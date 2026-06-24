<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { gameStore } from '../store/gameStore'
import { SEASON_INFO } from '../data/eventDefinitions'
import { SPECIES_EXTINCTION_FAILURES, type SpeciesIcon } from '../data/gameConfig'
import {
  SPECIES_TEMPLATES,
  SPECIES_UNLOCK_STAGES,
  SpeciesDef
} from '../data/speciesTemplates'
import SpeciesIconComp from './SpeciesIcon.vue'
import { waypointLabelFor } from '../data/nodeVisuals'

const year = computed(() => gameStore.state.year)
// 严格分离的两份数据：
// - totalSuccess: 成功迁徙次数（整数计数，仅用于阶段解锁 / 难度推进）
// - score       : 迁徙得分（按 species.successScore 加权求和，浮点）
// 顶栏把两个字段并列展示，文字 / 单位都不同，避免玩家把"次数"和"得分"混淆
const totalSuccess = computed(() => gameStore.state.totalSuccess)
const score = computed(() => gameStore.state.score)
const usedSegments = computed(() => gameStore.state.usedSegments)
const maxSegments = computed(() => gameStore.state.maxSegments)
const nodeCount = computed(() => gameStore.state.mapNodes.length)
const stage = computed(() => gameStore.state.stage)
const maxConcurrent = computed(() => gameStore.state.maxConcurrent)
const season = computed(() => gameStore.state.season)
const gameStarted = computed(() => gameStore.state.gameStarted)

/** 物种多样性百分比（0~100，1 位小数） */
const biodiversityPercent = computed(() => {
  return gameStore.getBiodiversityPercent()
})

/** 物种多样性文字 */
const biodiversityText = computed(() => `${biodiversityPercent.value.toFixed(1)}%`)

/** 多样性颜色：>= 66% 正常；< 66% 黄；< 33.4% 红 */
const biodiversityClass = computed(() => {
  const v = biodiversityPercent.value
  if (v < 33.4) return 'biodiv-red'
  if (v < 66) return 'biodiv-yellow'
  return 'biodiv-normal'
})

/**
 * 物种 logo 列表：固定渲染 4 个已知物种（候鸟 / 蝴蝶 / 鲑鱼 / 草原兽群）
 * - 未解锁：灰色 + 低透明 + grayscale
 * - 已解锁存活：正常亮色
 * - 已灭绝：暗红色
 */
interface SpeciesLogoView {
  id: string
  name: string
  icon: SpeciesIcon
  color: string
  state: 'locked' | 'alive' | 'extinct'
  failures: number
}

const speciesLogos = computed<SpeciesLogoView[]>(() => {
  return SPECIES_TEMPLATES.map((sp: SpeciesDef) => {
    const unlocked = gameStore.state.unlockedSpeciesIds.includes(sp.id)
    const extinct = gameStore.state.extinctSpeciesIds.includes(sp.id)
    const fc = gameStore.getSpeciesFailureCount(sp.id)
    const isAlive = unlocked && !extinct
    let state: SpeciesLogoView['state'] = 'locked'
    if (isAlive) state = 'alive'
    else if (extinct) state = 'extinct'
    return {
      id: sp.id,
      name: sp.name,
      icon: sp.icon,
      color: sp.color,
      state,
      failures: fc
    }
  })
})

/**
 * v13：物种 logo 改成"小按钮"
 * - 单击展开聊天气泡（在 logo 下方），外部点击 / 再次点击同一 logo 时收回
 * - 不依赖 hover 延时
 * - 聊天气泡内容：物种名 / 状态 / 失败计数 / 解锁阶段 / 必经点 / 风险描述 / 生态启示
 */
const openSpeciesId = ref<string | null>(null)

function toggleSpeciesBubble(id: string): void {
  openSpeciesId.value = openSpeciesId.value === id ? null : id
}

function closeSpeciesBubble(): void {
  openSpeciesId.value = null
}

/**
 * 外部点击关闭气泡
 * - 使用 capture 模式以在 SVG / 子组件处理事件前生效
 * - 通过 data-bubble-anchor / data-bubble-card 标记气泡区域
 */
