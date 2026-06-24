// 风险区动态规划器 v10（圆形限制区版 + 卡死修复）
// =============================================================
// 设计原则：
// - 风暴/干旱风险区一律使用圆形限制区，shape: 'circle'
// - 彻底删除 rect 拼接 / L 形 / 阶梯形等复杂候选
// - 圆形风险区生成规则：
//   * 优先放在目标物种 baseRoute 的中段附近
//   * 半径 RISK_CIRCLE_R（90~120）
//   * 圆必须完整在地图内
//   * 不覆盖任何节点，节点安全距离 NODE_SAFE_RADIUS（60~80）
//   * 至少命中 baseRoute 的某一段
//   * 放置后目标物种仍存在绕行路线
//   * 找不到完美候选时做 fallback：选"命中原路线 + 有绕行解"的最优圆
// - getActiveRiskZones 缓存：同一 season + 同一节点签名直接返回缓存
// - 候选集小：每条路线只尝试中段附近 6~12 个圆
// - 起点/终点/中转节点落在圆内也禁止通过
//
// v10 主线程卡死修复：
// - pickBaseRoute 端点对上限 6 对，避免 N×M 笛卡尔积 + 每对全 stateSearch
// - generateCircleCandidates 候选上限 24
// - evaluations 评估上限 16（按 midScore 排序后只取前几个）
// - findPlanningRoute 传入 maxTimeMs=3 / maxExpanded=600，避免无解时枚举所有简单路径
// - 整个 planDynamicRiskZones 流程 wall-clock 硬预算 30ms
//   超出立即返回 preset 兜底圈
// =============================================================
import type { RuntimeMapNode } from '../data/gameData'
import type { SpeciesDef, RequiredWaypoint } from '../data/speciesTemplates'
import { SPECIES_TEMPLATES } from '../data/speciesTemplates'
import { distance } from '../utils/geometry'
import type { RiskZone } from '../data/riskZones'
import type { SeasonId } from '../data/gameConfig'
import { checkRequiredWaypoints, normalizeTaskWaypoints, precheckWaypointCandidates } from './routeRequirements'
import { stateSearch, isStartTargetConnected, waypointMatchesForSolver, type NeighborInfo } from './routeSearch'

// 圆形风险区参数
const RISK_CIRCLE_R = 78            // 圆形风险区半径（缩小到能放进路线）
const NODE_SAFE_RADIUS = 24         // 圆心必须距离节点至少这个距离（避免端点被过滤）
const MIN_DETOUR = 20               // 首选绕行距离
const FALLBACK_MIN_DETOUR = 0       // fallback 绕行距离（不再卡死 detour）

// v10 调优：避免主线程卡死
const BASE_ROUTE_MAX_PAIRS = 6      // 选 baseRoute 最多尝试的起终点对
const CANDIDATE_MAX = 24            // 圆形候选硬上限
const EVAL_MAX = 16                 // 评估硬上限
const PLANNING_MAX_TIME_MS = 3      // 单次 stateSearch 墙钟预算
const PLANNING_MAX_EXPANDED = 600   // 单次 stateSearch 扩展上限
const PLAN_DYNAMIC_HARD_BUDGET_MS = 30 // 整个规划器墙钟预算

// 地图边界（与 gameConfig 保持一致）
const MAP_LEFT = 40
const MAP_TOP = 40
const MAP_RIGHT = 1160
const MAP_BOTTOM = 660

// 调试日志开关
const DEBUG = false

interface RouteInfo {
  path: string[]
  cost: number
}

// ============================================================
// 通用"季节"配置
// ============================================================
// 风险圈的"目标物种"（用于 baseRoute 规划）和"被禁物种列表"现在解耦：
// - targetSpeciesId：决定 baseRoute 选哪个物种的"最优路径"作为参照
// - forbiddenFor  ：决定实际禁止哪些物种穿越这个圈
//   这样新增 storm-vulnerable 物种（bar_goose / sea_turtle）虽然写在
//   speciesTemplates 的 disasterVulnerabilities 里，但风险圈规划器并不知道；
//   我们在这里把"vulnerable 物种"显式列出，避免遗漏。
interface SeasonBarrierConfig {
  season: SeasonId
  /** 用于 baseRoute 规划的目标物种 id */
  targetSpeciesId: string
  /** 实际被禁止穿越的物种 id 列表（与 disasterVulnerabilities 一致） */
  forbiddenFor: string[]
  zoneName: string
  reason: string
  idPrefix: string
}

