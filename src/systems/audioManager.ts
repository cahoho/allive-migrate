// 音频管理系统
// 职责：
// 1) 提供「拖线时选中物种」「新物种出现」「拖线经过节点」「路线完成」「背景音乐」5 类声音入口
// 2) 背景音乐支持单实例（ambient 一直存在）+ 多实例循环（每个出现的物种一个循环）
// 3) 音效（select/newSpecies/routeselect/routecomplete）一次性播放
// 4) 缺失的物种音频自动忽略（try/catch + 文件不存在时 fallback）
//
// sfx 文件夹结构（位于项目根 sfx/）：
//   sfx/出现新物种/*.mp3
//   sfx/鼠标选中物种准备迁徙/*.mp3
//   sfx/bg/*.mp3                    （包含「一直存在的背景声.mp3」和各物种名 .mp3）
//   sfx/uisfx/{routeselect,routecomplete}.mp3
//
// 通过 Vite 的 import.meta.glob ?url 引入资源 URL，开发/构建都生效。

import { getSpeciesTemplate, type SpeciesDef } from '../data/speciesTemplates'

// ============================================================
// 资源 URL 表（用 ?url 拿到最终可播放的 URL；Vite 会处理打包）
// ============================================================

// 全部 sfx/*.mp3 的 URL 映射（绝对路径 → 文件名 basename）
// 注意：import.meta.glob 的路径是相对于当前模块文件，src/systems/audioManager.ts
// → ../../sfx 才是项目根的 sfx 目录
const SFX_URLS: Record<string, string> = import.meta.glob('../../sfx/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** 通过「文件名 basename」找资源 URL（不依赖文件夹） */
function sfxUrl(fileName: string): string | null {
  for (const k of Object.keys(SFX_URLS)) {
    if (k.endsWith('/' + fileName) || k.endsWith('\\' + fileName)) {
      return SFX_URLS[k]
    }
  }
  return null
}

// ============================================================
// 文件名映射（基于实际资源名称）
// ============================================================

// 「新物种出现」只用一个 chime-alert 文件
const NEW_SPECIES_FILES = ['olivia_parker-chime-alert-demo-309545.mp3']

// 「鼠标选中物种准备迁徙」文件 → species id
// 没匹配上的物种会被忽略（bar_goose / eel 没有专属音频）
const SPECIES_SELECT_FILES: Record<string, string> = {
  bird: 'freesound_community-bird-call-38512.mp3',
  butterfly: 'freesound_community-fluttering-100961(butterfly).mp3',
  salmon: 'freesound_community-water-splash-102492.mp3',
  herd: 'u_jd81cxyq22-cow-mooing-343423(Animal Bovine).mp3',
  sea_turtle: 'u_hm3ohsiik6-breath-out-242642(turtle ).mp3',
  wood_frog: 'gargamel10-frog-sound-effect-380312.mp3'
  // bar_goose / eel：无专属音频，按"如果有的物种没有，则忽略"跳过
}

// 「bg/物种名.mp3」→ species id（按中文物种名匹配）
// 注：当前 sfx/bg/ 中没有「绿海龟.mp3」，所以 sea_turtle 不在表里
// 「如果有的物种没有，则忽略」由 syncSpeciesBackgrounds 的 sfxUrl 返回 null 自然处理
const SPECIES_BG_FILES: Record<string, string> = {
  bird: '雁鸭候鸟.mp3',
  butterfly: '帝王蝶.mp3',
  bar_goose: '斑头雁.mp3',
  salmon: '鲑鱼.mp3',
  herd: '兽群.mp3',
  eel: '美洲鳗.mp3',
  wood_frog: '青蛙.mp3'
  // sea_turtle：bg 文件夹里没有专属音频，按"如果有的物种没有，则忽略"跳过
}

const AMBIENT_BG_FILE = '一直存在的背景声.mp3'

// uisfx
const ROUTE_SELECT_FILE = 'routeselect.mp3'
const ROUTE_COMPLETE_FILE = 'routecomplete.mp3'

// ============================================================
// Audio 实例池
// ============================================================

/** 一次性音效：每次播放 new 一个 Audio，避免多任务同时播放互相打断 */
function playOneShot(url: string, volume = 1): void {
  if (!url) return
  try {
    const a = new Audio(url)
    a.volume = Math.max(0, Math.min(1, volume))
    a.play().catch((err) => {
      // 用户未授权/浏览器限制 → 静默失败
      if (typeof console !== 'undefined') {
        console.warn('[audio] playOneShot failed:', err)
      }
    })
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[audio] Audio ctor failed:', e)
  }
}

/**
 * 背景音乐池：每个 key 对应一个独立循环 Audio
 * - ambient: 一直存在的背景声
 * - species:<id>: 该物种解锁期间持续循环
 */
const bgLoop: Map<string, HTMLAudioElement> = new Map()

function startLoop(key: string, url: string, volume: number): void {
  if (!url) return
  if (bgLoop.has(key)) return
  try {
    const a = new Audio(url)
    a.loop = true
    a.volume = Math.max(0, Math.min(1, volume))
    a.preload = 'auto'
    // 浏览器自动播放策略：必须在用户交互之后才能播放
    // 这里 catch 失败，下一次用户交互后再尝试
    a.play().catch((err) => {
      if (typeof console !== 'undefined') {
        console.warn('[audio] bg loop start failed:', err)
      }
    })
    bgLoop.set(key, a)
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[audio] bg loop ctor failed:', e)
  }
}

function stopLoop(key: string): void {
  const a = bgLoop.get(key)
  if (!a) return
  try {
    a.pause()
    a.currentTime = 0
  } catch {
    // ignore
  }
  bgLoop.delete(key)
}

function pauseAllBg(): void {
  for (const a of bgLoop.values()) {
    try { a.pause() } catch { /* ignore */ }
  }
}

function resumeAllBg(): void {
  for (const a of bgLoop.values()) {
    a.play().catch(() => { /* ignore */ })
  }
}

// ============================================================
// 公共 API
// ============================================================

/** 解锁音频上下文（必须由用户手势触发；通常挂在首次 pointerdown） */
let unlocked = false
export function unlockAudio(): void {
  if (unlocked) return
  unlocked = true
  // 解锁后尝试把所有 background loop 拉起来
  resumeAllBg()
}

/** 暂停所有背景音乐（教程暂停 / 人类教程期间） */
export function pauseAllBackgrounds(): void {
  pauseAllBg()
}

/** 恢复所有背景音乐 */
export function resumeAllBackgrounds(): void {
  resumeAllBg()
}

/** 1) 玩家拖动某个物种 marker → 播放该物种「准备迁徙」音效 1 次（缺失则忽略） */
export function playSpeciesSelect(speciesId: string): void {
  const file = SPECIES_SELECT_FILES[speciesId]
  if (!file) return
  const url = sfxUrl(file)
  if (!url) return
  playOneShot(url, 0.9)
}

/** 2) 新物种出现 → 播放「新物种出现」文件夹下任一文件 1 次 */
export function playNewSpecies(): void {
  for (const f of NEW_SPECIES_FILES) {
    const url = sfxUrl(f)
    if (url) {
      playOneShot(url, 0.85)
      return
    }
  }
}

/** 3) 拖线经过一个节点 → 播放 routeselect */
export function playRouteSelect(): void {
  const url = sfxUrl(ROUTE_SELECT_FILE)
  if (!url) return
  playOneShot(url, 0.6)
}

/** 4) 拖线完成（提交且 validateRoute ok）→ 播放 routecomplete */
export function playRouteComplete(): void {
  const url = sfxUrl(ROUTE_COMPLETE_FILE)
  if (!url) return
  playOneShot(url, 0.85)
}

// ============================================================
// 背景音乐管理
// ============================================================

/**
 * 让「一直存在的背景声」开始循环；如果已经在播则忽略
 * 应在 initGame / startGame 时调用一次
 */
export function startAmbient(): void {
  if (bgLoop.has('ambient')) return
  const url = sfxUrl(AMBIENT_BG_FILE)
  if (!url) {
    if (typeof console !== 'undefined') {
      console.warn('[audio] ambient bg file not found:', AMBIENT_BG_FILE)
    }
    return
  }
  startLoop('ambient', url, 0.45)
}

/**
 * 同步物种背景音乐：根据「当前存在物种 id 列表」启动 / 停止对应循环
 * - unlockedSpeciesIds ∩ alive（未灭绝）就是要循环播放的物种
 * - 物种灭绝 / 删解锁时停止循环
 */
export function syncSpeciesBackgrounds(unlockedIds: string[], extinctIds: string[]): void {
  const extinctSet = new Set(extinctIds)
  const alive = new Set(unlockedIds.filter((id) => !extinctSet.has(id)))
  // 1) 启动新出现的
  for (const id of alive) {
    const key = 'species:' + id
    if (bgLoop.has(key)) continue
    const sp: SpeciesDef | undefined = getSpeciesTemplate(id)
    if (!sp) continue
    const file = SPECIES_BG_FILES[id]
    if (!file) continue
    const url = sfxUrl(file)
    if (!url) {
      // 文件不存在（如 sea_turtle 的"绿海龟.mp3"可能不在）→ 静默跳过
      continue
    }
    startLoop(key, url, 0.35)
  }
  // 2) 停止已不存在的（灭绝 / 解锁被撤）
  for (const key of Array.from(bgLoop.keys())) {
    if (!key.startsWith('species:')) continue
    const id = key.slice('species:'.length)
    if (!alive.has(id)) {
      stopLoop(key)
    }
  }
}

/** 全部停止（用于重置 / restart） */
export function stopAllBackgrounds(): void {
  for (const key of Array.from(bgLoop.keys())) {
    stopLoop(key)
  }
}
