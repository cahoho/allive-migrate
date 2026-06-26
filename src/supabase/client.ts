// ============================================================
// Supabase 客户端配置
// ============================================================
// 说明：此文件需要配置实际的 Supabase 项目 URL 和 anon key
// 开发环境：使用 .env 文件配置
// 生产环境：在部署平台设置环境变量
// ============================================================

import { createClient } from "@supabase/supabase-js"

// Supabase 项目配置
// 部署时替换为你的实际项目 URL 和 anon key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ""
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ""

/**
 * 获取 Supabase 匿名密钥（用于 Edge Function 调用的 Authorization 头）
 */
export function getAnonKey(): string {
  return supabaseAnonKey
}

/**
 * Supabase 客户端实例
 * 
 * 注意：
 * - anon key 是公开的，通过 RLS 策略控制数据访问权限
 * - Edge Functions 使用 service_role key（服务端密钥，不暴露给客户端）
 * - 所有敏感操作（签名验证、得分验证）在 Edge Functions 中完成
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // 不使用 Supabase Auth，纯匿名模式
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: "public",
  },
})

/**
 * 检查 Supabase 是否已配置
 */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0
}

/**
 * Edge Functions 调用的基础 URL
 */
export function getFunctionUrl(functionName: string): string {
  return `${supabaseUrl}/functions/v1/${functionName}`
}
