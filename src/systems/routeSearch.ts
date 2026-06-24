// 通用路线状态图搜索器
// =============================================================
// 这里是 solvability.ts 和 riskZonePlanner.ts 共用的唯一搜索器。
// 关键规则：
// - 初始 state 在 start 节点，start 不能计入 waypoint
// - target 永远不能计入 waypoint
// - 只有 nextNode 不是 start 也不是 target 时才能推进 waypoint
// - 成功条件：cur.state.nodeIndex === targetIdx && allWaypointsSatisfied
// - 回溯路径必须包含 start 和 target，且顺序正确
// - SearchRecord 改为：{ key, state, prevKey }，用 Map<key, SearchRecord> 存
//
// 关键修复（鲑鱼不可重复经过同一节点）：
// - SearchState 显式记录 visited nodes（压缩为 sorted index 数组）
// - 每次扩展邻居时，如果 nb.index 已经在 visited 中，直接跳过
// - buildStateKey 把 visited 信息编码进去，避免不同访问历史被错误合并
// - 这与 gameStore.pushDragNode 的"path 不允许包含重复节点"完全一致
//
// v2 修复（主线程卡死）：
// - 引入 maxDepth / maxExpanded / maxTimeMs 三个兜底
//   maxDepth  = 节点数 + waypoint 命中所需步数 + 少量富余
//   maxExpanded = 严格控制弹出 open 队列次数，避免"无解时遍历所有简单路径"
//   maxTimeMs  = 同步搜索的硬墙钟预算；命中后立即返回 null
// - 默认 maxDepth 收紧到 N + waypoint * 2，避免"枚举所有简单路径"
// - 默认 maxExpanded 由 8000 收紧到 2000；调用方可按场景再缩小
// - 调用方应先做 waypoint 候选预检查 + 图连通性预检查
// =============================================================
import type { RuntimeMapNode } from '../data/gameData'
import type { RequiredWaypoint } from '../data/speciesTemplates'

export interface SearchState {
  nodeIndex: number
  /** ordered 模式：当前完成到第几个 waypoint */
  waypointCursor: number
  /** ordered 模式：当前 waypoint 已命中次数 */
  currentHits: number
  /** unordered 模式：每个 waypoint 当前完成计数 */
  waypointCounts: number[]
  /**
   * 已访问节点集合（包含 start 和当前 nodeIndex，但不含 target）
   * 扩展邻居时如果 nb.index 已经在 visited 中，跳过该邻居。
   * 用 sorted 数组存储，方便 buildStateKey 编码。
   */
  visited: number[]
  g: number
}

export interface SearchRecord {
  key: string
  state: SearchState
  prevKey: string | null
}

export function requiredHitsForWaypoint(wp: RequiredWaypoint): number {
  if (wp.kind === 'node') return 1
  return Math.max(1, wp.count)
}

export function waypointMatchesForSolver(
  node: RuntimeMapNode,
  wp: RequiredWaypoint
): boolean {
  if (wp.kind === 'node') return node.id === wp.nodeId
  if (wp.kind === 'tag') return node.tags.includes(wp.tag)
  if (wp.kind === 'any') {
    // 任意可通行中转点：求解器已经在 buildRouteGraph 里把
    // 禁用/生态不可用/物种禁行/起终点节点都过滤掉了，这里直接返回 true。
    return true
  }
  return false
}

/**
 * 把 visited 数组压缩成"v:<sorted-index>:<sorted-index>:..."
 * 不含 visited 时返回 "v:*"（空集合）
 */
function visitedTag(visited: number[]): string {
  if (!visited || visited.length === 0) return 'v:*'
  // visited 已经在使用时按顺序 push，本身就有序
  return 'v:' + visited.join(':')
}

export function buildStateKey(
  nodeIndex: number,
  cursor: number,
  hits: number,
  counts: number[],
  visited?: number[]
): string {
  return `${nodeIndex}|${cursor}|${hits}|${counts.join(',')}|${visitedTag(visited ?? [])}`
}

/**
 * 到达 nextIdx 时推进 waypoint 状态。
 * 严格遵守：start / target 永远不计入 waypoint 命中。
 */