const STORM_CONFIG: SeasonBarrierConfig = {
  season: 'storm',
  targetSpeciesId: 'bird',
  // 暴风季对所有 storm-vulnerable 物种都禁用
  forbiddenFor: ['bird', 'bar_goose', 'sea_turtle'],
  zoneName: '风暴禁飞圈',
  reason: '暴风季不能穿越风暴禁飞圈，需要寻找绕行路线',
  idPrefix: 'storm_forbidden'
}

const DROUGHT_CONFIG: SeasonBarrierConfig = {
  season: 'drought',
  targetSpeciesId: 'butterfly',
  // 干旱季对所有 drought-vulnerable 物种都禁用
  forbiddenFor: ['butterfly', 'salmon', 'eel', 'wood_frog'],
  zoneName: '干旱隔离圈',
  reason: '干旱季不能穿越干旱隔离圈，需要绕行寻找补给点',
  idPrefix: 'drought_isolation'
}

// ============================================================
// 局部几何 helper
// ============================================================
function pointInCircleLocal(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function segmentIntersectsCircleLocal(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number
): boolean {
  // 端点在圆内
  if (pointInCircleLocal(ax, ay, cx, cy, r)) return true
  if (pointInCircleLocal(bx, by, cx, cy, r)) return true
  // 投影最近点
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2))
  const px = ax + t * dx
  const py = ay + t * dy
  return pointInCircleLocal(px, py, cx, cy, r)
}

function segmentIntersectsZoneLocal(
  ax: number, ay: number, bx: number, by: number,
  zone: RiskZone
): boolean {
  if (zone.shape === 'circle') {
    return segmentIntersectsCircleLocal(ax, ay, bx, by, zone.cx!, zone.cy!, zone.r!)
  }
  // 兼容旧 rect（虽然不再生成，但 segment 接口仍支持）
  return segmentIntersectsCircleLocal(ax, ay, bx, by, zone.cx ?? zone.x ?? 0, zone.cy ?? zone.y ?? 0, zone.r ?? 0)
}

// ============================================================
// 局部验证 helper
// ============================================================
function nodeAllowedByTagLocal(n: RuntimeMapNode, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true
  return n.tags.some((t) => allowed.includes(t))
}

function checkSegmentDistancesLocal(
  route: string[], max: number, nodes: RuntimeMapNode[]
): boolean {
  const m = new Map(nodes.map((n) => [n.id, n] as const))
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i])
    const b = m.get(route[i + 1])
    if (!a || !b) continue
    if (distance(a.x, a.y, b.x, b.y) > max) return false
  }
  return true
}

// ============================================================
// 路线求解（本地 dijkstra + 共享 stateSearch）
// ============================================================

