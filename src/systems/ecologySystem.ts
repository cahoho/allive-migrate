// =============================================================
// 生态健康值（Eco Health）v2 系统工具
// =============================================================
// 目标：
// - 提供 v2 命名下的"栖息地完整度"系统函数
//   - clampEcoHealth(value, maxHealth)
//   - getEcoState(health, maxHealth)
//   - createEcoDefaults()
//   - syncNodeEcoState(node)
//   - damageNodeEco(node, amount, now)
//   - recoverNodeEco(node, amount, now)
// - 纯函数 + 工具，不直接写 Vue state
//
// 与 v1（ecoHealthSystem.ts）并存：本文件是按用户最新要求命名的接口，
// 旧 v1 函数（initNodeEco / applyEcoDamage / tickNodeEco 等）继续保留，
// 由调用方决定使用哪一套。
// =============================================================
import {
  ECO_NODE_MAX_HEALTH,
  ECO_REENABLE_HEALTH,
  ECO_RECOVERY_DELAY_SECONDS,
  ECO_STATE_PRESSURED_MAX,
  ECO_STATE_DAMAGED_MAX,
  ECO_STATE_DEGRADED_MAX
} from '../data/gameConfig'
import type { RuntimeMapNode, EcoState } from '../data/gameData'

/** 把 health 限定在 [0, maxHealth] 区间 */
export function clampEcoHealth(value: number, maxHealth: number = ECO_NODE_MAX_HEALTH): number {
  if (!Number.isFinite(value)) return maxHealth
  return Math.max(0, Math.min(maxHealth, value))
}

/**
 * 根据 health 数值返回 eco 状态分类
 * - 70~100 : healthy
 * - 40~70  : pressured
 * - 15~40  : damaged
 * - 0~15   : degraded
 */
export function getEcoState(health: number, maxHealth: number = ECO_NODE_MAX_HEALTH): EcoState {
  if (maxHealth <= 0) return 'degraded'
  const pct = (clampEcoHealth(health, maxHealth) / maxHealth) * 100
  if (pct > ECO_STATE_PRESSURED_MAX) return 'healthy'
  if (pct > ECO_STATE_DAMAGED_MAX) return 'pressured'
  if (pct > ECO_STATE_DEGRADED_MAX) return 'damaged'
  return 'degraded'
}

/**
 * 给节点补齐 v2 默认 eco 字段。
 * 适合在节点创建（mapGenerator / makeBonusNode / generateInitialMap）后调用。
 *
 * @returns 返回一组默认值，调用方决定是直接赋值给字段还是用作占位。
 */
export function createEcoDefaults(): {
  health: number
  maxHealth: number
  ecoState: EcoState
  lastDamagedAt: number
  lastUsedAt: number
} {
  return {
    health: ECO_NODE_MAX_HEALTH,
    maxHealth: ECO_NODE_MAX_HEALTH,
    ecoState: 'healthy',
    lastDamagedAt: 0,
    lastUsedAt: 0
  }
}

/**
 * 把节点当前的 health 同步为正确的 ecoState。
 * - 同时把越界的 health 裁剪到 [0, maxHealth]
 * - 不会写 lastDamagedAt / lastUsedAt
 */
export function syncNodeEcoState(node: RuntimeMapNode): EcoState {
  const max = typeof node.maxHealth === 'number' && node.maxHealth > 0
    ? node.maxHealth
    : ECO_NODE_MAX_HEALTH
  node.health = clampEcoHealth(typeof node.health === 'number' ? node.health : max, max)
  if (typeof node.maxHealth !== 'number' || node.maxHealth <= 0) {
    node.maxHealth = max
  }
  const next = getEcoState(node.health, node.maxHealth)
  if (node.ecoState !== next) {
    node.ecoState = next
  }
  return next
}

/**
 * 应用一次扣血（人类活动 / 承载压力 / 任意来源）。
 * - amount > 0：扣血
 * - amount < 0：回血（不推荐使用，请走 recoverNodeEco）
 * - 自动更新 ecoState
 * - 不会让 health 低于 0
 *
 * @returns 实际扣血量（>0 表示发生了扣血，0 表示没扣）
 */
export function damageNodeEco(node: RuntimeMapNode, amount: number, now: number): number {
  if (amount <= 0) return 0
  if (typeof node.health !== 'number' || typeof node.maxHealth !== 'number') {
    syncNodeEcoState(node)
  }
  const before = node.health
  const after = clampEcoHealth(before - amount, node.maxHealth)
  const actual = before - after
  node.health = after
  node.lastDamagedAt = Number.isFinite(now) ? now : 0
  // 状态可能跨分界
  const nextState = getEcoState(node.health, node.maxHealth)
  if (node.ecoState !== nextState) {
    node.ecoState = nextState
  }
  // health <= 0：节点失效
  if (node.health <= 0 && node.status !== 'disabled') {
    node.status = 'disabled'
  } else if (node.health > ECO_REENABLE_HEALTH && node.status === 'disabled') {
    node.status = 'normal'
  }
  return actual
}

/**
 * 应用一次恢复。
 * - amount > 0：回血
 * - 节点刚受损（lastDamagedAt 在 ECO_RECOVERY_DELAY_SECONDS 窗口内）时不恢复
 * - 不会让 health 超过 maxHealth
 *
 * @returns 实际恢复量
 */
export function recoverNodeEco(node: RuntimeMapNode, amount: number, now: number): number {
  if (amount <= 0) return 0
  if (typeof node.health !== 'number' || typeof node.maxHealth !== 'number') {
    syncNodeEcoState(node)
  }
  if (node.health >= node.maxHealth) return 0
  if (typeof node.lastDamagedAt === 'number' && Number.isFinite(node.lastDamagedAt)) {
    if (now - node.lastDamagedAt < ECO_RECOVERY_DELAY_SECONDS) return 0
  }
  const before = node.health
  const after = clampEcoHealth(before + amount, node.maxHealth)
  const actual = after - before
  node.health = after
  if (actual > 0) {
    const nextState = getEcoState(node.health, node.maxHealth)
    if (node.ecoState !== nextState) {
      node.ecoState = nextState
    }
  }
  if (node.health > ECO_REENABLE_HEALTH && node.status === 'disabled') {
    node.status = 'normal'
  }
  return actual
}

/** 节点是否处于"暂时不可用"状态：health <= 0 */
export function isNodeEcoUnavailable(node: RuntimeMapNode): boolean {
  if (typeof node.health !== 'number') return false
  return node.health <= 0
}