export function advanceProgressOnArrival(
  state: SearchState,
  nodeIdx: number,
  startIdx: number,
  targetIdx: number,
  waypoints: RequiredWaypoint[],
  ordered: boolean,
  nodes: RuntimeMapNode[]
): SearchState {
  const isStart = nodeIdx === startIdx
  const isTarget = nodeIdx === targetIdx
  const canCountAsWaypoint = !isStart && !isTarget

  if (!canCountAsWaypoint || waypoints.length === 0) {
    return state
  }

  if (ordered) {
    const wp = waypoints[state.waypointCursor]
    if (!wp) return state
    if (!waypointMatchesForSolver(nodes[nodeIdx]!, wp)) return state

    const required = requiredHitsForWaypoint(wp)
    const nextHits = state.currentHits + 1

    if (nextHits >= required) {
      return {
        ...state,
        waypointCursor: state.waypointCursor + 1,
        currentHits: 0
      }
    }

    return {
      ...state,
      currentHits: nextHits
    }
  }

  const counts = state.waypointCounts.slice()
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]!
    if (!waypointMatchesForSolver(nodes[nodeIdx]!, wp)) continue
    if ((counts[i] ?? 0) >= requiredHitsForWaypoint(wp)) continue
    counts[i] = (counts[i] ?? 0) + 1
    break
  }

  return {
    ...state,
    waypointCounts: counts
  }
}

/** 是否所有 waypoint 都已满足 */
export function allWaypointsSatisfied(
  state: SearchState,
  waypoints: RequiredWaypoint[],
  ordered: boolean
): boolean {
  if (waypoints.length === 0) return true
  if (ordered) return state.waypointCursor >= waypoints.length
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i]!
    if ((state.waypointCounts[i] ?? 0) < requiredHitsForWaypoint(wp)) return false
  }
  return true
}

export interface NeighborInfo {
  /** 邻居节点 index */
  index: number
  /** 边距离 */
  distance: number
}

/**
 * stateSearch 选项
 * - maxDepth: 路径长度（边数）上限；超过即剪枝
 * - maxExpanded: 扩展节点（弹出 open 队列）总数上限
 * - maxTimeMs: 同步搜索墙钟预算（ms），命中即返回 null
 *
 * 触发背景：13 节点 / 1 分钟 / 任务快到终点的卡死来自
 * canSpawnSolvableTask → generateTask 同步调用 stateSearch；
 * 当 waypoint 在当前节点集合里根本无解（如 herd 缺 crossing），
 * 求解器为证明无解枚举大量简单路径，阻塞主线程。
 * 用 maxDepth 限制路径长度（waypoint 命中不需要重复访问同一节点），
 * 用 maxExpanded 做兜底（命中即返回 null），
 * 用 maxTimeMs 兜底再兜底（同步搜索在浏览器帧内不应超过 5ms）。
 */
export interface StateSearchOptions {
  maxDepth?: number
  maxExpanded?: number
  maxTimeMs?: number
}

/**
 * 计算 waypoint 命中所需的"额外步数"：每个 waypoint 至少需要 1 步
 * （不允许重复访问同一节点）
 */
function waypointExtraSteps(waypoints: RequiredWaypoint[]): number {
  let extra = 0
  for (const wp of waypoints) {
    if (wp.kind === 'node') {
      // 固定节点已由 precheckWaypointCandidates 保证存在且不在 start/target
      // 1 步足够
      extra += 1
    } else {
      // tag / any：count 步
      extra += Math.max(1, wp.count)
    }
  }
  return extra
}

/**
 * 计算合理的 maxDepth：
 * - 不允许重复访问同一节点，最多走 N-1 条边
 * - waypoint 命中需要额外步数
 * - 留 2 步富余
 */
export function computeMaxDepth(
  nodeCount: number,
  waypoints: RequiredWaypoint[]
): number {
  const N = Math.max(2, nodeCount)
  // 不重复访问：最多走 N-1 条边
  // 加上 waypoint 命中所需的额外步数
  // 加 1 步富余（用于到达 target）
  return Math.min(N - 1, N - 1 + waypointExtraSteps(waypoints) + 1)
}

/**
 * 通用 A* 搜索
 * @param getNeighbors 返回 (neighborIdx, edgeDistance) 列表
 * @param heuristic 给定节点 index，返回到 target 的启发式距离
 * @param opts.maxDepth 路径边数上限（超过即丢弃该邻居）
 * @param opts.maxExpanded 扩展总数上限（命中即返回 null）
 * @param opts.maxTimeMs 墙钟预算上限（命中即返回 null）
 *
 * 关键修复（鲑鱼不可重复经过同一节点）：
 * - SearchState 增加 visited: number[]，记录已访问节点 index
 * - 每次扩展邻居时，如果 nb.index 已在 cur.state.visited 中则跳过
 * - target 不需要进 visited（到达 target 即结束）
 * - 起点进 visited（绝不能"绕回起点"）
 */
