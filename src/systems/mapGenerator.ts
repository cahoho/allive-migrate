// 地图节点生成 v3
// =============================================================
// - 节点一个一个出现：每次 tryRevealOneNode() 最多 push 一个节点
// - 用 NodeArchetype 池取代固定节点 ID
// - 同一 archetype 可生成多个同 displayName 不同 id 的节点
// - 旧 API（FIXED_POSITIONS / makeFixedNode / generateInitialMap / addStageNodes / makeBonusNode）
//   全部保留为兼容，但内部已经改为 archetype
// - 兼容默认：旧路径会调用 generateInitialMap(rng, 1) 生成最初的几个节点
//   v4 不再"一次性把整组固定节点刷出来"，而是按"开局必出"最小集合生成
// - 写入 semanticKey / equivalenceKey，确保"同名 = 同类"语义贯穿
// - 启动时执行 assertDisplayNameSemanticConsistency() 做开发期校验
// =============================================================
import { SeededRandom } from './seededRandom'
import {
  WORLD_WIDTH, WORLD_HEIGHT,
  SAFE_MARGIN_LEFT, SAFE_MARGIN_RIGHT, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM,
  NODE_MIN_DISTANCE, MAX_MAP_NODES
} from '../data/gameConfig'
import { RuntimeMapNode } from '../data/gameData'
import { createEcoDefaults } from './ecologySystem'
import {
  NODE_ARCHETYPES,
  assertDisplayNameSemanticConsistency,
  type NodeArchetype
} from '../data/nodeTemplates'
import { getSpeciesTemplate } from '../data/speciesTemplates'
import type { NodeTag } from '../data/gameConfig'

// 启动时立即执行开发期一致性校验
// 任何"同 displayName 不同 equivalenceKey"会在程序启动时直接抛错
assertDisplayNameSemanticConsistency()

/** 距离工具 */
export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/** 安全矩形 */
function safeRect() {
  return {
    minX: SAFE_MARGIN_LEFT,
    maxX: WORLD_WIDTH - SAFE_MARGIN_RIGHT,
    minY: SAFE_MARGIN_TOP,
    maxY: WORLD_HEIGHT - SAFE_MARGIN_BOTTOM
  }
}

export const POSITION_JITTER = 22
const JITTER_TRIES = 20

/** id 自增序号 */
let nodeIdSeq = 0
function nextArchetypeId(role: string): string {
  return `n_${role}_${++nodeIdSeq}`
}

/** archetype 池中各 role 已生成节点数量（控制重复权重） */
const roleCount: Map<string, number> = new Map()

/** 重置内部状态（每局开始调用） */
export function resetGeneratorState() {
  nodeIdSeq = 0
  roleCount.clear()
}

/** 计算某 archetype 当前的抽签权重（出现越多权重越低，但仍 > 0） */
function roleWeight(arch: NodeArchetype, state: { totalSuccess: number; elapsedTime: number }): number {
  const used = roleCount.get(arch.role) ?? 0
  const decayed = Math.max(0.2, 1 - used * 0.35)
  // 未达解锁条件：权重 = 0
  if (typeof arch.minSuccess === 'number' && state.totalSuccess < arch.minSuccess) return 0
  if (typeof arch.minElapsed === 'number' && state.elapsedTime < arch.minElapsed) return 0
  // 加权
  return arch.weight * decayed
}

/** 抽取一个 archetype（按权重） */
function pickArchetype(
  rng: SeededRandom,
  state: { totalSuccess: number; elapsedTime: number }
): NodeArchetype | null {
  const pool: { item: NodeArchetype; weight: number }[] = []
  for (const a of NODE_ARCHETYPES) {
    const w = roleWeight(a, state)
    if (w > 0) pool.push({ item: a, weight: w })
  }
  if (pool.length === 0) return null
  return rng.weighted(pool) ?? null
}

function isInsideSafeMap(x: number, y: number): boolean {
  const r = safeRect()
  return x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY
}

function hasEnoughDistance(
  x: number, y: number,
  existing: RuntimeMapNode[],
  minDist: number
): boolean {
  for (const n of existing) {
    if (dist(x, y, n.x, n.y) < minDist) return false
  }
  return true
}

