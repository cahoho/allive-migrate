<script setup lang="ts">
import { computed } from 'vue'
import { RuntimeMapNode } from '../data/gameData'
import { gameStore } from '../store/gameStore'
import { getNodeVisualByKey } from '../data/nodeVisuals'
import { isNodeAllowedByTags } from '../systems/routeEligibility'
import NodeBadge from './NodeBadge.vue'

const props = defineProps<{
  node: RuntimeMapNode
  requiredTags?: never
}>()

const isSnap = computed(() => {
  if (!gameStore.state.dragState.active) return false
  return gameStore.state.dragState.overNodeId === props.node.id
})
const isInRoute = computed(() => {
  if (!gameStore.state.dragState.active) return false
  return gameStore.state.dragState.path.includes(props.node.id)
})
const isPulse = computed(() => {
  const t = gameStore.state.activeTasks.find((t) => t.targetNodeId === props.node.id && Date.now() - t.pulseAt < 1200)
  return !!t
})
const isError = computed(() => {
  const t = gameStore.state.activeTasks.find((t) => Date.now() - t.errorFlashAt < 1000)
  if (!t) return false
  return t.path.includes(props.node.id)
})
const isDisabled = computed(() => props.node.status === 'disabled')
const isRecentlySpawned = computed(() => Date.now() - props.node.spawnedAt < 1200)

const activeDragSpecies = computed(() => {
  if (!gameStore.state.dragState.active) return null
  const taskId = gameStore.state.dragState.taskId
  const task = taskId
    ? gameStore.state.activeTasks.find((t) => t.id === taskId)
    : undefined
  return task ? gameStore.findSpecies(task.speciesId) ?? null : null
})

const isSpeciesForbiddenDuringDrag = computed(() => {
  const species = activeDragSpecies.value
  if (!species) return false
  return !isNodeAllowedByTags(props.node, species.allowedNodeTags)
})

const isInteractionDisabled = computed(() => {
  return isDisabled.value || isSpeciesForbiddenDuringDrag.value
})

const badgePrimary = computed(() => {
  if (isDisabled.value) return '#5A6878'
  const key = props.node.equivalenceKey || props.node.displayName || props.node.name || 'unknown'
  return getNodeVisualByKey(key).primary
})

const opacity = computed(() => {
  if (isSpeciesForbiddenDuringDrag.value) return 0.28
  if (isDisabled.value) return 0.4
  return 1
})

const transform = computed(() => {
  let scale = 1
  if (isSnap.value) scale = 1.36
  else if (isInRoute.value) scale = 1.18
  return `translate(${props.node.x} ${props.node.y}) scale(${scale})`
})

const ecoHealthValue = computed<number>(() => {
  if (typeof props.node.health === 'number') return props.node.health
  return 100
})

const ecoState = computed(() => props.node.ecoState || 'healthy')

const ecoFlicker = computed<boolean>(() => {
  const h = ecoHealthValue.value
  if (h <= 15) return true
  if (ecoState.value === 'degraded') return true
  return false
})

const isUnderHumanPressure = computed<boolean>(() => {
  const t = props.node.lastHumanDamagedAt
  if (typeof t !== 'number' || !Number.isFinite(t)) return false
  const age = gameStore.state.elapsedTime - t
  return age >= 0 && age < 0.65
})

const badgeFlicker = computed<boolean>(() => {
  return ecoFlicker.value || isUnderHumanPressure.value
})

const badgeTitle = computed(() => {
  const base = props.node.name
  let suffix = ''
  if (typeof props.node.health === 'number') {
    suffix = ` | ÉúÌ¬½¡¿µ ${ecoHealthValue.value.toFixed(0)}%`
  }
  return base + suffix
})
</script>

<template>
  <g
    :class="['map-node', {
      snap: isSnap,
      'in-route': isInRoute,
      'target-pulse': isPulse,
      'error-flash': isError,
      'unlock-anim': isRecentlySpawned,
      disabled: isDisabled,
      'is-fixed': props.node.isFixed,
      'under-human-pressure': isUnderHumanPressure,
      'species-forbidden': isSpeciesForbiddenDuringDrag,
      'eco-healthy': ecoState === 'healthy',
      'eco-pressured': ecoState === 'pressured',
      'eco-damaged': ecoState === 'damaged',
      'eco-degraded': ecoState === 'degraded'
    }]"
    :style="{ pointerEvents: isInteractionDisabled ? 'none' : 'all', opacity: opacity }"
    :data-node-id="props.node.id"
  >
    <g :transform="transform">
      <foreignObject x="-22" y="-22" width="44" height="44" style="overflow: visible;" :class="{ 'human-pressure-badge': isUnderHumanPressure }">
        <NodeBadge :node="props.node" :size="44" :muted="isDisabled || isSpeciesForbiddenDuringDrag" :title="badgeTitle" :health="ecoHealthValue" :flicker="badgeFlicker" />
      </foreignObject>

      <circle v-if="isUnderHumanPressure" cx="0" cy="0" r="26" class="human-pressure-pulse">
        <animate attributeName="r" values="23;29;23" dur="0.55s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.25;0.9" dur="0.55s" repeatCount="indefinite" />
      </circle>

      <circle v-if="props.node.isFixed" cx="0" cy="-22" r="3" :fill="badgePrimary">
        <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
      </circle>

      <circle v-if="isRecentlySpawned" cx="0" cy="0" r="3" fill="none" :stroke="badgePrimary" stroke-width="1">
        <animate attributeName="r" from="3" to="26" dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
      </circle>
    </g>
    <text class="node-name" :class="{ unlock: isRecentlySpawned, 'is-fixed': props.node.isFixed }" :x="node.x" :y="node.y + 32">{{ node.name }}</text>
  </g>
</template>

<style scoped>
.human-pressure-pulse {
  fill: rgba(212, 88, 72, 0.06);
  stroke: rgba(212, 88, 72, 0.75);
  stroke-width: 2;
  pointer-events: none;
  filter: none;
}
.map-node.species-forbidden .node-name {
  fill: #A89480;
  opacity: 0.58;
}
.human-pressure-badge {
  animation: human-pressure-badge-flash 0.48s ease-in-out infinite;
  filter: drop-shadow(0 0 4px rgba(212, 88, 72, 0.45));
}
@keyframes human-pressure-badge-flash {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}
</style>
