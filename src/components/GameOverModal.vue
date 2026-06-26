<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { gameStore } from '../store/gameStore'
import { getSpeciesTemplate } from '../data/speciesTemplates'
import { useSupabase, ScoreErrorCode } from '../composables/useSupabase'

const emit = defineEmits<{
  showLeaderboard: []
  goHome: []
}>()

const score = computed(() => gameStore.state.score)
const failures = computed(() => gameStore.state.failures)
const totalSuccess = computed(() => gameStore.state.totalSuccess)
const seed = computed(() => gameStore.state.seed)
const survivalTime = computed(() => gameStore.state.survivalTime)
const finalNodeCount = computed(() => gameStore.state.mapNodes.length)

const biodiversityPercent = computed(() => gameStore.getBiodiversityPercent())
const biodiversityText = computed(() => `${biodiversityPercent.value.toFixed(1)}%`)

const extinctSpeciesNames = computed(() => {
  return gameStore.state.extinctSpeciesIds
    .map((id) => getSpeciesTemplate(id)?.name || id)
    .filter((name) => !!name)
})

const survivalText = computed(() => {
  const sec = Math.max(0, Math.floor(survivalTime.value))
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m} 分 ${s.toString().padStart(2, '0')} 秒`
})

// ============================================================
// 分数提交（游戏结束时自动提交，确保数据上榜）
// ============================================================
const { submitScore, isConfigured, startSession } = useSupabase()

const isSubmitting = ref(false)
const submitError = ref('')
const submitDone = ref(false)
const myRank = ref(0)
const isNetworkError = ref(false)

async function trySubmitScore() {
  // 只有在 gameOver=true 时才提交（防御性检查）
  if (!gameStore.state.gameOver) return
  if (!isConfigured() || submitDone.value) return

  isSubmitting.value = true
  submitError.value = ''
  isNetworkError.value = false

  try {
    const sessionToken = gameStore.state.sessionToken
    if (!sessionToken) {
      // 无法连接到服务器：显示错误提示，让用户知道成绩未同步
      submitError.value = '未能连接排行榜服务器，成绩仅在本地保存。请检查网络后重试'
      isSubmitting.value = false
      submitDone.value = true
      return
    }

    // 教程阶段弹出了 gameOver（例如点击跳过教程的极端情况），
    // 此时 gameStarted=false，没有任何实际游戏数据，不应提交。
    if (!gameStore.state.gameStarted) {
      console.log('[GameOverModal] gameStarted=false, 跳过提交（教程阶段无需记录）')
      isSubmitting.value = false
      submitDone.value = true
      return
    }

    // 记录屏幕上显示的分数（通过 computed）
    console.log('[GameOverModal] 屏幕显示:', {
      displayedScore: score.value.toFixed(1),
      displayedSurvivalText: survivalText.value,
      displayedStage: gameStore.state.stage,
    })

    // 立即捕获当前分数和时间（避免异步期间被重置）
    const finalScore = gameStore.state.score
    const finalSurvivalTime = gameStore.state.survivalTime
    const finalTotalSuccess = gameStore.state.totalSuccess
    const finalStage = gameStore.state.stage
    const finalSeed = gameStore.state.seed

    console.log('[GameOverModal] 提交分数:', {
      score: finalScore,
      survivalTime: finalSurvivalTime,
      totalSuccess: finalTotalSuccess,
      stage: finalStage,
      seed: finalSeed,
      gameStarted: gameStore.state.gameStarted,
      tutorialActive: gameStore.state.tutorialActive,
      tutorialPhase: gameStore.state.tutorialPhase,
      sessionToken: sessionToken.substring(0, 20) + '...',
    })

    const result = await submitScore({
      sessionToken,
      score: finalScore,
      survivalTime: finalSurvivalTime,
      totalSuccess: finalTotalSuccess,
      stage: finalStage,
      seed: finalSeed,
      speciesSuccessCounts: gameStore.state.speciesSuccessCounts,
      extinctSpecies: gameStore.state.extinctSpeciesIds,
      biodiversityPercent: biodiversityPercent.value,
    })

    if (result.success && result.response) {
      console.log('[GameOverModal] 提交成功:', result.response)
      myRank.value = result.response.rank
      gameStore.state.scoreSubmitted = true
      submitDone.value = true
    } else if (result.error) {
      console.warn('[GameOverModal] 提交失败:', result.error)
      if (result.error.code === ScoreErrorCode.SCORE_OVERFLOW) {
        submitError.value = '分数异常，本次成绩未记录'
        submitDone.value = true
      } else if (result.error.code === ScoreErrorCode.TOKEN_USED) {
        submitError.value = '会话已过期，成绩未记录'
        submitDone.value = true
      } else if (result.error.code === ScoreErrorCode.NETWORK_ERROR) {
        submitError.value = '网络不可用，成绩提交失败。请检查网络后点击重试'
        isNetworkError.value = true
      } else if (result.error.code === ScoreErrorCode.NOT_CONFIGURED) {
        // 静默
      } else {
        submitError.value = result.error.error
        submitDone.value = true
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    submitError.value = `提交分数时出错：${errMsg}`
    console.warn('Score submission error:', err)
    submitDone.value = true
  }

  isSubmitting.value = false
}

// ============================================================
// 监听 gameOver 状态：游戏结束时自动提交分数
// 组件在整个 'playing' 阶段保持挂载，通过 watch 而非 onMounted 触发
// 避免在组件挂载时（游戏尚未开始）提前消耗 submitDone 标记
// ============================================================
watch(
  () => gameStore.state.gameOver,
  (isOver) => {
    if (isOver) {
      trySubmitScore()
    } else {
      // 新一局开始：重置提交状态
      submitDone.value = false
      submitError.value = ''
      isNetworkError.value = false
      isSubmitting.value = false
      myRank.value = 0
    }
  }
)

// ============================================================
// 按钮操作
// ============================================================
async function restart() {
  if (isConfigured()) {
    try {
      const session = await startSession()
      gameStore.state.sessionToken = session.session_token
      gameStore.state.serverSeed = session.seed
    } catch (err) {
      console.warn('Failed to refresh session token:', err)
      // 清除旧 token，避免下一局用已使用的 token 提交
      gameStore.state.sessionToken = null
      gameStore.state.serverSeed = null
    }
  }
  gameStore.restart(gameStore.state.serverSeed ?? undefined)
}

function viewLeaderboard() {
  emit('showLeaderboard')
}

function backToHome() {
  emit('goHome')
}
</script>

<template>
  <div v-if="gameStore.state.gameOver" class="modal-mask">
    <div class="modal-card">
      <!-- 加载中 -->
      <div v-if="isSubmitting" class="loading-section">
        <div class="spinner"></div>
        <p>正在提交成绩...</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="submitError && !isSubmitting" class="error-banner">
        <p>{{ submitError }}</p>
        <button v-if="isNetworkError" class="btn-retry" @click="trySubmitScore">重试提交</button>
      </div>

      <!-- 本局结果 -->
      <div class="result-section">
        <h1 class="result-title">旅程结束</h1>
        <p class="result-subtitle">生态地图上的迁徙者，完成了它们的旅行</p>

        <div class="score-hero">
          <div class="score-number">{{ score.toFixed(1) }}</div>
          <div class="score-label">迁徙得分</div>
          <div v-if="myRank > 0 && !isSubmitting" class="score-rank-badge">
            全服第 <strong>{{ myRank }}</strong> 名
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">坚持时间</span>
            <span class="stat-value highlight">{{ survivalText }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">成功迁徙</span>
            <span class="stat-value">{{ totalSuccess }} 次</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">物种多样性</span>
            <span class="stat-value">{{ biodiversityText }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">到达阶段</span>
            <span class="stat-value">第 {{ gameStore.state.stage }} 阶段</span>
          </div>
          <div class="stat-item" v-if="extinctSpeciesNames.length > 0">
            <span class="stat-label">灭绝物种</span>
            <span class="stat-value extinct">{{ extinctSpeciesNames.join('、') }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">失败次数</span>
            <span class="stat-value">{{ failures }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">生态节点</span>
            <span class="stat-value">{{ finalNodeCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">随机种子</span>
            <span class="stat-value seed">{{ seed }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button class="btn-restart" :disabled="isSubmitting" @click="restart">再来一局</button>
        <button class="btn-leaderboard" :disabled="isSubmitting" @click="viewLeaderboard">查看排行</button>
        <button class="btn-home" :disabled="isSubmitting" @click="backToHome">返回主页</button>
        <p v-if="isSubmitting" class="submit-hint">成绩提交中，请稍候…</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================ */
/* 白色手账风格 — 游戏结算界面 */
/* ============================================================ */

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(247, 241, 230, 0.88);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: maskIn 0.3s ease;
}

@keyframes maskIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.modal-card {
  width: 440px;
  max-width: 94vw;
  max-height: 88vh;
  overflow-y: auto;
  background: var(--bg-sticker);
  background-image: var(--paper-noise);
  border: 1.5px dashed var(--border-dashed);
  border-radius: 12px 8px 14px 6px;
  padding: 32px 28px 24px;
  box-shadow: var(--shadow-modal);
  animation: cardSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

@keyframes cardSlide {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* 加载 */
.loading-section {
  text-align: center;
  padding: 24px 0;
}

.spinner {
  width: 28px;
  height: 28px;
  margin: 0 auto 12px;
  border: 3px solid var(--border-light);
  border-top-color: var(--success);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.loading-section p {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
}

.error-banner {
  margin-bottom: 16px;
  padding: 10px 14px;
  background: rgba(212, 88, 72, 0.06);
  border: 1.5px dashed rgba(212, 88, 72, 0.3);
  border-radius: 10px 6px 12px 8px;
  color: var(--danger);
  font-size: 13px;
  text-align: center;
}

.error-banner p {
  margin: 0 0 8px 0;
}

.error-banner p:last-child {
  margin-bottom: 0;
}

.btn-retry {
  margin-top: 4px;
  padding: 6px 18px;
  background: rgba(212, 88, 72, 0.1);
  border: 1px solid rgba(212, 88, 72, 0.3);
  border-radius: 8px;
  color: var(--danger);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover {
  background: rgba(212, 88, 72, 0.2);
  border-color: rgba(212, 88, 72, 0.5);
}

/* 结果区 */
.result-section {
  text-align: center;
  margin-bottom: 20px;
}

.result-title {
  margin: 0;
  font-family: var(--font-hand);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 2px;
}

.result-subtitle {
  margin: 6px 0 16px;
  font-size: 13px;
  color: var(--text-dim);
}

.score-hero {
  padding: 16px 0;
  margin-bottom: 16px;
  border-bottom: 1.5px dashed var(--border-light);
}

.score-number {
  font-family: var(--font-hand);
  font-size: 48px;
  font-weight: 800;
  color: var(--success);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.score-label {
  font-size: 14px;
  color: var(--text-dim);
  margin-top: 4px;
}

.score-rank-badge {
  margin-top: 8px;
  padding: 4px 14px;
  display: inline-block;
  background: rgba(108, 192, 128, 0.08);
  border: 1.5px dashed rgba(108, 192, 128, 0.3);
  border-radius: 20px 10px 22px 12px;
  font-size: 13px;
  color: var(--text-dim);
}

.score-rank-badge strong {
  color: var(--success);
  font-size: 15px;
}

/* 统计网格 */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  text-align: left;
  padding: 14px 16px;
  background: var(--bg-paper);
  background-image: var(--grid-lines);
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border-light);
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dotted var(--border-light);
}

.stat-item:last-child,
.stat-item:nth-last-child(2):nth-child(odd) {
  border-bottom: none;
}

.stat-label {
  font-size: 13px;
  color: var(--text-dim);
}

.stat-value {
  font-size: 14px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.stat-value.highlight { color: var(--success); }
.stat-value.extinct { color: var(--danger); font-size: 12px; }
.stat-value.seed {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 400;
}

/* 操作按钮 */
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-restart, .btn-leaderboard, .btn-home {
  width: 100%;
  padding: 12px 0;
  border-radius: 10px 6px 12px 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-hand);
  border: none;
}

.btn-restart {
  background: linear-gradient(135deg, #6CC080 0%, #5AAC6E 100%);
  color: #FFF;
  box-shadow: 0 2px 8px rgba(108, 192, 128, 0.2);
}
.btn-restart:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(108, 192, 128, 0.3);
}

.btn-leaderboard {
  background: var(--bg-paper);
  border: 1.5px dashed var(--border);
  color: var(--text-accent);
}
.btn-leaderboard:hover {
  background: var(--bg-panel);
  border-color: var(--border-dashed);
  color: var(--text);
}

.btn-home {
  background: transparent;
  border: 1.5px dashed var(--border-light);
  color: var(--text-dim);
  font-size: 13px;
}
.btn-home:hover {
  background: var(--bg-paper);
  color: var(--text);
  border-color: var(--border);
}
</style>