/** 在已存在节点附近找一个安全空位（最少 NODE_MIN_DISTANCE） */
function findSpotNearAnchor(
  rng: SeededRandom,
  existing: RuntimeMapNode[]
): { x: number; y: number } | null {
  if (existing.length === 0) {
    return {
      x: rng.range(WORLD_WIDTH * 0.3, WORLD_WIDTH * 0.7),
      y: rng.range(WORLD_HEIGHT * 0.3, WORLD_HEIGHT * 0.7)
    }
  }
  // 尝试 30 次：随机选一个已有节点为锚点，找附近的空位
  for (let attempt = 0; attempt < 30; attempt++) {
    const anchor = rng.pick(existing)
    if (!anchor) continue
    const ang = rng.range(0, Math.PI * 2)
    const d = rng.range(110, 280)
    const x = anchor.x + Math.cos(ang) * d
    const y = anchor.y + Math.sin(ang) * d
    if (!isInsideSafeMap(x, y)) continue
    if (!hasEnoughDistance(x, y, existing, NODE_MIN_DISTANCE)) continue
    return { x, y }
  }
  // fallback: 在所有节点的中心附近找
  let cx = WORLD_WIDTH / 2
  let cy = WORLD_HEIGHT / 2
  for (const n of existing) {
    cx += n.x
    cy += n.y
  }
  cx = cx / (existing.length + 1)
  cy = cy / (existing.length + 1)
  return { x: cx, y: cy }
}

/** 让一个候选点尽量和至少一个已存在节点距离 >= NODE_MIN_DISTANCE && <= 280 */
function findConnectedSpot(
  rng: SeededRandom,
  existing: RuntimeMapNode[]
): { x: number; y: number } | null {
  if (existing.length === 0) {
    return {
      x: rng.range(WORLD_WIDTH * 0.3, WORLD_WIDTH * 0.7),
      y: rng.range(WORLD_HEIGHT * 0.3, WORLD_HEIGHT * 0.7)
    }
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const anchor = rng.pick(existing)
    if (!anchor) continue
    const ang = rng.range(0, Math.PI * 2)
    const d = rng.range(110, 280)
    const x = anchor.x + Math.cos(ang) * d
    const y = anchor.y + Math.sin(ang) * d
    if (!isInsideSafeMap(x, y)) continue
    if (!hasEnoughDistance(x, y, existing, NODE_MIN_DISTANCE)) continue
    return { x, y }
  }
  return findSpotNearAnchor(rng, existing)
}

/**
 * 用 archetype 制造一个节点
 * - 不修改 external 列表
 * - 同时增加 roleCount
 * - 写入 semanticKey / equivalenceKey 保持与 archetype 一致
 */
function makeNodeFromArchetype(
  rng: SeededRandom,
  arch: NodeArchetype,
  existing: RuntimeMapNode[]
): RuntimeMapNode | null {
  const pos = findConnectedSpot(rng, existing)
  if (!pos) return null
  const id = nextArchetypeId(arch.role)
  const node: RuntimeMapNode = {
    id,
    name: arch.displayName,
    displayName: arch.displayName,
    semanticKey: arch.semanticKey,
    equivalenceKey: arch.equivalenceKey,
    type: arch.type,
    tags: [...arch.tags],
    x: pos.x,
    y: pos.y,
    status: 'normal',
    stage: 0,
    spawnedAt: Date.now(),
    isFixed: false,
    // 生态健康 v2：默认满血 + healthy（统一从 ecologySystem 拿默认值）
    ...createEcoDefaults()
  }
  roleCount.set(arch.role, (roleCount.get(arch.role) ?? 0) + 1)
  return node
}

/**
 * 渐进式：尝试生成一个节点
 * - 每次最多 push 一个
 * - 调用方负责维护 pendingRevealTimer / 队列
 * - 失败时（地图满 / 找不到空位）返回 null
 *
 * 鲑鱼核心链路约束：
 * - 当 totalSuccess >= 3（鲑鱼允许出现的阶段），
 *   在通用随机生成前，优先补齐鲑鱼核心链
 *   cold_sea → estuary → fishway → spawning_stream
 *   保证每段距离 < species.maxSegmentDistance。
 */
