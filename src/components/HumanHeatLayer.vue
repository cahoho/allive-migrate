<script setup lang="ts">
// 人类活动图层 v9
// =============================================================
// 核心约束（性能 / 体验）：
// - 全地图只有 1 个永久阻挡圆 + 最多 1 个缩圈点
// - 视觉移动由 RAF 改 transform（不写 Vue state / 不递增 humanFieldVersion）
// - 人类圆半径是动态的（被吞噬的物种 / 缩圈点会改大小），每帧从 getHumanBlocker() 读取
// - 不允许 SVG filter / feGaussianBlur / SMIL animate
// - 圆的大小（blockR / visualR）由 v9 配置：起步 36，范围 36~132
// - 缩圈点只在人类系统激活时显示
// - 缩圈点只在人类面板 mode === 'human' 时显示
// - pointer 关闭时人类保持原地不动（由 humanBlockerSystem.stepHumanBlocker 实现）
// =============================================================
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue'
import { gameStore } from '../store/gameStore'
import {
  HUMAN_BLOCKER_VISUAL_RADIUS,
  HUMAN_BLOCKER_PADDING,
  HUMAN_POINTER_DOT_RADIUS,
  HUMAN_SHRINK_POINT_RADIUS,
  WORLD_WIDTH,
  WORLD_HEIGHT
} from '../data/gameConfig'
import {
  ensureHumanBlocker,
  stepHumanBlocker,
  syncHumanBlockerClock,
  getHumanBlocker,
  getShrinkPoint
} from '../systems/humanBlockerSystem'

const props = defineProps<{
  mode: 'migration' | 'human'
  speciesId?: string
}>()

void props
void WORLD_WIDTH
void WORLD_HEIGHT

const visible = computed(() => gameStore.state.humanActive)

/**
 * 触发 blockerGroup 重新挂载：当人类圆半径变化时强制重新绑定，
 * 避免 SVG <circle :r> 动态更新带来的性能抖动。
 * 由于我们每帧直接 setAttribute 改 r 即可，所以不强制重挂载。
 */

// DOM 引用
const blockerGroupRef = ref<SVGGElement | null>(null)
const outerCircleRef = ref<SVGCircleElement | null>(null)
const innerCircleRef = ref<SVGCircleElement | null>(null)
const labelRef = ref<SVGTextElement | null>(null)
const pointerDotRef = ref<SVGCircleElement | null>(null)
const pointerLineRef = ref<SVGLineElement | null>(null)
const shrinkPointGroupRef = ref<SVGGElement | null>(null)

let rafId = 0
let lastNow = 0

function tick() {
  rafId = requestAnimationFrame(tick)
  if (!gameStore.state.humanActive) {
    // 人类未激活：隐藏缩圈点
    if (shrinkPointGroupRef.value) {
      shrinkPointGroupRef.value.style.opacity = '0'
    }
    return
  }
  const now = performance.now() / 1000
  // 暂停期间只同步时钟，不移动实体
  // - 避免恢复时 lastTime 与真实时间相差过大导致补帧跳动
  // - 暂停期间仍可读取并绘制当前 blocker 位置
  if (gameStore.isGameplayPaused()) {
    syncHumanBlockerClock(now)
  } else {
    stepHumanBlocker(now)
  }
  const b = getHumanBlocker()
  if (!b) return

  // 1) 改 blockerGroup 的 transform（不写 Vue state）
  if (blockerGroupRef.value) {
    blockerGroupRef.value.setAttribute('transform', `translate(${b.x} ${b.y})`)
  }

  // 2) 半径动态：根据 b.blockR / b.visualR 直接 setAttribute（不写 Vue state）
  if (outerCircleRef.value) {
    outerCircleRef.value.setAttribute('r', String(b.blockR + HUMAN_BLOCKER_PADDING))
  }
  if (innerCircleRef.value) {
    innerCircleRef.value.setAttribute('r', String(b.visualR))
  }
  if (labelRef.value) {
    labelRef.value.setAttribute('y', String(-(b.blockR + HUMAN_BLOCKER_PADDING) - 14))
  }

  // 3) 缩圈点
  const sp = getShrinkPoint()
  if (shrinkPointGroupRef.value) {
    if (sp && sp.active) {
      shrinkPointGroupRef.value.setAttribute('transform', `translate(${sp.x} ${sp.y})`)
      shrinkPointGroupRef.value.style.opacity = '1'
    } else {
      shrinkPointGroupRef.value.style.opacity = '0'
    }
  }

  // 4) pointer dot（human 模式）
  if (props.mode === 'human') {
    if (pointerDotRef.value) {
      if (b.pointerActive && b.pointerX !== null && b.pointerY !== null) {
        pointerDotRef.value.setAttribute('cx', String(b.pointerX))
        pointerDotRef.value.setAttribute('cy', String(b.pointerY))
        pointerDotRef.value.setAttribute('r', String(HUMAN_POINTER_DOT_RADIUS))
        pointerDotRef.value.style.opacity = '1'
      } else {
        pointerDotRef.value.style.opacity = '0'
      }
    }
  } else {
    if (pointerDotRef.value) {
      pointerDotRef.value.style.opacity = '0'
    }
  }

  void lastNow
}

