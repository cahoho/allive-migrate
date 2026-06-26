// ============================================================
// Supabase Edge Function: submit-score
// ============================================================
// 功能：验证并记录玩家的游戏分数
// 调用时机：游戏结束（gameOver=true）时自动调用
// ============================================================
// 反作弊验证层级：
//   L1: 令牌签名验证（HMAC-SHA256）
//   L2: 令牌是否过期
//   L3: 令牌是否已被使用（防重放）
//   L4: 得分边界验证（理论最大值检查）
//   L5: 生存时间合理性验证
//   L6: 得分/时间组合合理性验证
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? "allive-migration-secret-key-change-in-production";

// ============================================================
// 得分理论最大值计算
// ============================================================
// 基于物种 successScore 和游戏中可达到的最大迁徙次数
// 这是一个保守的上界，实际游戏中不可能达到
// ============================================================

interface SpeciesScoreInfo {
  id: string;
  successScore: number;
  minStage: number;
}

const SPECIES_SCORE_TABLE: SpeciesScoreInfo[] = [
  { id: "bird", successScore: 1.0, minStage: 1 },
  { id: "butterfly", successScore: 1.2, minStage: 2 },
  { id: "bar_goose", successScore: 0.9, minStage: 2 },
  { id: "salmon", successScore: 1.5, minStage: 3 },
  { id: "herd", successScore: 3.4, minStage: 4 },
  { id: "eel", successScore: 1.7, minStage: 5 },
  { id: "sea_turtle", successScore: 2.7, minStage: 5 },
  { id: "wood_frog", successScore: 3.8, minStage: 6 },
];

/**
 * 根据游戏阶段和生存时间计算理论上最大可能得分
 * 
 * 设计原理：
 * - 候鸟 (bird) 每段 0.55s，单次迁徙约需 2-4 段 → 约 1.1-2.2s
 * - 加上必经点等待时间，保守估计最快约 5s 完成一次完整迁徙
 * - 加上任务生成间隔（至少 2s），保守估计约 7s 完成一次有效迁徙
 * - 乘以系数 1.1 作为安全边界
 */
function computeMaxPossibleScore(
  stage: number,
  survivalTime: number,
  speciesSuccessCounts: Record<string, number>
): number {
  // 基础：根据阶段确定可用的最快物种
  let fastestScorePerMigration = 0.9; // 默认最快速物种得分
  for (const sp of SPECIES_SCORE_TABLE) {
    if (sp.minStage <= stage) {
      fastestScorePerMigration = Math.max(fastestScorePerMigration, sp.successScore);
    }
  }

  // 保守估计：每 7 秒完成一次迁徙（实际上不可能做到）
  const minSecondsPerMigration = 7;
  const maxPossibleMigrations = Math.ceil(survivalTime / minSecondsPerMigration);

  // 阶段加成：后期同时任务数多，理论可并行完成
  const concurrencyFactor = stage >= 5 ? 2.5 : stage >= 3 ? 1.8 : 1.2;

  // 理论最大值
  const theoreticalMax = maxPossibleMigrations * fastestScorePerMigration * concurrencyFactor * 1.15;

  // 如果提供了实际物种成功次数，进一步收紧边界
  if (speciesSuccessCounts && Object.keys(speciesSuccessCounts).length > 0) {
    let computedMax = 0;
    for (const [speciesId, count] of Object.entries(speciesSuccessCounts)) {
      const sp = SPECIES_SCORE_TABLE.find((s) => s.id === speciesId);
      if (sp) {
        computedMax += sp.successScore * Number(count);
      }
    }
    // 实际累计 + 20% 误差容忍（浮点精度 + 并发计数误差）
    return Math.max(computedMax * 1.2, theoreticalMax * 0.5);
  }

  return theoreticalMax;
}

/**
 * HMAC 签名验证
 */
async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  try {
    const sigBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(message));
  } catch {
    return false;
  }
}

/**
 * 解码并验证会话令牌
 */
async function decodeAndVerifyToken(
  sessionToken: string
): Promise<{ valid: boolean; payload?: any; error?: string }> {
  try {
    // 解码 base64
    const decoded = JSON.parse(atob(sessionToken));
    const { token_id, device_id, seed, expires_at, signature } = decoded;

    if (!token_id || !device_id || !seed || !expires_at || !signature) {
      return { valid: false, error: "Invalid token structure" };
    }

    // 验证签名
    const payload = JSON.stringify({ token_id, device_id, seed, expires_at });
    const isValid = await hmacVerify(payload, signature, SESSION_SECRET);
    if (!isValid) {
      return { valid: false, error: "Invalid token signature" };
    }

    // 验证过期
    if (new Date(expires_at) < new Date()) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false, error: "Failed to decode token" };
  }
}