/** 局部 dijkstra：返回 (prevIndex, distance) 表 */
function dijkstraDist(
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  extraZones: RiskZone[]
): { prev: Int32Array; dist: Float64Array } | null {
  const N = nodes.length
  const dist = new Float64Array(N).fill(Infinity)
  const prev = new Int32Array(N).fill(-1)
  const visited = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (nodes[i]!.status === 'disabled') {
      visited[i] = 1
      dist[i] = 0
    }
  }
  for (let i = 0; i < N; i++) {
    if (!visited[i]) dist[i] = 0
  }
  for (let iter = 0; iter < N; iter++) {
    let u = -1
    let best = Infinity
    for (let i = 0; i < N; i++) {
      if (visited[i]) continue
      if (dist[i] < best) {
        best = dist[i]
        u = i
      }
    }
    if (u === -1) break
    visited[u] = 1
    const un = nodes[u]!
    for (let v = 0; v < N; v++) {
      if (visited[v]) continue
      const vn = nodes[v]!
      if (vn.status === 'disabled') continue
      if (!nodeAllowedByTagLocal(un, species.allowedNodeTags)) continue
      if (!nodeAllowedByTagLocal(vn, species.allowedNodeTags)) continue
      const d = distance(un.x, un.y, vn.x, vn.y)
      if (d > species.maxSegmentDistance) continue
      let blocked = false
      for (const z of extraZones) {
        if (!z.forbiddenFor.includes(species.id)) continue
        if (segmentIntersectsZoneLocal(un.x, un.y, vn.x, vn.y, z)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      const nd = dist[u] + d
      if (nd < dist[v]) {
        dist[v] = nd
        prev[v] = u
      }
    }
  }
  return { prev, dist }
}

function findPlanningRoute(
  species: SpeciesDef,
  startId: string,
  targetId: string,
  nodes: RuntimeMapNode[],
  extraZones: RiskZone[] = []
): RouteInfo | null {
  const d = dijkstraDist(species, nodes, extraZones)
  if (!d) return null
  const m = new Map(nodes.map((n) => [n.id, n] as const))
  const startNode = m.get(startId)
  const targetNode = m.get(targetId)
  if (!startNode || !targetNode) return null
  const startIdx = nodes.indexOf(startNode)
  const targetIdx = nodes.indexOf(targetNode)

  const normalized: RequiredWaypoint[] = normalizeTaskWaypoints(
    species.requiredWaypoints,
    startNode,
    targetNode,
    nodes
  )

  const reverse: number[][] = nodes.map(() => [])
  for (let j = 0; j < nodes.length; j++) {
    const p = d.prev[j]
    if (p >= 0 && p !== j) {
      reverse[p]!.push(j)
    }
  }
  function getNeighbors(u: number): NeighborInfo[] {
    const out: NeighborInfo[] = []
    const seen = new Set<number>()
    const uNode = nodes[u]!
    for (const v of reverse[u]!) {
      if (v === u) continue
      if (m.get(nodes[v]!.id)?.status === 'disabled') continue
      const vNode = nodes[v]!
      const d2 = distance(uNode.x, uNode.y, vNode.x, vNode.y)
      if (d2 > species.maxSegmentDistance) continue
      if (seen.has(v)) continue
      seen.add(v)
      out.push({ index: v, distance: d2 })
    }
    for (let v = 0; v < nodes.length; v++) {
      if (v === u) continue
      if (seen.has(v)) continue
      const vNode = nodes[v]!
      if (vNode.status === 'disabled') continue
      if (!nodeAllowedByTagLocal(uNode, species.allowedNodeTags)) continue
      if (!nodeAllowedByTagLocal(vNode, species.allowedNodeTags)) continue
      const d2 = distance(uNode.x, uNode.y, vNode.x, vNode.y)
      if (d2 > species.maxSegmentDistance) continue
      let blocked = false
      for (const z of extraZones) {
        if (!z.forbiddenFor.includes(species.id)) continue
        if (segmentIntersectsZoneLocal(uNode.x, uNode.y, vNode.x, vNode.y, z)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      seen.add(v)
      out.push({ index: v, distance: d2 })
    }
    return out
  }

  // v10: BFS 连通性预检查，避免在 waypoint 必无解时枚举所有简单路径
  const connected = isStartTargetConnected(
    getNeighbors,
    startIdx,
    targetIdx,
    normalized,
    nodes,
    (nodeIdx, wp) => waypointMatchesForSolver(nodes[nodeIdx]!, wp)
  )
  if (!connected) return null

  const result = stateSearch(
    startIdx,
    targetIdx,
    normalized,
    species.requiredWaypointOrder ?? false,
    nodes,
    getNeighbors,
    (idx) => {
      const n = nodes[idx]!
      return distance(n.x, n.y, targetNode.x, targetNode.y)
    },
    {
      maxTimeMs: PLANNING_MAX_TIME_MS,
      maxExpanded: PLANNING_MAX_EXPANDED
    }
  )
  if (!result) return null
  const path = result.path
  if (path[0] !== startId) return null
  if (path[path.length - 1] !== targetId) return null
  if (!checkSegmentDistancesLocal(path, species.maxSegmentDistance, nodes)) return null
  if (!checkRequiredWaypoints(path, species.requiredWaypoints, species.requiredWaypointOrder ?? false, nodes).ok) {
    return null
  }
  let cost = 0
  for (let i = 0; i < path.length - 1; i++) {
    const a = m.get(path[i])!
    const b = m.get(path[i + 1])!
    cost += distance(a.x, a.y, b.x, b.y)
  }
  return { path, cost }
}

// ============================================================
// 圆形候选生成
// ============================================================

/**
 * 圆是否完全在地图内
 */
function circleInsideMap(cx: number, cy: number, r: number): boolean {
  return (
    cx - r >= MAP_LEFT &&
    cy - r >= MAP_TOP &&
    cx + r <= MAP_RIGHT &&
    cy + r <= MAP_BOTTOM
  )
}

/**
 * 圆是否覆盖任何节点（圆心距节点 < NODE_SAFE_RADIUS）
 */
function circleOverlapsAnyNode(
  cx: number, cy: number, r: number, nodes: RuntimeMapNode[]
): boolean {
  const minDist = r + NODE_SAFE_RADIUS
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    const d = distance(cx, cy, n.x, n.y)
    if (d < minDist) return true
  }
  return false
}

/**
 * 圆是否覆盖 baseRoute 的某一段
 */
function circleHitsRoute(
  cx: number, cy: number, r: number, route: string[], nodes: RuntimeMapNode[]
): boolean {
  const m = new Map(nodes.map((n) => [n.id, n] as const))
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i]!)
    const b = m.get(route[i + 1]!)
    if (!a || !b) continue
    if (segmentIntersectsCircleLocal(a.x, a.y, b.x, b.y, cx, cy, r)) return true
  }
  return false
}

