<!--
  NodeBadge.vue
  =============================================================
  统一的节点视觉标识组件（SVG）。
  地图节点和右侧详情面板节点必须共用此组件，不允许各画一套。

  Props：
    - node?        : RuntimeMapNode  若传入则优先按其 equivalenceKey 渲染
    - visualKey?   : string          若没传 node，按该 key 渲染（适用于"规则 badge"等场景）
    - visual?      : NodeVisual      直接传 visual 对象
    - size?        : number          整体尺寸（正方形 viewBox），默认 32
    - muted?       : boolean         是否置灰（disabled 状态）
    - filled?      : boolean         是否填充内部（默认只描边）
    - bare?        : boolean         仅画 logo 不画外轮廓
    - title?       : string          鼠标悬停文字
    - health?      : number | null   生态健康值（0~100）。null = 不启用血条
    - healthPercent? : number | null 兼容字段，优先于 health
    - flicker?     : boolean         退化 / 正在被人类扣血时的闪烁
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeMapNode } from '../data/gameData'
import type { NodeTag } from '../data/gameConfig'
import {
  getNodeVisual,
  getNodeVisualByKey,
  type NodeVisual,
  type NodeShape,
  type NodeLogoKind
} from '../data/nodeVisuals'

interface Props {
  node?: RuntimeMapNode | null
  visualKey?: string | null
  visual?: NodeVisual | null
  size?: number
  muted?: boolean
  filled?: boolean
  bare?: boolean
  title?: string
  /**
   * 生态健康值（0~100）。
   * - 传 null/undefined：不启用血条 UI（保持原版彩色 badge）
   * - 传 0~100：logo 本身作为纵向血条
   *   底层显示灰黑版（完整），顶层显示原色版，被 CSS clip-path 从上往下裁掉
   *   emptyPct = 100 - healthPct 部分
   */
  health?: number | null
  /** 兼容字段：直接传百分比（0~100） */
  healthPercent?: number | null
  /** 退化时的轻微闪烁（health <= 15 或正在受人类扣血） */
  flicker?: boolean
  /**
   * 属性标签：用于在节点右上角显示统一角标。
   * - 显式传入：直接用传入的 tag 列表判定是否显示"高山角标"
   * - 不传：自动回退到 node.tags
   * - 设为 []：不显示角标
   *
   * 默认值为 null 而不是空数组，使"未显式传入"和"显式传空数组"行为可区分。
   */
  attributeTags?: readonly NodeTag[] | null
}

const props = withDefaults(defineProps<Props>(), {
  node: null,
  visualKey: null,
  visual: null,
  size: 32,
  muted: false,
  filled: false,
  bare: false,
  title: '',
  health: null,
  healthPercent: null,
  flicker: false,
  attributeTags: null
})

/** 解析出最终使用的视觉定义 */
const resolvedVisual = computed<NodeVisual>(() => {
  if (props.visual) return props.visual
  if (props.node) return getNodeVisual(props.node)
  if (props.visualKey) return getNodeVisualByKey(props.visualKey)
  return getNodeVisualByKey('unknown')
})

/** 解析最终使用的健康值百分比（0~100） */
const healthPct = computed<number>(() => {
  if (props.healthPercent !== null && props.healthPercent !== undefined) {
    if (Number.isFinite(props.healthPercent)) {
      return Math.max(0, Math.min(100, props.healthPercent))
    }
  }
  if (props.health !== null && props.health !== undefined) {
    if (Number.isFinite(props.health)) {
      return Math.max(0, Math.min(100, props.health))
    }
  }
  if (props.node && typeof props.node.health === 'number' && Number.isFinite(props.node.health)) {
    const max = (typeof props.node.maxHealth === 'number' && props.node.maxHealth > 0)
      ? props.node.maxHealth
      : 100
    return Math.max(0, Math.min(100, (props.node.health / max) * 100))
  }
  return 100
})

/** 空血比例：用于 CSS clip-path inset 的 top 值 */
const emptyPct = computed<number>(() => 100 - healthPct.value)

/** 是否启用血条 UI（任一健康数据存在） */
const ecoActive = computed(() => {
  if (props.healthPercent !== null && props.healthPercent !== undefined) return true
  if (props.health !== null && props.health !== undefined) return true
  if (props.node && typeof props.node.health === 'number') return true
  return false
})

