// ============================================================
// Supabase Edge Function: get-leaderboard
// ============================================================
// 功能：返回全局排行榜
// 调用时机：GameOverModal 展示时、玩家点击"查看排行榜"时
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  score: number;
  survival_time: number;
  total_games: number;
}

Deno.serve(async (req: Request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers, status: 204 });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { headers, status: 405 }
    );
  }

  try {
    // 解析查询参数
    const url = new URL(req.url);
    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get("limit") || "20")),
      100
    );
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"));
    const deviceId = url.searchParams.get("device_id") || null;

    // 查询排行榜（使用视图）
    let query = supabase
      .from("leaderboard")
      .select("*")
      .order("rank", { ascending: true })
      .limit(limit)
      .range(offset, offset + limit - 1);

    const { data: leaderboard, error, count } = await query;

    if (error) {
      console.error("Leaderboard query error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to fetch leaderboard" }),
        { headers, status: 500 }
      );
    }

    // 如果需要查找特定玩家的排名
    let playerRank: LeaderboardEntry | null = null;
    if (deviceId) {
      const { data: playerData } = await supabase
        .from("leaderboard")
        .select("*")
        .eq("device_id", deviceId)
        .single();

      if (playerData) {
        playerRank = playerData;
      }
    }

    // 总参与人数
    const { count: totalPlayers } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .gte("total_games", 1);

    return new Response(
      JSON.stringify({
        leaderboard: leaderboard || [],
        player_rank: playerRank,
        total_players: totalPlayers || 0,
        limit,
        offset,
      }),
      { headers, status: 200 }
    );
  } catch (err) {
    console.error("get-leaderboard error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers, status: 500 }
    );
  }
});
