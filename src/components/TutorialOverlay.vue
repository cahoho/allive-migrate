<script setup lang="ts">
// 引导浮层 v1
// ============================================================
// 三层结构（用户文档 §六）：
// 1) 全屏半透明遮罩：rgba(5, 10, 18, 0.35)，但有目标处挖洞
// 2) 高亮圈点层：circle / rect / line
// 3) 中央小窗口：固定 56% 位置 + 底部三按钮
//
// 实现要点：
// - 用 getBoundingClientRect 读 DOM 真实位置（响应式：监听 scroll/resize/rAF）
// - 目标元素用 data-tutorial-target 标记
// - 在地图 SVG 内的目标（节点/marker/blocker/shrink）用 svg-data-* 标记
//   并提供 SVG-to-screen 坐标转换
// ============================================================
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import { gameStore } from '../store/gameStore'
import { getCurrentStep } from '../data/tutorialSteps'
import type { TutorialTargetSpec, TutorialStep } from '../data/gameData'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/gameConfig'
import { getHumanBlocker, getShrinkPoint } from '../systems/humanBlockerSystem'

// ============================================================
// 响应式状态
// ============================================================
const overlayRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)

// 当前高亮目标（已转换为屏幕坐标）
interface ResolvedTarget {
  id: string
  shape: 'circle' | 'rect' | 'line'
  // rect/circle
  x: number
  y: number
  w: number
  h: number
  r: number
  // line（svg world coords）
  linePoints?: { x: number; y: number }[]
}

const resolvedTargets = ref<ResolvedTarget[]>([])

// 高亮卡的位置（固定中央偏下；用户文档 §六）
const tooltipStyle = ref({ left: '50%', top: '56%', transform: 'translate(-50%, -50%)' })

const visible = computed(() => {
  if (!gameStore.state.tutorialActive) return false
  if (gameStore.state.tutorialPhase !== 'intro' && gameStore.state.tutorialPhase !== 'human') return false
  return true
})

const phase = computed(() => gameStore.state.tutorialPhase)
const stepIndex = computed(() => gameStore.state.tutorialStep)

const currentStep = computed<TutorialStep | null>(() => {
  return getCurrentStep(phase.value, stepIndex.value)
})

const canPrev = computed(() => {
  const s = currentStep.value
  if (!s) return false
  if (s.canPrev === false) return false
  return stepIndex.value > 0
})

const canSkip = computed(() => {
  const s = currentStep.value
  if (!s) return false
  if (s.canSkip === false) return false
  return true
})

const nextLabel = computed(() => currentStep.value?.nextLabel || '下一步')

const stepNumber = computed(() => `${stepIndex.value + 1} / ${total.value}`)
const total = computed(() => {
  // v13：intro 阶段从 8 步减为 7 步（合并了原 "drag" 和 "done"）
  return phase.value === 'intro' ? 7 : phase.value === 'human' ? 4 : 0
})

// ============================================================
// 步骤变更：执行 onEnter
// ============================================================
let lastStepId = ''
watch(
  () => `${phase.value}:${stepIndex.value}`,
  () => {
    const s = currentStep.value
    if (!s) return
    if (s.id === lastStepId) return
    lastStepId = s.id
    if (s.onEnter) {
      // 用 nextTick 推后到 DOM 更新后执行，避免和 reset 冲突
      nextTick(() => s.onEnter?.())
    }
    // 重新解析目标位置
    nextTick(() => resolveTargets())
  },
  { immediate: true }
)

watch(visible, (v) => {
  if (v) nextTick(() => resolveTargets())
})

// ============================================================
// 解析目标元素的屏幕坐标
// ============================================================
function getScreenRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  return el.getBoundingClientRect()
}

function getSvgScreenPos(worldX: number, worldY: number): { x: number; y: number } | null {
  // 通过唯一的 data-tutorial-svg 标记找到 svg 根
  const svg = document.querySelector('[data-tutorial-svg="root"]') as SVGSVGElement | null
  if (!svg) return null
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const pt = svg.createSVGPoint()
  pt.x = worldX
  pt.y = worldY
  const m = pt.matrixTransform(ctm)
  return { x: m.x, y: m.y }
}

