// 统一途径点（required waypoint）规则
// =============================================================
// 这是任务生成 / 路线求解 / 玩家提交 / 风险区规划 共用的唯一途径点逻辑。
// 任何系统都不应再复制一份"tag/node/order/count" 校验代码。
//
// 核心规则：
// 1) 起点 = route[0]；终点 = route[last]。
// 2) 途径点只能由 route.slice(1, -1) 满足；
//    起点和终点永远不能算作"途径"满足。
// 3) 同一节点在同一次校验中只能算一次。
// 4) 任何 waypoint 都不允许与起点/终点的 tag/身份重叠：
//    任务生成时若起点/终点已具备该 tag，则删除该 tag waypoint。
// 5) 任何 waypoint 都不允许在"显示名称相同但语义不同"的节点上误命中：
//    使用 RuntimeMapNode.equivalenceKey / RuntimeMapNode.semanticKey 区分。
// 6) `kind: 'any'` 表示"任意可通行的中间节点"：
//    - 不含起点/终点
//    - 仍受节点禁用、生态可用、风险、人类阻挡、距离、资源等既有规则限制
//    - 仍可被 species.allowedNodeTags（白名单）过滤
//    - 不再读取 tagPool / eligibleTags；不允许把 any 暗中限制成某几个 tag
// =============================================================
import type { RuntimeMapNode } from '../data/gameData'
import type { NodeTag } from '../data/gameConfig'
import type { RequiredWaypoint } from '../data/speciesTemplates'

/** 节点 id -> 节点 的快速查询 */
export function nodeMap(nodes: RuntimeMapNode[]): Map<string, RuntimeMapNode> {
  return new Map(nodes.map((n) => [n.id, n] as const))
}

/**
 * 返回 route 中"中间节点"的 id 列表（不包含起点 / 终点）。
 * 没有中间节点时返回空数组。
 */
export function getInteriorRouteIds(route: string[]): string[] {
  if (route.length <= 2) return []
  return route.slice(1, -1)
}

/**
 * 单个节点是否满足单个 waypoint 的语义。
 * - 'tag': 节点具有该 tag
 * - 'node': 节点 id === nodeId
 * - 'any': 任意可通行的中间节点（不含起点/终点；具体白名单/禁行/生态由调用方筛过）
 *   任何 waypoint 都不会把 route 起点/终点算作命中 — 由调用方传入 interiorIds
 */
export function waypointMatchesNode(
  node: RuntimeMapNode | undefined | null,
  wp: RequiredWaypoint
): boolean {
  if (!node) return false
  if (wp.kind === 'node') {
    return node.id === wp.nodeId
  }
  if (wp.kind === 'tag') {
    return node.tags.includes(wp.tag)
  }
  // kind === 'any'：任意可通行的中间节点。
  // 节点是否被 species 允许 / 是否被禁用 / 是否生态不可用，
  // 统一由调用方在筛选候选池时过滤；这里只做"白名单兜底"。
  return true
}

/**
 * 标准化"任务级别"的途径点：
 * 1) 删除与起终点重复的 node waypoint
 * 2) 删除起终点本身就具备该 tag 的 tag waypoint（用户规则：起点/终点已经是该区域时，
 *    这个途径要求直接从任务中删除，不允许 UI 还显示该区域）
 * 3) 合并等价途径点（同类 tag）
 */
export function normalizeTaskWaypoints(
  rawWaypoints: RequiredWaypoint[],
  start: RuntimeMapNode,
  target: RuntimeMapNode,
  _nodes: RuntimeMapNode[]
): RequiredWaypoint[] {
  const output: RequiredWaypoint[] = []
  for (const wp of rawWaypoints) {
    if (wp.kind === 'node') {
      if (wp.nodeId === start.id || wp.nodeId === target.id) continue
      output.push(wp)
      continue
    }
    if (wp.kind === 'tag') {
      const endpointMatches =
        start.tags.includes(wp.tag) || target.tags.includes(wp.tag)
      if (endpointMatches) continue
      output.push(wp)
      continue
    }
    // kind === 'any'
    output.push(wp)
  }
  return mergeEquivalentWaypoints(output)
}