export function tryRevealOneNode(
  rng: SeededRandom,
  existing: RuntimeMapNode[],
  state: { totalSuccess: number; elapsedTime: number }
): RuntimeMapNode | null {
  if (existing.length >= MAX_MAP_NODES) return null

  // 0) 鲑鱼核心链路强制生成（当鲑鱼解锁后）
  const forcedSalmonRole = pickMissingSalmonChainRole(existing, state)
  if (forcedSalmonRole) {
    const arch = NODE_ARCHETYPES.find((a) => a.role === forcedSalmonRole)
    if (arch) {
      const n = makeNodeFromArchetypeWithSalmonConstraint(rng, arch, existing)
      if (n) return n
      // 找不到合法位置：返回 null 等待下一帧，
      // 绝不允许"任意放置"破坏鲑鱼核心链路
    }
  }

  // 0.5) 后期物种支持节点补齐
  //   不新增节点类型；只是把已有 archetype（reef_shore / cave_shelter），
  //   在总成功数达到阈值时主动拉出来，避免后期物种因为地图缺节点而无法解锁。
  //   这里只调用一次；找不到合法位置时继续走通用随机生成，不阻塞主流程。
  const forcedLateRole = pickMissingLateSpeciesSupportRole(existing, state)
  if (forcedLateRole) {
    const arch = NODE_ARCHETYPES.find((a) => a.role === forcedLateRole)
    if (arch) {
      const n = makeNodeFromArchetype(rng, arch, existing)
      if (n) return n
    }
  }

  // 1) 通用随机生成
  for (let attempt = 0; attempt < 12; attempt++) {
    const arch = pickArchetype(rng, state)
    if (!arch) return null
    const n = makeNodeFromArchetype(rng, arch, existing)
    if (n) return n
  }
  return null
}

/**
 * 节点是否已经具有指定 role（用于判定 reef_shore / cave_shelter 是否已存在）
 */
function hasRole(nodes: RuntimeMapNode[], role: string): boolean {
  return nodes.some((n) => n.semanticKey === role || n.equivalenceKey === role)
}

/**
 * 后期物种支持节点补齐：
 * - sea_turtle 依赖 reef_shore：totalSuccess >= 11 时强制补齐
 * - wood_frog 依赖 cave_shelter：totalSuccess >= 15 时强制补齐
 *
 * 返回应该被强制补齐的 role；null 表示当前阶段不需要补齐。
 *
 * 注意：这里不是新增节点类型，只是保证已有 archetype 后期能稳定出现。
 */
export function pickMissingLateSpeciesSupportRole(
  existing: RuntimeMapNode[],
  state: { totalSuccess: number; elapsedTime: number }
): string | null {
  if (state.totalSuccess >= 11 && !hasRole(existing, 'reef_shore')) return 'reef_shore'
  if (state.totalSuccess >= 15 && !hasRole(existing, 'cave_shelter')) return 'cave_shelter'
  return null
}

// ============================================================
// 鲑鱼核心链路约束生成
// ============================================================
//
// 鲑鱼 mandatory 链路：
//   cold_sea → estuary → fishway → spawning_stream
//
// 关键规则：
// 1) 出现顺序固定：cold_sea 先有，再 estuary，再 fishway，再 spawning_stream
// 2) 每段距离 < species.maxSegmentDistance（留 16~24 像素安全余量）
// 3) cold_sea 是起点锚点：偏左/偏下/水域感
// 4) 找不到合法位置：返回 null，让本轮 reveal 失败，不污染地图
//
// 不要把候鸟、蝴蝶、草原兽群也加进这套逻辑。
// ============================================================

/** 鲑鱼核心链路的 role 顺序 */
export const SALMON_CHAIN_ROLES = [
  'cold_sea',
  'estuary',
  'fishway',
  'spawning_stream'
] as const

export type SalmonChainRole = (typeof SALMON_CHAIN_ROLES)[number]

/** 鲑鱼解锁阈值：与物种 minSuccess=3 同步 */
const SALMON_UNLOCK_SUCCESS = 3

/**
 * 判断给定 role 是否是鲑鱼核心链路节点
 */
export function isSalmonChainRole(role: string): boolean {
  return (SALMON_CHAIN_ROLES as readonly string[]).includes(role)
}

/**
 * 在已有节点中找到"鲑鱼核心链中第 i 个 role"的节点
 * - 优先用 semanticKey 判断
 * - 否则用 equivalenceKey
 * - 否则用 displayName（兜底）
 */