function resolveTargets() {
  const s = currentStep.value
  if (!s) {
    resolvedTargets.value = []
    return
  }
  const list: ResolvedTarget[] = []
  for (const t of s.targets) {
    const resolved = resolveOne(t)
    if (resolved) list.push(resolved)
  }
  resolvedTargets.value = list
}

function resolveOne(t: TutorialTargetSpec): ResolvedTarget | null {
  const padding = t.padding ?? 8

  // LINE: 用 svg world 坐标，转换为 screen
  if (t.shape === 'line' && t.linePoints) {
    return {
      id: t.id,
      shape: 'line',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      r: 0,
      linePoints: t.linePoints.map((p) => {
        const s = getSvgScreenPos(p.x, p.y)
        return s || p
      })
    }
  }

  // 特殊：通过 gameStore 状态动态查找节点位置（用于起/终点）
  if (t.selector === '[data-tutorial-target="start-node"]' || t.id === 'tutorial-start-node') {
    return resolveTaskNodeWorld(padding, 'start')
  }
  if (t.selector === '[data-tutorial-target="target-node"]' || t.id === 'tutorial-target-node') {
    return resolveTaskNodeWorld(padding, 'target')
  }
  if (t.selector === '[data-tutorial-target="human-blocker"]' || t.id === 'tutorial-human-circle') {
    return resolveHumanBlocker(padding)
  }
  if (t.selector === '[data-tutorial-target="shrink-point"]' || t.id === 'tutorial-shrink-point') {
    return resolveShrinkPoint(padding)
  }

  // RECT: rectSelector 优先；fallback: selector
  if (t.shape === 'rect') {
    const sel = t.rectSelector || t.selector
    if (!sel) return null
    const r = getScreenRect(sel)
    if (!r) return null
    return {
      id: t.id,
      shape: 'rect',
      x: r.left - padding,
      y: r.top - padding,
      w: r.width + padding * 2,
      h: r.height + padding * 2,
      r: 0
    }
  }

  // CIRCLE: 用 selector 中心 + 半径
  if (t.shape === 'circle') {
    if (!t.selector) return null
    const r = getScreenRect(t.selector)
    if (!r) return null
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const radius = Math.max(r.width, r.height) / 2 + padding
    return {
      id: t.id,
      shape: 'circle',
      x: cx,
      y: cy,
      w: 0,
      h: 0,
      r: radius
    }
  }

  return null
}

/** 通过 gameStore 找到当前任务起/终节点的世界坐标，再转屏幕坐标 */
function resolveTaskNodeWorld(padding: number, which: 'start' | 'target'): ResolvedTarget | null {
  const s = gameStore.state
  // 优先取教学任务，没有再取选中任务
  const taskId = s.tutorialTaskId || s.selectedTaskId
  if (!taskId) return null
  const task = s.activeTasks.find((t) => t.id === taskId)
  if (!task) return null
  const nodeId = which === 'start' ? task.startNodeId : task.targetNodeId
  const node = s.mapNodes.find((n) => n.id === nodeId)
  if (!node) return null
  const screen = getSvgScreenPos(node.x, node.y)
  if (!screen) return null
  return {
    id: which === 'start' ? 'tutorial-start-node' : 'tutorial-target-node',
    shape: 'circle',
    x: screen.x,
    y: screen.y,
    w: 0,
    h: 0,
    r: 28 + padding
  }
}

/** 人类阻挡圈：通过 humanBlockerSystem 模块接口取位置 */
function resolveHumanBlocker(padding: number): ResolvedTarget | null {
  const b = getHumanBlocker()
  if (!b) return null
  const screen = getSvgScreenPos(b.x, b.y)
  if (!screen) return null
  return {
    id: 'tutorial-human-circle',
    shape: 'circle',
    x: screen.x,
    y: screen.y,
    w: 0,
    h: 0,
    r: b.blockR + padding
  }
}

