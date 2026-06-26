# 排行榜得分/时间/ID 问题的两次修复

## 问题1：得分和时间为 0（已修复）

**根因：** `GameOverModal.vue` 使用 `onMounted` 触发 `trySubmitScore()`，而组件在游戏开始时就挂载（非 gameOver 时），导致：
- 教程模式：`gameStarted=false` → `submitDone=true` 锁死，真正的 gameOver 时跳过提交
- 非教程模式：挂载时提交了 score=0/survivalTime=0，后续无法覆盖

**修复：** `onMounted` → `watch(gameStore.state.gameOver)`，只在 gameOver=true 时提交，gameOver=false 时重置状态。

## 问题2：游戏结束后 player ID 不显示（刚修复）

**根因有两个：**

### 根因 A：竞态条件
GameOverModal 的"查看排行"按钮在分数提交期间可点击。玩家在 HTTP 请求返回前打开 LeaderboardModal → 数据库尚无 game_session → `player_rank = null` → my-rank-banner 不渲染。

**修复：** 提交期间 disabled 所有操作按钮。

### 根因 B：device_id 不一致（致命 Bug）
`src/composables/useDeviceId.ts` 中，当 localStorage 不可用时（CloudStudio iframe / 隐私模式），`catch` 分支每次调用 `getDeviceId()` 都生成**不同的 UUID**：

```typescript
// 修复前 — 每次返回随机值！
catch {
  return generateUUID()  // 每次调用都是新的 UUID
}
```

这导致：
1. `updateNickname()` → device_id = "AAA-111"
2. `startSession()` → device_id = "BBB-222"（发给 Edge Function）
3. `fetchLeaderboard()` → device_id = "CCC-333"（查询时永远找不到自己）

**修复：** catch 分支也缓存 UUID：

```typescript
catch {
  if (!cachedDeviceId) {
    cachedDeviceId = generateUUID()
  }
  return cachedDeviceId
}
```

## 改动文件
1. `src/components/GameOverModal.vue` — watch + 按钮 disabled
2. `src/composables/useDeviceId.ts` — device_id 缓存修复