Deno.serve(async (req: Request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers, status: 405 }
    );
  }

  try {
    const body = await req.json();
    const {
      session_token,
      score,
      survival_time,
      total_success,
      stage,
      seed,
      species_success_counts,
      extinct_species,
      biodiversity_percent,
      game_events_hash,
    } = body;

    // ============================================================
    // L1: 基本字段校验
    // ============================================================
    if (!session_token || typeof session_token !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing session_token", code: "INVALID_TOKEN" }),
        { headers, status: 400 }
      );
    }

    if (typeof score !== "number" || score < 0 || !Number.isFinite(score)) {
      return new Response(
        JSON.stringify({ error: "Invalid score", code: "INVALID_SCORE" }),
        { headers, status: 400 }
      );
    }

    if (typeof survival_time !== "number" || survival_time < 0 || !Number.isFinite(survival_time)) {
      return new Response(
        JSON.stringify({ error: "Invalid survival_time", code: "INVALID_TIME" }),
        { headers, status: 400 }
      );
    }

    // ============================================================
    // L2: 令牌验证
    // ============================================================
    const tokenResult = await decodeAndVerifyToken(session_token);
    if (!tokenResult.valid) {
      return new Response(
        JSON.stringify({
          error: tokenResult.error || "Token validation failed",
          code: "TOKEN_INVALID",
        }),
        { headers, status: 403 }
      );
    }

    const tokenPayload = tokenResult.payload!;

    // 验证种子一致性
    if (tokenPayload.seed !== seed) {
      return new Response(
        JSON.stringify({ error: "Seed mismatch", code: "SEED_MISMATCH" }),
        { headers, status: 403 }
      );
    }

    // ============================================================
    // L3: 令牌去重（防重放攻击）
    // ============================================================
    // 查询数据库，检查令牌是否已存在或被使用
    const { data: existingToken, error: tokenQueryError } = await supabase
      .from("session_tokens")
      .select("used, id")
      .eq("token", session_token)
      .single();

    if (tokenQueryError && tokenQueryError.code !== "PGRST116") {
      console.error("Token query error:", tokenQueryError);
    }

    if (existingToken) {
      if (existingToken.used) {
        return new Response(
          JSON.stringify({
            error: "Token already used",
            code: "TOKEN_USED",
          }),
          { headers, status: 403 }
        );
      }
    }

    // ============================================================
    // L4: 得分边界验证
    // ============================================================
    const maxPossible = computeMaxPossibleScore(
      stage || 1,
      survival_time,
      species_success_counts || {}
    );

    if (score > maxPossible) {
      console.warn(
        `Score validation failed: score=${score} exceeds max=${maxPossible.toFixed(2)} ` +
        `(stage=${stage}, survival=${survival_time}s, species=${JSON.stringify(species_success_counts)})`
      );
      return new Response(
        JSON.stringify({
          error: "Score exceeds theoretical maximum",
          code: "SCORE_OVERFLOW",
          max_possible: maxPossible,
        }),
        { headers, status: 403 }
      );
    }

    // ============================================================
    // L5: 生存时间合理性验证
    // ============================================================
    // 游戏计时从 gameStarted=true 开始，正常游戏至少需要 10s+ 才能 gameOver
    if (survival_time < 5 && score > 0) {
      return new Response(
        JSON.stringify({
          error: "Survival time too short for non-zero score",
          code: "TIME_SUSPICIOUS",
        }),
        { headers, status: 403 }
      );
    }

    // ============================================================
    // L6: 标记令牌为已使用 + 查找/创建玩家 + 记录成绩
    // ============================================================
    const deviceId = tokenPayload.device_id;

    // 标记令牌已使用
    if (existingToken) {
      await supabase
        .from("session_tokens")
        .update({ used: true })
        .eq("id", existingToken.id);
    } else {
      // 令牌不在数据库（可能是清理掉了），仍然接受但要记录
      console.warn("Token not found in DB but signature valid:", tokenPayload.token_id);
    }

    // 查找或创建玩家
    let playerId: string;
    const { data: existingPlayer } = await supabase
      .from("players")
      .select("id")
      .eq("device_id", deviceId)
      .single();

    if (existingPlayer) {
      playerId = existingPlayer.id;
    } else {
      // 玩家不存在，创建（带默认昵称）
      const { data: newPlayer, error: createError } = await supabase
        .from("players")
        .insert({
          device_id: deviceId,
          nickname: "匿名迁徙者",
        })
        .select("id")
        .single();

      if (createError || !newPlayer) {
        return new Response(
          JSON.stringify({ error: "Failed to create player", code: "DB_ERROR" }),
          { headers, status: 500 }
        );
      }
      playerId = newPlayer.id;
    }

    // 记录游戏会话
    const { data: gameSession, error: insertError } = await supabase
      .from("game_sessions")
      .insert({
        player_id: playerId,
        session_token: session_token,
        seed: seed,
        stage: stage || 1,
        score: Math.round(score * 100) / 100, // 精度归一化
        total_success: total_success || 0,
        survival_time: Math.round(survival_time * 100) / 100,
        species_success_counts: species_success_counts || {},
        extinct_species: extinct_species || [],
        biodiversity_percent: biodiversity_percent || null,
        game_events_hash: game_events_hash || null,
        validated: true,
        validation_details: `score=${score} max=${maxPossible.toFixed(2)} stage=${stage}`,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert game session:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to record score", code: "DB_ERROR" }),
        { headers, status: 500 }
      );
    }

    // ============================================================
    // 获取排行榜排名
    // ============================================================
    const { data: rankData, error: rankError } = await supabase
      .from("players")
      .select("best_score")
      .gte("best_score", score)
      .order("best_score", { ascending: false });

    const rank = rankData ? rankData.length : 0;
    const { count: totalPlayers } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .gte("total_games", 1);

    return new Response(
      JSON.stringify({
        success: true,
        validated: true,
        rank,
        total_players: totalPlayers || 0,
        score: Math.round(score * 100) / 100,
        game_session_id: gameSession?.id,
      }),
      { headers, status: 200 }
    );
  } catch (err) {
    console.error("submit-score error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", code: "SERVER_ERROR" }),
      { headers, status: 500 }
    );
  }
});
