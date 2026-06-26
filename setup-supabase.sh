#!/usr/bin/env bash
# ============================================================
# 众生迁徙 — Supabase 一键配置脚本
# 使用方法：
#   1. 设置你的 access token（从 https://supabase.com/dashboard/account/tokens 获取）
#   2. 运行：bash setup-supabase.sh
# ============================================================

set -e

PROJECT_REF="pzufflfqbeubpdoovawp"
SESSION_SECRET="allive-migrate-$(date +%s | sha256sum | head -c 32)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${RED}错误: 请先设置 SUPABASE_ACCESS_TOKEN 环境变量${NC}"
    echo ""
    echo "获取 token: https://supabase.com/dashboard/account/tokens"
    echo ""
    echo "设置方法:"
    echo "  export SUPABASE_ACCESS_TOKEN=\"sbp_xxxx...\""
    echo "  然后重新运行此脚本"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  众生迁徙 Supabase 一键配置${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Step 1: Link project
echo -e "${YELLOW}[1/4] 链接 Supabase 项目...${NC}"
npx supabase link --project-ref "$PROJECT_REF"
echo -e "${GREEN}✓ 项目已链接${NC}"

# Step 2: Push database migration
echo ""
echo -e "${YELLOW}[2/4] 执行数据库迁移...${NC}"
npx supabase db push
echo -e "${GREEN}✓ 数据库迁移完成${NC}"

# Step 3: Set secrets
echo ""
echo -e "${YELLOW}[3/4] 设置 Edge Function 密钥...${NC}"
npx supabase secrets set SESSION_SECRET="$SESSION_SECRET"
echo -e "${GREEN}✓ SESSION_SECRET 已设置${NC}"

# Step 4: Deploy Edge Functions
echo ""
echo -e "${YELLOW}[4/4] 部署 Edge Functions...${NC}"
npx supabase functions deploy start-session
npx supabase functions deploy submit-score
npx supabase functions deploy get-leaderboard
echo -e "${GREEN}✓ Edge Functions 已部署${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  全部完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "前端地址: https://17f5d5471196481d89fcd0ef081287f4.app.codebuddy.work"
echo ""
echo "验证 Edge Functions:"
echo "  npx supabase functions list"
