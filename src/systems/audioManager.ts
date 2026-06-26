// 音频管理系统 v2
// 职责：
// 1) 一次性音效：用 Web Audio API 预解码为 AudioBuffer，播放零延迟
// 2) 背景音乐：保持 HTMLAudioElement 循环
// 3) 加载阶段：preloadAllSfx() 异步拉取+解码所有音频，返回进度回调
// 4) 释放：页面卸载时 AudioContext.close() 回收内存
//
// sfx 文件夹结构：
//   sfx/出现新物种/*.mp3
//   sfx/鼠标选中物种准备迁徙/*.mp3
//   sfx/bg/*.mp3
//   sfx/uisfx/{routeselect,routecomplete}.mp3

import { getSpeciesTemplate, type SpeciesDef } from '../data/speciesTemplates'

// ============================================================
// 资源 URL 表
// ============================================================
const SFX_URLS: Record<string, string> = import.meta.glob('../../sfx/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

function sfxUrl(fileName: string): string | null {
  for (const k of Object.keys(SFX_URLS)) {
    if (k.endsWith('/' + fileName) || k.endsWith('\\' + fileName)) {
      return SFX_URLS[k]
    }
  }
  return null
}

// ============================================================
// 文件名映射
// ============================================================
const NEW_SPECIES_FILES = ['olivia_parker-chime-alert-demo-309545.mp3']

const SPECIES_SELECT_FILES: Record<string, string> = {
  bird: 'freesound_community-bird-call-38512.mp3',
  butterfly: 'freesound_community-fluttering-100961(butterfly).mp3',
  salmon: 'freesound_community-water-splash-102492.mp3',
  herd: 'u_jd81cxyq22-cow-mooing-343423(Animal Bovine).mp3',
  sea_turtle: 'u_hm3ohsiik6-breath-out-242642(turtle ).mp3',
  wood_frog: 'gargamel10-frog-sound-effect-380312.mp3'
}

const SPECIES_BG_FILES: Record<string, string> = {
  bird: '雁鸭候鸟.mp3',
  butterfly: '帝王蝶.mp3',
  bar_goose: '斑头雁.mp3',
  salmon: '鲑鱼.mp3',
  herd: '兽群.mp3',
  eel: '美洲鳗.mp3',
  wood_frog: '青蛙.mp3'
}

const AMBIENT_BG_FILE = '一直存在的背景声.mp3'
const ROUTE_SELECT_FILE = 'routeselect.mp3'
const ROUTE_COMPLETE_FILE = 'routecomplete.mp3'

// ============================================================
// Web Audio API — 一次性音效（零延迟播放）
// ============================================================

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  // 如果 context 被浏览器暂停（自动播放策略），resume 它
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/** AudioBuffer 缓存：url → decoded buffer */
const bufferCache = new Map<string, AudioBuffer>()

/**
 * 从 bufferCache 播放一次音效（零延迟）
 */
function playBuffer(urlKey: string, volume = 1): void {
  const buf = bufferCache.get(urlKey)
  if (!buf) return
  try {
    const ctx = getAudioCtx()
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, volume))
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start(0)
  } catch {
    // 静默失败
  }
}

// ============================================================
// 背景音乐 — HTMLAudioElement 循环
// ============================================================

const bgLoop: Map<string, HTMLAudioElement> = new Map()

function startLoop(key: string, url: string, volume: number): void {
  if (!url) return
  if (bgLoop.has(key)) return
  try {
    const a = new Audio(url)
    a.loop = true
    a.volume = Math.max(0, Math.min(1, volume))
    a.preload = 'auto'
    a.play().catch(() => {})
    bgLoop.set(key, a)
  } catch {
    // ignore
  }
}

function stopLoop(key: string): void {
  const a = bgLoop.get(key)
  if (!a) return
  try { a.pause(); a.currentTime = 0 } catch { /* ignore */ }
  bgLoop.delete(key)
}

function pauseAllBg(): void {
  for (const a of bgLoop.values()) {
    try { a.pause() } catch { /* ignore */ }
  }
}

function resumeAllBg(): void {
  for (const a of bgLoop.values()) {
    a.play().catch(() => {})
  }
}

// ============================================================
// 加载流程
// ============================================================

/** 收集需要预加载的一次性音效 URL（这些会解码为 AudioBuffer） */
function collectOneShotUrls(): string[] {
  const urls: string[] = []

  for (const f of NEW_SPECIES_FILES) {
    const url = sfxUrl(f)
    if (url) urls.push(url)
  }
  for (const f of Object.values(SPECIES_SELECT_FILES)) {
    const url = sfxUrl(f)
    if (url) urls.push(url)
  }
  const rsUrl = sfxUrl(ROUTE_SELECT_FILE)
  if (rsUrl) urls.push(rsUrl)
  const rcUrl = sfxUrl(ROUTE_COMPLETE_FILE)
  if (rcUrl) urls.push(rcUrl)

  return urls
}

