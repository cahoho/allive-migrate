<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useSupabase } from '../composables/useSupabase'
import type { LeaderboardEntry } from '../supabase/types'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { fetchLeaderboard, isConfigured } = useSupabase()

const loading = ref(false)
const leaderboard = ref<LeaderboardEntry[]>([])
const playerRank = ref<LeaderboardEntry | null>(null)
const totalPlayers = ref(0)

const leaderboardError = ref('')

// 每次打开时重新拉取排行榜
watch(() => props.visible, async (v) => {
  if (!v) return
  if (!isConfigured()) {
    leaderboardError.value = '排行榜功能未配置，请检查网络连接'
    return
  }

  loading.value = true
  leaderboard.value = []
  playerRank.value = null
  totalPlayers.value = 0
  leaderboardError.value = ''

  try {
    const result = await fetchLeaderboard(20, 0)
    if (result.success && result.data) {
      leaderboard.value = result.data.leaderboard
      playerRank.value = result.data.player_rank
      totalPlayers.value = result.data.total_players
    } else if (result.error) {
      leaderboardError.value = `加载排行榜失败：${result.error}`
    }
  } catch (err) {
    leaderboardError.value = `加载排行榜时网络出错：${err instanceof Error ? err.message : String(err)}`
  }

  loading.value = false
})

function formatTime(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function rankClass(rank: number): string {
  if (rank === 1) return 'rank-gold'
  if (rank === 2) return 'rank-silver'
  if (rank === 3) return 'rank-bronze'
  return ''
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div v-if="visible" class="ranking-overlay" @click.self="emit('close')">
    <div class="ranking-modal">
      <!-- 标题栏 -->
      <div class="ranking-header">
        <h2>全服排行榜</h2>
        <span v-if="totalPlayers > 0" class="player-count">{{ totalPlayers }} 位迁徙者</span>
        <button class="ranking-close" @click="emit('close')">&times;</button>
      </div>

      <!-- 我的排名 -->
      <div v-if="playerRank" class="my-rank-banner">
        <span class="my-rank-num">#{{ playerRank.rank }}</span>
        <span class="my-rank-info">
          {{ playerRank.nickname }} · 最佳 {{ playerRank.score.toFixed(1) }} 分 · {{ formatTime(playerRank.survival_time) }}
        </span>
      </div>

      <!-- 错误状态 -->
      <div v-if="leaderboardError" class="ranking-error">
        <p>{{ leaderboardError }}</p>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="ranking-loading">
        <div class="spinner"></div>
        <p>正在加载排行榜...</p>
      </div>

      <!-- 排行榜列表 -->
      <div v-else-if="leaderboard.length > 0" class="ranking-list">
        <div
          v-for="entry in leaderboard"
          :key="entry.rank"
          class="ranking-row"
          :class="{
            'is-me': entry.device_id === playerRank?.device_id,
            [rankClass(entry.rank)]: true
          }"
        >
          <span class="r-rank">
            <template v-if="entry.rank === 1">🥇</template>
            <template v-else-if="entry.rank === 2">🥈</template>
            <template v-else-if="entry.rank === 3">🥉</template>
            <template v-else>#{{ entry.rank }}</template>
          </span>
          <span class="r-name">{{ entry.nickname }}</span>
          <span class="r-score">{{ entry.score.toFixed(1) }} 分</span>
          <span class="r-time">{{ formatTime(entry.survival_time) }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!loading" class="ranking-empty">
        <p class="empty-title">暂无排行数据</p>
        <p class="empty-hint">完成一局游戏后，成绩会自动提交上榜</p>
        <p class="empty-hint">成为第一个上榜的迁徙者吧！</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================ */
/* 排行榜弹窗 — 白色手账风格 */
/* ============================================================ */
.ranking-overlay {
  position: fixed;
  inset: 0;
  z-index: 9600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(247, 241, 230, 0.82);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.ranking-modal {
  width: 420px;
  max-width: 92vw;
  max-height: 75vh;
  background: var(--bg-sticker);
  background-image: var(--paper-noise);
  border: 1.5px dashed var(--border-dashed);
  border-radius: 12px 8px 14px 6px;
  padding: 20px 24px;
  box-shadow: var(--shadow-modal);
  animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.ranking-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.ranking-header h2 {
  margin: 0;
  font-family: var(--font-hand);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  flex: 1;
  letter-spacing: 1px;
}

.player-count {
  font-size: 12px;
  color: var(--text-dim);
}

.ranking-close {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s;
}

.ranking-close:hover {
  color: var(--text);
}

.my-rank-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: rgba(108, 192, 128, 0.06);
  border: 1.5px dashed rgba(108, 192, 128, 0.3);
  border-radius: 10px 6px 12px 8px;
  flex-shrink: 0;
}

.my-rank-num {
  font-family: var(--font-hand);
  font-size: 20px;
  font-weight: 800;
  color: var(--success);
}

.my-rank-info {
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-loading {
  text-align: center;
  padding: 28px 0;
  flex: 1;
}

.spinner {
  width: 28px;
  height: 28px;
  margin: 0 auto 10px;
  border: 3px solid var(--border-light);
  border-top-color: var(--success);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.ranking-loading p {
  margin: 0;
  color: var(--text-dim);
  font-size: 13px;
}

.ranking-list {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  flex: 1;
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border-light);
  background: var(--bg-paper);
}

.ranking-row {
  display: grid;
  grid-template-columns: 42px 1fr 72px 52px;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-bottom: 1px dotted var(--border-light);
  transition: background 0.12s;
}

.ranking-row:last-child { border-bottom: none; }
.ranking-row:hover { background: rgba(90, 70, 50, 0.04); }
.ranking-row.is-me { background: rgba(108, 192, 128, 0.06); }

.r-rank {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-dim);
  text-align: center;
}

.rank-gold .r-rank { color: #D4A020; }
.rank-silver .r-rank { color: #8B9BA8; }
.rank-bronze .r-rank { color: #B8783C; }

.r-name {
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-row.is-me .r-name { color: var(--success); font-weight: 600; }

.r-score {
  font-size: 13px;
  color: var(--text-accent);
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.r-time {
  font-size: 11px;
  color: var(--text-dim);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.ranking-empty {
  text-align: center;
  padding: 28px 16px;
  color: var(--text-dim);
  font-size: 14px;
  flex: 1;
  opacity: 0.6;
}

.ranking-error {
  text-align: center;
  padding: 16px;
  margin-bottom: 12px;
  background: rgba(212, 88, 72, 0.06);
  border: 1.5px dashed rgba(212, 88, 72, 0.3);
  border-radius: 10px 6px 12px 8px;
  color: var(--danger);
  font-size: 13px;
  flex-shrink: 0;
}

.ranking-error p {
  margin: 0;
}
</style>
