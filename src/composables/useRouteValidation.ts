// 路线验证（核心规则）
// 顺序：
// 1) 起点
// 2) 终点（使用 task.targetEquivalenceKey / equivalenceKey 匹配）
// 3) 节点可用
// 4) 节点标签白名单
// 5) 单段距离上限
// 6) 必经点（统一通过 src/systems/routeRequirements.ts）
// 7) 风险区域
// 8) 资源
// 9) 人类 cluster 阻挡
//
// 关键：所有 waypoint 校验都从 routeRequirements 走，不再有第二份途径点逻辑。
import { RuntimeMapNode, SpeciesTask } from '../data/gameData'
import { SpeciesDef } from '../data/speciesTemplates'
import { SeasonId } from '../data/gameConfig'
import { gameStore } from '../store/gameStore'
import {
  checkAllowedNodeTags,
  checkSegmentCount,
  checkSegmentDistances,
  isNodeAvailable,
  nodeMap
} from '../systems/routeSolver'
import { checkRequiredWaypoints } from '../systems/routeRequirements'
import { getActiveRiskZones, segmentIntersectsZone } from '../data/riskZones'
import {
  segmentHitsHumanCluster,
  pointInHumanCluster
} from '../systems/humanFieldSystem'
import { isNodeEquivalent } from '../utils/nodeEquivalence'
import { isNodeEcoUnavailable } from '../systems/ecoHealthSystem'

export interface ValidationResult {
  ok: boolean
  msg?: string
  failedEdge?: [string, string]
  flashRiskZoneId?: string
  failedSegment?: { from: string; to: string; distance: number }
}

export function validateRoute(
  route: string[],
  task: SpeciesTask,
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  usedSegments: number,
  maxSegments: number,
  season: SeasonId
): ValidationResult {
  if (!route || route.length < 2) {
    return { ok: false, msg: '路线过短' }
  }
  // 0) 防御：route 中所有节点必须不同
  //    与 gameStore.pushDragNode 的"path 不允许包含重复节点"行为一致
  //    玩家已经天然不能重复节点；这里拦截异常输入（debug / 求解器回放等）
  {
    const seen = new Set<string>()
    for (const id of route) {
      if (seen.has(id)) {
        return { ok: false, msg: '路线包含重复节点' }
      }
      seen.add(id)
    }
  }
  // 1) 起点
  if (route[0] !== task.startNodeId) {
    return { ok: false, msg: '起点不正确' }
  }
  // 2) 终点：优先按 task.targetEquivalenceKey 匹配；否则回退 isNodeEquivalent
  const m0 = nodeMap(nodes)
  const lastNode = m0.get(route[route.length - 1])
  const targetNode = m0.get(task.targetNodeId)
  const targetOk =
    task.targetEquivalenceKey && lastNode?.equivalenceKey
      ? lastNode.equivalenceKey === task.targetEquivalenceKey
      : isNodeEquivalent(lastNode, targetNode)
  if (!targetOk) {
    return { ok: false, msg: `需要在 ${targetNode?.displayName || targetNode?.name || '目的地'} 松手` }
  }

  const m = nodeMap(nodes)

  // 3) 节点全部可用
  for (const id of route) {
    const n = m.get(id)
    if (!n) return { ok: false, msg: `节点不存在：${id}` }
    if (!isNodeAvailable(n)) {
      return { ok: false, msg: `${n.name} 当前不可用` }
    }
    if (isNodeEcoUnavailable(n)) {
      return { ok: false, msg: `${n.name} 栖息地退化，暂时不可通行` }
    }
  }

  // 4) 节点标签白名单
  const tagCheck = checkAllowedNodeTags(route, species.allowedNodeTags, nodes)
  if (!tagCheck.ok) {
    return { ok: false, msg: tagCheck.reason }
  }

  // 5) 单段距离上限
  const distCheck = checkSegmentDistances(route, species.maxSegmentDistance, nodes)
  if (!distCheck.ok) {
    return {
      ok: false,
      msg: `这段迁徙距离太远：${distCheck.distance} / ${species.maxSegmentDistance}，需要经过中转节点`,
      failedSegment: { from: distCheck.from!, to: distCheck.to!, distance: distCheck.distance! }
    }
  }

  // 6) 必经点：统一从 routeRequirements 走
  const wpCheck = checkRequiredWaypoints(
    route,
    task.requiredWaypoints ?? species.requiredWaypoints,
    task.requiredWaypointOrder ?? species.requiredWaypointOrder ?? false,
    nodes
  )
  if (!wpCheck.ok) {
    return { ok: false, msg: wpCheck.reason }
  }

  // 7) 风险区域
  const activeZones = getActiveRiskZones(season, nodes).filter((z) => z.forbiddenFor.includes(species.id))
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i])
    const b = m.get(route[i + 1])
    if (!a || !b) continue
    for (const zone of activeZones) {
      if (segmentIntersectsZone(a.x, a.y, b.x, b.y, zone)) {
        return {
          ok: false,
          msg: zone.reason,
          flashRiskZoneId: zone.id,
          failedEdge: [a.id, b.id]
        }
      }
    }
  }

  // 8) 资源
  const resCheck = checkSegmentCount(route, usedSegments, maxSegments)
  if (!resCheck.ok) {
    return { ok: false, msg: resCheck.reason }
  }

  // 9) 人类活动热点阻塞：仅在人类系统激活后生效
  if (gameStore.state.humanActive) {
    for (let i = 0; i < route.length - 1; i++) {
      const a = m.get(route[i])
      const b = m.get(route[i + 1])
      if (!a || !b) continue
      const hit = segmentHitsHumanCluster(a.x, a.y, b.x, b.y)
      if (hit) {
        return {
          ok: false,
          msg: `人类活动热点过于密集，迁徙路线被阻断`,
          failedEdge: [a.id, b.id]
        }
      }
    }
    for (const id of route) {
      const n = m.get(id)
      if (!n) continue
      const hit = pointInHumanCluster(n.x, n.y)
      if (hit) {
        return {
          ok: false,
          msg: `${n.name} 位于高密度人类活动热点中，无法落脚`
        }
      }
    }
  }

  return { ok: true }
}

/** 旧签名兼容（保留可被旧代码引用） */
export function validateRouteOldSignature(
  route: string[],
  task: SpeciesTask,
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  _edges: any[],
  _events: any[]
): ValidationResult {
  return validateRoute(route, task, species, nodes, 0, 99, 'normal')
}