/** 缩圈点 */
function resolveShrinkPoint(padding: number): ResolvedTarget | null {
  const sp = getShrinkPoint()
  if (!sp || !sp.active) {
    // 缩圈点不在时，圈一个 map 中心的安全区作 fallback
    const cx = WORLD_WIDTH / 2
    const cy = WORLD_HEIGHT * 0.7
    const screen = getSvgScreenPos(cx, cy)
    if (!screen) return null
    return {
      id: 'tutorial-shrink-point',
      shape: 'circle',
      x: screen.x,
      y: screen.y,
      w: 0,
      h: 0,
      r: 60
    }
  }
  const screen = getSvgScreenPos(sp.x, sp.y)
  if (!screen) return null
  return {
    id: 'tutorial-shrink-point',
    shape: 'circle',
    x: screen.x,
    y: screen.y,
    w: 0,
    h: 0,
    r: 26 + padding
  }
}

// ============================================================
// 监听：每 200ms 重新解析（目标移动 / 滚动 / 窗口 resize）
// ============================================================
let rafId = 0
let lastResolveAt = 0

function tick() {
  rafId = requestAnimationFrame(tick)
  if (!visible.value) return
  const now = performance.now()
  if (now - lastResolveAt > 200) {
    lastResolveAt = now
    resolveTargets()
  }
}

function onResize() {
  resolveTargets()
}

onMounted(() => {
  rafId = requestAnimationFrame(tick)
  // 初始解析
  setTimeout(resolveTargets, 50)
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
})

// ============================================================
// 遮罩 SVG：用 4 个矩形围着每个高亮目标"挖洞"
// ============================================================
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1920)
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 1080)

function onViewportResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', onViewportResize)
  onViewportResize()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
})

const maskPaths = computed(() => {
  const paths: string[] = []
  for (const t of resolvedTargets.value) {
    if (t.shape === 'rect') {
      paths.push(`M ${t.x} ${t.y} h ${t.w} v ${t.h} h -${t.w} Z`)
    } else if (t.shape === 'circle') {
      // 圆无法被 path 减除，用 stroke 圆环表现
      // 改用下面的 ring 渲染
    }
  }
  return paths
})

// ============================================================
// 操作
// ============================================================
function onNext() {
  const s = currentStep.value
  if (s?.onComplete) s.onComplete()
  gameStore.nextTutorialStep()
}
function onPrev() {
  gameStore.prevTutorialStep()
}
function onSkip() {
  gameStore.skipTutorial()
}

// 阻止引导层下点击穿透
function stop(e: Event) {
  e.stopPropagation()
}

// 暴露 world width/height 给模板
const W = WORLD_WIDTH
const H = WORLD_HEIGHT
</script>