function onDocumentPointerDown(e: PointerEvent): void {
  if (openSpeciesId.value === null) return
  const target = e.target as HTMLElement | null
  if (!target) return
  if (target.closest('[data-bubble-anchor]')) return
  if (target.closest('[data-bubble-card]')) return
  closeSpeciesBubble()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

/** 当前打开气泡的物种详情 */
interface SpeciesBubbleData {
  id: string
  name: string
  englishName: string
  color: string
  icon: SpeciesIcon
  state: 'locked' | 'alive' | 'extinct'
  stateLabel: string
  failures: number
  /** 该物种已成功迁徙次数 */
  successes: number
  /** 单次成功迁徙得分 */
  successScore: number
  /** 该物种累计贡献的迁徙得分 = successes × successScore */
  successContribution: number
  unlockStage: number
  waypointText: string
  randomRequirementText: string
  speedText: string
  riskText: string
  ecoInsight: string
}

const openBubble = computed<SpeciesBubbleData | null>(() => {
  if (openSpeciesId.value === null) return null
  const sp = SPECIES_TEMPLATES.find((s) => s.id === openSpeciesId.value)
  if (!sp) return null
  const unlocked = gameStore.state.unlockedSpeciesIds.includes(sp.id)
  const extinct = gameStore.state.extinctSpeciesIds.includes(sp.id)
  const fc = gameStore.getSpeciesFailureCount(sp.id)
  const sc = gameStore.getSpeciesSuccessCount(sp.id)
  let state: SpeciesBubbleData['state'] = 'locked'
  if (unlocked && !extinct) state = 'alive'
  else if (extinct) state = 'extinct'
  const stateLabel =
    state === 'alive'
      ? `存活（失败 ${fc} / ${SPECIES_EXTINCTION_FAILURES}）`
      : state === 'extinct'
      ? `已灭绝（失败 ${SPECIES_EXTINCTION_FAILURES} / ${SPECIES_EXTINCTION_FAILURES}）`
      : '未解锁'
  // 解锁阶段：单一事实源（speciesTemplates.ts 中的 SPECIES_UNLOCK_STAGES）
  const unlockStage = SPECIES_UNLOCK_STAGES[sp.id] ?? 1
  // 必经点描述：tag / node / any
  // 统一通过 waypointLabelFor 渲染，确保与 SpeciesPanel / 路线条 UI 文本一致。
  // 不再在调用方硬编码"（任一候选节点）"，文案全部来自单一事实源。
  const waypointText = sp.requiredWaypoints?.length
    ? sp.requiredWaypoints.map(waypointLabelFor).join(' → ')
    : '无'
  // v5：单次成功迁徙得分与该物种累计贡献得分
  const successScore = sp.successScore
  const successContribution = Math.round(sc * successScore * 100) / 100
  return {
    id: sp.id,
    name: state === 'locked' ? '未知' : sp.name,
    englishName: state === 'locked' ? 'Unknown' : sp.englishName,
    color: sp.color,
    icon: sp.icon,
    state,
    stateLabel,
    failures: fc,
    successes: sc,
    successScore,
    successContribution,
    unlockStage,
    waypointText,
    randomRequirementText: formatRandomRequirement(sp),
    speedText: formatSpeed(sp),
    riskText: sp.riskText,
    ecoInsight: sp.ecoInsight || ''
  }
})

/**
 * v11：把"坚持秒数"格式化为自然语言
 * - < 60s  : 坚持了 38 秒
 * - >= 60s : 坚持了 2 分 15 秒
 */
function formatSurvival(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  if (s < 60) return `坚持了 ${s} 秒`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `坚持了 ${m} 分 ${r.toString().padStart(2, '0')} 秒`
}
const survivalText = computed(() => formatSurvival(gameStore.state.survivalTime))

const seasonInfo = computed(() => SEASON_INFO[season.value])
const seasonClass = computed(() => `season-tag ${season.value}`)

const segmentsArr = computed(() => {
  const arr: boolean[] = []
  for (let i = 0; i < maxSegments.value; i++) {
    arr.push(i < usedSegments.value)
  }
  return arr
})

const stageHint = computed(() => {
  if (stage.value === 1) return '雁鸭候鸟'
  if (stage.value === 2) return '+ 帝王蝶 / 斑头雁'
  if (stage.value === 3) return '+ 鲑鱼'
  if (stage.value === 4) return '+ 角马兽群'
  if (stage.value === 5) return '+ 美洲鳗 / 绿海龟'
  if (stage.value >= 6) return '+ 林蛙'
  return '全部物种'
})

/**
 * 格式化"随机中转点"描述，用于气泡
 * - 没有 waypointPicker 或 maxCount <= 0：返回 "无"
 * - minCount == maxCount：显示固定值
 * - 否则显示区间
 *
 * waypointPicker 现在只包含 { minCount, maxCount }，不再有 tagPool / eligibleTags。
 * 候选节点由 allowedNodeTags / 风险 / 人类阻挡等规则自动筛选。
 */
function formatRandomRequirement(sp: SpeciesDef): string {
  const p = sp.waypointPicker
  if (!p || p.maxCount <= 0) return '无'
  const countText = p.minCount === p.maxCount ? `${p.minCount}` : `${p.minCount}-${p.maxCount}`
  return `${countText} 个随机中转点（任意可通行节点）`
}

/**
 * 格式化"移动速度"描述：分档说明物种迁徙速度分类
 * 与 speciesTemplates 中 migrationSpeed 字段保持一致：
 * - 0.4 ~ 0.5  极快：高强度飞行迁徙（斑头雁/雁鸭候鸟）
 * - 0.5 ~ 0.9  较快：昆虫或普通飞行迁徙（帝王蝶）
 * - 0.9 ~ 1.8  中等：水生洄游（鲑鱼/美洲鳗）
 * - 1.8 ~ 5.5  慢：海洋爬行动物迁徙（绿海龟）
 * - >= 5.5     极慢：陆地/两栖迁徙（角马兽群/林蛙）
 */
function formatSpeed(sp: SpeciesDef): string {
  const v = sp.migrationSpeed
  if (v <= 0.5) return '极快：高强度飞行迁徙'
  if (v <= 0.9) return '较快：昆虫或普通飞行迁徙'
  if (v <= 1.8) return '中等：水生洄游'
  if (v <= 5.5) return '慢：海洋爬行动物迁徙'
  return '极慢：陆地/两栖迁徙，容易被追击'
}
</script>

<template>
  <div class="topbar">
    <div class="title">众生迁徙 · Allive Migration</div>
    <div class="stats">
      <div class="stat"><span class="label">第</span><strong>{{ year }}</strong><span class="label">年</span></div>
      <div class="stat">
        <span class="label">阶段</span>
        <strong>{{ stage }}</strong>
        <span class="stage-species">{{ stageHint }}</span>
      </div>
      <div class="season-tag" :class="seasonClass">
        <span class="dot"></span>
        <span>{{ seasonInfo.name }}</span>
        <span class="season-desc">{{ seasonInfo.description }}</span>
      </div>
      <div class="stat"><span class="label">生态节点：</span><strong>{{ nodeCount }}</strong></div>
      <!--
        v5：严格分离"成功迁徙数量"与"迁徙得分"
        - 成功迁徙：只递增 1 次/次，衡量完成任务的次数
        - 迁徙得分：按 species.successScore 加权求和，衡量生态保护价值
        - 两者数值不再相等（如 1 次林蛙迁徙 = 1 次 / 3.8 分；2 次候鸟 = 2 次 / 2.0 分）
      -->
      <div
        class="stat"
        title="成功迁徙次数：完成迁徙任务的总数（仅用于阶段解锁与失败判定）"
      >
        <span class="label">成功迁徙：</span>
        <strong class="tabular">{{ totalSuccess }}</strong>
        <span class="unit">次</span>
      </div>
      <div
        class="stat"
        title="迁徙得分：按各物种 successScore 加权求和。飞行快的物种得分低，陆地/两栖慢速物种得分高。"
      >
        <span class="label">迁徙得分：</span>
        <strong class="tabular">{{ score.toFixed(1) }}</strong>
        <span class="unit">分</span>
      </div>
      <!-- v13：intro 引导第 7 步把"物种多样性 + 物种 logo"整体圈起来讲解失败判定 -->
      <div
        class="biodiv-species-cluster"
        data-tutorial-target="biodiv-and-species"
      >
        <div class="stat biodiversity-stat" :class="biodiversityClass" title="物种多样性：存活已解锁物种 / 已解锁物种">
          <span class="label">物种多样性：</span>
          <strong>{{ biodiversityText }}</strong>
        </div>
        <div class="stat species-logos-stat" title="点击 logo 查看物种信息">
          <div
            v-for="sp in speciesLogos"
            :key="sp.id"
            class="species-logo-chip-wrap"
          >
          <button
            type="button"
            class="species-logo-chip"
            :class="['species-logo-' + sp.state, { active: openSpeciesId === sp.id }]"
            :data-bubble-anchor="sp.id"
            :aria-label="`${sp.state === 'locked' ? '未知物种' : sp.name} ${sp.state === 'locked' ? '未解锁' : sp.state === 'alive' ? '存活' : '已灭绝'}`"
            @click="toggleSpeciesBubble(sp.id)"
          >
            <!-- v13：未解锁物种用问号占位，不暴露真实物种形象 -->
            <span v-if="sp.state === 'locked'" class="species-logo-unknown" aria-hidden="true">?</span>
            <SpeciesIconComp v-else :type="sp.icon" :color="sp.color" :size="20" />
          </button>
        </div>
        <!-- 聊天气泡：固定位置 / 顶在 chip 容器下方 -->
        <div
          v-if="openBubble"
          class="species-bubble"
          :class="['bubble-' + openBubble.state, `bubble-anchor-${openBubble.id}`]"
          data-bubble-card="1"
          role="dialog"
          aria-label="物种信息"
        >
          <div class="bubble-header">
            <span
              v-if="openBubble.state === 'locked'"
              class="bubble-unknown"
              aria-hidden="true"
            >?</span>
            <SpeciesIconComp v-else :type="openBubble.icon" :color="openBubble.color" :size="22" />
            <div class="bubble-titles">
              <div class="bubble-name">{{ openBubble.name }}</div>
              <div class="bubble-en">{{ openBubble.englishName }}</div>
            </div>
            <button
              type="button"
              class="bubble-close"
              aria-label="关闭"
              @click="closeSpeciesBubble"
            >×</button>
          </div>
          <div class="bubble-rows">
            <div class="bubble-row">
              <span class="bubble-label">状态</span>
              <span class="bubble-value" :class="`bubble-state-${openBubble.state}`">
                {{ openBubble.stateLabel }}
              </span>
            </div>
            <template v-if="openBubble.state !== 'locked'">
              <div class="bubble-row">
                <span class="bubble-label">解锁阶段</span>
                <span class="bubble-value">第 {{ openBubble.unlockStage }} 阶段</span>
              </div>
              <!--
                v5：成功迁徙得分（与"成功迁徙次数"严格分开）
                - 得分：species.successScore（每次该物种成功迁徙后获得的迁徙得分）
                - 累计：successes × successScore（该物种对总迁徙得分的贡献）
                - 跟顶栏"迁徙得分"的区别：顶栏是 Σ 全部物种的贡献
              -->
              <div
                class="bubble-row bubble-row-score"
                :title="`每次成功迁徙将获得 ${openBubble.successScore.toFixed(1)} 分迁徙得分`"
              >
                <span class="bubble-label">成功迁徙得分</span>
                <span class="bubble-value score">
                  <strong>{{ openBubble.successScore.toFixed(1) }}</strong>
                  <span class="score-unit">分/次</span>
                </span>
              </div>
              <div
                v-if="openBubble.successes > 0"
                class="bubble-row bubble-row-success-count"
                :title="`该物种已成功迁徙 ${openBubble.successes} 次，累计贡献 ${openBubble.successContribution.toFixed(1)} 分`"
              >
                <span class="bubble-label">已成功迁徙</span>
                <span class="bubble-value">
                  <strong>{{ openBubble.successes }}</strong>
                  <span class="score-unit">次 · 累计 {{ openBubble.successContribution.toFixed(1) }} 分</span>
                </span>
              </div>
              <div class="bubble-row">
                <span class="bubble-label">必经节点</span>
                <span class="bubble-value">{{ openBubble.waypointText }}</span>
              </div>
              <div class="bubble-row">
                <span class="bubble-label">随机要求</span>
                <span class="bubble-value">{{ openBubble.randomRequirementText }}</span>
              </div>
              <div class="bubble-row">
                <span class="bubble-label">移动速度</span>
                <span class="bubble-value">{{ openBubble.speedText }}</span>
              </div>
              <div class="bubble-row">
                <span class="bubble-label">风险描述</span>
                <span class="bubble-value">{{ openBubble.riskText }}</span>
              </div>
              <div v-if="openBubble.ecoInsight" class="bubble-row bubble-row-insight">
                <span class="bubble-label">生态启示</span>
                <span class="bubble-value insight">{{ openBubble.ecoInsight }}</span>
              </div>
            </template>
            <div v-else class="bubble-row bubble-row-locked-hint">
              <span class="bubble-value muted">达成第 {{ openBubble.unlockStage }} 阶段的迁徙次数后解锁。</span>
            </div>
          </div>
        </div>
      </div>
      </div>
      <!-- /biodiv-species-cluster -->

      <!-- v11：坚持时间，仅在游戏开始后显示 -->
      <div v-if="gameStarted" class="stat survival-stat" title="从点击【开始游戏】起计时">
        <span class="label">⏱</span>
        <strong class="survival-text">{{ survivalText }}</strong>
      </div>
      <div class="stat">
        <span class="label">同时任务：</span>
        <strong>{{ maxConcurrent }}</strong>
      </div>
      <div class="stat line-seg-stat">
        <span class="label">线路段：</span>
        <div class="segments">
          <span v-for="(u, i) in segmentsArr" :key="i" class="seg" :class="{ used: u }"></span>
        </div>
        <strong style="font-variant-numeric: tabular-nums;">{{ usedSegments }} / {{ maxSegments }}</strong>
      </div>

      <!-- v13：迁徙/人类活动切换按钮已迁移到 GameMap 右上方 -->
    </div>
  </div>
</template>

<style scoped>
.survival-stat {
  padding: 3px 10px;
  background: rgba(108, 192, 128, 0.08);
  border: 1px dashed rgba(108, 192, 128, 0.35);
  border-radius: 10px 6px 12px 8px;
}
.survival-stat .survival-text {
  color: var(--success);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-family: var(--font-hand);
}

/* ============ 物种多样性 + 物种 logo ============ */
.biodiv-species-cluster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.biodiversity-stat {
  padding: 3px 10px;
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border);
  background: var(--bg-sticker);
  transition: all 0.2s;
  box-shadow: var(--shadow-sticker);
}
.biodiversity-stat strong {
  font-variant-numeric: tabular-nums;
}
.biodiversity-stat.biodiv-normal {
  color: var(--text);
}
.biodiversity-stat.biodiv-normal strong {
  color: var(--success);
}
.biodiversity-stat.biodiv-yellow {
  background: rgba(232, 192, 80, 0.10);
  border-color: rgba(232, 192, 80, 0.45);
  border-style: solid;
}
.biodiversity-stat.biodiv-yellow strong {
  color: #E8C050;
}
.biodiversity-stat.biodiv-red {
  background: rgba(212, 88, 72, 0.08);
  border-color: rgba(212, 88, 72, 0.45);
  border-style: solid;
  animation: biodiversityRedPulse 1.6s ease-in-out infinite;
}
.biodiversity-stat.biodiv-red strong {
  color: #D45848;
}
@keyframes biodiversityRedPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(212, 88, 72, 0.0); }
  50% { box-shadow: 0 0 0 4px rgba(212, 88, 72, 0.12); }
}

