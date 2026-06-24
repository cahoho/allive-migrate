// 几何工具：计算两点距离、是否在圆内

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

export function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return distance(a.x, a.y, b.x, b.y)
}

export function isInCircle(
  px: number,
  py: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  return distance(px, py, cx, cy) <= r
}

// 把客户端坐标转换为 SVG 用户坐标
export function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  const transformed = pt.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}
