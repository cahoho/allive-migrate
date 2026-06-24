<script setup lang="ts">
// 路线层
// 关键规则（v2）：
// - 拖线视觉起点 = 视觉起点坐标（species logo 当前位置）
// - 真实路径（用于验证）= dragState.path
// - 已确认路径：visualStart -> path[0] -> path[1] -> ...
// - 预览线：最后已确认节点 -> 指针
// - 已提交路线（ActiveRoute）：visualStart -> nodeIds[0] -> nodeIds[1] -> ...
//   动物从 logo 位置沿线移动，而不是从节点中心
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { distance } from '../utils/geometry'

const dragPath = computed(() => gameStore.state.dragState.path)
const dragPointer = computed(() => gameStore.state.dragState.pointer)
const dragOverCancel = computed(() => gameStore.state.dragState.overCancel)
const previewDist = computed(() => gameStore.state.dragState.previewSegmentDistance)
const previewOverflow = computed(() => gameStore.state.dragState.previewOverflow)
const visualStartX = computed(() => gameStore.state.dragState.visualStartX)
const visualStartY = computed(() => gameStore.state.dragState.visualStartY)
const previewHumanBlocked = computed(() => gameStore.state.dragState.previewHumanBlocked)

const currentTask = computed(() => {
  const id = gameStore.state.dragState.taskId
  if (!id) return null
  return gameStore.state.activeTasks.find((t) => t.id === id) || null
})

const currentSpecies = computed(() => {
  if (!currentTask.value) return null
  return gameStore.findSpecies(currentTask.value.speciesId)
})

const maxSeg = computed(() => currentSpecies.value?.maxSegmentDistance ?? 0)
const speciesColor = computed(() => currentSpecies.value?.color ?? 'white')

const usedSegments = computed(() => gameStore.state.usedSegments)
const maxSegments = computed(() => gameStore.state.maxSegments)

const draftSegments = computed(() => Math.max(0, dragPath.value.length - 1))
const willOverflowSegments = computed(
  () => usedSegments.value + draftSegments.value + 1 > maxSegments.value
)

function getNode(id: string) {
  return gameStore.state.mapNodes.find((n) => n.id === id)
}

function hasVisualStart(): boolean {
  return visualStartX.value !== 0 || visualStartY.value !== 0
}

const confirmedSegments = computed(() => {
  const out: Array<{
    ax: number; ay: number; bx: number; by: number
    midX: number; midY: number
    dist: number
    overflow: boolean
  }> = []
  if (dragPath.value.length >= 1 && hasVisualStart()) {
    const first = getNode(dragPath.value[0])
    if (first) {
      const d = distance(visualStartX.value, visualStartY.value, first.x, first.y)
      out.push({
        ax: visualStartX.value, ay: visualStartY.value,
        bx: first.x, by: first.y,
        midX: (visualStartX.value + first.x) / 2,
        midY: (visualStartY.value + first.y) / 2,
        dist: Math.round(d),
        overflow: d > maxSeg.value
      })
    }
  }
  for (let i = 0; i < dragPath.value.length - 1; i++) {
    const a = getNode(dragPath.value[i])
    const b = getNode(dragPath.value[i + 1])
    if (!a || !b) continue
    const d = distance(a.x, a.y, b.x, b.y)
    out.push({
      ax: a.x, ay: a.y, bx: b.x, by: b.y,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: Math.round(d),
      overflow: d > maxSeg.value
    })
  }
  return out
})

const lastNode = computed(() => {
  const last = dragPath.value[dragPath.value.length - 1]
  if (!last) return null
  return getNode(last) || null
})

const previewColor = computed(() => {
  if (previewHumanBlocked.value) return 'var(--danger)'
  if (dragOverCancel.value) return 'var(--danger)'
  if (previewOverflow.value) return 'var(--danger)'
  if (willOverflowSegments.value) return 'var(--danger)'
  return speciesColor.value
})

const previewLabel = computed(() => {
  if (previewHumanBlocked.value) return '人群阻断'
  if (dragOverCancel.value) return '松手取消'
  return `${Math.round(previewDist.value)} / ${maxSeg.value}`
})

const routeLines = computed(() => gameStore.state.completedRoutes)

function pointsToString(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
}

const confirmedPathString = computed(() => {
  const pts: Array<{ x: number; y: number }> = []
  if (hasVisualStart()) {
    pts.push({ x: visualStartX.value, y: visualStartY.value })
  }
  for (const id of dragPath.value) {
    const n = getNode(id)
    if (n) pts.push({ x: n.x, y: n.y })
  }
  return pointsToString(pts)
})