.species-logos-stat {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 3px 6px;
  background: var(--bg-sticker);
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border);
  box-shadow: var(--shadow-sticker);
}
.species-logo-chip-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.species-logo-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  transition: filter 0.2s, transform 0.15s, box-shadow 0.2s;
  border: 1.5px dashed transparent;
  background: transparent;
  padding: 0;
  font: inherit;
  color: inherit;
}
.species-logo-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 0 2px rgba(90, 172, 200, 0.35);
}
.species-logo-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(90, 172, 200, 0.55);
}
.species-logo-chip.active {
  box-shadow: 0 0 0 2px rgba(90, 172, 200, 0.55);
  background: rgba(90, 172, 200, 0.10);
  border-color: rgba(90, 172, 200, 0.4);
}
.species-logo-chip.species-logo-locked {
  filter: grayscale(1);
  opacity: 0.45;
}
.species-logo-unknown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-dim);
  background: var(--bg-sticker);
  border: 1px dashed var(--border);
  font-family: var(--font-hand);
}
.species-logo-chip.species-logo-alive {
  filter: none;
  opacity: 1;
}
.species-logo-chip.species-logo-extinct {
  filter: grayscale(0.6) brightness(0.6);
  opacity: 1;
}
.species-logo-chip.species-logo-extinct :deep(svg) {
  filter: hue-rotate(310deg) saturate(2.4) brightness(0.55);
}