/** 收集背景音乐 URL（这些用 preload 方式预热） */
function collectBgUrls(): string[] {
  const urls: string[] = []
  const ambientUrl = sfxUrl(AMBIENT_BG_FILE)
  if (ambientUrl) urls.push(ambientUrl)
  for (const f of Object.values(SPECIES_BG_FILES)) {
    const url = sfxUrl(f)
    if (url) urls.push(url)
  }
  return urls
}

export interface LoadProgress {
  loaded: number
  total: number
  percent: number
  currentFile: string
}

/**
 * 预加载所有音频资源
 * @param onProgress 进度回调
 */
export async function preloadAllSfx(
  onProgress?: (p: LoadProgress) => void
): Promise<void> {
  const oneShotUrls = collectOneShotUrls()
  const bgUrls = collectBgUrls()
  const allUrls = [...oneShotUrls, ...bgUrls]
  const total = allUrls.length

  // 去重
  const unique = [...new Set(allUrls)]

  let loaded = 0
  const totalUnique = unique.length

  const update = (file: string) => {
    loaded++
    onProgress?.({
      loaded,
      total: totalUnique,
      percent: Math.round((loaded / totalUnique) * 100),
      currentFile: file
    })
  }

  // 并行加载 + 解码
  const tasks = unique.map(async (url) => {
    try {
      // 一次性音效：解码为 AudioBuffer 存内存
      if (oneShotUrls.includes(url)) {
        const response = await fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        const ctx = getAudioCtx()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        bufferCache.set(url, audioBuffer)
      } else {
        // 背景音乐：fetch 并创建 Blob URL 预热（后续 startLoop 会 new Audio(fetchedUrl)，浏览器已有缓存）
        await fetch(url)
      }
      update(url)
    } catch {
      update(url)
    }
  })

  await Promise.all(tasks)
}

// ============================================================
// 公共 API
// ============================================================

let unlocked = false
export function unlockAudio(): void {
  if (unlocked) return
  unlocked = true
  // 确保 AudioContext 被唤醒
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  resumeAllBg()
}

export function pauseAllBackgrounds(): void {
  pauseAllBg()
}

export function resumeAllBackgrounds(): void {
  resumeAllBg()
}

export function playSpeciesSelect(speciesId: string): void {
  const file = SPECIES_SELECT_FILES[speciesId]
  if (!file) return
  const url = sfxUrl(file)
  if (!url) return
  playBuffer(url, 0.9)
}

export function playNewSpecies(): void {
  for (const f of NEW_SPECIES_FILES) {
    const url = sfxUrl(f)
    if (url) {
      playBuffer(url, 0.85)
      return
    }
  }
}

export function playRouteSelect(): void {
  const url = sfxUrl(ROUTE_SELECT_FILE)
  if (!url) return
  playBuffer(url, 0.6)
}

export function playRouteComplete(): void {
  const url = sfxUrl(ROUTE_COMPLETE_FILE)
  if (!url) return
  playBuffer(url, 0.85)
}

// ============================================================
// 背景音乐管理
// ============================================================

export function startAmbient(): void {
  if (bgLoop.has('ambient')) return
  const url = sfxUrl(AMBIENT_BG_FILE)
  if (!url) return
  startLoop('ambient', url, 0.45)
}

export function syncSpeciesBackgrounds(unlockedIds: string[], extinctIds: string[]): void {
  const extinctSet = new Set(extinctIds)
  const alive = new Set(unlockedIds.filter((id) => !extinctSet.has(id)))
  for (const id of alive) {
    const key = 'species:' + id
    if (bgLoop.has(key)) continue
    const sp: SpeciesDef | undefined = getSpeciesTemplate(id)
    if (!sp) continue
    const file = SPECIES_BG_FILES[id]
    if (!file) continue
    const url = sfxUrl(file)
    if (!url) continue
    startLoop(key, url, 0.35)
  }
  for (const key of Array.from(bgLoop.keys())) {
    if (!key.startsWith('species:')) continue
    const id = key.slice('species:'.length)
    if (!alive.has(id)) stopLoop(key)
  }
}

export function stopAllBackgrounds(): void {
  for (const key of Array.from(bgLoop.keys())) {
    stopLoop(key)
  }
}

/** 释放所有资源（AudioContext + Buffer 缓存） */
export function releaseAudio(): void {
  bufferCache.clear()
  if (audioCtx) {
    audioCtx.close().catch(() => {})
    audioCtx = null
  }
}