<template>
  <div
    v-if="visible"
    ref="overlayRef"
    class="tutorial-overlay"
    @pointerdown="stop"
    @click="stop"
  >
    <!-- 遮罩：使用 4 个矩形围出"洞" -->
    <svg
      class="tutorial-mask"
      :viewBox="`0 0 ${viewportWidth} ${viewportHeight}`"
      preserveAspectRatio="none"
    >
      <path
        :d="`M 0 0 H ${viewportWidth} V ${viewportHeight} H 0 Z ${maskPaths.join(' ')}`"
        fill="rgba(200, 176, 96, 0.28)"
        fill-rule="evenodd"
      />
    </svg>

    <!-- 高亮圆环（circle shape） -->
    <svg
      class="tutorial-rings"
      :viewBox="`0 0 ${viewportWidth} ${viewportHeight}`"
      preserveAspectRatio="none"
    >
      <g v-for="t in resolvedTargets.filter(x => x.shape === 'circle')" :key="t.id">
        <circle
          :cx="t.x"
          :cy="t.y"
          :r="t.r"
          fill="none"
          stroke="rgba(90, 172, 200, 0.90)"
          stroke-width="2.5"
          stroke-dasharray="8 6"
        >
          <animate
            attributeName="r"
            :values="`${t.r};${t.r + 8};${t.r}`"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.6;1;0.6"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      <g v-for="t in resolvedTargets.filter(x => x.shape === 'rect')" :key="`r-${t.id}`">
        <rect
          :x="t.x"
          :y="t.y"
          :width="t.w"
          :height="t.h"
          fill="none"
          stroke="rgba(90, 172, 200, 0.90)"
          stroke-width="2.5"
          stroke-dasharray="10 6"
          rx="8"
        />
      </g>
      <g v-if="resolvedTargets.find(x => x.shape === 'line')">
        <path
          v-for="t in resolvedTargets.filter(x => x.shape === 'line')"
          :key="`l-${t.id}`"
          :d="`M ${t.linePoints![0].x} ${t.linePoints![0].y} ${t.linePoints!.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')}`"
          fill="none"
          stroke="rgba(90, 172, 200, 0.90)"
          stroke-width="2.5"
          stroke-dasharray="10 6"
        />
      </g>
    </svg>

    <!-- 中央小窗口 -->
    <div
      ref="tooltipRef"
      class="tutorial-tooltip"
      :style="tooltipStyle"
    >
      <div class="tutorial-step-indicator">{{ stepNumber }}</div>
      <div class="tutorial-text">{{ currentStep?.text || '' }}</div>
      <div class="tutorial-buttons">
        <button
          class="tut-btn tut-btn-skip"
          :disabled="!canSkip"
          @click="onSkip"
        >直接跳过</button>
        <button
          class="tut-btn tut-btn-prev"
          :disabled="!canPrev"
          @click="onPrev"
        >上一步</button>
        <button
          class="tut-btn tut-btn-next"
          @click="onNext"
        >{{ nextLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: auto;
}

.tutorial-mask,
.tutorial-rings {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.tutorial-tooltip {
  position: absolute;
  width: 360px;
  max-width: 92vw;
  padding: 18px 20px 14px;
  background: var(--bg-paper);
  background-image: var(--grid-dots);
  border: 1.5px dashed rgba(90, 172, 200, 0.45);
  border-radius: 14px 10px 16px 8px;
  color: var(--text);
  box-shadow: var(--shadow-modal), 0 0 16px rgba(90, 172, 200, 0.10);
  font-family: var(--font);
  backdrop-filter: blur(4px);
  animation: tutIn 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
}
@keyframes tutIn {
  from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

.tutorial-step-indicator {
  position: absolute;
  top: -10px;
  right: 14px;
  background: rgba(90, 172, 200, 0.12);
  color: var(--bird);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px dashed rgba(90, 172, 200, 0.35);
  letter-spacing: 0.06em;
  font-family: var(--font-hand);
}

.tutorial-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text);
  text-align: center;
  margin: 8px 0 14px;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font);
}

.tutorial-buttons {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.tut-btn {
  flex: 1;
  padding: 8px 6px;
  font-size: 12px;
  font-family: var(--font-hand);
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed rgba(90, 172, 200, 0.30);
  background: var(--bg-sticker);
  color: var(--text);
  cursor: pointer;
  transition: all 0.18s;
  letter-spacing: 0.04em;
}
.tut-btn:hover:not(:disabled) {
  background: rgba(90, 172, 200, 0.08);
  border-color: rgba(90, 172, 200, 0.55);
  color: var(--bird);
  border-style: solid;
}
.tut-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.tut-btn-next {
  background: rgba(90, 172, 200, 0.12);
  color: var(--bird);
  font-weight: 600;
  border-color: rgba(90, 172, 200, 0.50);
  border-style: solid;
}
.tut-btn-next:hover:not(:disabled) {
  background: rgba(90, 172, 200, 0.20);
}

.tut-btn-skip {
  font-weight: 400;
  color: var(--text-dim);
}
</style>