onMounted(() => {
  ensureHumanBlocker()
  rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
})

watch(visible, (v) => {
  if (v) ensureHumanBlocker()
})
</script>

<template>
  <!-- migration 模式：阻挡圈 + 中心圆 + 短文本 + 缩圈点 -->
  <g
    v-if="visible && props.mode === 'migration'"
    ref="blockerGroupRef"
    class="human-blocker"
    pointer-events="none"
  >
    <circle
      ref="outerCircleRef"
      :r="HUMAN_BLOCKER_VISUAL_RADIUS + HUMAN_BLOCKER_PADDING"
      fill="rgba(255, 110, 50, 0.10)"
      stroke="rgba(255, 110, 60, 0.85)"
      stroke-width="2"
      stroke-dasharray="6 4"
    />
    <circle
      ref="innerCircleRef"
      :r="HUMAN_BLOCKER_VISUAL_RADIUS"
      fill="rgba(255, 110, 50, 0.22)"
      stroke="rgba(255, 110, 60, 0.95)"
      stroke-width="1.6"
    />
    <text
      ref="labelRef"
      :y="-(HUMAN_BLOCKER_VISUAL_RADIUS + HUMAN_BLOCKER_PADDING) - 14"
      text-anchor="middle"
      class="human-blocker-label"
    >人类阻碍</text>
  </g>

  <!-- human 模式：阻挡圈 + 中心圆 + 鼠标点 + 缩圈点 -->
  <g v-if="visible && props.mode === 'human'">
    <g
      ref="blockerGroupRef"
      class="human-blocker"
      pointer-events="none"
    >
      <circle
        ref="outerCircleRef"
        :r="HUMAN_BLOCKER_VISUAL_RADIUS + HUMAN_BLOCKER_PADDING"
        fill="rgba(255, 110, 50, 0.08)"
        stroke="rgba(255, 110, 60, 0.7)"
        stroke-width="1.5"
        stroke-dasharray="6 4"
      />
      <circle
        ref="innerCircleRef"
        :r="HUMAN_BLOCKER_VISUAL_RADIUS"
        fill="rgba(255, 200, 120, 0.18)"
        stroke="rgba(255, 200, 120, 0.85)"
        stroke-width="1.6"
      />
    </g>
    <circle
      ref="pointerDotRef"
      :r="HUMAN_POINTER_DOT_RADIUS"
      fill="rgba(120, 220, 255, 0.95)"
      stroke="rgba(120, 220, 255, 0.6)"
      stroke-width="1"
      pointer-events="none"
      :opacity="0"
    />
    <line
      v-if="false"
      ref="pointerLineRef"
    />
  </g>

  <!-- 缩圈点：只在人类面板 mode === 'human' 时渲染 -->
  <g
    v-if="visible && props.mode === 'human'"
    ref="shrinkPointGroupRef"
    class="human-shrink-point"
    pointer-events="none"
  >
    <circle
      :r="HUMAN_SHRINK_POINT_RADIUS + 4"
      fill="rgba(80, 230, 200, 0.18)"
      stroke="rgba(80, 230, 200, 0.95)"
      stroke-width="1.5"
      stroke-dasharray="3 3"
    />
    <circle
      :r="HUMAN_SHRINK_POINT_RADIUS"
      fill="rgba(80, 230, 200, 0.55)"
      stroke="rgba(150, 255, 220, 1)"
      stroke-width="2"
    />
    <!-- 内嵌向内箭头（用三角形表示"向内缩"） -->
    <path
      :d="`M ${-HUMAN_SHRINK_POINT_RADIUS * 0.55} ${-HUMAN_SHRINK_POINT_RADIUS * 0.3}
           L ${HUMAN_SHRINK_POINT_RADIUS * 0.55} ${-HUMAN_SHRINK_POINT_RADIUS * 0.3}
           L 0 ${HUMAN_SHRINK_POINT_RADIUS * 0.55} Z`"
      fill="rgba(20, 80, 70, 0.95)"
      stroke="rgba(255, 255, 255, 0.9)"
      stroke-width="0.8"
    />
    <text
      :y="HUMAN_SHRINK_POINT_RADIUS + 14"
      text-anchor="middle"
      class="human-shrink-label"
    >缩圈点</text>
  </g>
</template>

<script lang="ts">
export default { name: 'HumanHeatLayer' }
</script>

<style scoped>
.human-blocker {
  pointer-events: none;
  will-change: transform;
}
.human-blocker-label {
  font-size: 13px;
  font-weight: 700;
  fill: rgba(139, 125, 107, 0.92);
  paint-order: stroke;
  stroke: rgba(247, 241, 230, 0.85);
  stroke-width: 3px;
  pointer-events: none;
  font-family: var(--font-hand);
}
.human-shrink-point {
  pointer-events: none;
  will-change: transform;
  transition: opacity 0.2s ease;
}
.human-shrink-label {
  font-size: 11px;
  font-weight: 700;
  fill: rgba(108, 192, 128, 0.92);
  paint-order: stroke;
  stroke: rgba(247, 241, 230, 0.85);
  stroke-width: 3px;
  pointer-events: none;
  font-family: var(--font-hand);
}
</style>
