// 路线求解与验证工具
// 验证：单段距离、必经点（统一通过 routeRequirements）、风险区域、节点标签白名单、段数限制
// 本文件保留：节点地图、节点可用性、距离校验、白名单、段数校验、风险区域校验
// waypoint 逻辑全部由 routeRequirements.ts 提供
import type { RuntimeMapNode, SpeciesTask } from '../data/gameData'
import type { SpeciesDef, RequiredWaypoint } from '../data/speciesTemplates'
import type { NodeTag } from '../data/gameConfig'
import { distance } from '../utils/geometry'
import { segmentIntersectsZone, getActiveRiskZones, type RiskZone } from '../data/riskZones'
import { isNodeAllowedByTags } from './routeEligibility'

/** 节点地图（id -> node） */
export function nodeMap(nodes: RuntimeMapNode[]): Map<string, RuntimeMapNode> {
  return new Map(nodes.map((n) => [n.id, n] as const))
}

/** 检查节点是否被禁用 */
export function isNodeAvailable(node: RuntimeMapNode | undefined): boolean {
  if (!node) return false
  return node.status !== 'disabled'
}

/** 路径节点必须存在且可用 */
export function routeNodesValid(route: string[], nodes: RuntimeMapNode[]): boolean {
  const m = nodeMap(nodes)
  for (const id of route) {
    const n = m.get(id)
    if (!n) return false
    if (!isNodeAvailable(n)) return false
  }
  return true
}

/**
 * Re-export 统一途径点校验
 * 实际实现位于 routeRequirements.ts
 * 保留旧导出名以兼容已有引用
 */
export { checkRequiredWaypoints, formatWaypointLabel as waypointLabel } from './routeRequirements'

/** 检查 route 中节点标签白名单（如果 species 配置了 allowedNodeTags） */
export function checkAllowedNodeTags(
  route: string[],
  allowed: NodeTag[] | undefined,
  nodes: RuntimeMapNode[]
): { ok: boolean; reason?: string } {
  if (!allowed || allowed.length === 0) return { ok: true }
  const m = nodeMap(nodes)
  for (const id of route) {
    const n = m.get(id)
    if (!n) continue
    if (!isNodeAllowedByTags(n, allowed)) {
      return { ok: false, reason: `${n.name} 不在允许的栖息地类型中` }
    }
  }
  return { ok: true }
}

/** 单段距离上限校验 */
export function checkSegmentDistances(
  route: string[],
  maxSegmentDistance: number,
  nodes: RuntimeMapNode[]
): { ok: boolean; distance?: number; from?: string; to?: string } {
  const m = nodeMap(nodes)
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i])
    const b = m.get(route[i + 1])
    if (!a || !b) continue
    const d = distance(a.x, a.y, b.x, b.y)
    if (d > maxSegmentDistance) {
      return {
        ok: false,
        distance: Math.round(d),
        from: a.id,
        to: b.id
      }
    }
  }
  return { ok: true }
}

/** 资源段数校验（route.length - 1） */
export function checkSegmentCount(
  route: string[],
  used: number,
  max: number
): { ok: boolean; reason?: string } {
  const needed = route.length - 1
  if (used + needed > max) {
    return { ok: false, reason: '线路资源不足' }
  }
  return { ok: true }
}

/** 检查路线是否穿过风险区域 */
export function checkRiskZones(
  route: string[],
  speciesId: string,
  season: 'normal' | 'storm' | 'drought',
  nodes?: import('../data/gameData').RuntimeMapNode[]
): { ok: boolean; reason?: string; hitZone?: RiskZone } {
  if (!nodes || nodes.length === 0) return { ok: true }
  const m = nodeMap(nodes)
  const zones = getActiveRiskZones(season, nodes)
    .filter((z) => z.forbiddenFor.includes(speciesId))
  if (zones.length === 0) return { ok: true }
  for (let i = 0; i < route.length - 1; i++) {
    const a = m.get(route[i])
    const b = m.get(route[i + 1])
    if (!a || !b) continue
    for (const zone of zones) {
      if (segmentIntersectsZone(a.x, a.y, b.x, b.y, zone)) {
        return {
          ok: false,
          reason: zone.reason,
          hitZone: zone
        }
      }
    }
  }
  return { ok: true }
}

// 防止未使用变量警告
void 0 as unknown as SpeciesTask
void 0 as unknown as SpeciesDef
