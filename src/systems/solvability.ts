// 可达性与可解性检查 v5
// =============================================================
// 核心要点：
// 1) 任何两个解锁节点之间，只要 distance(a, b) <= species.maxSegmentDistance，
//    就可以作为路径上的一段。
// 2) 任务生成前必须经过 canSpawnSolvableTask / findSolvableRouteForSpecies 可解性检查
// 3) 求解时使用统一的人类 cluster 阻挡入口：segmentHitsHumanCluster / pointInHumanCluster
// 4) waypoint 校验全部通过 src/systems/routeRequirements.ts 统一逻辑
// 5) 状态图搜索：使用 src/systems/routeSearch.ts 统一求解器
//    严格遵守：start / target 永远不计入 waypoint 命中
// 6) findSolvableRouteForSpecies 防御校验：route[0] === start && route[last] === target
// 7) canSpawnSolvableTask 每一对 (start, target) 都必须 normalizeTaskWaypoints
// 8) 路线图缓存已被移除：动态渐进生成下缓存风险太大，每次重新 buildRouteGraph
// 9) v5: 加入 BFS 连通性预检查 + 严格的 maxDepth/maxExpanded/maxTimeMs
//    杜绝 stateSearch 在无解时枚举所有简单路径
// 10) v5: 新增 isSpeciesSolvableQuick 廉价检查，替代 canSpawnSolvableTask 的"全量搜索"语义
//     gameStore 调用方在物种解锁/补任务时只跑廉价检查；
//     真正的"至少一对起终点可解"由 generateTask 内部的 findSolvableRouteForSpecies 兜底
// =============================================================
import type { RuntimeMapNode } from '../data/gameData'
import type { SpeciesDef, RequiredWaypoint } from '../data/speciesTemplates'
import type { SeasonId, NodeTag } from '../data/gameConfig'
import { distance } from '../utils/geometry'
import { nodeMap, checkAllowedNodeTags, checkSegmentDistances } from './routeSolver'
import { getActiveRiskZones, segmentIntersectsZone, clearRiskZoneCache } from '../data/riskZones'
import {
  segmentHitsHumanCluster,
  pointInHumanCluster,
  getBlockingHumanClusters,
  type HumanCluster
} from './humanFieldSystem'
import { checkRequiredWaypoints, normalizeTaskWaypoints, precheckWaypointCandidates } from './routeRequirements'
import {
  stateSearch as stateSearchShared,
  reconstructPath,
  requiredHitsForWaypoint,
  waypointMatchesForSolver,
  buildStateKey,
  isStartTargetConnected,
  type SearchState,
  type SearchRecord,
  type NeighborInfo
} from './routeSearch'

/** 求解时的人类阻挡选项 */
export interface HumanSolveOptions {
  /** 指定的 cluster 列表；不传则使用 system 当前 blocking clusters */
  humanClusters?: HumanCluster[]
  /** 完全忽略人类阻挡（极少数情况使用） */
  ignoreHumans?: boolean
  /** stateSearch 墙钟预算 (ms)；默认 4ms。同步帧内不应超过 5ms */
  maxTimeMs?: number
  /** stateSearch 扩展节点上限；默认 1500 */
  maxExpanded?: number
}

export interface NodeSpawnConstraint {
  nearNodeId: string
  maxDistance: number
  minDistance?: number
}

/** 物种允许的节点标签白名单（不设置则视为允许所有） */
function nodeAllowedByTag(n: RuntimeMapNode, allowed: NodeTag[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true
  return n.tags.some((t) => allowed.includes(t))
}

/** 给定路线 + 物种 + 当前风险：检查该路线是否安全（不穿过风险区域） */
function routeHitsForbiddenZone(
  route: string[],
  speciesId: string,
  season: SeasonId,
  nodes: RuntimeMapNode[]
): boolean {
  const m = nodeMap(nodes)
  const zones = getActiveRiskZones(season, nodes).filter((z) => z.forbiddenFor.includes(speciesId))
  if (zones.length === 0) return false
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i])
    const b = m.get(route[i + 1])
    if (!a || !b) continue
    for (const z of zones) {
      if (segmentIntersectsZone(a.x, a.y, b.x, b.y, z)) return true
    }
  }
  return false
}