function buildRouteVisualPoints(route: { visualStartX: number; visualStartY: number; nodeIds: string[] }) {
  const pts: Array<{ x: number; y: number }> = []
  pts.push({ x: route.visualStartX, y: route.visualStartY })
  for (const id of route.nodeIds) {
    const n = getNode(id)
    if (n) pts.push({ x: n.x, y: n.y })
  }
  return pts
}

function buildRouteSegments(pts: Array<{ x: number; y: number }>, color: string) {
  const out: Array<{
    midX: number; midY: number; dist: number; color: string
    ax: number; ay: number; bx: number; by: number
  }> = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const d = Math.round(distance(a.x, a.y, b.x, b.y))
    out.push({
      ax: a.x, ay: a.y, bx: b.x, by: b.y,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      dist: d,
      color
    })
  }
  return out
}
</script>

<template>
  <g class="routes">
    <polyline
      v-if="dragPath.length >= 1 && hasVisualStart()"
      class="route-line confirmed"
      :points="confirmedPathString"
      :stroke="speciesColor"
    />

    <g v-for="(seg, i) in confirmedSegments" :key="`seg-${i}`">
      <rect
        :x="seg.midX - 30"
        :y="seg.midY - 22"
        width="60"
        height="16"
        rx="3"
        :fill="seg.overflow ? 'var(--danger)' : 'rgba(253, 246, 227, 0.92)'"
        :stroke="seg.overflow ? 'var(--danger)' : speciesColor"
        stroke-width="1"
      />
      <text
        :x="seg.midX"
        :y="seg.midY - 10"
        text-anchor="middle"
        font-size="10"
        font-weight="600"
        :fill="seg.overflow ? '#FDF6E3' : speciesColor"
        style="font-variant-numeric: tabular-nums;"
      >{{ seg.dist }} / {{ maxSeg }}</text>
    </g>

    <line
      v-if="lastNode && dragPointer"
      class="route-line preview"
      :x1="lastNode.x"
      :y1="lastNode.y"
      :x2="dragPointer.x"
      :y2="dragPointer.y"
      :stroke="previewColor"
      :class="{ overflow: previewOverflow || dragOverCancel || willOverflowSegments || previewHumanBlocked }"
    />

    <g v-if="lastNode && dragPointer">
      <rect
        :x="dragPointer.x + 12"
        :y="dragPointer.y - 18"
        width="84"
        height="20"
        rx="3"
        :fill="(previewOverflow || dragOverCancel || willOverflowSegments || previewHumanBlocked) ? 'var(--danger)' : 'rgba(253, 246, 227, 0.95)'"
        :stroke="previewColor"
        stroke-width="1"
      />
      <text
        :x="dragPointer.x + 54"
        :y="dragPointer.y - 4"
        text-anchor="middle"
        font-size="10"
        font-weight="600"
        :fill="(previewOverflow || dragOverCancel || willOverflowSegments || previewHumanBlocked) ? '#FDF6E3' : speciesColor"
        style="font-variant-numeric: tabular-nums;"
      >{{ previewLabel }}</text>
    </g>

    <circle
      v-if="lastNode && dragPointer"
      :cx="dragPointer.x"
      :cy="dragPointer.y"
      r="4"
      :fill="previewColor"
      :stroke="previewColor"
      stroke-width="1"
      style="filter: drop-shadow(0 0 6px currentColor); pointer-events: none;"
    />

    <g v-for="route in routeLines" :key="route.id">
      <polyline
        v-if="route.status === 'migrating'"
        class="route-line confirmed"
        :points="pointsToString(buildRouteVisualPoints(route))"
        :stroke="route.color"
        :opacity="1"
      />
      <polyline
        v-else-if="route.status === 'fading'"
        class="route-line fading"
        :points="pointsToString(buildRouteVisualPoints(route))"
        :stroke="route.color"
        :opacity="Math.max(0, 1 - route.fadeProgress)"
        :stroke-width="Math.max(0.5, 3 * (1 - route.fadeProgress))"
      />
      <g v-for="(seg, i) in buildRouteSegments(buildRouteVisualPoints(route), route.color)" :key="`r${route.id}-${i}`">
        <text
          :x="seg.midX"
          :y="seg.midY - 4"
          text-anchor="middle"
          font-size="9"
          :fill="route.color"
          style="font-variant-numeric: tabular-nums; opacity: 0.8;"
        >{{ seg.dist }}</text>
      </g>
    </g>
  </g>
</template>