/* ============ 聊天气泡 — 手账贴纸卡片 ============ */
.species-bubble {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 260px;
  max-width: 320px;
  background: var(--bg-paper);
  background-image: var(--grid-dots);
  border: 1.5px dashed rgba(90, 172, 200, 0.40);
  border-radius: 12px 8px 14px 6px;
  padding: 10px 12px;
  color: var(--text);
  box-shadow: var(--shadow-modal);
  z-index: 500;
  text-align: left;
  font-size: 12px;
  line-height: 1.5;
}
.species-bubble::before,
.species-bubble::after {
  content: '';
  position: absolute;
  right: 18px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
}
.species-bubble::before {
  top: -8px;
  border-bottom: 8px solid rgba(90, 172, 200, 0.40);
}
.species-bubble::after {
  top: -7px;
  border-bottom: 8px solid var(--bg-paper);
}
.bubble-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(90, 172, 200, 0.25);
  margin-bottom: 8px;
}
.bubble-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.bubble-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--text);
  font-family: var(--font-hand);
}
.bubble-en {
  font-size: 11px;
  color: var(--text-dim);
}
.bubble-close {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.bubble-close:hover {
  background: rgba(90, 172, 200, 0.08);
  color: var(--text);
}
.bubble-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bubble-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.bubble-label {
  flex: 0 0 56px;
  color: var(--text-dim);
  font-size: 11px;
  padding-top: 1px;
}
.bubble-value {
  flex: 1;
  word-break: break-word;
  color: var(--text);
}
.bubble-state-alive {
  color: var(--success);
  font-weight: 600;
}
.bubble-state-locked {
  color: var(--text-dim);
}
.bubble-unknown {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  color: var(--text-dim);
  background: var(--bg-sticker);
  border: 1px dashed var(--border);
  flex-shrink: 0;
  font-family: var(--font-hand);
}
.bubble-value.muted {
  color: var(--text-dim);
  font-style: italic;
  font-size: 11px;
}
.bubble-row-locked-hint {
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--bg-sticker);
  border: 1px dashed var(--border-light);
  border-radius: 8px 4px 10px 6px;
}
.bubble-state-extinct {
  color: var(--danger);
  font-weight: 600;
}
.bubble-row-insight {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(108, 192, 128, 0.08);
  border: 1px dashed rgba(108, 192, 128, 0.35);
  border-left: 3px solid rgba(108, 192, 128, 0.55);
  border-radius: 8px 4px 10px 6px;
}
.bubble-value.insight {
  font-style: italic;
  font-size: 12px;
  color: var(--text-accent);
  line-height: 1.55;
}

/* 成功迁徙得分（手账蓝色标注） */
.bubble-row.bubble-row-score {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(90, 172, 200, 0.08);
  border: 1px dashed rgba(90, 172, 200, 0.30);
  border-left: 3px solid rgba(90, 172, 200, 0.55);
  border-radius: 8px 4px 10px 6px;
}
.bubble-row.bubble-row-score .bubble-label {
  color: rgba(90, 172, 200, 0.85);
  font-weight: 600;
}
.bubble-value.score {
  color: rgba(90, 172, 200, 0.95);
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.bubble-value.score strong {
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 700;
}
.score-unit {
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 400;
}
.bubble-row.bubble-row-success-count {
  padding: 4px 8px;
  background: rgba(247, 241, 230, 0.5);
  border: 1px dashed var(--border-light);
  border-radius: 8px 4px 10px 6px;
}
.bubble-row.bubble-row-success-count strong {
  font-variant-numeric: tabular-nums;
  color: var(--text);
  font-weight: 600;
}
</style>
