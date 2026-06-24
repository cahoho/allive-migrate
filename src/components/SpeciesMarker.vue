<script setup lang="ts">
// 物种任务 logo
// - waiting 状态：显示在视觉起点（任务.visualStartX/Y，由 gameStore 计算）
//   - 多个任务共享同一起点时，logo 围绕节点呈扇形分布（不重叠）
// - migrating / fading 状态：沿路线移动
// - pointerdown 在 logo 上时，把 logo 当前视觉位置通过 CustomEvent 传出
//   这样拖线就是从 logo 实际位置发出，而不是节点中心
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { SpeciesTask } from '../data/gameData'
import SpeciesIcon from './SpeciesIcon.vue'
import { getPointAtProgress } from '../utils/svgPath'

const props = defineProps<{
  task: SpeciesTask
}>()

const species = computed(() => gameStore.findSpecies(props.task.speciesId))
const isSelected = computed(() => gameStore.state.selectedTaskId === props.task.id)

const position = computed<{ x: number; y: number } | null>(() => {
  if (props.task.status === 'waiting') {
    // 视觉起点（多任务时由 gameStore 计算并存入 visualStartX/Y）
    if (typeof props.task.visualStartX === 'number' && typeof props.task.visualStartY === 'number') {
      return { x: props.task.visualStartX, y: props.task.visualStartY }
    }
    // 兜底：使用 startNode 位置；若节点不存在则不渲染
    const n = gameStore.state.mapNodes.find((nd) => nd.id === props.task.startNodeId)
    if (!n) return null
    return { x: n.x, y: n.y - 34 }
  }
  if (props.task.status === 'migrating' || props.task.status === 'fading') {
    return getPointAtProgress(props.task.path, props.task.progress, gameStore.state.mapNodes)
  }
  return null
})

const hasPosition = computed(() => position.value !== null)

const radius = 18
const circumference = 2 * Math.PI * radius
const ratio = computed(() => {
  if (!species.value) return 0
  if (props.task.totalTime <= 0) return 0
  return Math.max(0, Math.min(1, props.task.remaining / props.task.totalTime))
})
const dashOffset = computed(() => circumference * (1 - ratio.value))
const isWarning = computed(() => props.task.status === 'waiting' && props.task.remaining <= 5)

const color = computed(() => species.value?.color || 'white')

/** 视觉起点坐标（拖线从此发出） */
const visualStart = computed(() => position.value)

/** pointerdown 在 logo 上：把 taskId + 视觉起点坐标发出 */
function onDragStart(e: PointerEvent) {
  e.stopPropagation()
  e.preventDefault()
  const p = visualStart.value
  if (!p) return
  const evt = new CustomEvent('marker-drag-start', {
    detail: {
      taskId: props.task.id,
      clientX: e.clientX,
      clientY: e.clientY,
      pointerId: e.pointerId,
      visualStartX: p.x,
      visualStartY: p.y
    },
    bubbles: true
  })
  ;(e.target as HTMLElement).dispatchEvent(evt)
}

/** 单击：选中任务（让详情面板按 taskId 显示） */
function onClick(e: MouseEvent) {
  e.stopPropagation()
  gameStore.selectTask(props.task.id)
}
</script>

<template>
  <g
    v-if="hasPosition && position"
    :class="['species-marker', { selected: isSelected, warning: isWarning }]"
    :transform="`translate(${position.x} ${position.y})`"
    :style="{ color: color }"
    data-tutorial-target="species-marker"
  >
    <g
      v-if="task.status === 'waiting'"
      style="pointer-events: all; cursor: grab;"
      @pointerdown="onDragStart"
      @click="onClick"
    >
      <circle class="marker-bg" cx="0" cy="0" :r="radius + 2" :fill="color" opacity="0.15" />
      <circle
        class="timer-ring"
        cx="0"
        cy="0"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="2.5"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        stroke-linecap="round"
      />
      <circle class="marker-glow" cx="0" cy="0" :r="radius - 2" :fill="color" opacity="0.35" />
      <g class="animal-body">
        <SpeciesIcon :type="species?.icon || 'bird'" :color="color" :size="22" />
      </g>
    </g>
    <g v-else style="pointer-events: none;">
      <circle cx="0" cy="0" r="14" :fill="color" opacity="0.25" />
      <g class="animal-body">
        <SpeciesIcon :type="species?.icon || 'bird'" :color="color" :size="20" />
      </g>
    </g>
  </g>
</template>

<style scoped>
/* 手账风格物种标记：白底上计时环更清晰，使用投影代替发光 */
.species-marker {
  filter: drop-shadow(0 1px 3px rgba(90, 70, 50, 0.2));
}
.marker-bg {
  /* 手账背景：柔和色块而非霓虹发光 */
}
.marker-glow {
  /* 手账风格：降低内部光晕，改为轻柔色块 */
  opacity: 0.25 !important;
}
.species-marker.warning .timer-ring {
  /* 警告时加重投影，不用霓虹 */
  filter: drop-shadow(0 0 3px currentColor);
}
.animal-body {
  filter: drop-shadow(0 0.5px 1px rgba(90, 70, 50, 0.2));
}
</style>
