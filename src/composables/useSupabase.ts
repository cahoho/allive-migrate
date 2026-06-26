// ============================================================
// useSupabase - 游戏数据库操作
// ============================================================
// 封装 Supabase Edge Functions 调用和数据库直连操作
// 
// 反作弊流程：
// 1. 游戏开始 → startSession() 获取签名令牌 + 服务端种子
// 2. 游戏进行 → 客户端记录游戏事件
// 3. 游戏结束 → submitScore() 提交分数 + 令牌验证
// 4. 排行榜   → fetchLeaderboard() 获取全服排行
// ============================================================

import { supabase, getFunctionUrl, isSupabaseConfigured, getAnonKey } from "../supabase/client"
import { useDeviceId } from "./useDeviceId"
import type {
  StartSessionResponse,
  SubmitScoreResponse,
  LeaderboardResponse,
  LeaderboardEntry,
  GameEventLog,
} from "../supabase/types"

/**
 * 错误代码枚举
 */
export const ScoreErrorCode = {
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_INVALID: "TOKEN_INVALID",
  TOKEN_USED: "TOKEN_USED",
  SEED_MISMATCH: "SEED_MISMATCH",
  SCORE_OVERFLOW: "SCORE_OVERFLOW",
  TIME_SUSPICIOUS: "TIME_SUSPICIOUS",
  INVALID_SCORE: "INVALID_SCORE",
  INVALID_TIME: "INVALID_TIME",
  SERVER_ERROR: "SERVER_ERROR",
  DB_ERROR: "DB_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  NOT_CONFIGURED: "NOT_CONFIGURED",
} as const

export interface ScoreError {
  error: string
  code: string
  maxPossible?: number
}

