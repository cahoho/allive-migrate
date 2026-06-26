@'
========================================================================
  众生迁徙 (Allive Migration) — 数据库一键配置脚本
========================================================================
请在 Supabase Dashboard 中执行以下操作：

第 1 步：获取 Access Token（1 分钟）
  → 打开 https://supabase.com/dashboard/account/tokens
  → 点击 "Generate new token"，名称填 allive-migrate
  → 复制生成的 token

第 2 步：在本终端运行配置命令（替换 YOUR_TOKEN）
  set SUPABASE_ACCESS_TOKEN=YOUR_TOKEN
  npx supabase link --project-ref xqjonnyygbikbcansebam
  npx supabase db push
  npx supabase functions deploy start-session
  npx supabase functions deploy submit-score
  npx supabase functions deploy get-leaderboard

第 3 步：设置 Edge Function 密钥
  → 打开 https://supabase.com/dashboard/project/xqjonnyygbikbcansebam/settings/functions
  → 添加 Secret: SESSION_SECRET = 一个随机字符串（至少 32 字符）
     例如：npx supabase secrets set SESSION_SECRET="allive-migrate-2025-secret-key-change-this"

或者，你也可以直接在 Supabase SQL Editor 中手动执行 SQL 迁移：
  → 打开 https://supabase.com/dashboard/project/xqjonnyygbikbcansebam/sql/new
  → 粘贴 supabase/migrations/20240625000001_create_tables.sql 的全部内容
  → 点击 Run

========================================================================
'@
Write-Host "配置指南已准备好"
