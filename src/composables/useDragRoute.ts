// 动态地图的拖线 composable
// 核心规则：
// - 玩家可自由连线到任何已解锁、可见的节点（不再有"相邻"校验）
// - 拖线时显示当前预览段的实时距离
// - 超过物种 maxSegmentDistance 时变红
// - 资源不足时变红
// - 人类图层激活时：拖线被禁用；pointer 处理由 GameMap.vue 的 human-input-catcher 接管
// - 松手提交：检查路径最后一根线连到了哪里，而不是看指针附近的节点
// - 终点匹配：优先按 task.targetEquivalenceKey 匹配；退化到 isNodeEquivalent
import { ref, onBeforeUnmount, Ref } from 'vue'
import { gameStore } from '../store/gameStore'
import { NODE_SNAP_RADIUS_DESKTOP, NODE_SNAP_RADIUS_MOBILE } from '../data/gameConfig'
import { distance } from '../utils/geometry'
import { isNodeEquivalent } from '../utils/nodeEquivalence'
import { segmentHitsHumanCluster } from '../systems/humanFieldSystem'
import { isNodeEcoUnavailable } from '../systems/ecoHealthSystem'
import { isNodeAllowedByTags } from '../systems/routeEligibility'
import { playRouteSelect, playRouteComplete } from '../systems/audioManager'

export interface DragRouteOptions {
  svgRef: Ref<SVGSVGElement | null>
  cancelZoneEl: Ref<HTMLElement | null>
}

