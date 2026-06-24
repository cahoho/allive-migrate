// =============================================================
// 生态健康值（栖息地完整度）系统 v1
// =============================================================
// 目标：
// - 用"栖息地完整度"替代传统"节点血量"概念
// - 人类活动覆盖节点时缓慢扣除
// - 动物迁徙成功结算时，对路径上节点造成"承载压力"
// - 无干扰时缓慢恢复
// - 损伤 / 恢复 / 延迟恢复 等规则集中维护
// - 纯函数 + 工具，不直接写 Vue state
//
// 调用方负责：把节点列表 / 人类 blocker 传给本模块，模块返回
// "本帧应扣 / 加多少"或"哪些节点被影响"，由调用方写入 state。
// =============================================================
import {
  NODE_ECO_HEALTH_DEFAULT,
  NODE_ECO_HEALTH_MAX,
  NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC,
  NODE_ECO_DAMAGE_FROM_HUMAN_MAX_PER_SEC,
  NODE_ECO_HUMAN_PRESSURE_REF_RADIUS,
  NODE_ECO_RECOVERY_PER_SEC,
  NODE_ECO_RECOVERY_DELAY_SEC,
  NODE_ECO_MIGRATION_PRESSURE_MIN,
  NODE_ECO_MIGRATION_PRESSURE_MAX,
  NODE_ECO_STATE_PRESSURED_MAX,
  NODE_ECO_STATE_DAMAGED_MAX,
  NODE_ECO_STATE_DEGRADED_MAX,
  NODE_ECO_RECOVER_USABLE_THRESHOLD,
  NODE_ECO_AVOID_AS_ENDPOINT_HEALTH,
  NODE_ECO_TASK_WEIGHT_DAMAGED,
  NODE_ECO_TASK_WEIGHT_DEGRADED
} from '../data/gameConfig'
import type { RuntimeMapNode, EcoState } from '../data/gameData'

/** 一个人类阻挡圆的"压强参数"（不依赖 humanBlockerSystem 类型，避免循环依赖） */
export interface HumanPressureSource {
  x: number
  y: number
  /** 阻挡圆半径（blockR），影响扣血强度 */
  radius: number
  /** 是否激活 */
  active: boolean
}

// ============================================================
// 初始化 / 状态分类
// ============================================================

/**
 * 给一个节点补齐默认 eco 字段。
 * 适合在节点创建（mapGenerator / makeBonusNode / generateInitialMap）后调用。
 */
export function initNodeEco(node: RuntimeMapNode): void {
  if (typeof node.health !== 'number') {
    node.health = NODE_ECO_HEALTH_DEFAULT
  }
  if (typeof node.maxHealth !== 'number') {
    node.maxHealth = NODE_ECO_HEALTH_MAX
  }
  if (!node.ecoState) {
    node.ecoState = classifyEcoState(node.health)
  }
  // 防御：health 越界时裁剪
  node.health = clampHealth(node.health, node.maxHealth)
}

/** 把 health 限定在 [0, maxHealth] 区间 */
export function clampHealth(h: number, max = NODE_ECO_HEALTH_MAX): number {
  if (!Number.isFinite(h)) return NODE_ECO_HEALTH_DEFAULT
  return Math.max(0, Math.min(max, h))
}

/** 根据 health 数值返回 eco 状态分类 */
export function classifyEcoState(health: number): EcoState {
  if (health > NODE_ECO_STATE_PRESSURED_MAX) return 'healthy'
  if (health > NODE_ECO_STATE_DAMAGED_MAX) return 'pressured'
  if (health > NODE_ECO_STATE_DEGRADED_MAX) return 'damaged'
  return 'degraded'
}

/** 节点是否处于"暂时不可用"状态：health <= 0，且还没恢复到 35 以上 */
export function isNodeEcoUnavailable(node: RuntimeMapNode): boolean {
  if (typeof node.health !== 'number') return false
  return node.health <= 0
}

/** 节点是否处于"任务起终点尽量避开"状态：health 极低或为 0 */
export function shouldAvoidAsEndpoint(node: RuntimeMapNode): boolean {
  if (typeof node.health !== 'number') return false
  return node.health <= NODE_ECO_AVOID_AS_ENDPOINT_HEALTH
}

/**
 * 任务生成时的"节点权重折扣"。
 * - healthy: 1.0
 * - pressured: 1.0（轻微变灰不影响任务选择）
 * - damaged: NODE_ECO_TASK_WEIGHT_DAMAGED
 * - degraded: NODE_ECO_TASK_WEIGHT_DEGRADED
 * - 不可用 (health<=0): 0
 */
export function getEcoTaskWeight(node: RuntimeMapNode): number {
  if (typeof node.health !== 'number') return 1
  if (isNodeEcoUnavailable(node)) return 0
  switch (node.ecoState) {
    case 'healthy':
    case 'pressured':
      return 1
    case 'damaged':
      return NODE_ECO_TASK_WEIGHT_DAMAGED
    case 'degraded':
      return NODE_ECO_TASK_WEIGHT_DEGRADED
    default:
      return 1
  }
}

