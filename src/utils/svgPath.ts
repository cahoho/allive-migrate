// 沿路径计算位置（用于动物迁移动画）
import { RuntimeMapNode } from '../data/gameData'

export function buildPathD(nodeIds: string[], nodes: RuntimeMapNode[]): string {
  if (nodeIds.length === 0) return ''
  const pts = nodeIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as RuntimeMapNode[]
  if (pts.length === 0) return ''
  const head = pts[0]
  let d = `M ${head.x} ${head.y}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x} ${pts[i].y}`
  }
  return d
}

export function getPointAtProgress(
  nodeIds: string[],
  progress: number,
  nodes: RuntimeMapNode[]
): { x: number; y: number } | null {
  if (nodeIds.length === 0) return null
  const pts = nodeIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as RuntimeMapNode[]
  if (pts.length === 0) return null
  if (pts.length === 1) return { x: pts[0].x, y: pts[0].y }
  if (progress <= 0) return { x: pts[0].x, y: pts[0].y }
  if (progress >= 1) return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }
  let total = 0
  const segs: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    const l = Math.sqrt(dx * dx + dy * dy)
    segs.push(l)
    total += l
  }
  let target = progress * total
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = segs[i] === 0 ? 0 : target / segs[i]
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t
      }
    }
    target -= segs[i]
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y }
}
