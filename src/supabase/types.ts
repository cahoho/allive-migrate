// ============================================================
// Supabase 数据库类型定义
// ============================================================
// 与 supabase/migrations/20240625000001_create_tables.sql 保持一致

export interface Player {
  id: string
  device_id: string
  nickname: string
  created_at: string
  updated_at: string
  total_games: number
  best_score: number
  best_survival_time: number
}

export interface GameSession {
  id: string
  player_id: string
  session_token: string
  seed: number
  stage: number
  score: number
  total_success: number
  survival_time: number
  species_success_counts: Record<string, number>
  extinct_species: string[]
  biodiversity_percent: number | null
  game_events_hash: string | null
  validated: boolean
  validation_details: string | null
  created_at: string
}

export interface SessionToken {
  id: string
  token: string
  device_id: string
  seed: number
  expires_at: string
  used: boolean
  created_at: string
}

export interface LeaderboardEntry {
  rank: number
  nickname: string
  score: number
  survival_time: number
  total_games: number
  device_id: string
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
  player_rank: LeaderboardEntry | null
  total_players: number
  limit: number
  offset: number
}

export interface StartSessionResponse {
  session_token: string
  seed: number
  expires_at: string
}

export interface SubmitScoreResponse {
  success: boolean
  validated: boolean
  rank: number
  total_players: number
  score: number
  game_session_id?: string
}

/**
 * 游戏事件记录（用于客户端端反作弊哈希）
 */
export interface GameEventLog {
  seed: number
  stage: number
  totalSuccess: number
  score: number
  survivalTime: number
  speciesSuccessCounts: Record<string, number>
  extinctSpecies: string[]
  biodiversityPercent: number
  timestamp: number
}