// ============================================================
// 扣血 / 恢复
// ============================================================

/**
 * 应用一次扣血（人类活动 / 承载压力）。
 * - delta < 0：扣血
 * - 自动更新 ecoState 字段
 * - 自动写入 lastDamagedAt
 * - 不会让 health 低于 0
 *
 * @returns 实际扣血量（>0 表示发生了扣血，0 表示没扣）
 */
export function applyEcoDamage(
  node: RuntimeMapNode,
  delta: number,
  now: number
): number {
  if (delta >= 0) return 0
  if (typeof node.health !== 'number') initNodeEco(node)
  const before = node.health
  const after = clampHealth(before + delta, node.maxHealth)
  const actual = after - before
  node.health = after
  node.lastDamagedAt = now
  // 状态可能在跨分界时变化
  const nextState = classifyEcoState(node.health)
  if (node.ecoState !== nextState) {
    node.ecoState = nextState
  }
  // 防止 lastDamagedAt 被 NaN 污染
  if (!Number.isFinite(node.lastDamagedAt)) {
    delete node.lastDamagedAt
  }
  return actual
}

/**
 * 应用一次自然恢复。
 * - 无干扰时调用，每帧按 dt * 速率累加
 * - 节点刚受损（lastDamagedAt 在延迟窗口内）时不恢复
 * - 不会让 health 超过 maxHealth
 *
 * @returns 实际恢复量
 */
export function applyEcoRecovery(
  node: RuntimeMapNode,
  dt: number,
  now: number
): number {
  if (typeof node.health !== 'number') initNodeEco(node)
  if (node.health >= node.maxHealth) return 0
  if (typeof node.lastDamagedAt === 'number') {
    if (now - node.lastDamagedAt < NODE_ECO_RECOVERY_DELAY_SEC) return 0
  }
  const delta = NODE_ECO_RECOVERY_PER_SEC * dt
  const before = node.health
  const after = clampHealth(before + delta, node.maxHealth)
  const actual = after - before
  node.health = after
  if (actual > 0) {
    const nextState = classifyEcoState(node.health)
    if (node.ecoState !== nextState) {
      node.ecoState = nextState
    }
  }
  return actual
}

/**
 * 一次性"承载压力"扣血（动物迁徙成功后调用）。
 * 扣血量 = min..max 区间内随机选一个值。
 * 不会刷新 lastDamagedAt 的延迟逻辑——承载压力本身就让节点
 * 在一段时间内停止自然恢复是符合"短期承载过重"叙事的。
 */
export function applyMigrationPressure(
  node: RuntimeMapNode,
  rng: () => number,
  now: number
): number {
  const range = NODE_ECO_MIGRATION_PRESSURE_MAX - NODE_ECO_MIGRATION_PRESSURE_MIN
  const amount = -(NODE_ECO_MIGRATION_PRESSURE_MIN + Math.max(0, Math.min(1, rng())) * range)
  return applyEcoDamage(node, amount, now)
}

// ============================================================
// 批量接口（供 gameStore 推进一帧时调用）
// ============================================================

/**
 * 人类活动压强：检查所有节点，如果落在任何 active 人类阻挡圆内，
 * 返回该节点本帧应扣多少血。
 *
 * 扣血强度：根据阻挡圆半径做插值
 * - 半径 <= 0：取基础值 NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC
 * - 半径 >= REF：取上限 NODE_ECO_DAMAGE_FROM_HUMAN_MAX_PER_SEC
 * - 中间线性插值
 *
 * 返回 Map<nodeId, damagePerSec>；只包含"应该扣血"的节点。
 */
export function computeHumanPressureForNodes(
  nodes: RuntimeMapNode[],
  humans: HumanPressureSource[],
  dt: number
): Map<string, number> {
  const out = new Map<string, number>()
  if (!humans || humans.length === 0) return out
  for (const n of nodes) {
    if (typeof n.health !== 'number') initNodeEco(n)
    let totalDamage = 0
    for (const h of humans) {
      if (!h.active) continue
      const d = Math.hypot(n.x - h.x, n.y - h.y)
      if (d > h.radius) continue
      const intensity = intensityFromRadius(h.radius)
      const perSec = intensity * dt
      totalDamage += perSec
    }
    if (totalDamage > 0) {
      out.set(n.id, totalDamage)
    }
  }
  return out
}

function intensityFromRadius(r: number): number {
  if (r <= 0) return NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC
  if (r >= NODE_ECO_HUMAN_PRESSURE_REF_RADIUS) {
    return NODE_ECO_DAMAGE_FROM_HUMAN_MAX_PER_SEC
  }
  const t = r / NODE_ECO_HUMAN_PRESSURE_REF_RADIUS
  return NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC +
    (NODE_ECO_DAMAGE_FROM_HUMAN_MAX_PER_SEC - NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC) * t
}