function findSalmonNodeByRole(
  existing: RuntimeMapNode[],
  role: SalmonChainRole
): RuntimeMapNode | undefined {
  const arch = NODE_ARCHETYPES.find((a) => a.role === role)
  if (!arch) return undefined
  return existing.find((n) => {
    if (n.semanticKey === arch.semanticKey) return true
    if (n.equivalenceKey === arch.equivalenceKey) return true
    if (n.displayName === arch.displayName) return true
    return false
  })
}

/**
 * 鲑鱼核心链是否已经齐全（4 个不同节点都已生成）
 */
export function isSalmonChainComplete(existing: RuntimeMapNode[]): boolean {
  for (const role of SALMON_CHAIN_ROLES) {
    if (!findSalmonNodeByRole(existing, role)) return false
  }
  // 防御：四个节点必须是不同的节点
  const ids = SALMON_CHAIN_ROLES.map((r) => findSalmonNodeByRole(existing, r)?.id)
  return new Set(ids.filter(Boolean)).size === SALMON_CHAIN_ROLES.length
}

/**
 * 鲑鱼核心链路上"下一个应该生成"的 role
 * - totalSuccess < 3 时不介入（鲑鱼尚未解锁）
 * - 已齐全则返回 null
 * - 顺序：cold_sea → estuary → fishway → spawning_stream
 */
export function pickMissingSalmonChainRole(
  existing: RuntimeMapNode[],
  state?: { totalSuccess: number; elapsedTime: number }
): string | null {
  if (state && state.totalSuccess < SALMON_UNLOCK_SUCCESS) return null
  for (const role of SALMON_CHAIN_ROLES) {
    if (!findSalmonNodeByRole(existing, role)) return role
  }
  return null
}

/**
 * 获取鲑鱼单段最大距离，优先从 species 模板读取，失败兜底 320
 */
function getSalmonMaxSegmentDistance(): number {
  const salmon = getSpeciesTemplate('salmon')
  if (salmon && typeof salmon.maxSegmentDistance === 'number' && salmon.maxSegmentDistance > 0) {
    return salmon.maxSegmentDistance
  }
  return 320
}

/**
 * 在锚点附近找点：保证 (NODE_MIN_DISTANCE, maxAllowed-16) 范围
 * - 不与已有节点过近
 * - 不在安全区外
 * - 失败时多角度扫描兜底
 */
function findSpotNearRequiredAnchor(
  rng: SeededRandom,
  existing: RuntimeMapNode[],
  anchor: RuntimeMapNode,
  maxDist: number
): { x: number; y: number } | null {
  const minDist = NODE_MIN_DISTANCE + 12
  const maxAllowed = Math.max(minDist + 4, maxDist - 16)

  // 阶段 1：80 次随机抽样
  for (let attempt = 0; attempt < 80; attempt++) {
    const angle = rng.range(0, Math.PI * 2)
    const d = rng.range(minDist, maxAllowed)
    const x = anchor.x + Math.cos(angle) * d
    const y = anchor.y + Math.sin(angle) * d

    if (!isInsideSafeMap(x, y)) continue
    if (!hasEnoughDistance(x, y, existing, NODE_MIN_DISTANCE)) continue
    return { x, y }
  }

  // 阶段 2：24 个等分角度扇形扫描（更密集）
  const angleSteps = 24
  for (let i = 0; i < angleSteps; i++) {
    for (let r = 0.35; r < 1.0; r += 0.18) {
      const ang = (i / angleSteps) * Math.PI * 2
      const d = minDist + r * (maxAllowed - minDist)
      const x = anchor.x + Math.cos(ang) * d
      const y = anchor.y + Math.sin(ang) * d

      if (!isInsideSafeMap(x, y)) continue
      if (!hasEnoughDistance(x, y, existing, NODE_MIN_DISTANCE)) continue
      return { x, y }
    }
  }

  return null
}

/**
 * 鲑鱼"冷启动"：地图几乎是空的时候，第一个 cold_sea 怎么放
 * - 偏左/偏下/水域感（鲑鱼从海里出发）
 */