/**
 * 快速预检查：当前 nodes 集合（不含起终点）中，
 * 是否有足够"不同"的候选节点来满足 normalized 后的 waypoint 集合。
 *
 * 关键背景：
 * - canSpawnSolvableTask / generateTask 同步调用 stateSearch；
 * - 当某个 waypoint 在地图上根本没有候选（如 herd 缺 crossing），
 *   stateSearch 会枚举所有简单路径证明无解，阻塞主线程。
 * - 这里的预检查在 O(N·W) 内给出"必无解"的早期判断，避免进入 stateSearch。
 *
 * 严格遵守：
 * - 起点 / 终点永远不计入 waypoint 候选
 * - disabled 节点不计入候选
 * - 候选池统一受 species.allowedNodeTags 白名单过滤
 *   （调用方通过 allowedNodeTags 传入；不传则视为不限制）
 * - kind: 'node' 只看 nodeId 是否存在且非 disabled 且不是 start/target
 * - kind: 'tag' 至少需要 count 个不同节点（带该 tag，且非 start/target / disabled / 物种禁行）
 * - kind: 'any' 只检查"可通行中间节点"数量是否足够（不再读取标签白名单）
 *
 * 返回：
 * - { ok: true } 表示"存在性层面"可通过，进入 stateSearch
 * - { ok: false, reason } 表示"必无解"，调用方应直接 false/continue
 */
export interface WaypointPrecheckResult {
  ok: boolean
  reason?: string
}

export function precheckWaypointCandidates(
  waypoints: RequiredWaypoint[],
  start: RuntimeMapNode,
  target: RuntimeMapNode,
  nodes: RuntimeMapNode[],
  allowedNodeTags?: NodeTag[]
): WaypointPrecheckResult {
  if (!waypoints || waypoints.length === 0) return { ok: true }

  // 统一候选池：非 disabled、非 start/target、且满足 species.allowedNodeTags 白名单
  const allowList = allowedNodeTags && allowedNodeTags.length > 0 ? allowedNodeTags : null
  const isAllowed = (n: RuntimeMapNode): boolean => {
    if (!allowList) return true
    return n.tags.some((t) => allowList.includes(t))
  }
  let poolCount = 0
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (n.id === start.id || n.id === target.id) continue
    if (!isAllowed(n)) continue
    poolCount++
  }
  if (poolCount === 0) {
    return { ok: false, reason: '中间候选池为空' }
  }

  for (const wp of waypoints) {
    if (wp.kind === 'node') {
      // 固定节点：必须存在、非 disabled、不是 start/target
      if (wp.nodeId === start.id || wp.nodeId === target.id) {
        return { ok: false, reason: `必经点与起终点冲突：${wp.label}` }
      }
      const n = nodes.find((x) => x.id === wp.nodeId)
      if (!n || n.status === 'disabled') {
        return { ok: false, reason: `必经点缺失：${wp.label}` }
      }
      // node waypoint 也必须满足物种白名单
      if (!isAllowed(n)) {
        return { ok: false, reason: `必经点不在物种白名单内：${wp.label}` }
      }
      continue
    }
    if (wp.kind === 'tag') {
      const need = Math.max(1, wp.count)
      // 先按 start/target 是否带该 tag 排除；其实 normalizeTaskWaypoints 已经做过，
      // 但 precheck 单独调用时不保证，所以这里再判一次以保证正确性
      if (start.tags.includes(wp.tag) || target.tags.includes(wp.tag)) {
        return { ok: false, reason: `起终点已包含标签 ${wp.tag}，waypoint 应已删除` }
      }
      let matches = 0
      for (const n of nodes) {
        if (n.status === 'disabled') continue
        if (n.id === start.id || n.id === target.id) continue
        if (!isAllowed(n)) continue
        if (n.tags.includes(wp.tag)) matches++
        if (matches >= need) break
      }
      if (matches < need) {
        return {
          ok: false,
          reason: `标签 ${wp.tag} 候选不足（需要 ${need}，实际 ${matches}）`
        }
      }
      continue
    }
    // kind === 'any'
    // 任意可通行中间节点：只看池中候选数量是否足够；
    // 不再读取任何标签白名单 / tagPool。
    const need = Math.max(1, wp.count)
    if (poolCount < need) {
      return {
        ok: false,
        reason: `任意可通行中转点候选不足（需要 ${need}，实际 ${poolCount}）`
      }
    }
  }

  return { ok: true }
}