function hasValidEndpointPair(species: SpeciesDef, nodes: RuntimeMapNode[]): boolean {
  let hasStart = false
  let hasTarget = false
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (!hasStart && species.startTagPool.some((t) => n.tags.includes(t))) hasStart = true
    if (!hasTarget && species.targetTagPool.some((t) => n.tags.includes(t))) hasTarget = true
  }
  return hasStart && hasTarget
}

/**
 * 圆形限制区候选生成：
 * - 在 baseRoute 中段附近采样 6~12 个候选圆心
 * - 每个候选做硬过滤（在地图内、不覆盖节点、命中 baseRoute）
 * - 通过后做"可解性"验证
 */
interface CircleCandidate {
  cx: number
  cy: number
  r: number
  index: number
}

function generateCircleCandidates(
  baseRoute: RouteInfo,
  nodes: RuntimeMapNode[]
): CircleCandidate[] {
  const m = new Map(nodes.map((n) => [n.id, n] as const))

  type Sample = {
    cx: number
    cy: number
    segLen: number
    segIdx: number
    midScore: number
    t: number
  }

  const samples: Sample[] = []
  const midSegIdx = (baseRoute.path.length - 2) / 2

  for (let i = 0; i < baseRoute.path.length - 1; i++) {
    const a = m.get(baseRoute.path[i]!)
    const b = m.get(baseRoute.path[i + 1]!)
    if (!a || !b) continue

    const segLen = distance(a.x, a.y, b.x, b.y)
    if (segLen < 90) continue

    for (const t of [0.42, 0.5, 0.58]) {
      samples.push({
        cx: a.x + (b.x - a.x) * t,
        cy: a.y + (b.y - a.y) * t,
        segLen,
        segIdx: i,
        midScore: Math.abs(i - midSegIdx) + Math.abs(t - 0.5),
        t
      })
    }
  }

  samples.sort((a, b) => a.midScore - b.midScore)

  const candidates: CircleCandidate[] = []
  let index = 0

  // v10: 候选上限收紧到 8（= 8 sample × 5 normalOffsets / 5 = 单 normal × 单 tangent × 8）
  // 用 3 个 normal × 3 个 tangent = 9 / sample；samples 减到 4
  const MAX_SAMPLES = 4
  const normalOffsets = [
    0,
    RISK_CIRCLE_R * 0.55,
    -RISK_CIRCLE_R * 0.55
  ]
  const tangentOffsets = [0, 18, -18]

  for (const s of samples.slice(0, MAX_SAMPLES)) {
    const a = m.get(baseRoute.path[s.segIdx]!)
    const b = m.get(baseRoute.path[s.segIdx + 1]!)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const nx = -uy
    const ny = ux

    for (const no of normalOffsets) {
      for (const to of tangentOffsets) {
        const cx = s.cx + nx * no + ux * to
        const cy = s.cy + ny * no + uy * to
        candidates.push({
          cx,
          cy,
          r: RISK_CIRCLE_R,
          index: index++
        })

        // v10: 候选硬上限
        if (candidates.length >= CANDIDATE_MAX) return candidates
      }
    }
  }

  return candidates
}