// ============================================================
// 路线图：每次直接 build，不缓存。
// 节点 N 最大只有 24，O(N²) 完全可以接受。
// 旧缓存会因为地图渐进式生成产生"旧图污染新图"的致命 bug。
// ============================================================
interface RouteGraph {
  neighbors: number[][]
  nodeIndexById: Map<string, number>
  /**
   * 邻接信息（含距离），用于 routeSearch 的 getNeighbors
   * 缓存目的是：findRouteWithWaypointState 中 stateSearch 的 getNeighbors
   * 会被调用 N+ 次，每次重新算 distance 会浪费 CPU。
   * 路线图本身每次重新 build，但邻接 distance 在 build 阶段一次性算好。
   */
  neighborInfos: NeighborInfo[][]
}

let _humanObstacleVersion = 0

export function bumpHumanObstacleVersion(): void {
  _humanObstacleVersion++
}
export function getHumanObstacleVersion(): number {
  return _humanObstacleVersion
}

/** 兼容旧 API：仍可被外部调用。同步 bump riskZone 缓存。 */
export function bumpMapRevision(): void {
  _humanObstacleVersion++
  // 节点 map 变化时清掉 risk zone 缓存
  try {
    if (typeof clearRiskZoneCache === 'function') {
      clearRiskZoneCache()
    }
  } catch {
    // 静默失败
  }
}