export function stateSearch(
  startIdx: number,
  targetIdx: number,
  waypoints: RequiredWaypoint[],
  ordered: boolean,
  nodes: RuntimeMapNode[],
  getNeighbors: (idx: number) => NeighborInfo[],
  heuristic: (idx: number) => number,
  opts?: StateSearchOptions
): { path: string[]; records: Map<string, SearchRecord> } | null {
  if (startIdx === targetIdx) {
    if (waypoints.length === 0) {
      return { path: [nodes[startIdx]!.id], records: new Map() }
    }
    return null
  }

  // 默认上限（v2：比之前更紧）
  // - maxDepth：基于"不重复访问"性质计算 (N-1 + waypoint 额外步数)
  // - maxExpanded：兜底，命中即放弃本次搜索
  // - maxTimeMs：墙钟预算，命中即返回 null
  const N = nodes.length
  const maxDepth = Math.max(
    2,
    Math.min(
      opts?.maxDepth ?? computeMaxDepth(N, waypoints),
      N - 1 + waypointExtraSteps(waypoints) + 1
    )
  )
  const maxExpanded = Math.max(
    64,
    Math.min(opts?.maxExpanded ?? 2000, 4000)
  )
  const maxTimeMs = Math.max(0.5, opts?.maxTimeMs ?? 5)
  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now()

  const initialCounts: number[] = waypoints.map(() => 0)
  // 起点也放进 visited，避免后续绕回起点
  const initialVisited: number[] = [startIdx]
  const initialKey = buildStateKey(startIdx, 0, 0, initialCounts, initialVisited)
  const initial: SearchState = {
    nodeIndex: startIdx,
    waypointCursor: 0,
    currentHits: 0,
    waypointCounts: initialCounts,
    visited: initialVisited,
    g: 0
  }
  const records = new Map<string, SearchRecord>()
  records.set(initialKey, {
    key: initialKey,
    state: initial,
    prevKey: null
  })
  const open: SearchRecord[] = [records.get(initialKey)!]
  const closed = new Set<string>()

  let expanded = 0
  const hardExpandedCap = maxExpanded
  while (open.length > 0) {
    // 墙钟预算：命中即放弃
    if (typeof performance !== 'undefined') {
      const now = performance.now() - startedAt
      if (now > maxTimeMs) return null
    }
    if (++expanded > hardExpandedCap) return null
    let bestIdx = 0
    let bestF = open[0]!.state.g + heuristic(open[0]!.state.nodeIndex)
    for (let i = 1; i < open.length; i++) {
      const r = open[i]!
      const f = r.state.g + heuristic(r.state.nodeIndex)
      if (f < bestF) {
        bestF = f
        bestIdx = i
      }
    }
    const cur = open.splice(bestIdx, 1)[0]!
    if (closed.has(cur.key)) continue
    closed.add(cur.key)

    // 成功条件：到达 target 且 waypoint 全满
    if (cur.state.nodeIndex === targetIdx) {
      if (allWaypointsSatisfied(cur.state, waypoints, ordered)) {
        return {
          path: reconstructPath(cur.key, records, nodes),
          records
        }
      }
      // 否则还要继续扩展（绕路以满足 waypoint）
      // 但 target 已是当前节点，不能再扩展到自己
      continue
    }

    // 深度剪枝：当前路径（已访问节点数 - 1 = 已走边数）已到上限
    if (cur.state.visited.length - 1 >= maxDepth) continue

    const neighbors = getNeighbors(cur.state.nodeIndex)
    for (const nb of neighbors) {
      if (nb.index === cur.state.nodeIndex) continue

      // 关键：禁止重复经过同一节点（与 pushDragNode 行为一致）
      // visited 已包含 start；target 不进 visited（到达 target 即结束）
      if (nb.index !== targetIdx && cur.state.visited.includes(nb.index)) continue

      // 深度剪枝：到达 nb 后路径边数 = visited.length（含 nb 后）
      const nextEdgeCount = nb.index === targetIdx
        ? cur.state.visited.length
        : cur.state.visited.length + 1
      if (nextEdgeCount > maxDepth) continue

      // 推进 visited：把 nb.index 加入（target 不进）
      const nextVisited =
        nb.index === targetIdx
          ? cur.state.visited
          : cur.state.visited.concat(nb.index)

      const arrivedStateBase: SearchState = {
        nodeIndex: nb.index,
        waypointCursor: cur.state.waypointCursor,
        currentHits: cur.state.currentHits,
        waypointCounts: cur.state.waypointCounts.slice(),
        visited: nextVisited,
        g: cur.state.g + nb.distance
      }
      const arrivedState = advanceProgressOnArrival(
        arrivedStateBase,
        nb.index,
        startIdx,
        targetIdx,
        waypoints,
        ordered,
        nodes
      )
      const nextKey = buildStateKey(
        arrivedState.nodeIndex,
        arrivedState.waypointCursor,
        arrivedState.currentHits,
        arrivedState.waypointCounts,
        arrivedState.visited
      )
      if (closed.has(nextKey)) continue
      if (records.has(nextKey)) {
        // 已存在更优/等优记录：跳过
        const existing = records.get(nextKey)!
        if (existing.state.g <= arrivedState.g) continue
      }
      const rec: SearchRecord = {
        key: nextKey,
        state: arrivedState,
        prevKey: cur.key
      }
      records.set(nextKey, rec)
      open.push(rec)
    }
  }
  return null
}