/** 把单候选圆转换为 RiskZone 数组 */
function circleToZone(
  c: CircleCandidate,
  baseId: string,
  config: SeasonBarrierConfig
): RiskZone {
  return {
    id: `${baseId}_c${c.index}`,
    name: config.zoneName,
    activeInSeason: config.season,
    forbiddenFor: [...config.forbiddenFor],
    shape: 'circle' as const,
    cx: c.cx,
    cy: c.cy,
    r: c.r,
    reason: config.reason
  }
}

function pickSafeVisibleFallbackCircle(
  nodes: RuntimeMapNode[],
  config: SeasonBarrierConfig
): RiskZone[] {
  const presets = [
    { cx: 300, cy: 190 },
    { cx: 900, cy: 190 },
    { cx: 300, cy: 520 },
    { cx: 900, cy: 520 },
    { cx: 600, cy: 170 },
    { cx: 600, cy: 560 }
  ]

  for (const r of [RISK_CIRCLE_R, 68, 58]) {
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i]!
      if (!circleInsideMap(p.cx, p.cy, r)) continue
      if (circleOverlapsAnyNode(p.cx, p.cy, r, nodes)) continue

      return [{
        id: `${config.idPrefix}_visible_fallback_${i}_${Math.round(r)}`,
        name: config.zoneName,
        activeInSeason: config.season,
        forbiddenFor: [...config.forbiddenFor],
        shape: 'circle',
        cx: p.cx,
        cy: p.cy,
        r,
        reason: config.reason
      }]
    }
  }

  return []
}

/**
 * 公开：动态规划风险区（圆形版）
 * 1) 选 baseRoute（端点对上限）
 * 2) 候选圆（候选上限）
 * 3) 硬过滤：在地图内 + 不覆盖节点 + 命中 baseRoute
 * 4) 软过滤：加圆后仍可解 + detour 足够大（评估上限）
 * 5) fallback：若首选 det 不够，找"命中原路线 + 有绕行解"的最优圆
 * 6) 兜底：preset 圈
 *
 * v10: 整流程 wall-clock 硬预算 30ms
 */