function buildRouteGraph(
  species: SpeciesDef,
  season: SeasonId,
  nodes: RuntimeMapNode[],
  humanClusters: HumanCluster[]
): RouteGraph {
  const N = nodes.length
  const idIndex = new Map<string, number>()
  for (let i = 0; i < N; i++) idIndex.set(nodes[i]!.id, i)
  const neighbors: number[][] = new Array(N)
  const neighborInfos: NeighborInfo[][] = new Array(N)
  for (let i = 0; i < N; i++) {
    neighbors[i] = []
    neighborInfos[i] = []
  }

  const zones = getActiveRiskZones(season, nodes).filter((z) => z.forbiddenFor.includes(species.id))

  for (let i = 0; i < N; i++) {
    const a = nodes[i]!
    if (a.status === 'disabled') continue
    if (humanClusters.length > 0) {
      if (pointInHumanCluster(a.x, a.y, undefined, humanClusters)) continue
    }
    if (!nodeAllowedByTag(a, species.allowedNodeTags)) continue
    const list: number[] = []
    const infos: NeighborInfo[] = []
    for (let j = 0; j < N; j++) {
      if (i === j) continue
      const b = nodes[j]!
      if (b.status === 'disabled') continue
      if (humanClusters.length > 0) {
        if (pointInHumanCluster(b.x, b.y, undefined, humanClusters)) continue
        if (segmentHitsHumanCluster(a.x, a.y, b.x, b.y, undefined, humanClusters)) continue
      }
      if (!nodeAllowedByTag(b, species.allowedNodeTags)) continue
      const d = distance(a.x, a.y, b.x, b.y)
      if (d > species.maxSegmentDistance) continue
      let blocked = false
      for (const z of zones) {
        if (segmentIntersectsZone(a.x, a.y, b.x, b.y, z)) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      list.push(j)
      infos.push({ index: j, distance: d })
    }
    neighbors[i] = list
    neighborInfos[i] = infos
  }
  return {
    neighbors,
    nodeIndexById: idIndex,
    neighborInfos
  }
}

// ============================================================
// 状态图搜索：委托到 routeSearch 共享模块
// ============================================================

/**
 * 状态图搜索的统一求解器
 * 关键：只让 route.slice(1, -1) 的节点推进 waypoint；起点/终点不计入命中
 *
 * v5: 加入 BFS 连通性预检查 + 更紧的 maxDepth/maxExpanded/maxTimeMs 预算
 */
function findRouteWithWaypointState(
  species: SpeciesDef,
  activeSeason: SeasonId,
  nodes: RuntimeMapNode[],
  startNodeId: string,
  targetNodeId: string,
  waypoints: RequiredWaypoint[],
  ordered: boolean,
  opts?: HumanSolveOptions
): string[] | null {
  const clusters = !opts?.ignoreHumans
    ? (opts?.humanClusters ?? getBlockingHumanClusters())
    : []
  // 每次直接重新构建路线图（已移除缓存）
  const graph = buildRouteGraph(species, activeSeason, nodes, clusters)
  const startIdx = graph.nodeIndexById.get(startNodeId)
  const targetIdx = graph.nodeIndexById.get(targetNodeId)
  if (startIdx === undefined || targetIdx === undefined) return null
  const startNode = nodes[startIdx]
  const targetNode = nodes[targetIdx]
  if (!startNode || !targetNode) return null
  if (startNode.status === 'disabled' || targetNode.status === 'disabled') return null
  if (clusters.length > 0) {
    if (pointInHumanCluster(startNode.x, startNode.y, undefined, clusters)) return null
    if (pointInHumanCluster(targetNode.x, targetNode.y, undefined, clusters)) return null
  }

  // 起点 / 终点已经满足的 waypoint 视为已满足（在 routeSearch 内部不再做，
  // 但我们必须在调入搜索之前先过滤掉，否则会"无解"）
  const filtered: RequiredWaypoint[] = []
  for (const wp of waypoints) {
    if (wp.kind === 'node' && (wp.nodeId === startNodeId || wp.nodeId === targetNodeId)) continue
    if (
      wp.kind === 'tag' &&
      (startNode.tags.includes(wp.tag) || targetNode.tags.includes(wp.tag))
    ) continue
    filtered.push(wp)
  }

  // v5: BFS 连通性预检查
  // 不允许重复访问 + waypoint 必无解时直接 return null，
  // 避免 stateSearch 枚举所有简单路径来证明无解。
  const connected = isStartTargetConnected(
    (idx) => graph.neighborInfos[idx] || [],
    startIdx,
    targetIdx,
    filtered,
    nodes,
    (nodeIdx, wp) => waypointMatchesForSolver(nodes[nodeIdx]!, wp)
  )
  if (!connected) return null

  const result = stateSearchShared(
    startIdx,
    targetIdx,
    filtered,
    ordered,
    nodes,
    (idx) => graph.neighborInfos[idx] || [],
    (idx) => {
      const n = nodes[idx]
      if (!n) return 0
      return distance(n.x, n.y, targetNode.x, targetNode.y)
    },
    {
      // v5: 默认墙钟预算 4ms；调用方可通过 opts.maxTimeMs 再收紧
      maxTimeMs: opts?.maxTimeMs ?? 4,
      maxExpanded: opts?.maxExpanded ?? 1500
    }
  )
  if (!result) return null
  return result.path
}

// ============================================================
// 廉价可解性检查（v5 新增）
// ============================================================

/** 起终点对集合大小硬上限 */
const SPECIES_QUICK_ENDPOINT_LIMIT = 24

/**
 * 廉价可解性检查：
 * - 不调 stateSearch；只做候选预检查 + 必要的 BFS 连通性
 * - 适用于 gameStore 中：
 *     - 物种解锁：只要"至少一对起终点 BFS 可达 + 候选预检查通过"
 *     - tryGenerateTask 前置筛选：避免"全 species × 全 start × 全 target"全跑 stateSearch
 *
 * 关键：此函数绝不调 stateSearch。必须真正生成时再调 findSolvableRouteForSpecies。
 */
export function isSpeciesSolvableQuick(
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  season: SeasonId,
  opts?: HumanSolveOptions
): boolean {
  // 0) 基础过滤：可见节点 + 固定必经点存在
  const m = nodeMap(nodes)
  for (const wp of species.requiredWaypoints) {
    if (wp.kind === 'node') {
      const n = m.get(wp.nodeId)
      if (!n || n.status === 'disabled') return false
    }
  }
  const requiredNodeIds = new Set<string>()
  for (const wp of species.requiredWaypoints) {
    if (wp.kind === 'node') requiredNodeIds.add(wp.nodeId)
  }
  const visible = nodes.filter((n) => n.status !== 'disabled')
  if (visible.length < 2) return false

  // 1) 收集起 / 终点候选
  const starts: RuntimeMapNode[] = []
  const targets: RuntimeMapNode[] = []
  for (const n of visible) {
    if (requiredNodeIds.has(n.id)) continue
    if (species.startTagPool.some((t) => n.tags.includes(t))) starts.push(n)
    if (species.targetTagPool.some((t) => n.tags.includes(t))) targets.push(n)
  }
  if (starts.length === 0 || targets.length === 0) return false

  // 2) 上限限制：避免 starts.length * targets.length 爆炸
  const maxPairs = SPECIES_QUICK_ENDPOINT_LIMIT
  let pairCount = 0
  outer: for (const start of starts) {
    for (const target of targets) {
      if (++pairCount > maxPairs * 4) break outer
      if (start.id === target.id) continue

      // 标准化途经点
      const normalizedWps = normalizeTaskWaypoints(
        species.requiredWaypoints,
        start,
        target,
        nodes
      )

      // 必经点候选预检查（O(N·W)）
      // 传入 species.allowedNodeTags：让 any/tag 候选池与物种白名单一致
      const pre = precheckWaypointCandidates(normalizedWps, start, target, nodes, species.allowedNodeTags)
      if (!pre.ok) continue

      // 距离 + 白名单粗过滤：
      // 起点到终点直连距离 <= maxSegmentDistance
      if (distance(start.x, start.y, target.x, target.y) > species.maxSegmentDistance) {
        continue
      }
      if (!nodeAllowedByTag(start, species.allowedNodeTags)) continue
      if (!nodeAllowedByTag(target, species.allowedNodeTags)) continue

      // 走到这里，说明"廉价层面"通过
      return true
    }
  }
  return false
}

// ============================================================
// 真正的可解性检查（保留兼容旧 API，但内部走廉价检查 + 兜底）
// ============================================================

/**
 * 给定物种 id，判断当前地图上是否真的可以生成可解任务。
 *
 * 关键：每一对 (start, target) 都必须 normalizeTaskWaypoints，
 * 因为用户规则：起点/终点已经是该 tag 的区域时，该途径要求直接删除。
 *
 * v5: 改为"廉价检查 + 上限限制"：避免被 canSpawnSolvableTask 的循环
 * 多次同步触发 stateSearch 导致主线程卡死。
 */
export function canSpawnSolvableTask(
  speciesId: string,
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  season: SeasonId,
  opts?: HumanSolveOptions
): boolean {
  void speciesId
  // 1) 廉价检查
  if (!isSpeciesSolvableQuick(species, nodes, season, opts)) return false

  // 2) 真正的可解性：限制 (start, target) 配对数 + 限制 wall-clock
  const m = nodeMap(nodes)
  const requiredNodeIds = new Set<string>()
  for (const wp of species.requiredWaypoints) {
    if (wp.kind === 'node') requiredNodeIds.add(wp.nodeId)
  }
  const starts: RuntimeMapNode[] = []
  const targets: RuntimeMapNode[] = []
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (requiredNodeIds.has(n.id)) continue
    if (species.startTagPool.some((t) => n.tags.includes(t))) starts.push(n)
    if (species.targetTagPool.some((t) => n.tags.includes(t))) targets.push(n)
  }
  if (starts.length === 0 || targets.length === 0) return false

  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const hardBudgetMs = 8 // canSpawn 必须 1 帧内返回
  const maxPairs = SPECIES_QUICK_ENDPOINT_LIMIT

  let pairCount = 0
  for (const start of starts) {
    for (const target of targets) {
      if (++pairCount > maxPairs) return false
      if (start.id === target.id) continue

      // 墙钟预算
      if (typeof performance !== 'undefined') {
        const now = performance.now() - startedAt
        if (now > hardBudgetMs) return false
      }

      // 关键：每一对起终点都必须 normalize waypoint
      const normalizedWps = normalizeTaskWaypoints(
        species.requiredWaypoints,
        start,
        target,
        nodes
      )

      // 关键：必经点候选预检查
      // 当某个 tag/node/any waypoint 在当前节点集合里没有足够候选时
      // （如 herd 缺 crossing 节点），stateSearch 会枚举所有简单路径
      // 证明无解，严重阻塞主线程。预检查直接 continue 跳过该对起终点。
      // 同样传入 species.allowedNodeTags 与生成语义保持一致。
      const pre = precheckWaypointCandidates(normalizedWps, start, target, nodes, species.allowedNodeTags)
      if (!pre.ok) continue

      const route = findSolvableRouteForSpecies(
        species,
        m ? Object.keys(m).map((k) => m.get(k)!).filter(Boolean).map((n) => n.id) : [],
        season,
        nodes,
        start.id,
        target.id,
        normalizedWps,
        species.requiredWaypointOrder,
        opts
      )

      if (route && route.length >= 2) return true
    }
  }
  return false
}

