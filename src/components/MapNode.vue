<script setup lang="ts">
// 地图节点 v2
// 视觉由 nodeVisuals.ts + NodeBadge.vue 统一控制：
//   - 不同节点名称 = 不同 visualKey = 不同颜色 / 形状 / logo
//   - 不再依赖 shapeForType / nodeTintByTags / tagDecorationTags
// 交互状态保留：
//   snap / in-route / target-pulse / error-flash / unlock-anim / disabled / isFixed
// v4 调整：移除"必经候选"高亮环与"必经候选 · <tag>"文字（地图叠加过乱）。
// 候选节点名称统一在任务面板的"必须经过"区展示。
//
// v6（本次新增）：
// 拖线时（dragState.active === true），
// 当前拖拽物种天然不兼容的节点置灰 + 不可点击。
// 规则复用 systems/routeEligibility.isNodeAllowedByTags，
// 与右侧"禁止通过"列表 / 拖线吸附 / 最终提交校验共享同一事实源。
import { computed } from 'vue'
import { RuntimeMapNode } from '../data/gameData'
import { gameStore } from '../store/gameStore'
import { getNodeVisualByKey } from '../data/nodeVisuals'
import { isNodeAllowedByTags } from '../systems/routeEligibility'
import NodeBadge from './NodeBadge.vue'

const props = defineProps<{
  node: RuntimeMapNode
  /**
   * 旧字段：曾用于在地图上画"必经候选"高亮环 + 标签。
   * 反馈：地图叠加高亮过乱，已移除。任务面板的"必须经过"区仍会展示
   * 候选节点名称。父组件可不再传该 prop；保留类型仅为兼容旧调用。
   * @deprecated 自 v4 起
   */
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

/** 当前拖拽的物种（仅在 dragState.active === true 时有意义） */
const activeDragSpecies = computed(() => {
  if (!gameStore.state.dragState.active) return null
  const taskId = gameStore.state.dragState.taskId
  const task = taskId
    ? gameStore.state.activeTasks.find((t) => t.id === taskId)
    : undefined
  return task ? gameStore.findSpecies(task.speciesId) ?? null : null
})

/** 拖线时该节点对当前物种不可通行：用于置灰 + 禁选 */
const isSpeciesForbiddenDuringDrag = computed(() => {
  const species = activeDragSpecies.value
  if (!species) return false
  return !isNodeAllowedByTags(props.node, species.allowedNodeTags)
})

/** 最终交互禁用：原本 disabled / 物种禁行 / 拖线禁选 都算 */
const isInteractionDisabled = computed(() => {
  return isDisabled.value || isSpeciesForbiddenDuringDrag.value
})

/** 节点自身 logo 描边主色（用于固定节点顶部小圆点 / 解锁动画） */
const badgePrimary = computed(() => {
  if (isDisabled.value) return '#5A6878'
  const key = props.node.equivalenceKey || props.node.displayName || props.node.name || 'unknown'
  return getNodeVisualByKey(key).primary
})

const opacity = computed(() => {
  // 物种禁行（拖线时）视觉比 disabled 更重，但仍让玩家能看清位置
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

/** 生态健康值（0~100）。如果节点还没初始化（防御），回退 100 */
const ecoHealthValue = computed<number>(() => {
  if (typeof props.node.health === 'number') return props.node.health
  return 100
})

/** 节点当前的 ecoState（默认 healthy） */
const ecoState = computed(() => props.node.ecoState || 'healthy')

/** 退化状态时启用轻微闪烁（health <= 15 或 ecoState === 'degraded'） */
const ecoFlicker = computed<boolean>(() => {
  const h = ecoHealthValue.value
  if (h <= 15) return true
  if (ecoState.value === 'degraded') return true
  return false
})

/** 是否正在受到人类活动扣血：用于地图上的即时受击反馈 */
const isUnderHumanPressure = computed<boolean>(() => {
  const t = props.node.lastHumanDamagedAt
  if (typeof t !== 'number' || !Number.isFinite(t)) return false
  const age = gameStore.state.elapsedTime - t
  return age >= 0 && age < 0.65
})

/** badge 是否闪烁：退化闪烁 + 人类扣血即时闪烁 */
const badgeFlicker = computed<boolean>(() => {
  return ecoFlicker.value || isUnderHumanPressure.value
})

/** 节点标题：附加"生态健康 xx%" */
const badgeTitle = computed(() => {
  const base = props.node.name
  let suffix = ''
  if (typeof props.node.health === 'number') {
    suffix = `｜生态健康 ${ecoHealthValue.value.toFixed(0)}%`
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
      <!-- 节点主视觉：统一交给 NodeBadge 渲染 -->
      <foreignObject
        x="-22"
        y="-22"
        width="44"
        height="44"
        style="overflow: visible;"
        :class="{ 'human-pressure-badge': isUnderHumanPressure }"
      >
        <NodeBadge
          :node="props.node"
          :size="44"
          :muted="isDisabled || isSpeciesForbiddenDuringDrag"
          :title="badgeTitle"
          :health="ecoHealthValue"
          :flicker="badgeFlicker"
        />
      </foreignObject>

      <!-- 人类活动正在扣血时的即时受击反馈：小范围闪烁圈，不遮挡地图 -->
      <circle
        v-if="isUnderHumanPressure"
        cx="0"
        cy="0"
        r="26"
        class="human-pressure-pulse"
      >
        <animate attributeName="r" values="23;29;23" dur="0.55s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.25;0.9" dur="0.55s" repeatCount="indefinite" />
      </circle>

      <!-- v4：候选节点的视觉提示不再画在地图上，由任务面板展示。 -->

      <!-- 固定节点标记（顶部小圆点） -->
      <circle v-if="props.node.isFixed" cx="0" cy="-22" r="3" :fill="badgePrimary">
        <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
      </circle>

      <!-- 出现动画 -->
      <circle v-if="isRecentlySpawned" cx="0" cy="0" r="3" fill="none" :stroke="badgePrimary" stroke-width="1">
        <animate attributeName="r" from="3" to="26" dur="0.9s" fill="freeze" />
        <animate attributeName="opacity" from="0.9" to="0" dur="0.9s" fill="freeze" />
      </circle>
    </g>
    <!-- 节点名称 -->
    <text
      class="node-name"
      :class="{ unlock: isRecentlySpawned, 'is-fixed': props.node.isFixed }"
      :x="node.x"
      :y="node.y + 32"
    >{{ node.name }}</text>
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
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.72;
  }
}
</style>
