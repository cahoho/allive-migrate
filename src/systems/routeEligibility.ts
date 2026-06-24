// =============================================================
// 路线通行判定 v1
// =============================================================
// 职责：单一职责 —— 判定"节点是否满足物种 allowedNodeTags 白名单"。
//
// 不放在一起的内容：
// - 距离 / 人类阻挡 / 风险区 / 资源段数 / 生态状态：
//   这些仍由 useRouteValidation / routeSolver 各自处理；
//   本模块只处理"物种固有栖息地兼容性"。
//
// 使用：
// - 右侧 SpeciesPanel "禁止通过"区
// - tag 途径点候选节点过滤
// - 拖线吸附（useDragRoute.findSnapNode）
// - 拖线时 MapNode 置灰（MapNode.vue）
// - 最终路线提交校验（routeSolver.checkAllowedNodeTags）
// - gameStore.pushDragNode 防御性校验
//
// 所有调用方都从这里走，避免分散的 node.tags.some(...) 出现规则漂移。
// =============================================================
import type { RuntimeMapNode } from '../data/gameData'
import type { NodeTag } from '../data/gameConfig'

/**
 * 节点是否满足物种 allowedNodeTags 白名单。
 * - allowed 为空 / undefined：完全放行
 * - 否则：节点 tags 中必须至少有一个在白名单中
 */
export function isNodeAllowedByTags(
  node: RuntimeMapNode,
  allowedNodeTags: readonly NodeTag[] | undefined
): boolean {
  if (!allowedNodeTags || allowedNodeTags.length === 0) {
    return true
  }

  return node.tags.some((tag) => allowedNodeTags.includes(tag))
}