/** 颜色：原色版（满血时使用的颜色） */
const primaryColor = computed(() => (props.muted ? '#A89480' : resolvedVisual.value.primary))
const secondaryColor = computed(() => (props.muted ? '#E8DCC8' : resolvedVisual.value.secondary))
// 手账风格底色：温暖米白，与白色手账背景自然融合
const fillBg = computed(() => (props.muted ? '#EDE4D4' : '#FDF6E3'))
const opacityVal = computed(() => (props.muted ? 0.6 : 1))

/** 颜色：空血版（低健康时偏暗红砖，手账风格保持暖色系）
 *  手账空血：低血偏棕红，muted用浅沙棕 */
const ecoDarkPrimary = computed(() => (healthPct.value <= 15 ? '#B05040' : '#A89480'))
const ecoDarkSecondary = computed(() => (healthPct.value <= 15 ? '#D4C0A8' : '#E8DCC8'))
const ecoDarkFill = computed(() => (healthPct.value <= 15 ? '#F2E4D8' : '#EDE4D4'))
const ecoGrayPrimary = computed(() => ecoDarkPrimary.value)
const ecoGraySecondary = computed(() => ecoDarkSecondary.value)
const ecoGrayFill = computed(() => ecoDarkFill.value)

const viewBoxStr = computed(() => `-50 -50 100 100`)
const svgW = computed(() => props.size)
const svgH = computed(() => props.size)

/** 节点 logo title：附加"生态健康 xx%"信息 */
const badgeTitle = computed(() => {
  const base = props.title || resolvedVisual.value.description
  if (!ecoActive.value) return base
  return `${base}｜生态健康 ${healthPct.value.toFixed(0)}%`
})

