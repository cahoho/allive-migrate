// 风险区域（几何）：圆形 / 矩形
// 玩家可自由连线；不依赖隐藏边
// 风险区域仅在 activeInSeason 匹配当前季节时生效
// alwaysActive = true 时永远生效
// forbiddenFor 列出禁止穿越的物种 id
// v10：圆形版 + 缓存 + planDynamicRiskZones 超时兜底
import type { SeasonId } from './gameConfig'
import type { RuntimeMapNode } from './gameData'

export type RiskShape = 'circle' | 'rect'

export interface RiskZone {
  id: string
  name: string
  /** 何时激活；alwaysActive=true 时忽略 */
  activeInSeason: SeasonId
  /** 永远激活 */
  alwaysActive?: boolean
  /** 禁止的物种 id 列表 */
  forbiddenFor: string[]
  shape: RiskShape
  /** 圆形 */
  cx?: number
  cy?: number
  r?: number
  /** 矩形 */
  x?: number
  y?: number
  width?: number
  height?: number
  /** 描述 */
  reason: string
}

/** MVP 风险区域：必须与 WORLD_WIDTH/WORLD_HEIGHT 一致 */
export const RISK_ZONES: RiskZone[] = []

// =============================================================
// 缓存层
// =============================================================
// 同一 season + 同一地图节点签名下，直接返回缓存结果
// 避免 getActiveRiskZones 在 tickGame / useRouteValidation 中反复跑重型规划
// =============================================================
interface RiskZoneCacheEntry {
  zones: RiskZone[]
}
let _cache: { key: string; entry: RiskZoneCacheEntry } | null = null

// 缓存层保护：planDynamicRiskZones 内部已自带 30ms 墙钟预算；
// 这里再加一层 50ms 兜底：超时则返回空（绝不阻塞主线程）
const PLAN_HARD_BUDGET_MS = 50

function buildCacheKey(season: SeasonId, nodes: RuntimeMapNode[]): string {
  // 简化签名：节点数 + 节点 id/x/y/status（避免把整个对象都哈希进去）
  // status 状态变化时（warning/disabled 切换）也会让缓存失效
  let s = season + '|' + nodes.length
  for (const n of nodes) {
    s += '|' + n.id + ':' + n.x.toFixed(0) + ',' + n.y.toFixed(0) + ':' + n.status
  }
  return s
}

function invalidateRiskZoneCache(): void {
  _cache = null
}

/**
 * 清除 getActiveRiskZones 的缓存
 * 在节点 map 变化（bumpMapRevision）时由外部调用
 */
export function clearRiskZoneCache(): void {
  invalidateRiskZoneCache()
}

/** 当前季节激活的所有风险区域（v10：动态规划 + 缓存 + 兜底超时） */
export function getActiveRiskZones(season: SeasonId, nodes: RuntimeMapNode[] = []): RiskZone[] {
  if (season === 'normal') return []
  if (!nodes || nodes.length === 0) return []
  if (season !== 'storm' && season !== 'drought') return []

  // 1) 命中缓存
  const key = buildCacheKey(season, nodes)
  if (_cache && _cache.key === key) {
    return _cache.entry.zones
  }

  // 2) 重算（带墙钟预算）
  //    planDynamicRiskZones 内部已自带 30ms 预算；
  //    这里再加 50ms 兜底，保证不会因为任何原因（外星人代码 / 复杂地图）
  //    阻塞主线程。超出后直接返回空数组，UI 不会显示风险圈但不影响玩法。
  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  let zones: RiskZone[] = []
  try {
    zones = planDynamicRiskZonesSafe(season, nodes)
    if (
      typeof performance !== 'undefined' &&
      performance.now() - startedAt > PLAN_HARD_BUDGET_MS
    ) {
      // 超过兜底墙钟预算：抛弃结果，缓存空数组（避免再次跑）
      zones = []
    }
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn('[riskZones] planDynamicRiskZones failed:', e)
    }
    zones = []
  }
  _cache = { key, entry: { zones } }
  return zones
}

// 在模块顶层动态加载（仅在第一次调用时同步解析）
import { planDynamicRiskZones } from '../systems/riskZonePlanner'

function planDynamicRiskZonesSafe(season: SeasonId, nodes: RuntimeMapNode[]): RiskZone[] {
  return planDynamicRiskZones(season, nodes)
}

/** 检查线段是否与风险区域相交（点-形状几何判定） */
export function segmentIntersectsZone(
  ax: number, ay: number, bx: number, by: number,
  zone: RiskZone
): boolean {
  if (zone.shape === 'circle') {
    const cx = zone.cx!, cy = zone.cy!, r = zone.r!
    return segmentIntersectsCircle(ax, ay, bx, by, cx, cy, r)
  } else {
    const x = zone.x!, y = zone.y!, w = zone.width!, h = zone.height!
    return segmentIntersectsRect(ax, ay, bx, by, x, y, w, h)
  }
}

/** 线段与圆相交 */
function segmentIntersectsCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number
): boolean {
  if (pointInCircle(ax, ay, cx, cy, r)) return true
  if (pointInCircle(bx, by, cx, cy, r)) return true
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2))
  const px = ax + t * dx
  const py = ay + t * dy
  return pointInCircle(px, py, cx, cy, r)
}

function pointInCircle(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/** 线段与矩形相交 */
function segmentIntersectsRect(
  ax: number, ay: number, bx: number, by: number,
  x: number, y: number, w: number, h: number
): boolean {
  if (pointInRect(ax, ay, x, y, w, h)) return true
  if (pointInRect(bx, by, x, y, w, h)) return true
  const x2 = x + w
  const y2 = y + h
  return (
    segmentsIntersect(ax, ay, bx, by, x, y, x2, y) ||
    segmentsIntersect(ax, ay, bx, by, x2, y, x2, y2) ||
    segmentsIntersect(ax, ay, bx, by, x2, y2, x, y2) ||
    segmentsIntersect(ax, ay, bx, by, x, y2, x, y)
  )
}

function pointInRect(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h
}

/** 标准线段相交 */
function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1 = direction(cx, cy, dx, dy, ax, ay)
  const d2 = direction(cx, cy, dx, dy, bx, by)
  const d3 = direction(ax, ay, bx, by, cx, cy)
  const d4 = direction(ax, ay, bx, by, dx, dy)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  if (d1 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) return true
  if (d2 === 0 && onSegment(cx, cy, dx, dy, bx, by)) return true
  if (d3 === 0 && onSegment(ax, ay, bx, by, cx, cy)) return true
  if (d4 === 0 && onSegment(ax, ay, bx, by, dx, dy)) return true
  return false
}

function direction(px: number, py: number, qx: number, qy: number, rx: number, ry: number): number {
  return (qx - px) * (ry - py) - (qy - py) * (rx - px)
}

function onSegment(px: number, py: number, qx: number, qy: number, rx: number, ry: number): boolean {
  return Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy)
}