export function useDragRoute(opts: DragRouteOptions) {
  const activePointerId = ref<number | null>(null)
  let isMobile = false

  function detectMobile() {
    isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
  }
  detectMobile()
  window.addEventListener('resize', detectMobile)

  function getSnapRadius() {
    return isMobile ? NODE_SNAP_RADIUS_MOBILE : NODE_SNAP_RADIUS_DESKTOP
  }

  function pointerToSvg(clientX: number, clientY: number) {
    const svg = opts.svgRef.value
    if (!svg) return { x: clientX, y: clientY }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    const t = pt.matrixTransform(ctm.inverse())
    return { x: t.x, y: t.y }
  }

  /** 输入锁定：暂停原因集合 / 人类图层激活任一为真时禁用拖线
   *  - 暂停（如 human-tutorial）：玩家在教程中不应能拖线
   *  - 人类图层激活：pointer 处理交由 GameMap.vue 的 human-input-catcher 接管
   */
  function isInteractionLocked(): boolean {
    return gameStore.isGameplayPaused() ||
      (gameStore.state.humanActive && gameStore.state.humanLayerVisible)
  }

  /** 兼容旧名字：isHumanLayerActive 现在统一走 isInteractionLocked
   *  - 保留符号以防外部代码误用
   */
  function isHumanLayerActive(): boolean {
    return isInteractionLocked()
  }

  /** 当前拖拽中的物种（用于节点吸附过滤） */
  function currentDragSpecies() {
    const taskId = gameStore.state.dragState.taskId
    if (!taskId) return null
    const task = gameStore.state.activeTasks.find((item) => item.id === taskId)
    if (!task) return null
    return gameStore.findSpecies(task.speciesId) ?? null
  }

  /** 找拖线指针下最接近的可见节点（不判断是否相邻） */
  function findSnapNode(svgX: number, svgY: number): string | null {
    const r = getSnapRadius()
    const species = currentDragSpecies()
    // 拖拽中必须拿到 species；如果拿不到（理论不应该发生），
    // 仍然允许吸附，但不做物种标签过滤，避免因为数据异常直接吞掉指针
    let bestId: string | null = null
    let bestDist = r
    for (const node of gameStore.state.mapNodes) {
      if (node.status === 'disabled') continue
      // 生态健康：health <= 0 节点不能作为吸附目标
      if (isNodeEcoUnavailable(node)) continue
      // 物种天然不兼容的栖息地：不允许吸附
      if (species && !isNodeAllowedByTags(node, species.allowedNodeTags)) continue
      const d = distance(svgX, svgY, node.x, node.y)
      if (d <= r && d < bestDist) {
        bestDist = d
        bestId = node.id
      }
    }
    return bestId
  }

  /** 同一节点不能重复加入路线 */
  function isDuplicate(path: string[], nextId: string): boolean {
    return path.includes(nextId)
  }

  /** 起点 - 指针 / 末节点 - 指针 的距离 */
  function previewSegmentDistance(svgX: number, svgY: number): number {
    const path = gameStore.state.dragState.path
    if (path.length === 0) return 0
    const m = gameStore.getNodeMap()
    const last = m.get(path[path.length - 1])
    if (!last) return 0
    return distance(svgX, svgY, last.x, last.y)
  }

  /** 拖拽中的物种 */
  function currentSpeciesMaxSegment() {
    const taskId = gameStore.state.dragState.taskId
    if (!taskId) return Infinity
    const task = gameStore.state.activeTasks.find((t) => t.id === taskId)
    if (!task) return Infinity
    const sp = gameStore.findSpecies(task.speciesId)
    if (!sp) return Infinity
    return sp.maxSegmentDistance
  }

  function isInCancelZone(clientX: number, clientY: number): boolean {
    const el = opts.cancelZoneEl.value
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  }

  function onPointerMove(e: PointerEvent) {
    // 人类图层激活时：所有 pointer 处理交给 GameMap.vue 的 human-input-catcher
    if (isHumanLayerActive()) return
    if (!gameStore.state.dragState.active) return
    if (activePointerId.value !== null && e.pointerId !== activePointerId.value) return
    const p = pointerToSvg(e.clientX, e.clientY)
    gameStore.setDragPointer(p)
    const overCancel = isInCancelZone(e.clientX, e.clientY)
    gameStore.setDragOverCancel(overCancel)

    const snapId = findSnapNode(p.x, p.y)
    if (!snapId) {
      gameStore.setDragOverNode(null)
      // 仍要更新预览段距离（指针位置）
      const d = previewSegmentDistance(p.x, p.y)
      const max = currentSpeciesMaxSegment()
      gameStore.setDragPreview(d, d > max)
      // v6：没有 snap 时清掉 human-blocked 状态
      gameStore.setDragHumanBlocked(false, null)
      return
    }
    const path = gameStore.state.dragState.path
    const last = path[path.length - 1]
    const m = gameStore.getNodeMap()
    const snapNode = m.get(snapId)
    let previewD = 0
    if (snapNode) {
      const lastNode = last ? m.get(last) : undefined
      if (lastNode) {
        previewD = distance(lastNode.x, lastNode.y, snapNode.x, snapNode.y)
      }
    }
    const max = currentSpeciesMaxSegment()
    gameStore.setDragPreview(previewD, previewD > max)

    if (isDuplicate(path, snapId)) {
      gameStore.setDragOverNode(null)
      gameStore.setDragHumanBlocked(false, null)
      return
    }
    // 资源检查
    const newSegCount = path.length // 当前 path 节点数 = 已确认段数
    const willOverflow = gameStore.state.usedSegments + newSegCount >= gameStore.state.maxSegments

    // v6：检测"最后节点 -> 候选节点"线段是否被人类阻挡圈覆盖
    let humanBlocked = false
    let humanClusterId: string | null = null
    if (gameStore.state.humanActive && snapNode) {
      const lastNode = last ? m.get(last) : undefined
      if (lastNode) {
        const hit = segmentHitsHumanCluster(lastNode.x, lastNode.y, snapNode.x, snapNode.y)
        if (hit) {
          humanBlocked = true
          humanClusterId = hit.id
        }
      }
    }
    gameStore.setDragHumanBlocked(humanBlocked, humanClusterId)

    if (humanBlocked) {
      // 硬规则：被人类阻挡的线段绝不允许 push 节点
      // 仍显示目标节点高亮，但预览线和标签显示"人群阻断"
      gameStore.setDragOverNode(snapId)
      return
    }

    if (!willOverflow) {
      if (last !== snapId) {
        gameStore.pushDragNode(snapId)
      }
      gameStore.setDragOverNode(snapId)
    } else {
      gameStore.setDragOverNode(snapId)
    }
  }

  function onPointerUp(e: PointerEvent) {
    // 人类图层激活时：拖线被禁用，不做任何处理
    if (isHumanLayerActive()) return
    if (!gameStore.state.dragState.active) return
    if (activePointerId.value !== null && e.pointerId !== activePointerId.value) return
    const dragState = gameStore.state.dragState
    const taskId = dragState.taskId
    if (!taskId) {
      gameStore.cancelDrag()
      activePointerId.value = null
      return
    }
    const p = pointerToSvg(e.clientX, e.clientY)
    const overCancel = isInCancelZone(e.clientX, e.clientY)
    if (overCancel) {
      gameStore.cancelDrag()
      gameStore.pushToast('已取消本次路线', 'info')
      activePointerId.value = null
      return
    }

    const path = dragState.path
    const last = path[path.length - 1]
    const task = gameStore.state.activeTasks.find((t) => t.id === taskId)
    const targetId = task?.targetNodeId
    const nodeMap = gameStore.getNodeMap()
    const targetNode = targetId ? nodeMap.get(targetId) : undefined
    const lastNode = last ? nodeMap.get(last) : undefined

    // 提交条件：路径最后一根线连到了「与目标节点等价的节点」上
    // 优先按 task.targetEquivalenceKey 匹配
    const targetOk = task?.targetEquivalenceKey && lastNode?.equivalenceKey
      ? lastNode.equivalenceKey === task.targetEquivalenceKey
      : isNodeEquivalent(lastNode, targetNode)
    if (path.length >= 2 && targetOk) {
      const result = gameStore.submitRoute(taskId, path)
      if (!result.ok && result.msg) {
        gameStore.pushToast(result.msg, 'error')
      } else {
        gameStore.pushToast('迁徙路线已提交', 'success', 1200)
      }
      gameStore.cancelDrag()
      activePointerId.value = null
      return
    }

    // 只要最后连线点不是目的地，就清掉本次拖拽，让玩家重新开始
    // 不再 pushDragNode，不再保留路线
    gameStore.cancelDrag()
    gameStore.pushToast(
      `请把最后一条线连到 ${targetNode?.displayName || targetNode?.name || '目的地'}`,
      'warning'
    )
    activePointerId.value = null
  }

  function onPointerDown(_e: PointerEvent) {
    // 人类图层激活时：pointer 处理交给 GameMap.vue 的 human-input-catcher
    if (isHumanLayerActive()) return
  }

  function onPointerCancel(_e: PointerEvent) {
    if (isHumanLayerActive()) return
    if (!gameStore.state.dragState.active) return
    if (activePointerId.value !== null && _e.pointerId !== activePointerId.value) return
    gameStore.cancelDrag()
    activePointerId.value = null
  }

  function attachWindowListeners() {
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp, { passive: false })
    window.addEventListener('pointerdown', onPointerDown, { passive: false })
    window.addEventListener('pointercancel', onPointerCancel, { passive: false })
  }
  function detachWindowListeners() {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointercancel', onPointerCancel)
  }
  attachWindowListeners()

  onBeforeUnmount(() => {
    detachWindowListeners()
    window.removeEventListener('resize', detectMobile)
  })

  return {}
}
