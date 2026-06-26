// ============================================================
// Supabase Edge Function: start-session
// ============================================================
// 功能：为游戏客户端生成一个带 HMAC 签名的会话令牌
// 调用时机：玩家输入昵称后，点击"开始游戏"时
// ============================================================
// 反作弊机制：
//   1. 每个令牌只能使用一次（used=false → used=true）
//   2. 令牌有过期时间（10 分钟）
//   3. 令牌包含 HMAC-SHA256 签名，防止客户端伪造
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Supabase 客户端（service_role 权限，可操作所有表）
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// HMAC 签名密钥（存储在 Supabase Secret 中）
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? "allive-migration-secret-key-change-in-production";

// 令牌有效期（秒）
const TOKEN_TTL_SECONDS = 600; // 10 分钟

/**
 * 使用 HMAC-SHA256 生成签名
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * 生成随机种子（用于游戏地图生成）
 * 
 * 注意：种子必须适配客户端 newRandomSeed() 的范围（0 ~ 0x7FFFFFFF）。
 * Uint32Array 返回的是无符号 32 位值（0 ~ 4294967295），
 * 但 PostgreSQL INTEGER 是有符号 32 位（max 2147483647），
 * 超出会导致 INSERT 失败。
 * 使用 & 0x7FFFFFFF 确保值在 INT32 范围内。
 */
function generateSeed(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] & 0x7FFFFFFF;
}

/**
 * 生成 UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req: Request) => {
  // CORS 头
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
    const { device_id } = body;

    if (!device_id || typeof device_id !== "string" || device_id.length < 8) {
      return new Response(
        JSON.stringify({ error: "Invalid device_id" }),
        { headers, status: 400 }
      );
    }

    // 生成种子和令牌
    const seed = generateSeed();
    const tokenId = generateUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

    // 构建待签名内容
    const payload = JSON.stringify({
      token_id: tokenId,
      device_id,
      seed,
      expires_at: expiresAt.toISOString(),
    });

    // HMAC 签名
    const signature = await hmacSign(payload, SESSION_SECRET);

    // 完整令牌
    const sessionToken = btoa(
      JSON.stringify({
        token_id: tokenId,
        device_id,
        seed,
        expires_at: expiresAt.toISOString(),
        signature,
      })
    );

    // 存储令牌到数据库（标记为未使用）
    const { error: dbError } = await supabase
      .from("session_tokens")
      .insert({
        token: sessionToken,
        device_id,
        seed,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (dbError) {
      console.error("Failed to store session token:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to create session" }),
        { headers, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        session_token: sessionToken,
        seed,
        expires_at: expiresAt.toISOString(),
      }),
      { headers, status: 200 }
    );
  } catch (err) {
    console.error("start-session error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { headers, status: 500 }
    );
  }
});
