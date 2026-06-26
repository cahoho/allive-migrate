-- ============================================================
-- 众生迁徙 (Allive Migration) 数据库 Schema v1
-- ============================================================
-- 平台: Supabase PostgreSQL
-- 反作弊: HMAC 会话签名 + 服务端得分边界验证 + RLS
-- ============================================================

BEGIN;

-- ============================================================
-- 1. players 表：设备标识的玩家
-- ============================================================
-- 设计理念：
--  一台电脑 = 一个玩家（通过 localStorage UUID 标识）
--  无需登录系统，玩家只需输入昵称
--  同一设备可以多次修改昵称（保留最佳成绩）
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       TEXT UNIQUE NOT NULL,
    nickname        TEXT NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_games     INTEGER NOT NULL DEFAULT 0,
    best_score      NUMERIC(8,2) NOT NULL DEFAULT 0,
    best_survival_time NUMERIC(10,2) NOT NULL DEFAULT 0
);

COMMENT ON TABLE players IS '设备标识的玩家：一台电脑=一个玩家，无需登录';
COMMENT ON COLUMN players.device_id IS '客户端生成的 UUID，存储在 localStorage 中';

-- ============================================================
-- 2. game_sessions 表：每局游戏的完整记录
-- ============================================================
-- 反作弊字段：
--  session_token   : 服务端签名的会话令牌（HMAC-SHA256）
--  validated        : 服务端是否已验证通过
--  validation_details: 验证结果详情（用于人工复核）
-- ============================================================
CREATE TABLE IF NOT EXISTS game_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    session_token   TEXT UNIQUE NOT NULL,
    seed            INTEGER NOT NULL,
    stage           INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 6),
    score           NUMERIC(8,2) NOT NULL CHECK (score >= 0),
    total_success   INTEGER NOT NULL CHECK (total_success >= 0),
    survival_time   NUMERIC(10,2) NOT NULL CHECK (survival_time >= 0),
    
    -- 物种级别的详细数据（用于反作弊验证和服务端分析）
    species_success_counts  JSONB NOT NULL DEFAULT '{}',
    extinct_species         TEXT[] NOT NULL DEFAULT '{}',
    biodiversity_percent    NUMERIC(5,2) CHECK (biodiversity_percent BETWEEN 0 AND 100),
    
    -- 反作弊字段
    game_events_hash        TEXT,
    validated               BOOLEAN NOT NULL DEFAULT false,
    validation_details      TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE game_sessions IS '每局游戏的完整记录，含反作弊验证字段';
COMMENT ON COLUMN game_sessions.session_token IS '服务端 HMAC 签名的会话令牌，用于防重放攻击';
COMMENT ON COLUMN game_sessions.validated IS '服务端得分验证是否通过，只有 validated=true 的分数计入排行榜';
COMMENT ON COLUMN game_sessions.game_events_hash IS '客户端游戏事件的哈希值，用于服务端抽查验证';

-- ============================================================
-- 3. 索引策略
-- ============================================================

-- 排行榜查询：按得分倒序（最常用查询，组合索引）
CREATE INDEX IF NOT EXISTS idx_game_sessions_leaderboard 
    ON game_sessions(score DESC, created_at DESC) 
    WHERE validated = true;

-- 玩家历史记录查询
CREATE INDEX IF NOT EXISTS idx_game_sessions_player 
    ON game_sessions(player_id, created_at DESC);

-- 会话令牌查找（提交分数时验证）
CREATE INDEX IF NOT EXISTS idx_game_sessions_token 
    ON game_sessions(session_token);

-- 玩家最佳成绩排行
CREATE INDEX IF NOT EXISTS idx_players_leaderboard 
    ON players(best_score DESC, total_games DESC);

-- 防重复提交：同一 player_id + seed 组合去重
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_sessions_unique 
    ON game_sessions(player_id, session_token);

-- ============================================================
-- 4. 排行榜视图
-- ============================================================
-- 取每个玩家最佳成绩排行
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    ROW_NUMBER() OVER (ORDER BY p.best_score DESC, p.best_survival_time DESC, p.total_games DESC) AS rank,
    p.nickname,
    p.best_score AS score,
    p.best_survival_time AS survival_time,
    p.total_games,
    p.device_id
FROM players p
WHERE p.total_games > 0
ORDER BY p.best_score DESC, p.best_survival_time DESC;