/**
 * 合并等价 waypoint：
 * - 同 tag 的多个 waypoint 合并成一个 (count 相加)
 * - 同一个 'any' 的多个副本合并（eligibleTags 取并集）
 * - 重复 'node' 同一个 id 视为同一份
 */
function mergeEquivalentWaypoints(wps: RequiredWaypoint[]): RequiredWaypoint[] {
  const tagMap = new Map<NodeTag, { count: number; label: string }>()
  const anyEntries: Extract<RequiredWaypoint, { kind: 'any' }>[] = []
  const nodeIds = new Set<string>()
  const nodeEntries: Extract<RequiredWaypoint, { kind: 'node' }>[] = []

  for (const wp of wps) {
    if (wp.kind === 'tag') {
      const old = tagMap.get(wp.tag)
      tagMap.set(wp.tag, {
        count: (old?.count ?? 0) + wp.count,
        label: wp.label
      })
    } else if (wp.kind === 'any') {
      anyEntries.push(wp)
    } else {
      // node
      if (!nodeIds.has(wp.nodeId)) {
        nodeIds.add(wp.nodeId)
        nodeEntries.push(wp)
      }
    }
  }

  const out: RequiredWaypoint[] = []
  for (const [tag, v] of tagMap) {
    out.push({ kind: 'tag', tag, label: v.label, count: v.count })
  }
  for (const a of anyEntries) out.push(a)
  for (const n of nodeEntries) out.push(n)
  return out
}

/**
 * 检查一个 waypoint 是否能由 interiorIds 满足
 * 内部：使用 waypointMatchesNode，但同一节点只能算一次
 */
function interiorCountSatisfies(
  interiorIds: string[],
  m: Map<string, RuntimeMapNode>,
  wp: RequiredWaypoint
): number {
  let n = 0
  for (const id of interiorIds) {
    if (waypointMatchesNode(m.get(id), wp)) n += 1
  }
  return n
}

/**
 * 统一途径点校验（任务/路线提交共用）
 *
 * @param route  候选路线（route[0] = start, route[last] = target）
 * @param waypoints 已 normalize 的途径点列表
 * @param ordered 是否要求按顺序
 * @param nodes 当前地图节点
 * @returns ok = true 表示满足；ok = false 时 reason 描述失败原因
 *
 * 关键：只使用 route.slice(1, -1) 满足 waypoint
 *      起点/终点绝不计入"途径"
 */