/**
 * 推进一帧生态健康：
 * 1) 人类活动扣血
 * 2) 无干扰节点自然恢复
 * 3) 检测 ecoState 跨分界 → 通知调用方（用于触发轻量提示）
 *
 * 返回本帧发生的状态变化（供 UI toast / 提示用）。
 */
export interface EcoTickResult {
  /** 本帧扣血的节点 id 列表 */
  damagedIds: string[]
  /** 本帧恢复的节点 id 列表 */
  recoveredIds: string[]
  /** 进入 damaged 状态的节点（health 刚刚跌破 40） */
  enteredDamaged: string[]
  /** 进入 degraded 状态的节点（health 刚刚跌破 15） */
  enteredDegraded: string[]
  /** 进入 healthy 状态的节点（health 刚刚回升到 70 以上） */
  enteredHealthy: string[]
  /** 进入 pressured 状态的节点（health 在 40~70 之间） */
  enteredPressured: string[]
  /** health 跌破 0 的节点（暂时不可用） */
  enteredUnavailable: string[]
  /** health 重新升到 35 以上的节点（恢复可用） */
  reenteredUsable: string[]
}

export function tickNodeEco(
  nodes: RuntimeMapNode[],
  humans: HumanPressureSource[],
  dt: number,
  now: number,
  prevStates?: Map<string, EcoState>,
  prevUnavailable?: Set<string>
): EcoTickResult {
  const result: EcoTickResult = {
    damagedIds: [],
    recoveredIds: [],
    enteredDamaged: [],
    enteredDegraded: [],
    enteredHealthy: [],
    enteredPressured: [],
    enteredUnavailable: [],
    reenteredUsable: []
  }
  if (!nodes || nodes.length === 0) return result

  // 1) 人类活动扣血
  const pressureMap = computeHumanPressureForNodes(nodes, humans, dt)
  for (const n of nodes) {
    const dmg = pressureMap.get(n.id)
    if (dmg && dmg > 0) {
      const prevState = (prevStates && prevStates.get(n.id)) || n.ecoState
      const wasUnavailable = prevUnavailable ? prevUnavailable.has(n.id) : isNodeEcoUnavailable(n)
      const actual = applyEcoDamage(n, -dmg, now)
      if (actual < 0) {
        result.damagedIds.push(n.id)
        if (n.ecoState === 'damaged' && prevState !== 'damaged') {
          result.enteredDamaged.push(n.id)
        }
        if (n.ecoState === 'degraded' && prevState !== 'degraded') {
          result.enteredDegraded.push(n.id)
        }
        if (isNodeEcoUnavailable(n) && !wasUnavailable) {
          result.enteredUnavailable.push(n.id)
        }
      }
    }
  }

  // 2) 自然恢复（未被人类扣血的节点 + lastDamagedAt 已超延迟）
  for (const n of nodes) {
    if (pressureMap.has(n.id)) continue
    const prevState = (prevStates && prevStates.get(n.id)) || n.ecoState
    const wasUnavailable = prevUnavailable ? prevUnavailable.has(n.id) : isNodeEcoUnavailable(n)
    const before = n.health
    applyEcoRecovery(n, dt, now)
    if (n.health > before) {
      result.recoveredIds.push(n.id)
    }
    if (n.ecoState === 'healthy' && prevState !== 'healthy') {
      result.enteredHealthy.push(n.id)
    }
    if (n.ecoState === 'pressured' && prevState !== 'pressured') {
      result.enteredPressured.push(n.id)
    }
    if (!isNodeEcoUnavailable(n) && wasUnavailable) {
      // 仅在真正跨过"恢复可用阈值"时记录
      if (before < NODE_ECO_RECOVER_USABLE_THRESHOLD && n.health >= NODE_ECO_RECOVER_USABLE_THRESHOLD) {
        result.reenteredUsable.push(n.id)
      }
    }
  }

  return result
}

/**
 * 一次性给一组节点施加"承载压力"（动物迁徙成功时调用）。
 * 不会调用 applyMigrationPressure 的 rng 工具——传入 amount 即可。
 */
export function applyBatchMigrationPressure(
  nodes: RuntimeMapNode[],
  ids: string[],
  rng: () => number,
  now: number
): { nodeId: string; actual: number }[] {
  const out: { nodeId: string; actual: number }[] = []
  if (!ids || ids.length === 0) return out
  const m = new Map(nodes.map((n) => [n.id, n] as const))
  for (const id of ids) {
    const n = m.get(id)
    if (!n) continue
    const actual = applyMigrationPressure(n, rng, now)
    if (actual < 0) {
      out.push({ nodeId: id, actual })
    }
  }
  return out
}