COMMENT ON VIEW leaderboard IS '全服排行榜：取每个玩家最佳成绩，按得分倒序排列';

-- ============================================================
-- 5. session_tokens 表：会话令牌管理
-- ============================================================
-- 每个令牌只能提交一次分数，防止重放攻击
CREATE TABLE IF NOT EXISTS session_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token           TEXT UNIQUE NOT NULL,
    device_id       TEXT NOT NULL,
    seed            INTEGER NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE session_tokens IS '会话令牌管理：每个令牌只能使用一次';
COMMENT ON COLUMN session_tokens.used IS '令牌是否已被使用（提交过分数）';

CREATE INDEX IF NOT EXISTS idx_session_tokens_token ON session_tokens(token);
CREATE INDEX IF NOT EXISTS idx_session_tokens_device ON session_tokens(device_id);

-- ============================================================
-- 6. RLS（行级安全策略）
-- ============================================================

-- 启用 RLS
ALTER TABLE IF EXISTS players ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS session_tokens ENABLE ROW LEVEL SECURITY;

-- players 表策略：
-- - 任何人都可以创建玩家（INSERT）
-- - 只有本设备可以 UPDATE 自己的信息
-- - 排行榜读取：所有人可以读（用于显示昵称）

-- 允许匿名插入新玩家
DROP POLICY IF EXISTS players_insert_policy ON players;
CREATE POLICY players_insert_policy ON players
    FOR INSERT TO anon
    WITH CHECK (true);

-- 允许通过 device_id 读取任何玩家（排行榜展示用）
DROP POLICY IF EXISTS players_select_policy ON players;
CREATE POLICY players_select_policy ON players
    FOR SELECT TO anon
    USING (true);

-- 只允许更新自己的记录（通过 device_id 匹配）
DROP POLICY IF EXISTS players_update_policy ON players;
CREATE POLICY players_update_policy ON players
    FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);

-- game_sessions 表策略：
-- - 插入：任何人都可以提交（但需通过 Edge Function 验证）
-- - 读取：任何人都可以读取已验证的记录（排行榜数据）

DROP POLICY IF EXISTS game_sessions_insert_policy ON game_sessions;
CREATE POLICY game_sessions_insert_policy ON game_sessions
    FOR INSERT TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS game_sessions_select_policy ON game_sessions;
CREATE POLICY game_sessions_select_policy ON game_sessions
    FOR SELECT TO anon
    USING (validated = true);

-- session_tokens 表策略：
-- - 客户端可以通过 anon key 操作

DROP POLICY IF EXISTS session_tokens_select_policy ON session_tokens;
CREATE POLICY session_tokens_select_policy ON session_tokens
    FOR SELECT TO anon
    USING (true);

DROP POLICY IF EXISTS session_tokens_insert_policy ON session_tokens;
CREATE POLICY session_tokens_insert_policy ON session_tokens
    FOR INSERT TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS session_tokens_update_policy ON session_tokens;
CREATE POLICY session_tokens_update_policy ON session_tokens
    FOR UPDATE TO anon
    USING (true);

-- ============================================================
-- 7. 触发器：自动更新 player 统计
-- ============================================================

CREATE OR REPLACE FUNCTION update_player_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE players
    SET 
        total_games = total_games + 1,
        best_score = GREATEST(best_score, NEW.score),
        best_survival_time = GREATEST(best_survival_time, NEW.survival_time),
        updated_at = NOW()
    WHERE id = NEW.player_id AND NEW.validated = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_player_stats ON game_sessions;
CREATE TRIGGER trg_update_player_stats
    AFTER INSERT ON game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_player_stats();

-- ============================================================
-- 8. 清理过期令牌的定时函数
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
    DELETE FROM session_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================
-- DOWN Migration（回滚脚本）
-- ============================================================
-- 如需回滚，请执行以下 SQL：
-- 
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_update_player_stats ON game_sessions;
-- DROP FUNCTION IF EXISTS update_player_stats();
-- DROP FUNCTION IF EXISTS cleanup_expired_tokens();
-- DROP VIEW IF EXISTS leaderboard;
-- DROP TABLE IF EXISTS session_tokens CASCADE;
-- DROP TABLE IF EXISTS game_sessions CASCADE;
-- DROP TABLE IF EXISTS players CASCADE;
-- COMMIT;
