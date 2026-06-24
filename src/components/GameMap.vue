<script setup lang="ts">
// v4 调整：移除"必经候选"在地图上的高亮环 / 文字。地图职责回到节点、
// 风险、路径、人类活动层；候选节点名称改由任务面板的"必须经过"区展示。
import { ref, computed, onMounted } from 'vue'
import { gameStore } from '../store/gameStore'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/gameConfig'
import MapNode from './MapNode.vue'
import RouteLine from './RouteLine.vue'
import SpeciesMarker from './SpeciesMarker.vue'
import RiskZone from './RiskZone.vue'
import HumanHeatLayer from './HumanHeatLayer.vue'
import LayerToggle from './LayerToggle.vue'
import { useDragRoute } from '../composables/useDragRoute'
import { setHumanPointerTarget } from '../systems/humanBlockerSystem'

const svgRef = ref<SVGSVGElement | null>(null)
const cancelZoneRef = ref<HTMLElement | null>(null)

const viewBox = computed(() => `0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`)
const nodes = computed(() => gameStore.state.mapNodes)
const waitingTasks = computed(() => gameStore.state.activeTasks)
const season = computed(() => gameStore.state.season)

/** 当前正在拖拽的物种 id（传给 RiskZone 用于预览高亮） */
const draggingSpeciesId = computed(() => {
  const id = gameStore.state.dragState.taskId
  if (!id) return null
  const task = gameStore.state.activeTasks.find((t) => t.id === id)
  return task?.speciesId || null
})

/** 人类图层是否激活且当前正在显示中 */
const humanLayerVisible = computed(() =>
  gameStore.state.humanActive && gameStore.state.humanLayerVisible
)

useDragRoute({
  svgRef: svgRef as any,
  cancelZoneEl: cancelZoneRef as any
})

function onMarkerDragStart(e: Event) {
  // 输入保护：暂停期间不允许启动新的拖线
  // - human-tutorial 等暂停原因生效时，直接 return
  // - 教程浮层按钮仍可点击（事件源不同）
  if (gameStore.isGameplayPaused()) return
  const ce = e as CustomEvent
  const { taskId, clientX, clientY, visualStartX, visualStartY } = ce.detail
  if (!svgRef.value) return
  const task = gameStore.state.activeTasks.find((t) => t.id === taskId)
  if (!task || task.status !== 'waiting') return
  gameStore.startDrag(
    taskId,
    typeof visualStartX === 'number' ? visualStartX : undefined,
    typeof visualStartY === 'number' ? visualStartY : undefined
  )
  const pt = svgRef.value.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svgRef.value.getScreenCTM()
  if (ctm) {
    const t = pt.matrixTransform(ctm.inverse())
    gameStore.setDragPointer({ x: t.x, y: t.y })
  }
}

function bindMarkerEvents() {
  const root = svgRef.value?.parentElement
  if (!root) return
  root.addEventListener('marker-drag-start', onMarkerDragStart as EventListener)
}
onMounted(() => {
  bindMarkerEvents()
})

// ============================================================
// 人类图层 pointer catcher
// v8：鼠标按下时调用 setHumanPointerTarget(x, y, true)
// 移动时如果 pressed 则持续更新；松开/取消/离开时关闭
// ============================================================
const activeHumanPointerId = ref<number | null>(null)

function pointerToSvg(e: PointerEvent) {
  const svg = svgRef.value
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const p = pt.matrixTransform(ctm.inverse())
  return { x: p.x, y: p.y }
}

function onHumanPointerDown(e: PointerEvent) {
  if (!humanLayerVisible.value) return
  // 输入保护：暂停期间不允许新的 pointer 按压
  // 教程暂停时即便图层意外 visible 也不接受新按压
  if (gameStore.isGameplayPaused()) {
    // 防御：若之前有残留的按压态，也清掉
    if (activeHumanPointerId.value !== null) {
      setHumanPointerTarget(null, null, false)
      gameStore.setHumanPressActive(false)
      activeHumanPointerId.value = null
    }
    return
  }
  const p = pointerToSvg(e)
  if (!p) return
  activeHumanPointerId.value = e.pointerId
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  gameStore.setPointerPos(p)
  gameStore.setHumanPressActive(true)
  setHumanPointerTarget(p.x, p.y, true)
}