/**
 * 关键修复：
 * - records 存的是每个 state 自身 + prevKey
 * - reconstruct 直接沿 prevKey 走，每个 rec.state.nodeIndex 都 push 到 path
 * - 保证 path 起点 = start 节点，path 终点 = final 节点（target）
 */
export function reconstructPath(
  finalKey: string,
  records: Map<string, SearchRecord>,
  nodes: RuntimeMapNode[]
): string[] {
  const path: string[] = []
  let key: string | null = finalKey
  const guard = new Set<string>()

  while (key) {
    if (guard.has(key)) break
    guard.add(key)

    const rec = records.get(key)
    if (!rec) break

    path.unshift(nodes[rec.state.nodeIndex]!.id)
    key = rec.prevKey
  }

  return path
}

/**
 * 图连通性预检查（O(N+E)）：
 * - 从 startIdx BFS 遍历图，统计可达节点集
 * - 如果 targetIdx 不可达，直接返回 false
 * - 如果某个 waypoint 需要的 tag/node 不在可达集里，也返回 false
 * - 用于在调入 stateSearch 之前快速排除"必无解"的情况，
 *   避免 stateSearch 枚举所有简单路径来证明无解，阻塞主线程。
 *
 * @param getNeighbors 邻居函数（与 stateSearch 同一个）
 * @param startIdx 起点 index
 * @param targetIdx 终点 index
 * @param waypoints 必经点（已 normalize）
 * @param nodes 节点列表
 * @param isWaypointMatch 给定节点 index，判断是否满足指定 waypoint
 * @returns true = 可解性层面通过，可进入 stateSearch
 */
export function isStartTargetConnected(
  getNeighbors: (idx: number) => NeighborInfo[],
  startIdx: number,
  targetIdx: number,
  waypoints: RequiredWaypoint[],
  nodes: RuntimeMapNode[],
  isWaypointMatch: (nodeIdx: number, wp: RequiredWaypoint) => boolean
): boolean {
  if (startIdx === targetIdx) return waypoints.length === 0

  // BFS 统计可达节点
  const reachable = new Set<number>([startIdx])
  const queue: number[] = [startIdx]
  // 节点数硬上限，避免极端情况下爆栈
  const maxQueue = nodes.length + 4
  let head = 0
  while (head < queue.length && queue.length < maxQueue) {
    const u = queue[head++]!
    const ns = getNeighbors(u)
    for (const nb of ns) {
      if (nb.index === u) continue
      if (reachable.has(nb.index)) continue
      reachable.add(nb.index)
      queue.push(nb.index)
    }
  }

  if (!reachable.has(targetIdx)) return false

  // 验证每个 waypoint 是否有可达候选
  for (const wp of waypoints) {
    let found = false
    for (const idx of reachable) {
      if (idx === startIdx || idx === targetIdx) continue
      if (isWaypointMatch(idx, wp)) {
        found = true
        break
      }
    }
    if (!found) return false
  }
  return true
}
