// ============================================================
// useDeviceId - 设备标识管理
// ============================================================
// 设计理念：
//  一台电脑 = 一个玩家
//  通过 localStorage 持久化 UUID 实现设备指纹
//  不依赖浏览器指纹库（隐私友好）
// ============================================================

const DEVICE_ID_KEY = "allive_device_id"
const NICKNAME_KEY = "allive_player_nickname"

let cachedDeviceId: string | null = null

/**
 * 获取或生成设备唯一标识
 * 
 * 策略：
 * 1. 从 localStorage 读取已有 UUID
 * 2. 如果不存在，生成新的 UUID v4 并持久化
 * 3. 清除浏览器数据后，玩家会被视为新玩家
 * 
 * 安全性：
 * - 不发送任何浏览器指纹信息到服务器
 * - UUID 仅用于区分不同设备/浏览器
 * - 玩家可手动清除 localStorage 重置身份
 */
export function useDeviceId() {
  function getDeviceId(): string {
    if (cachedDeviceId) return cachedDeviceId

    try {
      let id = localStorage.getItem(DEVICE_ID_KEY)
      if (!id) {
        id = generateUUID()
        localStorage.setItem(DEVICE_ID_KEY, id)
      }
      cachedDeviceId = id
      return id
    } catch {
      // localStorage 不可用（隐私模式、CloudStudio iframe 等）
      // 关键修复：必须缓存生成的 UUID，否则每次调用 getDeviceId() 都返回
      // 不同的值，导致前后端 device_id 不匹配，玩家永远找不到自己。
      if (!cachedDeviceId) {
        cachedDeviceId = generateUUID()
      }
      return cachedDeviceId
    }
  }

  /**
   * 获取保存的玩家昵称
   */
  function getSavedNickname(): string | null {
    try {
      return localStorage.getItem(NICKNAME_KEY)
    } catch {
      return null
    }
  }

  /**
   * 保存玩家昵称
   */
  function saveNickname(nickname: string): void {
    try {
      localStorage.setItem(NICKNAME_KEY, nickname)
    } catch {
      // 静默失败
    }
  }

  /**
   * 清除设备标识（用于调试/重置）
   */
  function clearDeviceId(): void {
    try {
      localStorage.removeItem(DEVICE_ID_KEY)
      localStorage.removeItem(NICKNAME_KEY)
    } catch {
      // 静默失败
    }
    cachedDeviceId = null
  }

  return {
    getDeviceId,
    getSavedNickname,
    saveNickname,
    clearDeviceId,
  }
}

/**
 * 生成 UUID v4（兼容 crypto.randomUUID）
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // 降级方案
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