export function checkRequiredWaypoints(
  route: string[],
  waypoints: RequiredWaypoint[],
  ordered: boolean,
  nodes: RuntimeMapNode[]
): { ok: boolean; reason?: string } {
  if (!waypoints || waypoints.length === 0) return { ok: true }
  if (route.length < 2) return { ok: false, reason: '路线过短' }

  const m = nodeMap(nodes)
  const interiorIds = getInteriorRouteIds(route)
  if (interiorIds.length === 0) {
    // 没有中间节点，但任务要求途径点
    if (waypoints.length > 0) {
      return {
        ok: false,
        reason: `还需${formatWaypointShortLabel(waypoints[0]!)}`
      }
    }
  }

  if (ordered) {
    // 顺序模式：每个 waypoint 维护"还需要命中 count 次"的状态
    // 必须按顺序由 interiorIds 满足
    let cursor = 0
    const remainders: number[] = waypoints.map((w) =>
      w.kind === 'node' ? 1 : Math.max(1, w.kind === 'any' ? w.count : w.count)
    )
    for (const id of interiorIds) {
      if (cursor >= waypoints.length) break
      const wp = waypoints[cursor]!
      if (waypointMatchesNode(m.get(id), wp)) {
        remainders[cursor] = (remainders[cursor] ?? 1) - 1
        if ((remainders[cursor] ?? 0) <= 0) cursor++
      }
    }
    if (cursor < waypoints.length) {
      return {
        ok: false,
        reason: `需要先经过：${formatWaypointLabel(waypoints[cursor]!)}`
      }
    }
    return { ok: true }
  }

  // 非顺序模式
  for (const wp of waypoints) {
    if (wp.kind === 'node') {
      // 起点/终点不算；其它位置命中即可
      // 起点 / 终点是 route[0] / route[last]，interiorIds 不会包含它们
      if (!interiorIds.includes(wp.nodeId)) {
        return { ok: false, reason: `需要经过：${wp.label}` }
      }
    } else if (wp.kind === 'tag') {
      const count = interiorCountSatisfies(interiorIds, m, wp)
      if (count < wp.count) {
        return {
          ok: false,
          reason: `还需要经过 ${wp.count} 处${wp.label}（当前 ${count}）`
        }
      }
    } else {
      // 'any'
      const count = interiorCountSatisfies(interiorIds, m, wp)
      if (count < wp.count) {
        const isMany = wp.count > 1
        return {
          ok: false,
          reason: isMany
            ? `还需途径任意可通行中转点（${wp.count}处）`
            : `还需途径任意可通行中转点`
        }
      }
    }
  }
  return { ok: true }
}

/**
 * 玩家视角显示用：完整标签
 */
export function formatWaypointLabel(wp: RequiredWaypoint): string {
  if (wp.kind === 'any') {
    if (wp.count <= 1) return '途径任意可通行中转点'
    return `途径任意可通行中转点（${wp.count}处）`
  }
  if (wp.kind === 'tag') {
    if (wp.count <= 1) return `途径任意${wp.label}`
    return `途径任意${wp.label}（${wp.count}处）`
  }
  return `途径${wp.label}`
}

/**
 * 简写标签：用于"还需要…"等紧凑提示
 */
export function formatWaypointShortLabel(wp: RequiredWaypoint): string {
  if (wp.kind === 'any') {
    return wp.count > 1 ? `途径任意可通行中转点（${wp.count}处）` : '途径任意可通行中转点'
  }
  if (wp.kind === 'tag') {
    return wp.count > 1 ? `途径任意${wp.label}（${wp.count}处）` : `途径任意${wp.label}`
  }
  return `途径${wp.label}`
}

/**
 * 多个 waypoint 拼接成一个"路线要求"字符串
 * - ordered: 用 " → " 连接
 * - non-ordered: 用 "、" 连接
 * - count <= 1 不再显示 "×1" 后缀
 */
export function formatWaypointsChain(
  wps: RequiredWaypoint[],
  ordered: boolean,
  _nodes: RuntimeMapNode[] = []
): string {
  void _nodes
  if (!wps || wps.length === 0) return '无强制途径'
  const labels = wps.map(formatWaypointLabel)
  return ordered ? labels.join(' → ') : labels.join('、')
}

/**
 * 旧式 waypointLabel 兼容（routeSolver / riskZonePlanner / 调试用）
 */
export function waypointLabel(wp: RequiredWaypoint): string {
  if (wp.kind === 'node') return wp.label
  if (wp.kind === 'any') {
    return wp.count > 1
      ? `${wp.label || '任意可通行中转点'} ×${wp.count}`
      : (wp.label || '任意可通行中转点')
  }
  return `${wp.label} ×${wp.count}`
}
