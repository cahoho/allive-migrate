# 项目长期记忆 — Allive Migration

## 技术栈
- Vue 3 + TypeScript + Vite + Pinia（自建 reactive store）
- Supabase（PostgreSQL + Edge Functions）
- 纯前端游戏，无后端框架

## 数据库系统
- 平台: Supabase（免费 500MB PostgreSQL）
- 表: players, game_sessions, session_tokens, leaderboard view
- 6 层反作弊: HMAC签名 → 令牌去重 → 得分边界 → 时间合理性 → RLS → 边缘函数验证
- 3 个 Edge Functions: start-session, submit-score, get-leaderboard
- 离线模式: 未配置 Supabase 时游戏完全可用，仅无排行榜

## 玩法数据
- 8 物种: bird/butterfly/bar_goose/salmon/herd/eel/sea_turtle/wood_frog
- 得分严格分离: totalSuccess(整数次数) vs score(加权浮点)
- 阶段解锁: STAGE_UNLOCK_SCORES = [2,5,9,13,18]
- 物种多样性失败判定: ≤33.3%
- SPECIES_EXTINCTION_FAILURES = 3

## 项目规范
- 用户偏好直接执行方案，不要 A/B 选项
- 修改前必读文件，改动后必构建验证
- 修改文件不超出需求范围
- 每完成一步记录日志
