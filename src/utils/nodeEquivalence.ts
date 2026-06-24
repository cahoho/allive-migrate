// 节点等价判定工具
// 玩家视角下：等价 key (equivalenceKey) 相同的节点视为同一类地点
// 旧版仅按 displayName 判断；新版优先使用 equivalenceKey
// 这样可以彻底避免"同名但语义不同"的认知错误
import type { RuntimeMapNode } from '../data/gameData'

/**
 * 两个节点是否等价
 * 1) 同 id 直接等价
 * 2) 优先使用 equivalenceKey
 * 3) 旧数据兜底：displayName / name 相同
 */
export function isNodeEquivalent(
  a: RuntimeMapNode | undefined | null,
  b: RuntimeMapNode | undefined | null
): boolean {
  if (!a || !b) return false
  if (a.id === b.id) return true
  if (a.equivalenceKey && b.equivalenceKey) {
    return a.equivalenceKey === b.equivalenceKey
  }
  const aName = a.displayName || a.name
  const bName = b.displayName || b.name
  if (aName && bName && aName === bName) return true
  return false
}

/**
 * 给定节点 id，判断它是否与目标节点等价
 */
export function isNodeIdEquivalentToTarget(
  nodeId: string | null | undefined,
  targetId: string | null | undefined,
  nodes: RuntimeMapNode[]
): boolean {
  if (!nodeId || !targetId) return false
  const map = new Map(nodes.map((n) => [n.id, n] as const))
  return isNodeEquivalent(map.get(nodeId), map.get(targetId))
}

/**
 * 检查节点是否满足任务的目标等价 key
 * 优先使用 task.targetEquivalenceKey；否则退化到 id/displayName 比对
 */
export function nodeMatchesTaskTarget(
  node: RuntimeMapNode | undefined,
  task: { targetNodeId: string; targetEquivalenceKey?: string }
): boolean {
  if (!node) return false
  if (task.targetEquivalenceKey && node.equivalenceKey) {
    return node.equivalenceKey === task.targetEquivalenceKey
  }
  return node.id === task.targetNodeId
}