function onHumanPointerMove(e: PointerEvent) {
  if (!humanLayerVisible.value) return
  // 暂停期间 pointer move 直接忽略，不更新人类位置
  if (gameStore.isGameplayPaused()) return
  const p = pointerToSvg(e)
  if (!p) return
  gameStore.setPointerPos(p)
  // 只在按压时驱动阻挡圆；hover 只更新光标位置
  if (activeHumanPointerId.value !== e.pointerId) {
    return
  }
  setHumanPointerTarget(p.x, p.y, true)
}

function onHumanPointerUp(e: PointerEvent) {
  if (!humanLayerVisible.value) return
  if (activeHumanPointerId.value !== e.pointerId) return
  setHumanPointerTarget(null, null, false)
  gameStore.setHumanPressActive(false)
  activeHumanPointerId.value = null
}

function onHumanPointerCancel(e: PointerEvent) {
  if (!humanLayerVisible.value) return
  if (activeHumanPointerId.value !== e.pointerId) return
  setHumanPointerTarget(null, null, false)
  gameStore.setHumanPressActive(false)
  activeHumanPointerId.value = null
}

function onHumanPointerLeave(_e: PointerEvent) {
  if (!humanLayerVisible.value) return
  // 暂停期间也清理按压态，避免恢复时残留 pointer 控制
  if (gameStore.isGameplayPaused()) {
    if (activeHumanPointerId.value !== null) {
      setHumanPointerTarget(null, null, false)
      gameStore.setHumanPressActive(false)
      activeHumanPointerId.value = null
    }
    gameStore.setPointerPos(null)
    return
  }
  if (activeHumanPointerId.value === null) {
    setHumanPointerTarget(null, null, false)
    gameStore.setHumanPressActive(false)
  }
  gameStore.setPointerPos(null)
}
</script>