export function useSupabase() {
  const { getDeviceId, getSavedNickname, saveNickname } = useDeviceId()

  /**
   * Edge Function 调用必需的请求头
   * Supabase Edge Functions 默认需要 Authorization: Bearer <anonKey>
   */
  function authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAnonKey()}`,
    }
  }

  /**
   * 开始新游戏会话
   * 
   * 调用时机：玩家点击"开始游戏"时
   * 
   * @returns 包含 session_token, seed, expires_at
   */
  async function startSession(): Promise<StartSessionResponse> {
    if (!isSupabaseConfigured()) {
      // 离线模式：使用本地种子
      return {
        session_token: "offline-session-" + Date.now(),
        seed: Math.floor(Math.random() * 2147483647),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      }
    }

    const deviceId = getDeviceId()
    const url = getFunctionUrl("start-session")

    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ device_id: deviceId }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Failed to start session")
    }

    return await response.json()
  }

  /**
   * 提交游戏分数
   * 
   * 调用时机：gameOver=true 时自动调用
   * 
   * @returns 验证结果 + 排行榜排名
   */
  async function submitScore(params: {
    sessionToken: string
    score: number
    survivalTime: number
    totalSuccess: number
    stage: number
    seed: number
    speciesSuccessCounts: Record<string, number>
    extinctSpecies: string[]
    biodiversityPercent: number
    gameEventLog?: GameEventLog
  }): Promise<{ success: boolean; response?: SubmitScoreResponse; error?: ScoreError }> {
    if (!isSupabaseConfigured()) {
      // 离线模式：模拟成功
      return {
        success: true,
        response: {
          success: true,
          validated: false,
          rank: 0,
          total_players: 0,
          score: params.score,
        },
      }
    }

    // 生成游戏事件哈希（用于反作弊验证的额外证据）
    const gameEventsHash = await hashGameEvents(params.gameEventLog || {
      seed: params.seed,
      stage: params.stage,
      totalSuccess: params.totalSuccess,
      score: params.score,
      survivalTime: params.survivalTime,
      speciesSuccessCounts: params.speciesSuccessCounts,
      extinctSpecies: params.extinctSpecies,
      biodiversityPercent: params.biodiversityPercent,
      timestamp: Date.now(),
    })

    const url = getFunctionUrl("submit-score")

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          session_token: params.sessionToken,
          score: params.score,
          survival_time: params.survivalTime,
          total_success: params.totalSuccess,
          stage: params.stage,
          seed: params.seed,
          species_success_counts: params.speciesSuccessCounts,
          extinct_species: params.extinctSpecies,
          biodiversity_percent: params.biodiversityPercent,
          game_events_hash: gameEventsHash,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          success: false,
          error: {
            error: data.error || "Score submission failed",
            code: data.code || ScoreErrorCode.SERVER_ERROR,
            maxPossible: data.max_possible,
          },
        }
      }

      return { success: true, response: data as SubmitScoreResponse }
    } catch (err) {
      return {
        success: false,
        error: {
          error: "Network error: " + (err instanceof Error ? err.message : String(err)),
          code: ScoreErrorCode.NETWORK_ERROR,
        },
      }
    }
  }

  /**
   * 获取全服排行榜
   * 
   * @param limit 返回条数（默认 20，最大 100）
   * @param offset 偏移量
   */
  async function fetchLeaderboard(limit = 20, offset = 0): Promise<{
    success: boolean
    data?: LeaderboardResponse
    error?: string
  }> {
    if (!isSupabaseConfigured()) {
      return {
        success: true,
        data: {
          leaderboard: [],
          player_rank: null,
          total_players: 0,
          limit,
          offset,
        },
      }
    }

    const deviceId = getDeviceId()
    const url = getFunctionUrl("get-leaderboard")
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      device_id: deviceId,
    })

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: { Authorization: `Bearer ${getAnonKey()}` },
      })
      const data = await response.json()

      if (!response.ok) {
        return { success: false, error: data.error || "Failed to fetch leaderboard" }
      }

      return { success: true, data: data as LeaderboardResponse }
    } catch (err) {
      return {
        success: false,
        error: "Network error: " + (err instanceof Error ? err.message : String(err)),
      }
    }
  }

  /**
   * 更新玩家昵称
   * 
   * 逻辑：先查 device_id 是否存在 → 存在则 UPDATE，不存在则 INSERT。
   * 不能依赖 UPDATE 返回的 error 判断"没匹配到行"，
   * 因为 Supabase 在 0 行匹配时返回 error: null（不是 error）。
   */
  async function updateNickname(nickname: string): Promise<boolean> {
    saveNickname(nickname)

    if (!isSupabaseConfigured()) {
      return true
    }

    const deviceId = getDeviceId()

    try {
      // 先查是否存在
      const { data: existing, error: queryError } = await supabase
        .from("players")
        .select("id")
        .eq("device_id", deviceId)
        .single()

      if (queryError && queryError.code !== "PGRST116") {
        // PGRST116 = "No rows found" — 这是预期情况，不报错
        console.warn("Failed to query player:", queryError)
      }

      if (existing) {
        // 玩家已存在 → 更新昵称
        const { error: updateError } = await supabase
          .from("players")
          .update({ nickname, updated_at: new Date().toISOString() })
          .eq("id", existing.id)

        if (updateError) {
          console.warn("Failed to update player nickname:", updateError)
          return false
        }
      } else {
        // 新玩家 → 创建记录
        const { error: insertError } = await supabase
          .from("players")
          .insert({
            device_id: deviceId,
            nickname,
          })

        if (insertError) {
          console.warn("Failed to insert player:", insertError)
          return false
        }
      }

      return true
    } catch (err) {
      console.warn("Failed to update nickname:", err)
      return false
    }
  }

  return {
    startSession,
    submitScore,
    fetchLeaderboard,
    updateNickname,
    getDeviceId,
    getSavedNickname,
    saveNickname,
    isConfigured: isSupabaseConfigured,
  }
}

/**
 * 生成游戏事件哈希（SHA-256）
 * 用于服务端抽查验证：如果服务端重放事件能得到相同哈希，说明事件未被篡改
 */
async function hashGameEvents(log: GameEventLog): Promise<string> {
  const encoder = new TextEncoder()
  // 按固定顺序序列化，确保一致性
  const normalized = JSON.stringify({
    seed: log.seed,
    stage: log.stage,
    totalSuccess: log.totalSuccess,
    score: Math.round(log.score * 100) / 100,
    survivalTime: Math.round(log.survivalTime * 100) / 100,
    speciesSuccessCounts: Object.keys(log.speciesSuccessCounts)
      .sort()
      .reduce((acc, key) => {
        acc[key] = log.speciesSuccessCounts[key]
        return acc
      }, {} as Record<string, number>),
    extinctSpecies: [...log.extinctSpecies].sort(),
    biodiversityPercent: log.biodiversityPercent,
    timestamp: log.timestamp,
  })

  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