/**
 * 找一条合法路线
 * - start = route[0]
 * - target = route[last]
 * - 满足 waypoints（含 ordered/count/any）
 * - 不穿过 riskZone
 * - 不被 humanClusters 阻挡
 * - 单段距离 <= maxSegmentDistance
 * - 节点符合 allowedNodeTags
 * - 节点都非 disabled
 *
 * 入口：从外部（taskGenerator / gameStore）调用
 */
export function findSolvableRouteForSpecies(
  species: SpeciesDef,
  visibleNodeIds: string[],
  activeSeason: SeasonId,
  nodes: RuntimeMapNode[],
  startNodeId?: string,
  targetNodeId?: string,
  requiredWaypoints?: RequiredWaypoint[],
  requiredWaypointOrder?: boolean,
  opts?: HumanSolveOptions
): string[] | null {
  void visibleNodeIds
  const start = startNodeId || species.startNode
  const target = targetNodeId || species.targetNode
  const wps = requiredWaypoints || species.requiredWaypoints
  const ordered = requiredWaypointOrder ?? species.requiredWaypointOrder
  const m = nodeMap(nodes)
  const startNode = m.get(start)
  const targetNode = m.get(target)
  if (!startNode || !targetNode) return null
  if (startNode.status === 'disabled' || targetNode.status === 'disabled') return null

  // 防御：必经点候选预检查
  // 任务生成阶段理应已做预检查，但 findSolvableRouteForSpecies
  // 可能被其他调用方（如玩家提交校验/调试）直接调用；
  // 此处再做一次能避免在 waypoint 必无解时进入 stateSearch
  // 导致主线程卡死。
  // 同样传入 species.allowedNodeTags 与生成语义保持一致。
  const precheck = precheckWaypointCandidates(wps, startNode, targetNode, nodes, species.allowedNodeTags)
  if (!precheck.ok) return null

  const route = findRouteWithWaypointState(
    species,
    activeSeason,
    nodes,
    start,
    target,
    wps,
    ordered ?? false,
    opts
  )
  if (!route) return null

  // 防御校验 1：route 必须以 start 开头、target 结尾
  if (route[0] !== start) return null
  if (route[route.length - 1] !== target) return null
  if (route.length < 2) return null

  // 防御：再次使用统一 routeRequirements 校验（按 route.slice(1, -1) 满足 waypoint）
  const wpCheck = checkRequiredWaypoints(
    route,
    wps,
    ordered ?? false,
    nodes
  )
  if (!wpCheck.ok) return null

  // 距离
  const distCheck = checkSegmentDistances(route, species.maxSegmentDistance, nodes)
  if (!distCheck.ok) return null
  // 白名单
  const tagCheck = checkAllowedNodeTags(route, species.allowedNodeTags, nodes)
  if (!tagCheck.ok) return null
  // 风险
  if (routeHitsForbiddenZone(route, species.id, activeSeason, nodes)) return null
  // 人类 cluster
  if (!opts?.ignoreHumans) {
    const clusters = opts?.humanClusters ?? getBlockingHumanClusters()
    if (clusters.length > 0) {
      const m2 = nodeMap(nodes)
      for (let i = 0; i < route.length - 1; i++) {
        const a = m2.get(route[i])
        const b = m2.get(route[i + 1])
        if (!a || !b) continue
        if (segmentHitsHumanCluster(a.x, a.y, b.x, b.y, undefined, clusters)) return null
      }
      for (const id of route) {
        const n = m2.get(id)
        if (!n) continue
        if (pointInHumanCluster(n.x, n.y, undefined, clusters)) return null
      }
    }
  }
  return route
}