function findSalmonColdSeaStartSpot(
  rng: SeededRandom,
  existing: RuntimeMapNode[]
): { x: number; y: number } | null {
  const minDist = NODE_MIN_DISTANCE + 12

  // 偏左下水域区（地图 30%~55% 宽 × 55%~80% 高）
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = rng.range(WORLD_WIDTH * 0.3, WORLD_WIDTH * 0.55)
    const y = rng.range(WORLD_HEIGHT * 0.55, WORLD_HEIGHT * 0.85)
    if (!isInsideSafeMap(x, y)) continue
    if (!hasEnoughDistance(x, y, existing, NODE_MIN_DISTANCE)) continue
    void minDist
    return { x, y }
  }
  // 兜底
  return findConnectedSpot(rng, existing)
}

/**
 * 给定一个鲑鱼核心链 role，构造节点
 * - cold_sea: 冷启动位置（地图偏左下/水域感）
 * - estuary: 必须 < maxSegmentDistance 锚定在 cold_sea
 * - fishway: 必须 < maxSegmentDistance 锚定在 estuary
 * - spawning_stream: 必须 < maxSegmentDistance 锚定在 fishway
 *
 * 找不到合法位置时返回 null（绝不允许出现"任意放"）
 */
function makeNodeFromArchetypeWithSalmonConstraint(
  rng: SeededRandom,
  arch: NodeArchetype,
  existing: RuntimeMapNode[]
): RuntimeMapNode | null {
  const maxDist = getSalmonMaxSegmentDistance()

  let pos: { x: number; y: number } | null = null

  if (arch.role === 'cold_sea') {
    pos = findSalmonColdSeaStartSpot(rng, existing)
  } else if (arch.role === 'estuary') {
    const anchor = findSalmonNodeByRole(existing, 'cold_sea')
    if (!anchor) return null
    pos = findSpotNearRequiredAnchor(rng, existing, anchor, maxDist)
  } else if (arch.role === 'fishway') {
    const anchor = findSalmonNodeByRole(existing, 'estuary')
    if (!anchor) return null
    pos = findSpotNearRequiredAnchor(rng, existing, anchor, maxDist)
  } else if (arch.role === 'spawning_stream') {
    const anchor = findSalmonNodeByRole(existing, 'fishway')
    if (!anchor) return null
    pos = findSpotNearRequiredAnchor(rng, existing, anchor, maxDist)
  }

  if (!pos) return null

  const id = nextArchetypeId(arch.role)
  const node: RuntimeMapNode = {
    id,
    name: arch.displayName,
    displayName: arch.displayName,
    semanticKey: arch.semanticKey,
    equivalenceKey: arch.equivalenceKey,
    type: arch.type,
    tags: [...arch.tags],
    x: pos.x,
    y: pos.y,
    status: 'normal',
    stage: 0,
    spawnedAt: Date.now(),
    isFixed: false,
    // 生态健康 v2：默认满血 + healthy
    ...createEcoDefaults()
  }
  roleCount.set(arch.role, (roleCount.get(arch.role) ?? 0) + 1)
  return node
}

/**
 * 验证鲑鱼核心链路是否合法：
 * - 4 个不同节点都已生成
 * - 任意相邻两段距离 < species.maxSegmentDistance（严格 <，不是 <=）
 *
 * 返回 true = 链路可用，false = 不可用
 * 缺任意一个节点返回 false
 */
export function validateSalmonCoreChain(nodes: RuntimeMapNode[]): boolean {
  const a = findSalmonNodeByRole(nodes, 'cold_sea')
  const b = findSalmonNodeByRole(nodes, 'estuary')
  const c = findSalmonNodeByRole(nodes, 'fishway')
  const d = findSalmonNodeByRole(nodes, 'spawning_stream')
  if (!a || !b || !c || !d) return false
  const ids = new Set([a.id, b.id, c.id, d.id])
  if (ids.size !== 4) return false

  const maxDist = getSalmonMaxSegmentDistance()
  const d1 = dist(a.x, a.y, b.x, b.y)
  const d2 = dist(b.x, b.y, c.x, c.y)
  const d3 = dist(c.x, c.y, d.x, d.y)
  return d1 < maxDist && d2 < maxDist && d3 < maxDist
}

/**
 * 兼容旧 API：开局初始地图
 * v4 改为：开局生成 ~3 个基础节点 + 候鸟路线的核心节点
 * 不再一次性把整组固定节点刷出来
 */
