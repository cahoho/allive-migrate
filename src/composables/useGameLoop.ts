// 动态游戏主循环
// 阶段 1 不切换风险；阶段 2 开始每 SEASON_INTERVAL 切换一次
// 季节只影响新提交的路线（已迁徙中路线不受影响）
//
// 关键修复：人类系统推进（tickHumanField / humanFieldVersion）由 gameStore.tickGame 唯一负责
// useGameLoop 不再单独调用 tickHumanField，避免双倍 dt 导致性能问题
//
// v11：
// - elapsedTime 仅在游戏开始后累加（玩法窗口期间 = 0）
// - survivalTime 在游戏开始后单独累加，作为"坚持时间"
//   - 用于顶部状态栏显示 / 结束面板显示
//   - 暂停 / 未开始 / gameOver 时不累加
import { onBeforeUnmount } from 'vue'
import { gameStore } from '../store/gameStore'

export function useGameLoop() {
  let lastTs = performance.now()
  let rafId = 0

  function tick(now: number) {
    const dtRaw = (now - lastTs) / 1000
    // 防止页面卡顿后单帧大跳跃
    const dt = Math.min(0.1, dtRaw)
    lastTs = now

    // v11：游戏未开始 / 已结束 / 暂停原因集合非空时，不累加任何时间
    // - elapsedTime / survivalTime：暂停期间冻结
    // - tickGame 内部还会有第二道安全保护（isGameplayPaused 守卫）
    const isRunning =
      gameStore.state.gameStarted &&
      !gameStore.state.gameOver &&
      !gameStore.isGameplayPaused()
    if (isRunning) {
      gameStore.state.elapsedTime += dt
      gameStore.state.survivalTime += dt
    }

    gameStore.tickGame(dt)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  onBeforeUnmount(() => {
    cancelAnimationFrame(rafId)
  })
}