export function planDynamicRiskZones(season: SeasonId, nodes: RuntimeMapNode[]): RiskZone[] {
  if (!nodes || nodes.length === 0) return []
  if (season !== 'storm' && season !== 'drought') return []

  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const budgetExhausted = () =>
    typeof performance !== 'undefined'
      ? performance.now() - startedAt > PLAN_DYNAMIC_HARD_BUDGET_MS
      : false

  const config: SeasonBarrierConfig =
    season === 'storm' ? STORM_CONFIG : DROUGHT_CONFIG

  const targetSpeciesId = config.targetSpeciesId
  const species = SPECIES_TEMPLATES.find((s) => s.id === targetSpeciesId)

  // 没有对应物种或端点不足时，也要给玩家显示一个稳定的季节圈；
  // 但兜底圈必须避开节点，保证不会把地图搞成无解。
  if (!species || !hasValidEndpointPair(species, nodes)) {
    return pickSafeVisibleFallbackCircle(nodes, config)
  }

  // 必经点候选预检查
  // 当 requiredWaypoint 在地图上根本没有候选（如鸟缺少 wetland）时，
  // 直接返回兜底圈，避免 pickBaseRoute 多次调 stateSearch 阻塞主线程
  for (const wp of species.requiredWaypoints) {
    if (wp.kind === 'node') {
      const exists = nodes.some((n) => n.id === wp.nodeId && n.status !== 'disabled')
      if (!exists) return pickSafeVisibleFallbackCircle(nodes, config)
    } else if (wp.kind === 'tag') {
      let matches = 0
      for (const n of nodes) {
        if (n.status === 'disabled') continue
        if (n.tags.includes(wp.tag)) matches++
      }
      if (matches < Math.max(1, wp.count)) {
        return pickSafeVisibleFallbackCircle(nodes, config)
      }
    }
  }

  const base = pickBaseRoute(species, nodes)
  if (!base) {
    return pickSafeVisibleFallbackCircle(nodes, config)
  }

  if (budgetExhausted()) return pickSafeVisibleFallbackCircle(nodes, config)

  const candidates = generateCircleCandidates(base.route, nodes)

  const passed: CircleCandidate[] = []
  for (const c of candidates) {
    if (!circleInsideMap(c.cx, c.cy, c.r)) continue
    if (circleOverlapsAnyNode(c.cx, c.cy, c.r, nodes)) continue
    if (!circleHitsRoute(c.cx, c.cy, c.r, base.route.path, nodes)) continue
    passed.push(c)
  }

  interface EvalResult {
    candidate: CircleCandidate
    detour: number
    isFallback: boolean
  }

  const evaluations: EvalResult[] = []
  // v10: 评估上限
  const evalLimit = Math.min(passed.length, EVAL_MAX)
  for (let i = 0; i < evalLimit; i++) {
    if (budgetExhausted()) break
    const c = passed[i]!
    const zone = circleToZone(
      c,
      `${config.idPrefix}_b${base.startId}_t${base.targetId}`,
      config
    )

    const newRoute = findPlanningRoute(
      species,
      base.startId,
      base.targetId,
      nodes,
      [zone]
    )

    if (!newRoute) continue

    const detour = newRoute.cost - base.route.cost
    if (detour < FALLBACK_MIN_DETOUR) continue

    evaluations.push({
      candidate: c,
      detour,
      isFallback: detour < MIN_DETOUR
    })
  }

  if (evaluations.length > 0) {
    const preferred = evaluations.filter((e) => !e.isFallback)
    const pool = preferred.length > 0 ? preferred : evaluations

    let best = pool[0]!
    for (const e of pool) {
      if (e.detour > best.detour) best = e
    }

    return [circleToZone(
      best.candidate,
      `${config.idPrefix}_b${base.startId}_t${base.targetId}`,
      config
    )]
  }

  // 最重要的兜底：不能因为没有完美绕行候选就完全不显示风险圈。
  // 这个圈是明确的季节限制区，只是不强行卡死主路线。
  return pickSafeVisibleFallbackCircle(nodes, config)
}

function pickBaseRoute(
  species: SpeciesDef,
  nodes: RuntimeMapNode[]
): { route: RouteInfo; startId: string; targetId: string } | null {
  const starts: RuntimeMapNode[] = []
  const targets: RuntimeMapNode[] = []
  const requiredNodeIds = new Set<string>()
  for (const wp of species.requiredWaypoints) {
    if (wp.kind === 'node') requiredNodeIds.add(wp.nodeId)
  }
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (requiredNodeIds.has(n.id)) continue
    if (species.startTagPool.some((t) => n.tags.includes(t))) starts.push(n)
    if (species.targetTagPool.some((t) => n.tags.includes(t))) targets.push(n)
  }
  if (starts.length === 0 || targets.length === 0) return null
  let best: { route: RouteInfo; startId: string; targetId: string } | null = null
  // v10: 端点对上限
  let pairCount = 0
  for (let i = 0; i < starts.length && pairCount < BASE_ROUTE_MAX_PAIRS; i++) {
    for (let j = 0; j < targets.length && pairCount < BASE_ROUTE_MAX_PAIRS; j++) {
      pairCount++
      if (starts[i]!.id === targets[j]!.id) continue
      // waypoint 候选预检查：必无解时直接跳过 stateSearch
      const normalizedWps = normalizeTaskWaypoints(
        species.requiredWaypoints,
        starts[i]!,
        targets[j]!,
        nodes
      )
      const pre = precheckWaypointCandidates(normalizedWps, starts[i]!, targets[j]!, nodes, species.allowedNodeTags)
      if (!pre.ok) continue
      const route = findPlanningRoute(species, starts[i]!.id, targets[j]!.id, nodes, [])
      if (route) {
        if (!best || route.cost < best.route.cost) {
          best = { route, startId: starts[i]!.id, targetId: targets[j]!.id }
        }
      }
      if (best && best.route.cost < 300) break
    }
    if (best && best.route.cost < 300) break
  }
  return best
}

// 抑制未使用警告
void (RISK_CIRCLE_R as number)
void (MIN_DETOUR as number)
void (FALLBACK_MIN_DETOUR as number)
void DEBUG