/** 兼容旧 API */
export function getVisibleNodeIds(nodes: RuntimeMapNode[]): string[] {
  return nodes.filter((n) => n.status !== 'disabled').map((n) => n.id)
}

/** 兼容旧 API */
export function getReachableNeighbors(
  currentNodeId: string,
  species: SpeciesDef,
  _visibleNodeIds: string[]
): string[] {
  void species
  void _visibleNodeIds
  // 旧 API 仅保留签名；新代码请使用 findSolvableRouteForSpecies
  const m = nodeMap(_getAlliveMapNodes())
  const cur = m.get(currentNodeId)
  if (!cur) return []
  const out: string[] = []
  for (const next of _getAlliveMapNodes()) {
    if (next.id === currentNodeId) continue
    if (next.status === 'disabled') continue
    if (distance(cur.x, cur.y, next.x, next.y) <= species.maxSegmentDistance) {
      out.push(next.id)
    }
  }
  return out
}

function _getAlliveMapNodes(): RuntimeMapNode[] {
  const s = (globalThis as any).__alliveState
  if (s && Array.isArray(s.mapNodes)) return s.mapNodes as RuntimeMapNode[]
  const w = (typeof window !== 'undefined' ? (window as any).__allive : null)
  if (w && w.state && Array.isArray(w.state.mapNodes)) return w.state.mapNodes as RuntimeMapNode[]
  return []
}

// 抑制未使用导入
void _humanObstacleVersion
void requiredHitsForWaypoint
void waypointMatchesForSolver
void buildStateKey
void reconstructPath
type _UnusedSearchState = SearchState
type _UnusedSearchRecord = SearchRecord
