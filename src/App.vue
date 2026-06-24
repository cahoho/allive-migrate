<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import TopBar from './components/TopBar.vue'
import GameMap from './components/GameMap.vue'
import SpeciesPanel from './components/SpeciesPanel.vue'
import GameOverModal from './components/GameOverModal.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'
import { gameStore } from './store/gameStore'
import { useGameLoop } from './composables/useGameLoop'
import { unlockAudio, pauseAllBackgrounds, resumeAllBackgrounds } from './systems/audioManager'

useGameLoop()

function onVisibilityChange() {
  // 浏览器切到后台 / 切回前台：暂停 / 恢复所有背景音乐
  // 暂停原因（教程等）由 gameStore.isGameplayPaused 控制主循环
  // 音频这一层只负责"页面可见性"
  if (document.hidden) {
    pauseAllBackgrounds()
  } else {
    resumeAllBackgrounds()
  }
}

onMounted(() => {
  // v12：initGame 后直接进入分步引导（替代 v11 的整屏说明弹窗）
  gameStore.initGame()
  // 启动 intro 引导
  gameStore.startTutorial()

  // 浏览器自动播放策略：第一次用户手势之后才能真正播放音频
  // 挂在 capture 阶段，确保拖线 / 点 marker 之前就能解锁
  const onFirstInteract = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', onFirstInteract, true)
    window.removeEventListener('keydown', onFirstInteract, true)
  }
  window.addEventListener('pointerdown', onFirstInteract, true)
  window.addEventListener('keydown', onFirstInteract, true)

  // 页面可见性切换：暂停 / 恢复所有背景音乐
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="app-root">
    <TopBar />
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

    <!-- v12：分步小窗引导（高亮圈点） -->
    <TutorialOverlay />
    <GameOverModal />
  </div>
</template>
