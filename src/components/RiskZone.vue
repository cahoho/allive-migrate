<script setup lang="ts">
// 风险区域可视化层 v9
// 圆形限制区：风暴禁飞圈 / 干旱隔离圈
// 风格：明显警示、虚线 + 标签，让玩家一眼能看到"圈"在哪里
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { getActiveRiskZones, segmentIntersectsZone } from '../data/riskZones'
import { RuntimeMapNode } from '../data/gameData'

const props = defineProps<{
  nodes: RuntimeMapNode[]
  speciesPath?: string[]
  speciesId?: string
}>()

const season = computed(() => gameStore.state.season)

const activeZones = computed(() => getActiveRiskZones(season.value, props.nodes))

/** 当前是否有任务正在闪烁某风险区域 */
const flashingZoneId = computed(() => {
  for (const t of gameStore.state.activeTasks) {
    if (t.flashRiskZoneId && t.flashRiskZoneAt && Date.now() - t.flashRiskZoneAt < 1400) {
      return t.flashRiskZoneId
    }
  }
  return null
})

/** 当前正在拖拽的路线预览是否会撞到某风险区域（用于高亮提示） */
const previewHitZoneId = computed(() => {
  if (!props.speciesId) return null
  const path = gameStore.state.dragState.path
  if (path.length === 0) return null
  const pointer = gameStore.state.dragState.pointer
  if (!pointer) return null
  const lastId = path[path.length - 1]
  const lastNode = props.nodes.find((n) => n.id === lastId)
  if (!lastNode) return null
  const zones = activeZones.value.filter((z) => z.forbiddenFor.includes(props.speciesId!))
  for (const z of zones) {
    if (segmentIntersectsZone(lastNode.x, lastNode.y, pointer.x, pointer.y, z)) {
      return z.id
    }
  }
  return null
})

function fillFor(zoneId: string) {
  if (flashingZoneId.value === zoneId) return 'rgba(212, 88, 72, 0.35)'
  if (previewHitZoneId.value === zoneId) return 'rgba(232, 160, 76, 0.22)'
  // 默认：暖棕填充，手绘地图风格
  return 'rgba(200, 176, 96, 0.10)'
}
function strokeFor(zoneId: string) {
  if (flashingZoneId.value === zoneId) return '#D45848'
  if (previewHitZoneId.value === zoneId) return '#E8A04C'
  return '#C8B898'
}
function strokeWidthFor(zoneId: string) {
  if (flashingZoneId.value === zoneId) return 2.6
  if (previewHitZoneId.value === zoneId) return 2.2
  return 1.5
}
function labelFillFor(zoneId: string) {
  if (flashingZoneId.value === zoneId) return '#D45848'
  if (previewHitZoneId.value === zoneId) return '#E8A04C'
  return '#8B7D6B'
}
</script>

<template>
  <g class="risk-zones">
    <g v-for="zone in activeZones" :key="zone.id">
      <!-- 圆形风险区域（v9：仅圆形；rect 形状已不再生成） -->
      <template v-if="zone.shape === 'circle'">
        <circle
          :cx="zone.cx"
          :cy="zone.cy"
          :r="zone.r"
          :fill="fillFor(zone.id)"
          :stroke="strokeFor(zone.id)"
          :stroke-width="strokeWidthFor(zone.id)"
          :stroke-dasharray="flashingZoneId === zone.id ? '0' : '8 5'"
          :opacity="flashingZoneId === zone.id ? 0.95 : 0.85"
        >
          <animate
            v-if="flashingZoneId === zone.id"
            attributeName="opacity"
            values="0.4;0.95;0.4"
            dur="0.6s"
            repeatCount="3"
          />
        </circle>
        <!-- 在圆边外画一个"向心"刻度小标记，提示"圆形禁区" -->
        <line
          :x1="zone.cx"
          :y1="(zone.cy ?? 0) - (zone.r ?? 0) - 8"
          :x2="zone.cx"
          :y2="(zone.cy ?? 0) - (zone.r ?? 0) - 18"
          :stroke="strokeFor(zone.id)"
          :stroke-width="1.4"
          :stroke-dasharray="flashingZoneId === zone.id ? '0' : '2 3'"
          pointer-events="none"
        />
        <text
          :x="zone.cx"
          :y="(zone.cy ?? 0) - (zone.r ?? 0) - 22"
          text-anchor="middle"
          font-size="13"
          :fill="labelFillFor(zone.id)"
          style="pointer-events: none; font-weight: 700;"
        >{{ zone.name }}</text>
      </template>
      <!-- 兼容旧 rect 形状（已不再生成，但保留 fallback） -->
      <template v-else>
        <rect
          :x="zone.x"
          :y="zone.y"
          :width="zone.width"
          :height="zone.height"
          :fill="fillFor(zone.id)"
          :stroke="strokeFor(zone.id)"
          :stroke-width="strokeWidthFor(zone.id)"
          :stroke-dasharray="flashingZoneId === zone.id ? '0' : '8 5'"
          :opacity="flashingZoneId === zone.id ? 0.95 : 0.85"
        >
          <animate
            v-if="flashingZoneId === zone.id"
            attributeName="opacity"
            values="0.4;0.95;0.4"
            dur="0.6s"
            repeatCount="3"
          />
        </rect>
        <text
          :x="(zone.x || 0) + (zone.width || 0) / 2"
          :y="(zone.y || 0) - 8"
          text-anchor="middle"
          font-size="13"
          :fill="labelFillFor(zone.id)"
          style="pointer-events: none; font-weight: 700;"
        >{{ zone.name }}</text>
      </template>
    </g>
  </g>
</template>
