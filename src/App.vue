<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import TopBar from './components/TopBar.vue'
import GameMap from './components/GameMap.vue'
import SpeciesPanel from './components/SpeciesPanel.vue'
import GameOverModal from './components/GameOverModal.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import NicknameInput from './components/NicknameInput.vue'
import LeaderboardModal from './components/LeaderboardModal.vue'
import { gameStore } from './store/gameStore'
import { useGameLoop } from './composables/useGameLoop'
import { useSupabase } from './composables/useSupabase'
import { useDeviceId } from './composables/useDeviceId'
import { unlockAudio, pauseAllBackgrounds, resumeAllBackgrounds } from './systems/audioManager'
import type { LoadProgress } from './systems/audioManager'
import { preloadAllSfx } from './systems/audioManager'

const { startSession, updateNickname, isConfigured } = useSupabase()
const { clearDeviceId } = useDeviceId()

// 游戏流程：'nickname' → 'loading' → 'playing'
const appPhase = ref<'nickname' | 'loading' | 'playing'>('nickname')
const isAudioLoading = ref(false)
const loadingProgress = ref<LoadProgress | null>(null)
const showLeaderboard = ref(false)

const TUTORIAL_PREF_KEY = 'allive_tutorial_enabled'

useGameLoop()

function onVisibilityChange() {
  if (document.hidden) {
    pauseAllBackgrounds()
  } else {
    resumeAllBackgrounds()
  }
}

async function onNicknameConfirm(nickname: string, tutorialEnabled: boolean = true) {
  try {
    await updateNickname(nickname)
    gameStore.state.playerNickname = nickname

    if (isConfigured()) {
      try {
        const session = await startSession()
        gameStore.state.sessionToken = session.session_token
        gameStore.state.serverSeed = session.seed
      } catch (err) {
        console.warn('Failed to start Supabase session, using local seed:', err)
      }
    }

    // 进入加载阶段
    appPhase.value = 'loading'
    isAudioLoading.value = true
    const tutorial = tutorialEnabled

    await preloadAllSfx((p) => {
      loadingProgress.value = p
    })

    isAudioLoading.value = false

    // 初始化游戏
    gameStore.initGame(gameStore.state.serverSeed ?? gameStore.state.seed)

    if (tutorial) {
      gameStore.startTutorial()
    } else {
      gameStore.startGame()
    }

    appPhase.value = 'playing'
  } catch (err) {
    console.error('Failed to start game:', err)
    appPhase.value = 'nickname' // 出错回退到输入界面
  } finally {
    // 无论成功或失败，加载阶段结束
  }
}

function switchIdentity() {
  clearDeviceId()
  try { localStorage.removeItem(TUTORIAL_PREF_KEY) } catch { /* silent */ }
  window.location.reload()
}

/**
 * 返回首页：回到欢迎页面（不清除设备身份）
 * 
 * 用户点击"返回首页"后会看到 NicknameInput 的欢迎界面：
 * "欢迎回来，XXX" + "进入游戏" 按钮
 * 而非强制重新输入昵称。
 */
function goHome() {
  showLeaderboard.value = false
  appPhase.value = 'nickname'
}

onMounted(() => {
  // 不自动登录，始终先显示 NicknameInput
  // - 新玩家：看到昵称输入页面
  // - 回头客：看到"欢迎回来，XXX"页面
  // 浏览器自动播放策略
  const onFirstInteract = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', onFirstInteract, true)
    window.removeEventListener('keydown', onFirstInteract, true)
  }
  window.addEventListener('pointerdown', onFirstInteract, true)
  window.addEventListener('keydown', onFirstInteract, true)

  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="app-root">
    <div v-if="isAudioLoading" class="loading-overlay">
      <div class="loading-card">
        <div class="loading-spinner"></div>
        <p class="loading-title">正在准备音效资源…</p>
        <div v-if="loadingProgress" class="loading-progress-bar">
          <div class="progress-fill" :style="{ width: loadingProgress!.percent + '%' }"></div>
        </div>
        <p class="loading-file">{{ loadingProgress?.currentFile || '...' }}</p>
      </div>
    </div>

    <NicknameInput
      v-if="appPhase === 'nickname'"
      @confirm="onNicknameConfirm"
      @switch-identity="switchIdentity"
    />

    <template v-if="appPhase === 'playing'">
      <TopBar @open-ranking="showLeaderboard = true" />
      <div class="main-area">
        <GameMap />
        <div class="panel-wrap">
          <SpeciesPanel />
        </div>
      </div>

      <div class="toasts">
        <div
          v-for="t in gameStore.state.toasts"
          :key="t.id"
          class="toast"
          :class="t.kind"
        >{{ t.text }}</div>
      </div>

      <TutorialOverlay />
      <GameOverModal
        @show-leaderboard="showLeaderboard = true"
        @go-home="goHome"
      />
      <LeaderboardModal
        :visible="showLeaderboard"
        @close="showLeaderboard = false; gameStore.setGameplayPause('ranking', false)"
      />
    </template>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 11000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-main);
  background-image: var(--grid-dots);
}

.loading-card {
  text-align: center;
  padding: 36px 48px;
  background: var(--bg-sticker);
  border: 1.5px dashed var(--border-dashed);
  border-radius: var(--radius-sticker);
  box-shadow: var(--shadow-sticker);
}

.loading-spinner {
  width: 36px;
  height: 36px;
  margin: 0 auto 16px;
  border: 3px solid var(--border-light);
  border-top-color: var(--success);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-title {
  margin: 0 0 10px;
  font-family: var(--font-hand);
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 2px;
}

.loading-file {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}

.loading-progress-bar {
  width: 100%;
  height: 6px;
  margin-top: 10px;
  background: var(--border-light);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--success), var(--info));
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>