// 形状绘制
const shapePoints = computed<string>(() => {
  const s: NodeShape = resolvedVisual.value.shape
  const r = 38
  switch (s) {
    case 'triangle':
      return `0,${-r} ${(r * 0.866).toFixed(2)},${(r * 0.5).toFixed(2)} ${(-r * 0.866).toFixed(2)},${(r * 0.5).toFixed(2)}`
    case 'diamond':
      return `0,${-r} ${r},0 0,${r} ${-r},0`
    case 'square':
      return `${-r},${-r} ${r},${-r} ${r},${r} ${-r},${r}`
    case 'hexagon': {
      const pts: string[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`)
      }
      return pts.join(' ')
    }
    case 'pentagon': {
      const pts: string[] = []
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i - Math.PI / 2
        pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`)
      }
      return pts.join(' ')
    }
    case 'octagon': {
      const pts: string[] = []
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 8
        pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`)
      }
      return pts.join(' ')
    }
    case 'rounded-square':
    case 'circle':
    default:
      return ''
  }
})

const isCircle = computed(() => resolvedVisual.value.shape === 'circle')
const isRoundedSquare = computed(() => resolvedVisual.value.shape === 'rounded-square')
const logoKind = computed<NodeLogoKind>(() => resolvedVisual.value.logo)

/** 顶层彩色 logo 的裁剪样式：clip-path: inset(top right bottom left)
 *  inset 的 top 越大表示从上方裁掉越多；保留的下方区域 = 100 - top
 *  healthPct=100 → emptyPct=0 → 保留 100% 彩色
 *  healthPct=0   → emptyPct=100 → 保留 0% 彩色（整层被裁掉） */
const fillLayerStyle = computed<Record<string, string>>(() => ({
  'clip-path': `inset(${emptyPct.value}% 0 0 0)`,
  '-webkit-clip-path': `inset(${emptyPct.value}% 0 0 0)`
}))

/**
 * 有效属性标签：
 * - 显式传入 attributeTags：用传入值
 * - 未传入：回退到 node?.tags
 * - 都没有：空数组（不显示角标）
 */
const effectiveAttributeTags = computed<readonly NodeTag[]>(() => {
  return props.attributeTags ?? props.node?.tags ?? []
})

/** 是否显示"高山角标" */
const hasMountainAttribute = computed<boolean>(() => {
  return effectiveAttributeTags.value.includes('mountain')
})

/** 高山角标中心：右上角 (-50, -50, 100, 100) 坐标系内 */
const mountainCornerCx = 29
const mountainCornerCy = -29
const mountainCornerR = 11

/** 高山角标颜色：muted 时同步变灰，手账风格用暖棕 */
const mountainBadgeFill = computed(() => (props.muted ? '#E8DCC8' : '#E0D4B8'))
const mountainBadgeStroke = computed(() => (props.muted ? '#A89480' : '#8C7A66'))
const mountainBadgePeak = computed(() => (props.muted ? '#A89480' : '#5C4F3A'))
</script>

<template>
  <svg
    :width="svgW"
    :height="svgH"
    :viewBox="viewBoxStr"
    :opacity="opacityVal"
    :title="badgeTitle"
    class="node-badge"
    :class="{
      'eco-active': ecoActive,
      'eco-flicker': ecoActive && flicker,
      'eco-degraded': ecoActive && healthPct <= 15,
      muted
    }"
    shape-rendering="geometricPrecision"
  >
    <!--
      生态健康激活：双层 logo 叠加
      - 底层 node-badge-layer-empty：完整空血版（暗灰 / 极低时暗红）
      - 顶层 node-badge-layer-fill：完整原色版，被 CSS clip-path 从上往下裁掉空血部分
      - 顶层过渡：clip-path 0.28s linear 平滑变化
    -->
    <template v-if="ecoActive">
      <g class="node-badge-stack">
        <!-- 底层：空血层（始终完整显示） -->
        <g class="node-badge-layer node-badge-layer-empty">
          <!-- 外轮廓 -->
          <g
            v-if="!bare"
            class="node-badge-shape"
            :fill="props.filled ? ecoGrayPrimary : ecoGrayFill"
            :stroke="ecoGrayPrimary"
            stroke-width="3"
            stroke-linejoin="round"
          >
            <circle v-if="isCircle" cx="0" cy="0" r="38" />
            <rect v-else-if="isRoundedSquare" x="-32" y="-32" width="64" height="64" rx="10" ry="10" />
            <polygon v-else :points="shapePoints" />
          </g>
          <!-- 内部 logo（灰黑） -->
          <g class="node-badge-logo">
            <g v-if="logoKind === 'bird-egg'">
              <ellipse cx="0" cy="2" rx="11" ry="14" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
              <circle cx="-3" cy="-3" r="1.6" :fill="ecoGrayPrimary" stroke="none" />
              <circle cx="4" cy="0" r="1.4" :fill="ecoGrayPrimary" stroke="none" />
              <circle cx="-1" cy="5" r="1.2" :fill="ecoGrayPrimary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'wave' || logoKind === 'wetland'">
              <path d="M -18 4 Q -12 -6, -6 4 T 6 4 T 18 4" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -18 -6 Q -12 -16, -6 -6 T 6 -6 T 18 -6" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'sun'">
              <circle cx="0" cy="0" r="9" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
              <g :stroke="ecoGrayPrimary" stroke-width="2.2" stroke-linecap="round">
                <line x1="0" y1="-18" x2="0" y2="-13" />
                <line x1="0" y1="18" x2="0" y2="13" />
                <line x1="-18" y1="0" x2="-13" y2="0" />
                <line x1="18" y1="0" x2="13" y2="0" />
                <line x1="-13" y1="-13" x2="-9" y2="-9" />
                <line x1="13" y1="-13" x2="9" y2="-9" />
                <line x1="-13" y1="13" x2="-9" y2="9" />
                <line x1="13" y1="13" x2="9" y2="9" />
              </g>
            </g>
            <g v-else-if="logoKind === 'flower'">
              <circle cx="0" cy="-10" r="5" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <circle cx="9.5" cy="-3" r="5" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <circle cx="6" cy="8" r="5" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <circle cx="-6" cy="8" r="5" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <circle cx="-9.5" cy="-3" r="5" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <circle cx="0" cy="0" r="3" :fill="ecoGrayPrimary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'tree'">
              <path d="M 0 -16 L -11 0 L -5 0 L -12 8 L 12 8 L 5 0 L 11 0 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <rect x="-2.5" y="8" width="5" height="6" :fill="ecoGrayPrimary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'fish'">
              <path d="M -16 0 Q -8 -10, 6 -8 Q 14 -6, 16 0 Q 14 6, 6 8 Q -8 10, -16 0 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <path d="M 16 0 L 22 -6 L 22 6 Z" :fill="ecoGrayPrimary" stroke="none" />
              <circle cx="-8" cy="-2" r="1.6" :fill="ecoGrayPrimary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'branch'">
              <path d="M 0 14 L 0 -4" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.6" stroke-linecap="round" />
              <path d="M 0 -4 L -10 -14 M 0 -4 L 10 -14" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.6" stroke-linecap="round" />
              <path d="M -3 6 L -12 10 M 3 6 L 12 10" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.6" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'arrow-up'">
              <path d="M -8 8 L -8 -2 L -14 -2 L 0 -16 L 14 -2 L 8 -2 L 8 8 Z" :fill="ecoGrayPrimary" stroke="none" />
              <line x1="0" y1="-12" x2="0" y2="14" :stroke="ecoGraySecondary" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'stream'">
              <path d="M -16 10 Q -8 0, 0 4 T 16 -8" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 0 Q -8 -10, 0 -6 T 16 -18" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
              <circle cx="12" cy="-15" r="2" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="1.4" />
            </g>
            <g v-else-if="logoKind === 'grass'">
              <path d="M -14 12 L -14 4 M -10 12 L -10 0 M -6 12 L -6 6 M -2 12 L -2 -2
                       M 2 12 L 2 4 M 6 12 L 6 -2 M 10 12 L 10 2 M 14 12 L 14 6"
                    :stroke="ecoGrayPrimary" stroke-width="2" stroke-linecap="round" fill="none" />
              <line x1="-16" y1="14" x2="16" y2="14" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linecap="round" />
            </g>
            <g v-else-if="logoKind === 'bridge'">
              <path d="M -16 6 Q 0 -8, 16 6" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" />
              <line x1="-16" y1="10" x2="16" y2="10" :stroke="ecoGrayPrimary" stroke-width="2.4" />
              <line x1="-8" y1="3" x2="-8" y2="10" :stroke="ecoGrayPrimary" stroke-width="2" />
              <line x1="0" y1="-1" x2="0" y2="10" :stroke="ecoGrayPrimary" stroke-width="2" />
              <line x1="8" y1="3" x2="8" y2="10" :stroke="ecoGrayPrimary" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'crystal'">
              <path d="M 0 -16 L 12 -6 L 8 12 L -8 12 L -12 -6 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <line x1="0" y1="-16" x2="0" y2="12" :stroke="ecoGrayPrimary" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'rock'">
              <path d="M -14 8 L -8 -2 L -2 -8 L 6 -4 L 14 4 L 12 12 L -10 12 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 -2 L 6 -4" fill="none" :stroke="ecoGrayPrimary" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'cave'">
              <path d="M -16 12 L -16 -2 Q -16 -16, 0 -16 Q 16 -16, 16 -2 L 16 12 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <path d="M -6 12 Q -6 0, 0 0 Q 6 0, 6 12" :fill="ecoGrayPrimary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'forest-patch'">
              <circle cx="-9" cy="-2" r="7" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
              <circle cx="9" cy="2" r="7" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
              <circle cx="0" cy="9" r="6" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'compass'">
              <circle cx="0" cy="0" r="14" :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" />
              <path d="M 0 -10 L 3 0 L 0 10 L -3 0 Z" :fill="ecoGrayPrimary" stroke="none" />
              <circle cx="0" cy="0" r="2" :fill="ecoGraySecondary" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'mountain'">
              <path d="M -16 10 L -6 -6 L 0 0 L 8 -10 L 16 10 Z"
                    :fill="ecoGraySecondary" :stroke="ecoGrayPrimary" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 0 L -6 -6 L -3 -2" fill="none" :stroke="ecoGrayPrimary" stroke-width="1.5" />
              <path d="M 5 -6 L 8 -10 L 11 -6" fill="none" :stroke="ecoGrayPrimary" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'sea'">
              <path d="M -16 2 Q -10 -4, -4 2 T 8 2 T 18 2" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 -6 Q -10 -12, -4 -6 T 8 -6 T 18 -6" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
              <path d="M -16 10 Q -10 4, -4 10 T 8 10 T 18 10" fill="none" :stroke="ecoGrayPrimary" stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
            </g>
            <g v-else-if="logoKind === 'any'">
              <circle cx="0" cy="0" r="16" fill="none" :stroke="ecoGrayPrimary" stroke-width="2" stroke-dasharray="3 2.5" />
              <circle cx="0" cy="0" r="5" :fill="ecoGrayPrimary" stroke="none" />
              <line x1="0" y1="-13" x2="0" y2="-7" :stroke="ecoGrayPrimary" stroke-width="1.5" stroke-linecap="round" />
              <line x1="0" y1="7" x2="0" y2="13" :stroke="ecoGrayPrimary" stroke-width="1.5" stroke-linecap="round" />
              <line x1="-13" y1="0" x2="-7" y2="0" :stroke="ecoGrayPrimary" stroke-width="1.5" stroke-linecap="round" />
              <line x1="7" y1="0" x2="13" y2="0" :stroke="ecoGrayPrimary" stroke-width="1.5" stroke-linecap="round" />
            </g>
            <g v-else>
              <circle cx="0" cy="0" r="10" :fill="ecoGrayPrimary" stroke="none" />
              <circle cx="0" cy="0" r="4" :fill="ecoGraySecondary" stroke="none" />
            </g>
          </g>
        </g>

        <!-- 顶层：有血层（被 clip-path 从上往下裁切 + 0.28s 过渡） -->
        <g
          class="node-badge-layer node-badge-layer-fill"
          :style="fillLayerStyle"
        >
          <!-- 外轮廓 -->
          <g
            v-if="!bare"
            class="node-badge-shape"
            :fill="props.filled ? primaryColor : fillBg"
            :stroke="primaryColor"
            stroke-width="3"
            stroke-linejoin="round"
          >
            <circle v-if="isCircle" cx="0" cy="0" r="38" />
            <rect v-else-if="isRoundedSquare" x="-32" y="-32" width="64" height="64" rx="10" ry="10" />
            <polygon v-else :points="shapePoints" />
          </g>
          <!-- 内部 logo（原色） -->
          <g class="node-badge-logo">
            <g v-if="logoKind === 'bird-egg'">
              <ellipse cx="0" cy="2" rx="11" ry="14" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="-3" cy="-3" r="1.6" :fill="primaryColor" stroke="none" />
              <circle cx="4" cy="0" r="1.4" :fill="primaryColor" stroke="none" />
              <circle cx="-1" cy="5" r="1.2" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'wave' || logoKind === 'wetland'">
              <path d="M -18 4 Q -12 -6, -6 4 T 6 4 T 18 4" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -18 -6 Q -12 -16, -6 -6 T 6 -6 T 18 -6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'sun'">
              <circle cx="0" cy="0" r="9" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <g :stroke="primaryColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="0" y1="-18" x2="0" y2="-13" />
                <line x1="0" y1="18" x2="0" y2="13" />
                <line x1="-18" y1="0" x2="-13" y2="0" />
                <line x1="18" y1="0" x2="13" y2="0" />
                <line x1="-13" y1="-13" x2="-9" y2="-9" />
                <line x1="13" y1="-13" x2="9" y2="-9" />
                <line x1="-13" y1="13" x2="-9" y2="9" />
                <line x1="13" y1="13" x2="9" y2="9" />
              </g>
            </g>
            <g v-else-if="logoKind === 'flower'">
              <circle cx="0" cy="-10" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="9.5" cy="-3" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="6" cy="8" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="-6" cy="8" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="-9.5" cy="-3" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="0" cy="0" r="3" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'tree'">
              <path d="M 0 -16 L -11 0 L -5 0 L -12 8 L 12 8 L 5 0 L 11 0 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <rect x="-2.5" y="8" width="5" height="6" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'fish'">
              <path d="M -16 0 Q -8 -10, 6 -8 Q 14 -6, 16 0 Q 14 6, 6 8 Q -8 10, -16 0 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M 16 0 L 22 -6 L 22 6 Z" :fill="primaryColor" stroke="none" />
              <circle cx="-8" cy="-2" r="1.6" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'branch'">
              <path d="M 0 14 L 0 -4" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" />
              <path d="M 0 -4 L -10 -14 M 0 -4 L 10 -14" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" />
              <path d="M -3 6 L -12 10 M 3 6 L 12 10" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'arrow-up'">
              <path d="M -8 8 L -8 -2 L -14 -2 L 0 -16 L 14 -2 L 8 -2 L 8 8 Z" :fill="primaryColor" stroke="none" />
              <line x1="0" y1="-12" x2="0" y2="14" :stroke="secondaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'stream'">
              <path d="M -16 10 Q -8 0, 0 4 T 16 -8" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 0 Q -8 -10, 0 -6 T 16 -18" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
              <circle cx="12" cy="-15" r="2" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.4" />
            </g>
            <g v-else-if="logoKind === 'grass'">
              <path d="M -14 12 L -14 4 M -10 12 L -10 0 M -6 12 L -6 6 M -2 12 L -2 -2
                       M 2 12 L 2 4 M 6 12 L 6 -2 M 10 12 L 10 2 M 14 12 L 14 6"
                    :stroke="primaryColor" stroke-width="2" stroke-linecap="round" fill="none" />
              <line x1="-16" y1="14" x2="16" y2="14" :stroke="primaryColor" stroke-width="2" stroke-linecap="round" />
            </g>
            <g v-else-if="logoKind === 'bridge'">
              <path d="M -16 6 Q 0 -8, 16 6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <line x1="-16" y1="10" x2="16" y2="10" :stroke="primaryColor" stroke-width="2.4" />
              <line x1="-8" y1="3" x2="-8" y2="10" :stroke="primaryColor" stroke-width="2" />
              <line x1="0" y1="-1" x2="0" y2="10" :stroke="primaryColor" stroke-width="2" />
              <line x1="8" y1="3" x2="8" y2="10" :stroke="primaryColor" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'crystal'">
              <path d="M 0 -16 L 12 -6 L 8 12 L -8 12 L -12 -6 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <line x1="0" y1="-16" x2="0" y2="12" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'rock'">
              <path d="M -14 8 L -8 -2 L -2 -8 L 6 -4 L 14 4 L 12 12 L -10 12 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 -2 L 6 -4" fill="none" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'cave'">
              <path d="M -16 12 L -16 -2 Q -16 -16, 0 -16 Q 16 -16, 16 -2 L 16 12 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -6 12 Q -6 0, 0 0 Q 6 0, 6 12" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'forest-patch'">
              <circle cx="-9" cy="-2" r="7" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="9" cy="2" r="7" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="0" cy="9" r="6" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'compass'">
              <circle cx="0" cy="0" r="14" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <path d="M 0 -10 L 3 0 L 0 10 L -3 0 Z" :fill="primaryColor" stroke="none" />
              <circle cx="0" cy="0" r="2" :fill="secondaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'mountain'">
              <path d="M -16 10 L -6 -6 L 0 0 L 8 -10 L 16 10 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 0 L -6 -6 L -3 -2" fill="none" :stroke="primaryColor" stroke-width="1.5" />
              <path d="M 5 -6 L 8 -10 L 11 -6" fill="none" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'sea'">
              <path d="M -16 2 Q -10 -4, -4 2 T 8 2 T 18 2" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 -6 Q -10 -12, -4 -6 T 8 -6 T 18 -6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
              <path d="M -16 10 Q -10 4, -4 10 T 8 10 T 18 10" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
            </g>
            <g v-else-if="logoKind === 'any'">
              <circle cx="0" cy="0" r="16" fill="none" :stroke="primaryColor" stroke-width="2" stroke-dasharray="3 2.5" />
              <circle cx="0" cy="0" r="5" :fill="primaryColor" stroke="none" />
              <line x1="0" y1="-13" x2="0" y2="-7" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="0" y1="7" x2="0" y2="13" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="-13" y1="0" x2="-7" y2="0" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="7" y1="0" x2="13" y2="0" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
            </g>
            <g v-else>
              <circle cx="0" cy="0" r="10" :fill="primaryColor" stroke="none" />
              <circle cx="0" cy="0" r="4" :fill="secondaryColor" stroke="none" />
            </g>
          </g>
        </g>
      </g>
    </template>

    <!-- 生态健康未激活：保持原版单层彩色 badge -->
    <template v-else>
      <g class="node-badge-stack">
        <g class="node-badge-layer">
          <!-- 外轮廓 -->
          <g
            v-if="!bare"
            class="node-badge-shape"
            :fill="props.filled ? primaryColor : fillBg"
            :stroke="primaryColor"
            stroke-width="3"
            stroke-linejoin="round"
          >
            <circle v-if="isCircle" cx="0" cy="0" r="38" />
            <rect v-else-if="isRoundedSquare" x="-32" y="-32" width="64" height="64" rx="10" ry="10" />
            <polygon v-else :points="shapePoints" />
          </g>
          <!-- 内部 logo -->
          <g class="node-badge-logo">
            <g v-if="logoKind === 'bird-egg'">
              <ellipse cx="0" cy="2" rx="11" ry="14" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="-3" cy="-3" r="1.6" :fill="primaryColor" stroke="none" />
              <circle cx="4" cy="0" r="1.4" :fill="primaryColor" stroke="none" />
              <circle cx="-1" cy="5" r="1.2" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'wave' || logoKind === 'wetland'">
              <path d="M -18 4 Q -12 -6, -6 4 T 6 4 T 18 4" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -18 -6 Q -12 -16, -6 -6 T 6 -6 T 18 -6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'sun'">
              <circle cx="0" cy="0" r="9" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <g :stroke="primaryColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="0" y1="-18" x2="0" y2="-13" />
                <line x1="0" y1="18" x2="0" y2="13" />
                <line x1="-18" y1="0" x2="-13" y2="0" />
                <line x1="18" y1="0" x2="13" y2="0" />
                <line x1="-13" y1="-13" x2="-9" y2="-9" />
                <line x1="13" y1="-13" x2="9" y2="-9" />
                <line x1="-13" y1="13" x2="-9" y2="9" />
                <line x1="13" y1="13" x2="9" y2="9" />
              </g>
            </g>
            <g v-else-if="logoKind === 'flower'">
              <circle cx="0" cy="-10" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="9.5" cy="-3" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="6" cy="8" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="-6" cy="8" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="-9.5" cy="-3" r="5" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.5" />
              <circle cx="0" cy="0" r="3" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'tree'">
              <path d="M 0 -16 L -11 0 L -5 0 L -12 8 L 12 8 L 5 0 L 11 0 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <rect x="-2.5" y="8" width="5" height="6" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'fish'">
              <path d="M -16 0 Q -8 -10, 6 -8 Q 14 -6, 16 0 Q 14 6, 6 8 Q -8 10, -16 0 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M 16 0 L 22 -6 L 22 6 Z" :fill="primaryColor" stroke="none" />
              <circle cx="-8" cy="-2" r="1.6" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'branch'">
              <path d="M 0 14 L 0 -4" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" />
              <path d="M 0 -4 L -10 -14 M 0 -4 L 10 -14" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" />
              <path d="M -3 6 L -12 10 M 3 6 L 12 10" fill="none" :stroke="primaryColor" stroke-width="2.6" stroke-linecap="round" opacity="0.7" />
            </g>
            <g v-else-if="logoKind === 'arrow-up'">
              <path d="M -8 8 L -8 -2 L -14 -2 L 0 -16 L 14 -2 L 8 -2 L 8 8 Z" :fill="primaryColor" stroke="none" />
              <line x1="0" y1="-12" x2="0" y2="14" :stroke="secondaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'stream'">
              <path d="M -16 10 Q -8 0, 0 4 T 16 -8" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 0 Q -8 -10, 0 -6 T 16 -18" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.6" />
              <circle cx="12" cy="-15" r="2" :fill="secondaryColor" :stroke="primaryColor" stroke-width="1.4" />
            </g>
            <g v-else-if="logoKind === 'grass'">
              <path d="M -14 12 L -14 4 M -10 12 L -10 0 M -6 12 L -6 6 M -2 12 L -2 -2
                       M 2 12 L 2 4 M 6 12 L 6 -2 M 10 12 L 10 2 M 14 12 L 14 6"
                    :stroke="primaryColor" stroke-width="2" stroke-linecap="round" fill="none" />
              <line x1="-16" y1="14" x2="16" y2="14" :stroke="primaryColor" stroke-width="2" stroke-linecap="round" />
            </g>
            <g v-else-if="logoKind === 'bridge'">
              <path d="M -16 6 Q 0 -8, 16 6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <line x1="-16" y1="10" x2="16" y2="10" :stroke="primaryColor" stroke-width="2.4" />
              <line x1="-8" y1="3" x2="-8" y2="10" :stroke="primaryColor" stroke-width="2" />
              <line x1="0" y1="-1" x2="0" y2="10" :stroke="primaryColor" stroke-width="2" />
              <line x1="8" y1="3" x2="8" y2="10" :stroke="primaryColor" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'crystal'">
              <path d="M 0 -16 L 12 -6 L 8 12 L -8 12 L -12 -6 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <line x1="0" y1="-16" x2="0" y2="12" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'rock'">
              <path d="M -14 8 L -8 -2 L -2 -8 L 6 -4 L 14 4 L 12 12 L -10 12 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 -2 L 6 -4" fill="none" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'cave'">
              <path d="M -16 12 L -16 -2 Q -16 -16, 0 -16 Q 16 -16, 16 -2 L 16 12 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -6 12 Q -6 0, 0 0 Q 6 0, 6 12" :fill="primaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'forest-patch'">
              <circle cx="-9" cy="-2" r="7" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="9" cy="2" r="7" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <circle cx="0" cy="9" r="6" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
            </g>
            <g v-else-if="logoKind === 'compass'">
              <circle cx="0" cy="0" r="14" :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" />
              <path d="M 0 -10 L 3 0 L 0 10 L -3 0 Z" :fill="primaryColor" stroke="none" />
              <circle cx="0" cy="0" r="2" :fill="secondaryColor" stroke="none" />
            </g>
            <g v-else-if="logoKind === 'mountain'">
              <path d="M -16 10 L -6 -6 L 0 0 L 8 -10 L 16 10 Z"
                    :fill="secondaryColor" :stroke="primaryColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M -8 0 L -6 -6 L -3 -2" fill="none" :stroke="primaryColor" stroke-width="1.5" />
              <path d="M 5 -6 L 8 -10 L 11 -6" fill="none" :stroke="primaryColor" stroke-width="1.5" />
            </g>
            <g v-else-if="logoKind === 'sea'">
              <path d="M -16 2 Q -10 -4, -4 2 T 8 2 T 18 2" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" />
              <path d="M -16 -6 Q -10 -12, -4 -6 T 8 -6 T 18 -6" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.7" />
              <path d="M -16 10 Q -10 4, -4 10 T 8 10 T 18 10" fill="none" :stroke="primaryColor" stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
            </g>
            <g v-else-if="logoKind === 'any'">
              <circle cx="0" cy="0" r="16" fill="none" :stroke="primaryColor" stroke-width="2" stroke-dasharray="3 2.5" />
              <circle cx="0" cy="0" r="5" :fill="primaryColor" stroke="none" />
              <line x1="0" y1="-13" x2="0" y2="-7" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="0" y1="7" x2="0" y2="13" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="-13" y1="0" x2="-7" y2="0" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="7" y1="0" x2="13" y2="0" :stroke="primaryColor" stroke-width="1.5" stroke-linecap="round" />
            </g>
            <g v-else>
              <circle cx="0" cy="0" r="10" :fill="primaryColor" stroke="none" />
              <circle cx="0" cy="0" r="4" :fill="secondaryColor" stroke="none" />
            </g>
          </g>
        </g>
      </g>
    </template>

    <!--
      高山角标：节点右上角统一徽标
      - 任何节点只要 effectiveAttributeTags 包含 'mountain' 就显示
      - 与生态健康血条 / 节点本体视觉相互独立
      - pointer-events: none，不影响地图节点点击和拖线
      - 不使用 SVG filter / blur / SMIL animate
    -->
    <g
      v-if="hasMountainAttribute"
      class="node-badge-mountain-corner"
      pointer-events="none"
      aria-label="高山节点"
    >
      <!-- 小圆形底板 -->
      <circle
        :cx="mountainCornerCx"
        :cy="mountainCornerCy"
        :r="mountainCornerR"
        :fill="mountainBadgeFill"
        :stroke="mountainBadgeStroke"
        stroke-width="1.5"
      />
      <!-- 双峰山形 path（简洁） -->
      <path
        :d="`M ${mountainCornerCx - 5} ${mountainCornerCy + 3}
             L ${mountainCornerCx - 1.5} ${mountainCornerCy - 3}
             L ${mountainCornerCx + 1.5} ${mountainCornerCy}
             L ${mountainCornerCx + 5} ${mountainCornerCy + 3} Z`"
        :fill="mountainBadgePeak"
        stroke="none"
        stroke-linejoin="round"
      />
    </g>
  </svg>
</template>

<style scoped>
.node-badge {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  /* 手账风格：轻微投影，模拟贴纸效果 */
  filter: drop-shadow(0 1px 3px rgba(90, 70, 50, 0.15));
}

.node-badge-stack {
  display: block;
}

.node-badge-layer {
  display: block;
}

/*
 * 血条效果：双层 logo 叠加
 * 底层（empty）：手账空血色（浅棕米色）
 * 顶层（fill）：完整原色 logo，被 clip-path 裁掉空血部分
 */
.node-badge-layer-empty {
  opacity: 0.88;
}

.node-badge-layer-fill {
  opacity: 1;
  transition: clip-path 0.28s linear, -webkit-clip-path 0.28s linear;
  will-change: clip-path;
}

/* muted 状态 */
.node-badge.muted .node-badge-layer-empty {
  opacity: 0.65;
}
.node-badge.muted .node-badge-layer-fill {
  opacity: 0.65;
}

/* 退化闪烁 */
.node-badge.eco-flicker .node-badge-layer-fill {
  animation: eco-fill-flicker 0.55s ease-in-out infinite;
}
.node-badge.eco-flicker .node-badge-layer-empty {
  animation: eco-empty-flicker 0.55s ease-in-out infinite;
}
@keyframes eco-fill-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}
@keyframes eco-empty-flicker {
  0%, 100% { opacity: 0.88; }
  50% { opacity: 0.72; }
}

/* 极低血量时整体轻微呼吸 */
.node-badge.eco-degraded {
  animation: eco-degraded-breath 1.6s ease-in-out infinite;
}
@keyframes eco-degraded-breath {
  0%, 100% { filter: drop-shadow(0 1px 3px rgba(90, 70, 50, 0.15)); }
  50% { filter: drop-shadow(0 1px 5px rgba(180, 80, 60, 0.3)) brightness(0.95); }
}
</style>