<template>
  <div class="map-wrap">
    <!-- v13：迁徙 / 人类活动 切换按钮，固定在底图右上方 -->
    <LayerToggle />

    <svg
      ref="svgRef"
      class="map-svg"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      data-tutorial-svg="root"
    >
      <defs>
        <!-- 手绘纸质地图渐变：温暖的米白/浅棕底色 -->
        <radialGradient id="mapGradient" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#FDF6E3" />
          <stop offset="100%" stop-color="#F0E6CC" />
        </radialGradient>
        <!-- 手绘线条滤镜：轻微颤抖感 -->
        <filter id="handDrawn" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <!-- 纸质纹理滤镜 -->
        <filter id="paperTexture" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise"/>
          <feBlend in="SourceGraphic" in2="grayNoise" mode="multiply" result="blended"/>
        </filter>
        <!-- 手绘地图边框纹路 -->
        <pattern id="dotGrid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="15" cy="15" r="0.7" fill="#C8B898" opacity="0.4"/>
        </pattern>
      </defs>

      <rect class="map-bg" x="0" y="0" :width="WORLD_WIDTH" :height="WORLD_HEIGHT" />

      <!-- 底图纸质点网格 -->
      <rect x="0" y="0" :width="WORLD_WIDTH" :height="WORLD_HEIGHT" fill="url(#dotGrid)" opacity="0.6" pointer-events="none" />

      <!-- ============================================================
           手绘地图装饰层（迁徙模式时显示）
           包含：双线边框 / 四角花纹 / 罗盘花 / 地形等高线 / 航线虚线
           ============================================================ -->
      <g v-if="!humanLayerVisible" class="map-decoration" pointer-events="none">

        <!-- ── 外双线边框 ── -->
        <!-- 外框粗线 -->
        <rect x="6" y="6" :width="WORLD_WIDTH - 12" :height="WORLD_HEIGHT - 12"
              fill="none" stroke="#C8B898" stroke-width="2" rx="3" opacity="0.55" />
        <!-- 内框细线 -->
        <rect x="14" y="14" :width="WORLD_WIDTH - 28" :height="WORLD_HEIGHT - 28"
              fill="none" stroke="#C8B898" stroke-width="0.8" rx="2" opacity="0.4" />
        <!-- 边框间距小刻度 - 上边 -->
        <g opacity="0.35" stroke="#C8B898" stroke-width="0.7">
          <line v-for="k in 20" :key="`tick-t${k}`"
            :x1="k * (WORLD_WIDTH / 21)" y1="6" :x2="k * (WORLD_WIDTH / 21)" y2="14" />
          <!-- 下边 -->
          <line v-for="k in 20" :key="`tick-b${k}`"
            :x1="k * (WORLD_WIDTH / 21)" :y1="WORLD_HEIGHT - 14" :x2="k * (WORLD_WIDTH / 21)" :y2="WORLD_HEIGHT - 6" />
          <!-- 左边 -->
          <line v-for="k in 12" :key="`tick-l${k}`"
            x1="6" :y1="k * (WORLD_HEIGHT / 13)" x2="14" :y2="k * (WORLD_HEIGHT / 13)" />
          <!-- 右边 -->
          <line v-for="k in 12" :key="`tick-r${k}`"
            :x1="WORLD_WIDTH - 14" :y1="k * (WORLD_HEIGHT / 13)" :x2="WORLD_WIDTH - 6" :y2="k * (WORLD_HEIGHT / 13)" />
        </g>

        <!-- ── 四角装饰花纹 ── -->
        <!-- 左上角：卷草纹 -->
        <g transform="translate(20, 20)" opacity="0.5" fill="none" stroke="#B8A888" stroke-linecap="round">
          <path d="M 0,0 Q 12,0 16,8 Q 20,16 12,20" stroke-width="1.4"/>
          <path d="M 0,0 Q 0,12 8,16 Q 16,20 20,12" stroke-width="1.0" opacity="0.6"/>
          <circle cx="0" cy="0" r="2.5" fill="#B8A888" stroke="none"/>
          <circle cx="20" cy="12" r="1.5" fill="#B8A888" stroke="none" opacity="0.7"/>
          <circle cx="12" cy="20" r="1.5" fill="#B8A888" stroke="none" opacity="0.7"/>
        </g>
        <!-- 右上角 -->
        <g :transform="`translate(${WORLD_WIDTH - 20}, 20) scale(-1,1)`" opacity="0.5" fill="none" stroke="#B8A888" stroke-linecap="round">
          <path d="M 0,0 Q 12,0 16,8 Q 20,16 12,20" stroke-width="1.4"/>
          <path d="M 0,0 Q 0,12 8,16 Q 16,20 20,12" stroke-width="1.0" opacity="0.6"/>
          <circle cx="0" cy="0" r="2.5" fill="#B8A888" stroke="none"/>
          <circle cx="20" cy="12" r="1.5" fill="#B8A888" stroke="none" opacity="0.7"/>
          <circle cx="12" cy="20" r="1.5" fill="#B8A888" stroke="none" opacity="0.7"/>
        </g>
        <!-- 左下角 -->
        <g :transform="`translate(20, ${WORLD_HEIGHT - 20}) scale(1,-1)`" opacity="0.5" fill="none" stroke="#B8A888" stroke-linecap="round">
          <path d="M 0,0 Q 12,0 16,8 Q 20,16 12,20" stroke-width="1.4"/>
          <path d="M 0,0 Q 0,12 8,16 Q 16,20 20,12" stroke-width="1.0" opacity="0.6"/>
          <circle cx="0" cy="0" r="2.5" fill="#B8A888" stroke="none"/>
        </g>
        <!-- 右下角 -->
        <g :transform="`translate(${WORLD_WIDTH - 20}, ${WORLD_HEIGHT - 20}) scale(-1,-1)`" opacity="0.5" fill="none" stroke="#B8A888" stroke-linecap="round">
          <path d="M 0,0 Q 12,0 16,8 Q 20,16 12,20" stroke-width="1.4"/>
          <path d="M 0,0 Q 0,12 8,16 Q 16,20 20,12" stroke-width="1.0" opacity="0.6"/>
          <circle cx="0" cy="0" r="2.5" fill="#B8A888" stroke="none"/>
        </g>

        <!-- ── 右下角罗盘花（古典手绘罗盘）── -->
        <g :transform="`translate(${WORLD_WIDTH - 58}, ${WORLD_HEIGHT - 58})`" opacity="0.42">
          <!-- 外圈 -->
          <circle cx="0" cy="0" r="22" fill="none" stroke="#B8A888" stroke-width="1.2"/>
          <circle cx="0" cy="0" r="18" fill="none" stroke="#C8B898" stroke-width="0.6" stroke-dasharray="2 3"/>
          <!-- 8方向主刻度 -->
          <g stroke="#B8A888" stroke-width="1.2" stroke-linecap="round">
            <line x1="0" y1="-22" x2="0" y2="-14"/>
            <line x1="0" y1="22" x2="0" y2="14"/>
            <line x1="-22" y1="0" x2="-14" y2="0"/>
            <line x1="22" y1="0" x2="14" y2="0"/>
          </g>
          <g stroke="#C8B898" stroke-width="0.7" stroke-linecap="round" opacity="0.7">
            <line x1="-15.6" y1="-15.6" x2="-10.6" y2="-10.6"/>
            <line x1="15.6" y1="-15.6" x2="10.6" y2="-10.6"/>
            <line x1="-15.6" y1="15.6" x2="-10.6" y2="10.6"/>
            <line x1="15.6" y1="15.6" x2="10.6" y2="10.6"/>
          </g>
          <!-- 北方箭头（指北针）-->
          <path d="M 0,-14 L 3,-5 L 0,-8 L -3,-5 Z" fill="#B8A888" stroke="none"/>
          <path d="M 0,14 L 2,5 L 0,8 L -2,5 Z" fill="#C8B898" stroke="none" opacity="0.6"/>
          <!-- 中心点 -->
          <circle cx="0" cy="0" r="2.5" fill="#B8A888" stroke="none"/>
          <circle cx="0" cy="0" r="1" fill="#FDF6E3" stroke="none"/>
          <!-- 北字标注 -->
          <text x="0" y="-25" text-anchor="middle" font-size="6" fill="#B8A888" font-family="serif" letter-spacing="0.5">N</text>
        </g>

        <!-- ── 地形等高线装饰（左侧山地区）── -->
        <g opacity="0.2" fill="none" stroke="#C8B898" stroke-width="0.9" stroke-linecap="round">
          <!-- 山形轮廓线组 1（左上区）-->
          <path d="M 30,80 Q 60,50 90,65 Q 115,75 130,60"/>
          <path d="M 35,90 Q 65,62 95,76 Q 118,86 132,72"/>
          <path d="M 40,100 Q 70,74 100,87 Q 120,96 134,84"/>
          <!-- 山形轮廓线组 2（右下区）-->
          <path :d="`M ${WORLD_WIDTH-130},${WORLD_HEIGHT-80} Q ${WORLD_WIDTH-90},${WORLD_HEIGHT-55} ${WORLD_WIDTH-60},${WORLD_HEIGHT-65}`"/>
          <path :d="`M ${WORLD_WIDTH-125},${WORLD_HEIGHT-92} Q ${WORLD_WIDTH-85},${WORLD_HEIGHT-67} ${WORLD_WIDTH-55},${WORLD_HEIGHT-77}`"/>
        </g>

        <!-- ── 中部装饰：手绘小山丘 ── -->
        <g opacity="0.18" fill="#D4C4A8" stroke="#B8A888" stroke-width="0.8" stroke-linecap="round">
          <!-- 山丘1 -->
          <path :d="`M ${WORLD_WIDTH*0.15},${WORLD_HEIGHT*0.72} Q ${WORLD_WIDTH*0.18},${WORLD_HEIGHT*0.62} ${WORLD_WIDTH*0.22},${WORLD_HEIGHT*0.72} Z`"/>
          <path :d="`M ${WORLD_WIDTH*0.18},${WORLD_HEIGHT*0.72} Q ${WORLD_WIDTH*0.22},${WORLD_HEIGHT*0.6} ${WORLD_WIDTH*0.27},${WORLD_HEIGHT*0.72} Z`"/>
          <!-- 山丘2 -->
          <path :d="`M ${WORLD_WIDTH*0.72},${WORLD_HEIGHT*0.22} Q ${WORLD_WIDTH*0.75},${WORLD_HEIGHT*0.12} ${WORLD_WIDTH*0.79},${WORLD_HEIGHT*0.22} Z`"/>
          <path :d="`M ${WORLD_WIDTH*0.75},${WORLD_HEIGHT*0.22} Q ${WORLD_WIDTH*0.79},${WORLD_HEIGHT*0.1} ${WORLD_WIDTH*0.84},${WORLD_HEIGHT*0.22} Z`"/>
        </g>

        <!-- ── 迁徙航线方向标注（虚线指示） ── -->
        <!-- 从左到右的候鸟迁徙方向提示线 -->
        <g opacity="0.15" stroke="#A89480" stroke-width="1" stroke-dasharray="6 8" fill="none">
          <path :d="`M 30,${WORLD_HEIGHT*0.35} Q ${WORLD_WIDTH*0.3},${WORLD_HEIGHT*0.25} ${WORLD_WIDTH*0.7},${WORLD_HEIGHT*0.3} Q ${WORLD_WIDTH*0.85},${WORLD_HEIGHT*0.32} ${WORLD_WIDTH-30},${WORLD_HEIGHT*0.28}`"/>
        </g>
        <!-- 海洋迁徙曲线 -->
        <g opacity="0.12" stroke="#5C94C0" stroke-width="1.2" stroke-dasharray="4 8" fill="none">
          <path :d="`M 30,${WORLD_HEIGHT*0.65} Q ${WORLD_WIDTH*0.25},${WORLD_HEIGHT*0.75} ${WORLD_WIDTH*0.5},${WORLD_HEIGHT*0.7} Q ${WORLD_WIDTH*0.75},${WORLD_HEIGHT*0.65} ${WORLD_WIDTH-30},${WORLD_HEIGHT*0.6}`"/>
        </g>

        <!-- ── 边角文字装饰 ── -->
        <text x="22" y="12" font-size="5.5" fill="#C8B898" opacity="0.5" font-family="serif" letter-spacing="1">众生迁徙</text>
        <text :x="WORLD_WIDTH - 22" :y="WORLD_HEIGHT - 8" text-anchor="end" font-size="5" fill="#C8B898" opacity="0.4" font-family="serif">MIGRATION MAP</text>
      </g>

      <!--
        迁徙底图（始终渲染）。
        v8：当 humanLayerVisible 时，仅给 .migration-world 加 .dimmed class
        (CSS: opacity: 0.38 + pointer-events: none)
        不使用 SVG filter / feGaussianBlur
      -->
      <g
        class="migration-world"
        :class="{ dimmed: humanLayerVisible }"
      >
        <RiskZone :nodes="nodes" :species-id="draggingSpeciesId || undefined" />
        <RouteLine />
        <g>
          <MapNode v-for="n in nodes" :key="n.id" :node="n" />
        </g>
        <g>
          <SpeciesMarker v-for="task in waitingTasks" :key="task.id" :task="task" />
        </g>
        <!-- migration 模式阻挡圈（始终渲染；只画唯一 blocker） -->
        <HumanHeatLayer
          v-if="gameStore.state.humanActive"
          mode="migration"
          :species-id="draggingSpeciesId || undefined"
        />
      </g>

      <!-- 人类活动层打开时的轻量压暗蒙层 -->
      <rect
        v-if="humanLayerVisible"
        class="human-backdrop-tint"
        x="0"
        y="0"
        :width="WORLD_WIDTH"
        :height="WORLD_HEIGHT"
      />

      <!-- 人类活动层（独立显示）：单 blocker 直接绘制，无 SVG blur -->
      <HumanHeatLayer
        v-if="gameStore.state.humanActive && humanLayerVisible"
        mode="human"
      />

      <!-- 人类图层激活时的 pointer catcher -->
      <rect
        v-if="humanLayerVisible"
        class="human-input-catcher"
        x="0"
        y="0"
        :width="WORLD_WIDTH"
        :height="WORLD_HEIGHT"
        fill="transparent"
        @pointerdown.prevent.stop="onHumanPointerDown"
        @pointermove.prevent.stop="onHumanPointerMove"
        @pointerup.prevent.stop="onHumanPointerUp"
        @pointercancel.prevent.stop="onHumanPointerCancel"
        @pointerleave.prevent.stop="onHumanPointerLeave"
      />
    </svg>

    <div ref="cancelZoneRef" class="cancel-zone" :class="{ active: gameStore.state.dragState.active, over: gameStore.state.dragState.overCancel }">
      <div class="cz-title">取消连线</div>
      <div class="cz-sub">{{ gameStore.state.dragState.overCancel ? '松手取消本次路线' : 'Release to Cancel' }}</div>
    </div>
  </div>
</template>

<style scoped>
.human-input-catcher {
  cursor: none;
  pointer-events: all;
}
.migration-world {
  transition: opacity 0.25s ease;
}
.human-backdrop-tint {
  fill: rgba(200, 176, 96, 0.12);
  pointer-events: none;
}
/* 手绘地图装饰层 */
.map-decoration {
  pointer-events: none;
  user-select: none;
}
</style>
