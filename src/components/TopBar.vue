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
import { useSupabase } from '../composables/useSupabase'

const emit = defineEmits<{
  openRanking: []
}>()

const year = computed(() => gameStore.state.year)
const totalSuccess = computed(() => gameStore.state.totalSuccess)
const score = computed(() => gameStore.state.score)
const usedSegments = computed(() => gameStore.state.usedSegments)
const maxSegments = computed(() => gameStore.state.maxSegments)
const nodeCount = computed(() => gameStore.state.mapNodes.length)
const stage = computed(() => gameStore.state.stage)
const maxConcurrent = computed(() => gameStore.state.maxConcurrent)
const season = computed(() => gameStore.state.season)
const gameStarted = computed(() => gameStore.state.gameStarted)
const nickname = computed(() => gameStore.state.playerNickname || '迁徙者')

const biodiversityPercent = computed(() => {
  return gameStore.getBiodiversityPercent()
})

const biodiversityText = computed(() => `${biodiversityPercent.value.toFixed(1)}%`)

const biodiversityClass = computed(() => {
  const v = biodiversityPercent.value
  if (v < 33.4) return 'biodiv-red'
  if (v < 66) return 'biodiv-yellow'
  return 'biodiv-normal'
})

// 实时排名按钮
const { isConfigured } = useSupabase()

function openRanking() {
  if (!isConfigured()) return
  emit('openRanking')
  gameStore.setGameplayPause('ranking', true)
}

// ============================================================
// 物种 logo 下方数据（已有逻辑，不动）
// ============================================================
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

const openSpeciesId = ref<string | null>(null)

function toggleSpeciesBubble(id: string): void {
  openSpeciesId.value = openSpeciesId.value === id ? null : id
}

function closeSpeciesBubble(): void {
  openSpeciesId.value = null
}

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

interface SpeciesBubbleData {
  id: string
  name: string
  englishName: string
  color: string
  icon: SpeciesIcon
  state: 'locked' | 'alive' | 'extinct'
  stateLabel: string
  failures: number
  successes: number
  successScore: number
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
  const unlockStage = SPECIES_UNLOCK_STAGES[sp.id] ?? 1
  const waypointText = sp.requiredWaypoints?.length
    ? sp.requiredWaypoints.map(waypointLabelFor).join(' → ')
    : '无'
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

function formatRandomRequirement(sp: SpeciesDef): string {
  const p = sp.waypointPicker
  if (!p || p.maxCount <= 0) return '无'
  const countText = p.minCount === p.maxCount ? `${p.minCount}` : `${p.minCount}-${p.maxCount}`
  return `${countText} 个随机中转点（任意可通行节点）`
}

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
    <!-- 第一行：标题 + 季节提示 + 用户区域（昵称 + 实时排名按钮） -->
    <div class="title-row">
      <span class="title">众生迁徙 · Allive Migration</span>

      <span
        v-if="gameStarted"
        class="season-inline"
        :class="seasonClass"
        :title="seasonInfo.description"
      >
        <span class="dot"></span>
        {{ seasonInfo.description }}
      </span>

      <div class="user-actions">
        <span class="nickname-badge">{{ nickname }}</span>
        <button
          type="button"
          class="ranking-btn"
          :disabled="!isConfigured() || !gameStarted"
          :title="!isConfigured() ? '排行榜需要连接服务器' : !gameStarted ? '游戏开始后可查看' : '查看实时排名'"
          @click="openRanking"
        >
          🏆 实时排名
        </button>
      </div>
    </div>

    <!-- 第二行：统计面板 -->
    <div class="stats">
      <div class="stat"><span class="label">第</span><strong>{{ year }}</strong><span class="label">年</span></div>
      <div class="stat">
        <span class="label">阶段</span>
        <strong>{{ stage }}</strong>
        <span class="stage-species">{{ stageHint }}</span>
      </div>
      <div class="stat"><span class="label">生态节点：</span><strong>{{ nodeCount }}</strong></div>
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
            <span v-if="sp.state === 'locked'" class="species-logo-unknown" aria-hidden="true">?</span>
            <SpeciesIconComp v-else :type="sp.icon" :color="sp.color" :size="20" />
          </button>
        </div>
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
    </div>
  </div>
</template>

<style scoped>
/* ============================================================ */
/* 第一行：标题行 */
/* ============================================================ */
.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px 4px;
  min-height: 34px;
}

.title {
  font-family: var(--font-hand);
  font-size: 15px;
  font-weight: 700;
  color: #c0d4c0;
  letter-spacing: 1.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 季节内联提示 — 极小，在标题右侧 */
.season-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.08);
}

.season-inline .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 季节颜色 */
.season-inline.spring {
  background: rgba(108, 192, 128, 0.12);
  color: #7cd494;
  border-color: rgba(108, 192, 128, 0.2);
}
.season-inline.spring .dot { background: #7cd494; }

.season-inline.summer {
  background: rgba(232, 192, 80, 0.12);
  color: #e8c050;
  border-color: rgba(232, 192, 80, 0.2);
}
.season-inline.summer .dot { background: #e8c050; }

.season-inline.autumn {
  background: rgba(210, 150, 80, 0.12);
  color: #d29650;
  border-color: rgba(210, 150, 80, 0.2);
}
.season-inline.autumn .dot { background: #d29650; }

.season-inline.winter {
  background: rgba(130, 180, 210, 0.12);
  color: #82b4d2;
  border-color: rgba(130, 180, 210, 0.2);
}
.season-inline.winter .dot { background: #82b4d2; }

/* 用户操作区域 — 推到最右侧 */
.user-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.nickname-badge {
  font-size: 12px;
  font-weight: 600;
  color: #a0c8a0;
  padding: 3px 10px;
  background: rgba(108, 192, 128, 0.08);
  border: 1px solid rgba(108, 192, 128, 0.15);
  border-radius: 12px;
  white-space: nowrap;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ranking-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 12px;
  background: rgba(90, 172, 200, 0.1);
  border: 1px solid rgba(90, 172, 200, 0.2);
  border-radius: 12px;
  color: #80bcd4;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  font-family: inherit;
}

.ranking-btn:hover:not(:disabled) {
  background: rgba(90, 172, 200, 0.18);
  border-color: rgba(90, 172, 200, 0.35);
  color: #a0d4e8;
}

.ranking-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 切换身份按钮 */
.switch-identity-btn {
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(160, 190, 160, 0.5);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.switch-identity-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(200, 220, 200, 0.85);
}

/* 切换身份按钮 */
.switch-identity-btn {
  border: none;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(160, 190, 160, 0.5);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.switch-identity-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(200, 220, 200, 0.85);
}

/* ============================================================ */
/* 保留的已有样式（物种 logo、气泡、生存时间等） */
/* ============================================================ */
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
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
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

/* 聊天气泡 */
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