export function generateInitialMap(
  rng: SeededRandom,
  _stage: number
): RuntimeMapNode[] {
  resetGeneratorState()
  const nodes: RuntimeMapNode[] = []
  // 开局先放 5 个核心节点（候鸟 + 蝴蝶）
  // - 候鸟：北方繁殖地 / 沿海湿地 / 南方越冬地
  // - 蝴蝶：高山花海 / 南方森林
  const seedRoles: NodeArchetype[] = [
    NODE_ARCHETYPES.find((a) => a.role === 'north_breeding')!,
    NODE_ARCHETYPES.find((a) => a.role === 'coastal_wetland')!,
    NODE_ARCHETYPES.find((a) => a.role === 'south_wintering')!,

    // 开局加入蝴蝶核心节点，修复一直只有候鸟的问题
    NODE_ARCHETYPES.find((a) => a.role === 'mountain_flower')!,
    NODE_ARCHETYPES.find((a) => a.role === 'south_forest')!
  ]
  for (const a of seedRoles) {
    const n = makeNodeFromArchetype(rng, a, nodes)
    if (n) nodes.push(n)
  }
  return nodes
}

/**
 * 兼容旧 API：按阶段获取节点模板
 * v4 改为：返回空数组（节点渐进式生成）
 */
export function addStageNodes(_stage: number): NodeTemplateLike[] {
  return []
}

/** 兼容旧 NodeTemplate shape */
export interface NodeTemplateLike {
  id: string
  type: import('../data/gameConfig').NodeType
  displayName: string
  baseTags: NodeTag[]
  stage: number
}

/** 兼容旧 API：makeFixedNode（v4 改为 makeNodeFromArchetype） */
export function makeFixedNode(
  _template: NodeTemplateLike,
  existingNodes: RuntimeMapNode[],
  _rng: SeededRandom
): RuntimeMapNode {
  // 兜底：直接在附近生成一个通用节点
  const pos = findSpotNearAnchor(_rng, existingNodes)
  const x = pos ? pos.x : WORLD_WIDTH / 2
  const y = pos ? pos.y : WORLD_HEIGHT / 2
  // 兜底节点没有 archetype，所以 semanticKey / equivalenceKey 退化为 displayName
  return {
    id: `fallback_${++nodeIdSeq}`,
    name: _template.displayName,
    displayName: _template.displayName,
    semanticKey: _template.displayName,
    equivalenceKey: _template.displayName,
    type: _template.type,
    tags: [..._template.baseTags],
    x,
    y,
    status: 'normal',
    stage: _template.stage,
    spawnedAt: Date.now(),
    isFixed: true,
    // 生态健康 v2：默认满血 + healthy
    ...createEcoDefaults()
  }
}

/** 兼容旧 API：蹦出节点 */
export function makeBonusNode(
  rng: SeededRandom,
  existing: RuntimeMapNode[],
  _nearNodeIds?: string[],
  state?: { totalSuccess: number; elapsedTime: number }
): RuntimeMapNode | null {
  // 关键修复：必须把 totalSuccess / elapsedTime 透传给 tryRevealOneNode，
  // 否则完成后新增节点仍只从早期池子里抽，后续物种需要的节点不容易出现。
  return tryRevealOneNode(
    rng,
    existing,
    state ?? { totalSuccess: 0, elapsedTime: 0 }
  )
}

// ============================================================
// 兼容旧 API（占位）
// ============================================================

/** @deprecated 不再使用 */
export function generateNewNode(_rng: SeededRandom, _currentNodes: RuntimeMapNode[]): RuntimeMapNode | null {
  return null
}

/** @deprecated 不再使用 */
export function makeExtraNode(_rng: SeededRandom, _index: number, _allNodes: RuntimeMapNode[]): RuntimeMapNode | null {
  return null
}

/** @deprecated 不再使用 */
export function makeExtraNodeWithConstraint(
  _rng: SeededRandom,
  _allNodes: RuntimeMapNode[],
  _constraint: { nearNodeId: string; maxDistance: number; minDistance?: number }
): RuntimeMapNode | null {
  return null
}

/** 兼容：节点间"是否应该存在连接" */
export function shouldConnect(_a: RuntimeMapNode, _b: RuntimeMapNode): boolean {
  return true
}

/** 兼容：edge 查询 */
export function getEdgeBetween(_a: string, _b: string, _edges: any[]): undefined {
  return undefined
}

/** 兼容：旧 FIXED_POSITIONS 接口占位 */
export const FIXED_POSITIONS: Record<string, { x: number; y: number }> = {}

void MAX_MAP_NODES
