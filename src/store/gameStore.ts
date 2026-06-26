// 共享游戏状态 v8
// 关键规则：
// - 拖线视觉起点 = 物种 logo 实际位置（不是节点中心）
// - 真实路线只包含 startNode 起步，由 DragState.path 维护
// - 多个物种共享同一节点时，logo 围绕节点呈扇形排布，不重叠
// - 提交成功后 ActiveRoute 保留 visualStart，让动物从 logo 位置出发
// - 任务生成前必须经过 canSpawnSolvableTask 可解性检查
// - 节点揭示：每成功一次迁徙，tryRevealOneNode 推一个；失败/时间不生成
// - 人类系统：唯一永久阻挡圆，无 planner / cooldown / 状态机
// - 阻挡圆移动由 HumanHeatLayer 的 requestAnimationFrame 改 transform，
//   tickGame 不再负责推进阻挡圆
// - tickGame 不再递增 humanFieldVersion
import { reactive } from 'vue'
import {
  RuntimeMapNode, SpeciesTask, ActiveRoute, DragState, ToastMsg, GameState
} from '../data/gameData'
import {
  MAX_FAILURES, MAX_ROUTE_SEGMENTS, STAGE_UNLOCK_SCORES, STAGE5_MAX_CONCURRENT,
  STAGE6_MAX_CONCURRENT,
  SEASON_INTERVAL, TASK_SPAWN_INTERVAL_BASE, TASK_SPAWN_INTERVAL_MIN,
  SeasonId, MAX_MAP_NODES,
  HUMAN_ACTIVATION_SUCCESS,
  HUMAN_HUNT_SUCCESS_THRESHOLD, HUMAN_HUNT_LOOKAHEAD_SECONDS,
  HUMAN_HUNT_SAMPLE_STEP, HUMAN_HUNT_REPLAN_INTERVAL,
  HUMAN_BLOCKER_HUNT_SPEED,
  HUMAN_LAYER_TIME_SCALE,
  SPECIES_EXTINCTION_FAILURES,
  BIODIVERSITY_FAILURE_THRESHOLD,
  ECO_HUMAN_DAMAGE_PER_SECOND,
  ECO_ANIMAL_ROUTE_PRESSURE,
  ECO_RECOVERY_PER_SECOND
} from '../data/gameConfig'
import { SeededRandom, newRandomSeed, hashSeed } from '../systems/seededRandom'
import {
  generateInitialMap,
  tryRevealOneNode,
  resetGeneratorState
} from '../systems/mapGenerator'
import { generateTask, canGenerateTaskFor, canSpawnSolvableTaskQuick } from '../systems/taskGenerator'
import {
  SPECIES_TEMPLATES,
  SPECIES_UNLOCK_STAGES,
  SpeciesDef,
  getSpeciesTemplate
} from '../data/speciesTemplates'
import {
  initNodeEco,
  isNodeEcoUnavailable,
  shouldAvoidAsEndpoint,
  getEcoTaskWeight
} from '../systems/ecoHealthSystem'
import type { HumanPressureSource } from '../systems/ecoHealthSystem'
import {
  damageNodeEco,
  recoverNodeEco,
  syncNodeEcoState,
  isNodeEcoUnavailable as isNodeEcoUnavailableV2
} from '../systems/ecologySystem'
import { validateRoute, ValidationResult } from '../composables/useRouteValidation'
import { distance } from '../utils/geometry'
import { SEASON_INFO } from '../data/eventDefinitions'
import { findSolvableRouteForSpecies, bumpMapRevision } from '../systems/solvability'
import { isNodeAllowedByTags } from '../systems/routeEligibility'
import { getActiveRiskZones } from '../data/riskZones'
import {
  ensureHumanBlocker,
  setHumanBlockerActive,
  setHumanPointerTarget,
  getBlockingHumanClusters,
  getHumanBlocker,
  growHuman,
  shrinkHuman,
  tickShrinkPoint,
  tryConsumeShrinkPoint,
  setHumanHuntTarget,
  initHumanField,
  type HumanCluster
} from '../systems/humanBlockerSystem'
import { getPointAtProgress } from '../utils/svgPath'
import { getTutorialStepCount } from '../data/tutorialSteps'
import {
  playRouteSelect,
  playRouteComplete,
  playSpeciesSelect,
  playNewSpecies,
  startAmbient,
  syncSpeciesBackgrounds,
  stopAllBackgrounds,
  unlockAudio
} from '../systems/audioManager'

let taskIdSeq = 0
let routeIdSeq = 0
let toastIdSeq = 0

/**
 * 迁徙得分累加后会因浮点精度产生长尾（0.1+0.2=0.30000000000000004）
 * 每次累加后用 toFixed(2) 截掉尾巴，UI 上始终显示干净的 0.1 步进。
 */
function roundScore(v: number): number {
  return Math.round(v * 100) / 100
}


function blankState(): GameState {
  return {
    seed: newRandomSeed(),
    elapsedTime: 0,
    year: 1,

    stage: 1,
    totalSuccess: 0,
    score: 0,
    failures: 0,
    maxFailures: MAX_FAILURES,
    maxConcurrent: 1,
    taskSpawnInterval: computeTaskSpawnInterval(1),
    usedSegments: 0,
    maxSegments: MAX_ROUTE_SEGMENTS,

    season: 'normal',
    nextSeasonIn: 999,

    mapNodes: [],

    activeTasks: [],
    completedRoutes: [],

    unlockedSpeciesIds: ['bird'],
    speciesFailureCounts: {},
    speciesSuccessCounts: {},
    extinctSpeciesIds: [],

    selectedTaskId: null,
    dragState: {
      active: false,
      taskId: null,
      visualStartX: 0,
      visualStartY: 0,
      pointer: null,
      path: [],
      previewSegmentDistance: 0,
      previewOverflow: false,
      overCancel: false,
      overNodeId: null,
      startTime: 0,
      previewHumanBlocked: false,
      previewHumanClusterId: null
    },
    gameOver: false,
    toasts: [],
    startTime: Date.now(),

    // v11：游戏未开始前不计时、不生成任务
    gameStarted: false,
    // v11：坚持时间（秒），仅在 gameStarted=true 时累加
    survivalTime: 0,

    humanActive: false,
    humanHuntActive: false,
    humanLayerVisible: false,
    humanFieldVersion: 0,
    pointerPos: null,
    humanPressActive: false,

    // 引导系统状态
    tutorialActive: false,
    tutorialStep: 0,
    tutorialPhase: null,
    tutorialCompletedIntro: false,
    tutorialCompletedHuman: false,
    tutorialTaskId: null,

    // 暂停原因集合：每帧 / 每次 tickGame 都从这里查询
    // 唯一初始化入口：blankState() / initGame()
    pauseReasons: [],

    // Supabase 数据库集成字段
    sessionToken: null,
    scoreSubmitted: false,
    playerNickname: '',
    serverSeed: null,
  }
}

const state = reactive<GameState>(blankState())

// 节点命中时间戳（用于触发动效）：{ nodeId → timestamp }
// MapNode 组件读取并在命中 500ms 内显示礼花 + 震动效果
const nodeHitTimestamps = reactive<Record<string, number>>({})

// 全局 RNG
let rng: SeededRandom = new SeededRandom(state.seed)

function pushToast(text: string, kind: ToastMsg['kind'] = 'info', durationMs = 2200) {
  const id = toastIdSeq++
  state.toasts.push({ id, text, kind, at: Date.now() })
  setTimeout(() => {
    const idx = state.toasts.findIndex((t) => t.id === id)
    if (idx >= 0) state.toasts.splice(idx, 1)
  }, durationMs)
}

/** 初始化新对局 */
function initGame(seed?: number) {
  // 保存跨对局状态
  const savedNickname = state.playerNickname
  const savedToken = state.sessionToken
  const savedServerSeed = state.serverSeed

  if (seed !== undefined) {
    state.seed = seed
  } else {
    state.seed = newRandomSeed()
  }
  rng = new SeededRandom(state.seed)
  state.elapsedTime = 0
  state.year = 1
  state.stage = 1

  state.totalSuccess = 0
  state.score = 0
  state.failures = 0
  state.usedSegments = 0
  state.maxSegments = MAX_ROUTE_SEGMENTS
  state.maxConcurrent = computeMaxConcurrent(state.stage)
  state.taskSpawnInterval = computeTaskSpawnInterval(state.stage)

  state.season = 'normal'
  state.nextSeasonIn = 999

  resetGeneratorState()
  state.mapNodes = generateInitialMap(rng, 1)
  ensureEcoFieldsFor(state.mapNodes)
  bumpMapRevision()

  state.activeTasks = []
  state.completedRoutes = []
  state.unlockedSpeciesIds = ['bird']
  state.speciesFailureCounts = {}
  state.speciesSuccessCounts = {}
  state.extinctSpeciesIds = []

  state.selectedTaskId = null
  state.dragState = {
    active: false,
    taskId: null,
    visualStartX: 0,
    visualStartY: 0,
    pointer: null,
    path: [],
    previewSegmentDistance: 0,
    previewOverflow: false,
    overCancel: false,
    overNodeId: null,
    startTime: 0,
    previewHumanBlocked: false,
    previewHumanClusterId: null
  }
  state.gameOver = false
  state.toasts = []
  state.startTime = Date.now()

  // v11：游戏开始前的状态
  // - 不生成任务
  // - 不激活人类系统
  // - 不累加坚持时间
  state.gameStarted = false
  state.survivalTime = 0

  state.humanActive = false
  state.humanHuntActive = false
  state.humanLayerVisible = false
  state.humanFieldVersion = 0
  state.pointerPos = null
  state.humanPressActive = false
  setHumanHuntTarget(null)

  // 引导系统状态：每次 initGame 重置（允许玩家重玩时重新走引导）
  state.tutorialActive = false
  state.tutorialStep = 0
  state.tutorialPhase = null
  state.tutorialCompletedIntro = false
  state.tutorialCompletedHuman = false
  state.tutorialTaskId = null

  // 暂停原因集合：每次 initGame / restart 都彻底清空
  state.pauseReasons = []

  // 恢复跨对局状态（昵称、会话令牌）
  state.playerNickname = savedNickname
  state.sessionToken = savedToken
  state.serverSeed = savedServerSeed
  state.scoreSubmitted = false

  // 生态健康：清空跨帧状态缓存
  lastEcoStates = new Map()
  lastEcoUnavail = new Set()
  lastEcoToastAt = {}

  pushToast(`生态地图已生成：${state.mapNodes.length} 个节点`, 'success', 2000)

  // 音频：启动「一直存在的背景声」，并同步初始物种（鸟）的 bg 循环
  startAmbient()
  syncSpeciesBackgrounds(state.unlockedSpeciesIds, state.extinctSpeciesIds)

  // v11：initGame 不再立即补满任务，等玩家点击【开始游戏】后再开始生成
}

/**
 * 防御：候鸟首任务必须能生成。
 * 正常情况下 generateInitialMap 已经给出 北方繁殖地 / 沿海湿地 / 南方越冬地。
 * 只有在地图异常时才会被触发。
 */
function ensureStarterNodesForBird(): void {
  const hasBreeding = state.mapNodes.some((n) => n.tags.includes('breeding'))
  const hasWetland = state.mapNodes.some((n) => n.tags.includes('wetland'))
  const hasWintering = state.mapNodes.some((n) => n.tags.includes('wintering'))
  if (hasBreeding && hasWetland && hasWintering) return
  state.mapNodes = generateInitialMap(rng, 1)
}

/** 找节点 */
function getNode(id: string): RuntimeMapNode | undefined {
  return state.mapNodes.find((n) => n.id === id)
}

// ============================================================
// 生态健康（Eco Health）
// ============================================================
// 集中处理：
// 1) 节点创建时初始化 eco 字段
// 2) 提供"按健康过滤 / 权重"工具给任务生成器
// 3) tickGame 推进扣血/恢复
// 4) 任务完成时给路径上节点施加"承载压力"

function ensureEcoFieldsFor(nodes: RuntimeMapNode[]): void {
  for (const n of nodes) initNodeEco(n)
}

/**
 * 任务候选节点过滤：按 health/ecoState 筛掉不可用 + 极低健康节点
 * - health <= 0：直接不可用（除非已恢复到 35）
 * - 起点 / 终点：尽量避开 health <= 15 的节点
 * - 必经点：仍允许从 damaged 节点中选（但避开 degraded / 不可用）
 */
function filterCandidatesForTask(
  nodes: RuntimeMapNode[],
  role: 'start' | 'target' | 'waypoint' | 'any'
): RuntimeMapNode[] {
  const out: RuntimeMapNode[] = []
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (typeof n.health !== 'number') initNodeEco(n)
    if (isNodeEcoUnavailable(n)) continue
    if ((role === 'start' || role === 'target') && shouldAvoidAsEndpoint(n)) continue
    if (role === 'waypoint' && n.ecoState === 'degraded') continue
    out.push(n)
  }
  return out
}

/** 把节点列表按 eco 权重排序（健康优先） */
function sortByEcoWeight(nodes: RuntimeMapNode[]): RuntimeMapNode[] {
  return [...nodes].sort((a, b) => getEcoTaskWeight(b) - getEcoTaskWeight(a))
}

/** 把"承载压力"应用到任务完成时经过的节点 */
function applyMigrationPressureOnComplete(task: SpeciesTask): void {
  if (!task.path || task.path.length === 0) return
  // 起点和终点都计为"被经过"
  // 中间节点按 path 顺序全部计
  // 重复节点去重
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of task.path) {
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  // v2：动物迁徙成功时按一次 ECO_ANIMAL_ROUTE_PRESSURE 对路径上每个节点扣血
  // 不再走 v1 的 applyBatchMigrationPressure（区间随机）
  let anyStatusChanged = false
  for (const id of ids) {
    const n = state.mapNodes.find((m) => m.id === id)
    if (!n) continue
    const before = n.status
    damageNodeEco(n, ECO_ANIMAL_ROUTE_PRESSURE, state.elapsedTime)
    n.lastUsedAt = state.elapsedTime
    if (n.status !== before) anyStatusChanged = true
  }
  if (anyStatusChanged) {
    bumpMapRevision()
  }
}

// 生态健康：每帧推进；附带"上一次的 ecoState / 不可用集合"做跨帧比较
let lastEcoStates: Map<string, 'healthy' | 'pressured' | 'damaged' | 'degraded'> = new Map()
let lastEcoUnavail: Set<string> = new Set()
// 生态健康教育 toast：上次提示时间（elapsedTime 秒）
let lastMigrationPressureToastAt = 0
let lastEcoToastAt: { [key: string]: number } = {}
const ECO_TOAST_COOLDOWN = 6 // 同类 toast 至少间隔 6 秒

/**
 * 推进一帧生态健康 tick（v2）
 * - 人类活动覆盖节点时按 ECO_HUMAN_DAMAGE_PER_SECOND 扣血（与人类圆大小略成正比）
 * - 动物迁徙压力在结算时已通过 applyMigrationPressureOnComplete 一次性施加
 * - 无干扰时按 ECO_RECOVERY_PER_SECOND 缓慢恢复
 * - 状态跨分界时给出轻量提示
 */
function tickEcoHealth(dt: number): void {
  if (!state.mapNodes || state.mapNodes.length === 0) {
    lastEcoStates.clear()
    lastEcoUnavail.clear()
    return
  }
  ensureEcoFieldsFor(state.mapNodes)

  // 收集人类活动压强源
  // 注意：生态扣血半径必须和路线阻断 / 视觉外圈一致。
  // getBlockingHumanClusters().r 已经是 blockR + HUMAN_BLOCKER_PADDING。
  const sources: HumanPressureSource[] = []
  if (state.humanActive) {
    const clusters = getBlockingHumanClusters()
    for (const c of clusters) {
      if (!c.blocking) continue
      sources.push({
        x: c.x,
        y: c.y,
        radius: c.r,
        active: true
      })
    }
  }

  const now = state.elapsedTime
  // v2: 按节点分别推进
  // 1) 人类活动覆盖节点 → damageNodeEco（基础速率；圆越大略快，但不超 MAX）
  // 2) 没有人类覆盖 → recoverNodeEco（按 ECO_RECOVERY_PER_SECOND 慢速回血）
  const enteredPressured: string[] = []
  const enteredDamaged: string[] = []
  const enteredDegraded: string[] = []
  const enteredUnavailable: string[] = []
  const reenteredUsable: string[] = []
  let anyStatusChanged = false

  for (const n of state.mapNodes) {
    if (typeof n.health !== 'number') syncNodeEcoState(n)
    const prevState = n.ecoState
    const wasUnavailable = isNodeEcoUnavailableV2(n)

    // 是否被人类覆盖
    let humanDamagePerSec = 0
    if (sources.length > 0) {
      for (const s of sources) {
        if (!s.active) continue
        const d = Math.hypot(n.x - s.x, n.y - s.y)
        if (d > s.radius) continue
        // 圆越大扣血略快，但有上限
        const base = ECO_HUMAN_DAMAGE_PER_SECOND
        const max = base * 1.6
        const refR = 120
        const ratio = refR > 0 ? Math.min(1, s.radius / refR) : 0
        humanDamagePerSec = base + (max - base) * ratio
        break
      }
    }

    let changed = false
    if (humanDamagePerSec > 0) {
      const dmg = humanDamagePerSec * dt
      const actual = damageNodeEco(n, dmg, now)
      if (actual > 0) {
        // 只记录"人类活动造成的持续扣血"时间，用于地图节点即时受击反馈
        n.lastHumanDamagedAt = now
        changed = true
      }
    } else {
      // 没有人类覆盖：尝试自然恢复
      const rec = recoverNodeEco(n, ECO_RECOVERY_PER_SECOND * dt, now)
      if (rec > 0) changed = true
    }

    // 状态跨分界收集
    if (n.ecoState !== prevState) {
      if (n.ecoState === 'pressured') enteredPressured.push(n.id)
      if (n.ecoState === 'damaged') enteredDamaged.push(n.id)
      if (n.ecoState === 'degraded') enteredDegraded.push(n.id)
    }
    if (isNodeEcoUnavailableV2(n) && !wasUnavailable) {
      enteredUnavailable.push(n.id)
      changed = true
    } else if (!isNodeEcoUnavailableV2(n) && wasUnavailable) {
      // 仅在真正跨过恢复阈值时记录
      if (n.health >= 35) reenteredUsable.push(n.id)
      changed = true
    }
    if (changed) anyStatusChanged = true
  }

  // 状态变化时 bumpMapRevision，避免可通行性变化后路线系统不刷新
  if (anyStatusChanged) {
    bumpMapRevision()
  }

  // 跨分界 toast：每个状态变化只提示一次（cooldown 6s）
  function maybeToast(key: string, text: string, kind: 'info' | 'warning' = 'info') {
    if ((now - (lastEcoToastAt[key] ?? -999)) < ECO_TOAST_COOLDOWN) return
    lastEcoToastAt[key] = now
    pushToast(text, kind, 2200)
  }

  if (enteredDegraded.length > 0) {
    const sample = enteredDegraded[0]
    const n = state.mapNodes.find((x) => x.id === sample)
    maybeToast(
      'eco:degraded',
      n ? `「${n.name}」栖息地退化，暂时无法作为迁徙终点` : '栖息地退化，请尝试其他迁徙路线',
      'warning'
    )
  }
  if (enteredUnavailable.length > 0) {
    const sample = enteredUnavailable[0]
    const n = state.mapNodes.find((x) => x.id === sample)
    maybeToast(
      'eco:unavailable',
      n ? `「${n.name}」承载压力过高，需要休养` : '该节点承载压力过高，需要休养',
      'warning'
    )
  }
  if (reenteredUsable.length > 0) {
    const sample = reenteredUsable[0]
    const n = state.mapNodes.find((x) => x.id === sample)
    maybeToast(
      'eco:recover',
      n ? `「${n.name}」生态恢复中，欢迎生物重新经过` : '生态恢复中，请尝试其他迁徙路线',
      'info'
    )
  }
  if (enteredPressured.length > 0) {
    const sample = enteredPressured[0]
    const n = state.mapNodes.find((x) => x.id === sample)
    maybeToast(
      'eco:pressured',
      n ? `「${n.name}」受到人类活动压力，生态健康下降` : '人类活动正在压迫栖息地',
      'warning'
    )
  }
  if (enteredDamaged.length > 0) {
    const sample = enteredDamaged[0]
    const n = state.mapNodes.find((x) => x.id === sample)
    maybeToast(
      'eco:damaged',
      n ? `「${n.name}」栖息地明显受损，请留意` : '人类活动正在削弱这片栖息地',
      'info'
    )
  }

  // 缓存当前状态供下一帧对比（保留 lastEcoStates / lastEcoUnavail 兼容旧引用）
  lastEcoStates = new Map(state.mapNodes.map((n) => [n.id, n.ecoState]))
  lastEcoUnavail = new Set(
    state.mapNodes.filter((n) => typeof n.health === 'number' && n.health <= 0).map((n) => n.id)
  )
}

/** 找任务对应的物种 */
function findSpecies(id: string): SpeciesDef | undefined {
  return getSpeciesTemplate(id)
}

/** 阶段判定（基于总成功数） */
function computeStage(): number {
  let s = 1
  for (let i = 0; i < STAGE_UNLOCK_SCORES.length; i++) {
    if (state.totalSuccess >= STAGE_UNLOCK_SCORES[i]) s = i + 2
  }
  return s
}

function computeMaxConcurrent(stage: number): number {
  if (stage >= 6) return STAGE6_MAX_CONCURRENT // 5
  if (stage >= 5) return STAGE5_MAX_CONCURRENT // 4
  if (stage === 4) return 3
  if (stage >= 2) return 2
  return 1
}

/**
 * 不同阶段的任务生成间隔（秒）。
 * - 阶段 1：基础（12.0s）—— 给玩家熟悉节奏
 * - 阶段 2-6：随阶段逐步压缩到 7.0s，配合更大的 maxConcurrent
 *   让后期"多任务 + 高密度"成为常态
 *
 * 注意：实际生成仍然受 maxConcurrent + waypoint 候选约束，
 * 这里只是降低"补任务的概率门槛"。
 */
function computeTaskSpawnInterval(stage: number): number {
  if (stage >= 6) return 7.0
  if (stage >= 5) return 8.0
  if (stage >= 4) return 9.0
  if (stage >= 3) return 10.0
  if (stage >= 2) return 11.0
  return TASK_SPAWN_INTERVAL_BASE // 12.0
}

function applyStage(newStage: number) {
  if (newStage === state.stage) return
  const old = state.stage
  state.stage = newStage
  state.maxConcurrent = computeMaxConcurrent(newStage)
  state.taskSpawnInterval = computeTaskSpawnInterval(newStage)
  if (newStage >= 2 && state.nextSeasonIn >= 999) {
    state.nextSeasonIn = SEASON_INTERVAL
  }
  tryUnlockSpeciesForStage(newStage)
  pushToast(`进入第 ${newStage} 阶段`, 'info', 1500)
}

function tryUnlockSpeciesForStage(newStage: number) {
  // 不再写死 4 个物种：从 SPECIES_TEMPLATES + SPECIES_UNLOCK_STAGES 自动生成
  // 这样新增物种只需要更新 speciesTemplates.ts，自动生效
  const targets = SPECIES_TEMPLATES
    .map((sp) => ({ id: sp.id, stage: SPECIES_UNLOCK_STAGES[sp.id] ?? 1 }))
    .sort((a, b) => a.stage - b.stage)
  const clusters = getBlockingHumanClusters()
  for (const t of targets) {
    if (newStage < t.stage) continue
    if (state.unlockedSpeciesIds.includes(t.id)) continue
    // 已灭绝物种不再重新解锁
    if (state.extinctSpeciesIds.includes(t.id)) continue
    const sp = getSpeciesTemplate(t.id)
    if (!sp) continue
    if (!canGenerateTaskFor(sp, state.mapNodes)) continue
    // v5: 用廉价检查替代 canSpawnSolvableTask，
    // 避免在 tickGame 中多次触发 stateSearch 导致主线程卡死
    if (!canSpawnSolvableTaskQuick(sp, state.mapNodes, state.season, clusters)) continue
    state.unlockedSpeciesIds.push(t.id)
    pushToast(`新物种加入：${sp.name}（${sp.englishName}）`, 'success', 3000)
    // 新物种出现 → 播放「新物种出现」音效 1 次
    playNewSpecies()
    // 同步背景音乐：让该物种的 bg 循环开始
    syncSpeciesBackgrounds(state.unlockedSpeciesIds, state.extinctSpeciesIds)
  }
}

// =============================================================
// 物种多样性 / 灭绝
// =============================================================
//
// 失败判定从 v3 起改用"物种多样性"机制：
// 1) 每次失败只给对应 species 的失败次数 +1
// 2) 累计 SPECIES_EXTINCTION_FAILURES 后该物种加入 extinctSpeciesIds
// 3) 已灭绝物种未完成任务被清理；不再生成新任务
// 4) 物种多样性 = 存活已解锁物种 / 已解锁物种 * 100
//    <= BIODIVERSITY_FAILURE_THRESHOLD (≈ 33.3) → gameOver
//
// 保留旧 MAX_FAILURES / state.failures 字段但不再作为游戏失败判定。

/** 获取某物种当前的失败次数（0 表示没失败过） */
function getSpeciesFailureCount(speciesId: string): number {
  if (!speciesId) return 0
  const v = state.speciesFailureCounts[speciesId]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * 获取某物种当前的成功迁徙次数（0 表示还没成功过）。
 * 与 getSpeciesFailureCount 对偶，给 TopBar 气泡 / SpeciesPanel
 * 用来展示"已成功 N 次 / X 分"等数据。
 */
function getSpeciesSuccessCount(speciesId: string): number {
  if (!speciesId) return 0
  const v = state.speciesSuccessCounts[speciesId]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** 某物种是否已灭绝 */
function isSpeciesExtinct(speciesId: string): boolean {
  if (!speciesId) return false
  return state.extinctSpeciesIds.includes(speciesId)
}

/**
 * 物种多样性百分比（0~100）
 * - 已解锁物种数 = unlockedSpeciesIds.length
 * - 存活已解锁物种数 = unlocked - extinct
 * - 多样性 = 存活 / 已解锁 * 100
 * - 已解锁物种 = 0 时返回 100（避免开局被立即判负）
 */
function getBiodiversityPercent(): number {
  const unlocked = state.unlockedSpeciesIds.length
  if (unlocked === 0) return 100
  let alive = 0
  for (const sid of state.unlockedSpeciesIds) {
    if (!state.extinctSpeciesIds.includes(sid)) alive++
  }
  return Math.max(0, Math.min(100, (alive / unlocked) * 100))
}

/**
 * 给某物种失败次数 +1
 * - 累计达 SPECIES_EXTINCTION_FAILURES 时：
 *   - 该物种加入 extinctSpeciesIds
 *   - 清理该物种未完成任务
 *   - 提示 toast
 *   - 触发 bumpMapRevision 让路线系统重新评估
 * - 之后不再生成该物种的新任务
 *
 * @returns true 表示本帧发生了灭绝事件
 */
function bumpSpeciesFailure(speciesId: string): boolean {
  if (!speciesId) return false
  if (state.extinctSpeciesIds.includes(speciesId)) return false
  const before = getSpeciesFailureCount(speciesId)
  const after = before + 1
  state.speciesFailureCounts[speciesId] = after
  if (after < SPECIES_EXTINCTION_FAILURES) {
    console.log(`[bumpSpeciesFailure] ${speciesId} 失败 ${after}/${SPECIES_EXTINCTION_FAILURES} (未灭绝)`)
    return false
  }
  // 灭绝
  console.log(`[bumpSpeciesFailure] ⚠️ ${speciesId} 已灭绝! failures=${after}, unlocked=${state.unlockedSpeciesIds}, extinct=${[...state.extinctSpeciesIds, speciesId]}`)
  state.extinctSpeciesIds.push(speciesId)
  cleanupSpeciesTasks(speciesId)
  bumpMapRevision()
  // 物种灭绝 → 停止该物种的 bg 循环
  syncSpeciesBackgrounds(state.unlockedSpeciesIds, state.extinctSpeciesIds)
  const sp = getSpeciesTemplate(speciesId)
  pushToast(
    sp ? `${sp.name} 累计失败 ${SPECIES_EXTINCTION_FAILURES} 次，已灭绝` : `${speciesId} 已灭绝`,
    'error',
    3200
  )
  return true
}

/** 清理某物种未完成的任务（waiting / migrating） */
function cleanupSpeciesTasks(speciesId: string): void {
  if (!speciesId) return
  const removedTaskIds: string[] = []
  for (const t of state.activeTasks) {
    if (t.speciesId !== speciesId) continue
    if (t.status === 'fading' || t.status === 'done') continue
    t.status = 'done'
    removedTaskIds.push(t.id)
  }
  // 删除已 done 的 + 取消 in-route 的 segment
  for (const id of removedTaskIds) {
    const t = state.activeTasks.find((x) => x.id === id)
    if (t) {
      const idx = state.activeTasks.indexOf(t)
      if (idx >= 0) state.activeTasks.splice(idx, 1)
    }
    const route = state.completedRoutes.find((r) => r.taskId === id)
    if (route) {
      state.usedSegments = Math.max(0, state.usedSegments - route.segmentCount)
      const ridx = state.completedRoutes.indexOf(route)
      if (ridx >= 0) state.completedRoutes.splice(ridx, 1)
    }
  }
  refreshAllTaskVisualPositions()
  if (state.selectedTaskId && removedTaskIds.includes(state.selectedTaskId)) {
    const next = state.activeTasks.find((x) => x.status === 'waiting' || x.status === 'migrating')
    state.selectedTaskId = next ? next.id : null
  }
}

/**
 * 检查多样性阈值，若过低则触发 gameOver
 */
function checkBiodiversityGameOver(): void {
  if (state.gameOver) return
  // 教程阶段不允许 gameOver：教程中 gameStarted=false，
  // 此时 tickGame 不再处理任务超时，但 tutorial 内部可能间接触发该检查。
  // 没有真正开始游戏就不能判定生态崩溃。
  if (!state.gameStarted) return
  const pct = getBiodiversityPercent()
  if (pct <= BIODIVERSITY_FAILURE_THRESHOLD) {
    console.trace('[checkBiodiversityGameOver] 触发 gameOver', { pct, stage: state.stage, gameStarted: state.gameStarted, unlocked: state.unlockedSpeciesIds.length, extinct: state.extinctSpeciesIds.length })
    state.gameOver = true
    state.survivalTime = state.elapsedTime // 确保 survivalTime 在 gameOver 瞬间已被封存
    pushToast(
      `物种多样性已降至 ${pct.toFixed(1)}%，生态崩溃`,
      'error',
      4500
    )
  } else {
    console.log('[checkBiodiversityGameOver] 未触发', { pct, stage: state.stage, threshold: BIODIVERSITY_FAILURE_THRESHOLD })
  }
}

function checkStageUpgrade() {
  const target = computeStage()
  if (target > state.stage) applyStage(target)
}

function switchSeason() {
  const order: SeasonId[] = ['normal', 'storm', 'drought']
  const idx = order.indexOf(state.season)
  const next = order[(idx + 1) % order.length]
  state.season = next
  state.nextSeasonIn = SEASON_INTERVAL
  const info = SEASON_INFO[next]
  pushToast(`季节切换：${info.name}（${info.description}）`, 'info', 2200)
}

// ============================================================
// 多任务 logo 排布
// ============================================================

function hasLiveSelectedTask(): boolean {
  if (!state.selectedTaskId) return false
  return state.activeTasks.some((t) =>
    t.id === state.selectedTaskId &&
    (t.status === 'waiting' || t.status === 'migrating' || t.status === 'fading')
  )
}

function groupTasksByStartNode(): Map<string, SpeciesTask[]> {
  const groups = new Map<string, SpeciesTask[]>()
  for (const t of state.activeTasks) {
    if (t.status !== 'waiting' && t.status !== 'migrating') continue
    const key = t.startNodeId
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.spawnedAt - b.spawnedAt)
  }
  return groups
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function getTaskVisualPosition(
  task: SpeciesTask,
  siblingIndex: number,
  siblingCount: number
): { x: number; y: number } | null {
  const node = getNode(task.startNodeId)
  if (!node) {
    if (typeof console !== 'undefined') {
      console.warn(`Task start node missing: ${task.startNodeId} (species=${task.speciesId})`)
    }
    return null
  }

  if (siblingCount <= 1) {
    return { x: node.x, y: node.y - 34 }
  }

  const radius = 38
  const angleStart = -140
  const angleEnd = -40
  const t = siblingIndex / (siblingCount - 1)
  const angle = angleStart + (angleEnd - angleStart) * t
  return {
    x: node.x + Math.cos(toRad(angle)) * radius,
    y: node.y + Math.sin(toRad(angle)) * radius
  }
}

function refreshAllTaskVisualPositions() {
  const groups = groupTasksByStartNode()
  for (const arr of groups.values()) {
    arr.forEach((t, i) => {
      const pos = getTaskVisualPosition(t, i, arr.length)
      if (!pos) {
        t.visualStartX = undefined
        t.visualStartY = undefined
        return
      }
      t.visualStartX = pos.x
      t.visualStartY = pos.y
    })
  }
}

function ensureTaskVisualPosition(task: SpeciesTask) {
  if (typeof task.visualStartX === 'number' && typeof task.visualStartY === 'number') {
    if (task.visualStartX !== 0 || task.visualStartY !== 0) return
  }
  const groups = groupTasksByStartNode()
  const arr = groups.get(task.startNodeId) || [task]
  const i = arr.findIndex((t) => t.id === task.id)
  const pos = getTaskVisualPosition(task, i < 0 ? 0 : i, arr.length)
  if (!pos) {
    task.visualStartX = undefined
    task.visualStartY = undefined
    return
  }
  task.visualStartX = pos.x
  task.visualStartY = pos.y
}

/** 尝试生成任务（仅 waiting 状态） */
function tryGenerateTask(speciesId?: string): SpeciesTask | null {
  if (state.gameOver) return null
  // v11：未开始时不允许生成任务（玩法窗口期间不应该有任何任务出现）
  // 教学阶段例外：intro 阶段需要有一个任务让玩家看到
  const allowDuringTutorial = state.tutorialActive && state.tutorialPhase === 'intro'
  if (!state.gameStarted && !allowDuringTutorial) return null

  const clusters = getBlockingHumanClusters()

  const liveTasks = state.activeTasks.filter((t) =>
    t.status === 'waiting' || t.status === 'migrating'
  )

  if (liveTasks.length >= state.maxConcurrent) return null

  const liveCountBySpecies = new Map<string, number>()
  for (const t of liveTasks) {
    liveCountBySpecies.set(t.speciesId, (liveCountBySpecies.get(t.speciesId) ?? 0) + 1)
  }

  // 后期（阶段 5+）允许同一物种最多同时出现 2 个；
  // 阶段 1-4 保持 1 个，避免"全是候鸟/全是鲑鱼"的单调局面
  const maxSameSpecies = state.stage >= 5 ? 2 : 1

  const candidates = state.unlockedSpeciesIds.filter((sid) => {
    if (speciesId && sid !== speciesId) return false

    // 已灭绝物种不再生成新任务
    if (state.extinctSpeciesIds.includes(sid)) return false

    const sameCount = liveCountBySpecies.get(sid) ?? 0
    if (sameCount >= maxSameSpecies) return false

    const sp = findSpecies(sid)
    if (!sp) return false
    if (!canGenerateTaskFor(sp, state.mapNodes)) return false
    // v5: 改用廉价检查；真正的"可解"由 generateTask 内部 findSolvableRouteForSpecies 兜底
    // 之前先 canSpawn 再 generate 会重复调 stateSearch 阻塞主线程
    if (!canSpawnSolvableTaskQuick(sp, state.mapNodes, state.season, clusters)) return false

    return true
  })

  if (candidates.length === 0) return null

  // 优先生成当前屏幕上数量更少的物种，避免一直候鸟。
  const minLive = Math.min(
    ...candidates.map((sid) => liveCountBySpecies.get(sid) ?? 0)
  )

  const pool = candidates.filter((sid) => (liveCountBySpecies.get(sid) ?? 0) === minLive)
  rng.shuffle(pool)

  for (const sid of pool) {
    const sp = findSpecies(sid)
    if (!sp) continue

    const task = generateTask({
      rng,
      species: sp,
      nodes: state.mapNodes,
      elapsedTime: state.elapsedTime,
      season: state.season,
      humanClusters: clusters,
      maxAttempts: 32
    })

    if (task) {
      state.activeTasks.push(task)
      refreshAllTaskVisualPositions()

      if (!state.dragState.active && !hasLiveSelectedTask()) {
        state.selectedTaskId = task.id
      }

      return task
    }
  }

  return null
}

/**
 * 硬规则：保证 waiting 任务一定存在。
 * v10 强化：
 * 1) 已有 waiting 任务即可返回（不再单任务独占）
 * 2) 尝试 fillWaitingTasks 把并发补满
 * 3) 兜底：保证候鸟基础节点存在后再补一次
 * 4) 极端兜底：单独生成候鸟任务
 * 5) 不要重置人类活动圈位置
 *    如果当前 blocker 位置导致暂时生成不了任务，就继续走后面的 starter node 兜底
 * 不允许关闭 blocking；不允许 setTimeout 兜底
 */
function liveTaskCount(): number {
  return state.activeTasks.filter((t) =>
    t.status === 'waiting' || t.status === 'migrating'
  ).length
}

function fillWaitingTasks(reason: string): boolean {
  if (state.gameOver) return false
  if (!state.gameStarted) return false

  let made = false
  let guard = 0

  while (liveTaskCount() < state.maxConcurrent && guard < state.maxConcurrent * 4) {
    guard++

    const before = state.activeTasks.length
    const task = tryGenerateTask()

    if (!task || state.activeTasks.length === before) break
    made = true
  }

  if (!state.selectedTaskId) {
    const next = state.activeTasks.find((t) => t.status === 'waiting')
      || state.activeTasks.find((t) => t.status === 'migrating')
    state.selectedTaskId = next?.id ?? null
  }

  void reason
  return made
}

/**
 * v11 节奏：仅补"至少 1 个 waiting"任务，不直接补满。
 * - 如果当前有 waiting 或 migrating 任务，不再补
 * - 如果当前没有 waiting，尝试补 1 个
 * - 兜底逻辑沿用 ensureWaitingMigrationTask（包括 starter node 修复）
 * - 实际"是否补满到 maxConcurrent"由 tickGame 的 spawn timer 控制
 */
function replenishAtLeastOneWaiting(reason: string): boolean {
  if (state.gameOver) return false
  if (!state.gameStarted) return false

  // 已经有 waiting 时不补；migrating 状态不能算 waiting
  const hasWaiting = state.activeTasks.some((t) => t.status === 'waiting')
  if (hasWaiting) return true

  // 没有 waiting：尝试补 1 个
  const task = tryGenerateTask()
  if (task) {
    if (!state.selectedTaskId) state.selectedTaskId = task.id
    return true
  }

  // 兜底：先确保候鸟基础节点存在，再补一次
  ensureStarterNodesForBird()
  bumpMapRevision()
  if (tryGenerateTask()) {
    if (!state.selectedTaskId) {
      const t = state.activeTasks.find((x) => x.status === 'waiting')
      if (t) state.selectedTaskId = t.id
    }
    return true
  }

  // 最后兜底：候鸟
  if (tryGenerateTask('bird')) return true

  if (typeof console !== 'undefined') {
    console.warn(`[replenishAtLeastOneWaiting] failed to spawn waiting (reason=${reason})`)
  }
  return false
}

function ensureWaitingMigrationTask(reason: string): boolean {
  if (state.gameOver) return false
  // v11：未开始时不允许生成任务
  if (!state.gameStarted) return false

  if (liveTaskCount() >= state.maxConcurrent) {
    return state.activeTasks.some((t) => t.status === 'waiting')
  }

  if (fillWaitingTasks(reason)) return true

  // 兜底：确保候鸟基础节点存在，但不要只强制生成候鸟。
  ensureStarterNodesForBird()
  bumpMapRevision()

  if (fillWaitingTasks(`${reason}_after_starter_fix`)) return true

  // 最后的最后才尝试候鸟，不能作为常规路径。
  if (tryGenerateTask('bird')) return true

  if (typeof console !== 'undefined') {
    console.warn(`[ensureWaitingMigrationTask] failed to generate task (reason=${reason})`)
  }

  return false
}

// ============================================================
// 路线提交
// ============================================================

function submitRoute(taskId: string, route: string[]): { ok: boolean; msg?: string; flashRiskZoneId?: string } {
  const task = state.activeTasks.find((t) => t.id === taskId)
  if (!task) return { ok: false, msg: '任务不存在' }
  const species = findSpecies(task.speciesId)
  if (!species) return { ok: false, msg: '物种不存在' }
  const result: ValidationResult = validateRoute(
    route, task, species, state.mapNodes,
    state.usedSegments, state.maxSegments, state.season
  )
  if (!result.ok) {
    task.errorMsg = result.msg
    task.errorFlashAt = Date.now()
    if (result.flashRiskZoneId) {
      task.flashRiskZoneId = result.flashRiskZoneId
      task.flashRiskZoneAt = Date.now()
    }
    return { ok: false, msg: result.msg, flashRiskZoneId: result.flashRiskZoneId }
  }
  const startNode = getNode(task.startNodeId)
  if (!startNode) {
    return { ok: false, msg: `任务起点节点缺失：${task.startNodeId}` }
  }
  const visualStartX = task.visualStartX ?? startNode.x
  const visualStartY = task.visualStartY ?? (startNode.y - 34)

  task.status = 'migrating'
  task.path = [...route]
  task.progress = 0
  task.remaining = -1
  const segCount = route.length - 1
  state.usedSegments += segCount
  const routeObj: ActiveRoute = {
    id: `r${routeIdSeq++}`,
    taskId: task.id,
    speciesId: task.speciesId,
    color: species.color,
    nodeIds: [...route],
    visualStartX,
    visualStartY,
    segmentCount: segCount,
    status: 'migrating',
    fadeProgress: 0
  }
  state.completedRoutes.push(routeObj)
  refreshAllTaskVisualPositions()
  // 路线提交成功 → 播放 routecomplete
  playRouteComplete()

  // 引导系统：玩家在 intro 阶段成功提交了路线 → 自动跳到最后一步
  // v13：intro 现在是 7 步；最后的 step 6（0-indexed）是"物种多样性"。
  // 玩家完成第一次拖动后（之前是 step 6 拖动步骤），现在对应 step 5
  // （target 节点）后直接拖动。
  if (state.tutorialActive && state.tutorialPhase === 'intro' && state.tutorialStep === 5) {
    // 给出"我拖好了"的反馈
    pushToast('路线已提交', 'success', 1200)
    // 推进到最后一步（step 6，物种多样性讲解）
    state.tutorialStep = 6
  }

  return { ok: true }
}

function completeTask(taskId: string) {
  const task = state.activeTasks.find((t) => t.id === taskId)
  if (!task) return
  task.status = 'fading'
  task.progress = 1
  task.pulseAt = Date.now()
  // 关键拆分：
  // - state.totalSuccess  = 成功迁徙次数（整数，单纯计数）
  // - state.score         = 迁徙得分（按物种 successScore 加权的总和，浮点）
  // 两者必须在更新时同步推进，但语义不同：次数用于阶段解锁 / 难度推进，
  // 得分为玩家直观看到的"我保护生态的成果"。
  // 单一事实源：species.successScore
  const sp = getSpeciesTemplate(task.speciesId)
  const points = sp?.successScore ?? 1
  state.score = roundScore(state.score + points)
  state.totalSuccess += 1
  // 物种级成功次数：用于 TopBar 物种气泡中显示"已成功 N 次"
  state.speciesSuccessCounts[task.speciesId] = (state.speciesSuccessCounts[task.speciesId] || 0) + 1
  const route = state.completedRoutes.find((r) => r.taskId === taskId)
  if (route) route.status = 'fading'

  // 生态健康：动物迁徙成功后，对路径上节点施加"承载压力"
  applyMigrationPressureOnComplete(task)

  scheduleTaskCleanup(taskId)
  checkStageUpgrade()
  const target = computeStage()
  tryUnlockSpeciesForStage(target)
  // 每成功一次迁徙，尝试揭示一个节点（与时间/失败解耦）
  revealNodeForSuccessfulMigration()
  maybeActivateHuman()
  updateHumanHuntMode()
  // v11 节奏：完成任务后优先补到"至少有 1 个 waiting"，
  // 由 tickGame 的 spawn timer 决定何时把并发补满，避免瞬间塞满。
  replenishAtLeastOneWaiting('complete')
  // 教育性提示：本次迁徙对路径节点造成了"承载压力"
  if (task.path && task.path.length >= 2) {
    if ((state.elapsedTime - (lastMigrationPressureToastAt ?? -999)) > 14) {
      lastMigrationPressureToastAt = state.elapsedTime
      pushToast('保护迁徙通道，可以让更多动物安全通过', 'info', 2400)
    }
  }
}

/**
 * 每次成功迁徙后，尝试揭示一个新节点。
 * - 严格受 MAX_MAP_NODES 限制
 * - 只走"成功路径"；失败 / 超时 / 被吞噬 / 玩家不操作都不会调用
 * - 推完节点后立刻尝试解锁当前阶段的新物种
 */
function revealNodeForSuccessfulMigration(): void {
  if (state.mapNodes.length >= MAX_MAP_NODES) return
  const node = tryRevealOneNode(rng, state.mapNodes, {
    totalSuccess: state.totalSuccess,
    elapsedTime: state.elapsedTime
  })
  if (!node) return
  initNodeEco(node)
  state.mapNodes.push(node)
  bumpMapRevision()
  tryUnlockSpeciesForStage(computeStage())
  pushToast(`新生态点出现：${node.name}`, 'success', 2000)
}

function maybeActivateHuman() {
  if (state.humanActive) return
  if (state.totalSuccess >= HUMAN_ACTIVATION_SUCCESS) {
    state.humanActive = true
    state.humanLayerVisible = false
    // 人类系统激活：保证有唯一 blocker 存在
    ensureHumanBlocker()
    setHumanBlockerActive(true)
    pushToast('⚠️ 人类活动开始影响迁徙廊道', 'warning', 3500)
    // 人类系统激活时只保证至少 1 个 waiting，不直接补满，
    // 避免玩家还没准备好就被瞬间塞满任务。
    replenishAtLeastOneWaiting('activate')
    // 首次激活：触发"人类活动引导"
    if (!state.tutorialCompletedHuman && !state.tutorialActive) {
      // 延后到下个微任务，避免在同一帧里启动引导时遮挡 toast
      queueMicrotask(() => startHumanTutorial())
    }
  }
}

/**
 * 人类追击模式切换：成功迁徙数达到 HUMAN_HUNT_SUCCESS_THRESHOLD 时开启。
 * - 不会重置 / 重建 humanBlocker
 * - 不会瞬移人类位置
 * - 关闭时清空当前追击目标，屏保/玩家控制自然接管
 */
function updateHumanHuntMode(): void {
  const shouldHunt =
    state.humanActive &&
    state.totalSuccess >= HUMAN_HUNT_SUCCESS_THRESHOLD

  if (state.humanHuntActive === shouldHunt) return

  state.humanHuntActive = shouldHunt

  if (shouldHunt) {
    pushToast('⚠️ 人类开始主动追击正在迁徙的生物', 'warning', 3500)
  } else {
    setHumanHuntTarget(null)
  }
}

// =============================================================
// 人类追击：预测 + 选择
// =============================================================

let nextHumanHuntReplanIn = 0

function getTaskMoveDuration(task: SpeciesTask): number {
  // v12：按物种差异化迁徙速度
  // - 飞行物种（候鸟/蝴蝶）migrationSpeed 小 → 跑得快
  // - 草原兽群（陆地哺乳动物）migrationSpeed 大 → 明显比飞行慢
  // 缺省回退到 0.55，兼容无 migrationSpeed 字段的旧 task 数据
  const sp = findSpecies(task.speciesId)
  const seg = sp?.migrationSpeed ?? 0.55
  return Math.max(1.5, task.path.length * seg)
}

function getMigratingTaskPoint(
  task: SpeciesTask,
  progress: number
): { x: number; y: number } | null {
  return getPointAtProgress(
    task.path,
    Math.max(0, Math.min(1, progress)),
    state.mapNodes
  )
}

function estimateMigratingTaskVelocity(task: SpeciesTask): {
  vx: number
  vy: number
  speed: number
} {
  const dur = getTaskMoveDuration(task)
  const p0 = getMigratingTaskPoint(task, task.progress)
  const dt = 0.18
  const p1 = getMigratingTaskPoint(
    task,
    Math.min(1, task.progress + dt / dur)
  )

  if (!p0 || !p1) {
    return { vx: 0, vy: 0, speed: 0 }
  }

  const vx = (p1.x - p0.x) / dt
  const vy = (p1.y - p0.y) / dt

  return {
    vx,
    vy,
    speed: Math.hypot(vx, vy)
  }
}

interface InterceptCandidate {
  x: number
  y: number
  score: number
  taskId: string
  speciesId: string
}

function predictBestHumanInterceptForTask(
  task: SpeciesTask,
  humanX: number,
  humanY: number
): InterceptCandidate | null {
  if (task.status !== 'migrating') return null
  if (!task.path || task.path.length < 2) return null

  const dur = getTaskMoveDuration(task)
  const velocity = estimateMigratingTaskVelocity(task)

  let best: InterceptCandidate | null = null

  for (
    let lookahead = 0;
    lookahead <= HUMAN_HUNT_LOOKAHEAD_SECONDS;
    lookahead += HUMAN_HUNT_SAMPLE_STEP
  ) {
    const predictedProgress = Math.min(1, task.progress + lookahead / dur)
    const p = getMigratingTaskPoint(task, predictedProgress)
    if (!p) continue

    const humanDistance = distance(humanX, humanY, p.x, p.y)
    const humanEta = humanDistance / Math.max(1, HUMAN_BLOCKER_HUNT_SPEED)

    // 评分逻辑：
    // 1. 优先选择人类 ETA 和动物到达时间接近的点
    // 2. 其次选择离人类更近的点
    // 3. 动物速度越快，略微提高威胁感，让人类更积极追它
    const etaGap = Math.abs(humanEta - lookahead)
    const score =
      etaGap * 90 +
      humanDistance * 0.28 -
      velocity.speed * 0.12 +
      lookahead * 4

    if (!best || score < best.score) {
      best = {
        x: p.x,
        y: p.y,
        score,
        taskId: task.id,
        speciesId: task.speciesId
      }
    }
  }

  return best
}

function updateHumanHuntTarget(dt: number): void {
  if (!state.humanActive || !state.humanHuntActive) {
    setHumanHuntTarget(null)
    return
  }

  nextHumanHuntReplanIn -= dt
  if (nextHumanHuntReplanIn > 0) return
  nextHumanHuntReplanIn = HUMAN_HUNT_REPLAN_INTERVAL

  const human = getHumanBlocker()
  if (!human || !human.active) {
    setHumanHuntTarget(null)
    return
  }

  const migratingTasks = state.activeTasks.filter((t) => t.status === 'migrating')

  if (migratingTasks.length === 0) {
    setHumanHuntTarget(null)
    return
  }

  let best: InterceptCandidate | null = null

  for (const task of migratingTasks) {
    const candidate = predictBestHumanInterceptForTask(task, human.x, human.y)
    if (!candidate) continue
    if (!best || candidate.score < best.score) {
      best = candidate
    }
  }

  if (!best) {
    setHumanHuntTarget(null)
    return
  }

  setHumanHuntTarget({
    x: best.x,
    y: best.y,
    taskId: best.taskId,
    speciesId: best.speciesId,
    reason: 'hunt'
  })
}

let cleanupTimers: Record<string, number> = {}
function scheduleTaskCleanup(taskId: string) {
  if (cleanupTimers[taskId]) clearTimeout(cleanupTimers[taskId])
  cleanupTimers[taskId] = window.setTimeout(() => {
    const task = state.activeTasks.find((t) => t.id === taskId)
    if (task) {
      const idx = state.activeTasks.indexOf(task)
      if (idx >= 0) state.activeTasks.splice(idx, 1)
    }
    const route = state.completedRoutes.find((r) => r.taskId === taskId)
    if (route) {
      state.usedSegments = Math.max(0, state.usedSegments - route.segmentCount)
      const idx2 = state.completedRoutes.indexOf(route)
      if (idx2 >= 0) state.completedRoutes.splice(idx2, 1)
    }
    delete cleanupTimers[taskId]
    if (state.selectedTaskId === taskId) {
      const next = state.activeTasks.find((t) =>
        t.status === 'waiting' || t.status === 'migrating'
      )
      state.selectedTaskId = next?.id ?? null
    }
    refreshAllTaskVisualPositions()
  }, 1200)
}

function failTask(taskId: string) {
  const task = state.activeTasks.find((t) => t.id === taskId)
  if (!task) return
  console.log(`[failTask] ${task.speciesId} 任务失败, remaining=${task.remaining?.toFixed(2)}, status=${task.status}, gameStarted=${state.gameStarted}, failures=${state.failures + 1}`)
  // 兼容旧字段：state.failures 仍累加，但不再作为游戏失败判定
  state.failures += 1
  const extinctThisFrame = bumpSpeciesFailure(task.speciesId)
  pushToast(`${findSpecies(task.speciesId)?.name || '物种'}迁徙超时`, 'error')
  const idx = state.activeTasks.indexOf(task)
  if (idx >= 0) state.activeTasks.splice(idx, 1)
  refreshAllTaskVisualPositions()
  // 多样性 / 灭绝 之后才做 gameOver 判定
  if (extinctThisFrame) {
    checkBiodiversityGameOver()
  }
  // v11 节奏：失败后优先保证 1 个 waiting，不立刻补满
  replenishAtLeastOneWaiting('fail')
}

function cancelDrag() {
  state.dragState.active = false
  state.dragState.taskId = null
  state.dragState.path = []
  state.dragState.pointer = null
  state.dragState.overCancel = false
  state.dragState.overNodeId = null
  state.dragState.previewSegmentDistance = 0
  state.dragState.previewOverflow = false
  state.dragState.visualStartX = 0
  state.dragState.visualStartY = 0
  state.dragState.previewHumanBlocked = false
  state.dragState.previewHumanClusterId = null
}

function startDrag(taskId: string, visualStartX?: number, visualStartY?: number) {
  // 输入保护：暂停期间绝不允许启动新的拖线
  // 否则玩家在 human-tutorial 暂停期间按下 marker 会瞬间启动 dragState，
  // 等教程结束恢复时已经处于"未确认的拖线"状态。
  if (isGameplayPaused()) return
  const task = state.activeTasks.find((t) => t.id === taskId)
  if (!task) return
  ensureTaskVisualPosition(task)
  const startNode = getNode(task.startNodeId)
  if (!startNode) {
    if (typeof console !== 'undefined') {
      console.warn(`Cannot start drag: start node missing for task ${taskId} / ${task.startNodeId}`)
    }
    return
  }
  const vsx = visualStartX ?? task.visualStartX ?? startNode.x
  const vsy = visualStartY ?? task.visualStartY ?? (startNode.y - 34)
  state.dragState.active = true
  state.dragState.taskId = taskId
  state.dragState.visualStartX = vsx
  state.dragState.visualStartY = vsy
  state.dragState.path = [task.startNodeId]
  state.dragState.startTime = Date.now()
  state.dragState.overCancel = false
  state.dragState.overNodeId = null
  state.dragState.previewSegmentDistance = 0
  state.dragState.previewOverflow = false
  state.dragState.previewHumanBlocked = false
  state.dragState.previewHumanClusterId = null
  state.selectedTaskId = taskId
  // 玩家开始拖动某个物种 → 播放该物种的「准备迁徙」音频 1 次（缺失则忽略）
  playSpeciesSelect(task.speciesId)
}

function pushDragNode(nodeId: string) {
  if (!state.dragState.active) return
  if (state.dragState.path.includes(nodeId)) return
  // 硬规则：被人类阻挡的线段绝不允许 push 节点
  if (state.dragState.previewHumanBlocked) return
  // 防御性校验：拖拽物种天然不能通过的节点不允许加入路径
  // - useDragRoute 的 findSnapNode 已经做了过滤，但这里兜底，
  //   防止未来其他调用方绕过拖线吸附逻辑
  // - isNodeAllowedByTags 在 store 顶部 import 段集中管理
  const taskId = state.dragState.taskId
  const task = taskId
    ? state.activeTasks.find((t) => t.id === taskId)
    : undefined
  const species = task ? findSpecies(task.speciesId) : undefined
  const node = getNode(nodeId)
  if (!task || !species || !node) return
  if (!isNodeAllowedByTags(node, species.allowedNodeTags)) {
    return
  }
  state.dragState.path.push(nodeId)
  // 拖线经过一个新节点 → 播放 routeselect
  // 只有 path 长度 >= 2 时才响（第一个节点是起点，不算"经过"）
  if (state.dragState.path.length >= 2) {
    playRouteSelect()
    nodeHitTimestamps[nodeId] = performance.now()
  }
  // 新增节点后清掉 previewHumanBlocked：玩家已经从该节点继续拖线
  state.dragState.previewHumanBlocked = false
  state.dragState.previewHumanClusterId = null
}

function setDragPreview(d: number, overflow: boolean) {
  state.dragState.previewSegmentDistance = d
  state.dragState.previewOverflow = overflow
}

function setDragPointer(p: { x: number; y: number } | null) {
  state.dragState.pointer = p
}

function setDragOverCancel(v: boolean) {
  state.dragState.overCancel = v
}

function setDragOverNode(id: string | null) {
  state.dragState.overNodeId = id
}

function setPointerPos(p: { x: number; y: number } | null) {
  state.pointerPos = p
}

function setHumanPressActive(active: boolean) {
  state.humanPressActive = active
  if (!active) {
    setHumanPointerTarget(null, null, false)
  }
}

// =============================================================
// 暂停原因集合管理
// =============================================================
// 集中式 API：所有"暂停"或"恢复"都通过 setGameplayPause(reason, paused)
// 不要直接修改 state.pauseReasons，避免 add/remove 不对称
function setGameplayPause(reason: import('../data/gameData').GamePauseReason, paused: boolean): void {
  const exists = state.pauseReasons.includes(reason)
  if (paused && !exists) {
    state.pauseReasons.push(reason)
  }
  if (!paused && exists) {
    state.pauseReasons = state.pauseReasons.filter((item) => item !== reason)
  }
}

function isGameplayPaused(): boolean {
  return state.pauseReasons.length > 0
}

function setDragHumanBlocked(blocked: boolean, clusterId: string | null) {
  state.dragState.previewHumanBlocked = blocked
  state.dragState.previewHumanClusterId = clusterId
}

function selectTask(id: string | null) {
  state.selectedTaskId = id
}

function getNodeMap(): Map<string, RuntimeMapNode> {
  return new Map(state.mapNodes.map((n) => [n.id, n] as const))
}

function spawnNewNode(): boolean {
  return false
}

/**
 * v11：玩家点击【开始游戏】时调用。
 * 1. 关闭玩法说明窗口
 * 2. 计时器从 0 开始
 * 3. 立即补 2 个初始任务，让开局不空场
 * 4. 季节 / 人类 / 任务生成 / 缩圈点 等系统按原规则开始运行
 */
function startGame(): void {
  if (state.gameStarted) return
  if (state.gameOver) return

  console.log('[startGame] gameStarted=true, 当前 activeTasks:', state.activeTasks.length, 'waiting:', state.activeTasks.filter(t => t.status === 'waiting').length)
  state.gameStarted = true
  state.survivalTime = 0

  // 清除所有旧任务残留（如教程阶段留下的 status 异常的任务）
  state.activeTasks = state.activeTasks.filter(
    (t) => t.status === 'waiting' || t.status === 'migrating'
  )

  // 开局不空场：直接补 1 个任务
  const initialSpawn = 1
  let spawned = 0
  let guard = 0

  // 先尝试随机物种
  while (spawned < initialSpawn && guard < initialSpawn * 6) {
    guard++
    if (tryGenerateTask()) {
      spawned++
    } else {
      break
    }
  }

  // 如果随机物种失败，直接强制候鸟（不经过 quick check）
  if (spawned === 0) {
    console.warn('[startGame] 随机物种任务生成失败，兜底使用候鸟')
    ensureStarterNodesForBird()
    bumpMapRevision()
    // 直接调用 generateTask，跳过 canSpawnSolvableTaskQuick
    const sp = findSpecies('bird')
    if (sp) {
      const forcedTask = generateTask({
        rng,
        species: sp,
        nodes: state.mapNodes,
        elapsedTime: 0,
        season: state.season,
        skipSolvabilityCheck: true, // 跳过快速检查，内部 findSolvableRoute 兜底
      })
      if (forcedTask) {
        state.activeTasks.push(forcedTask)
        state.selectedTaskId = forcedTask.id
        spawned++
      }
    }
  }

  // 如果还是失败，重新生成地图后再试
  if (spawned === 0) {
    console.warn('[startGame] 候鸟任务仍然失败，重新生成地图')
    for (let retry = 0; retry < 5 && spawned === 0; retry++) {
      state.mapNodes = generateInitialMap(rng, 1)
      ensureEcoFieldsFor(state.mapNodes)
      bumpMapRevision()
      if (tryGenerateTask('bird')) spawned++
    }
  }

  if (spawned === 0) {
    console.error('[startGame] 无法生成任何任务！游戏可能立即结束')
  }
}

function restart(seed?: number) {
  Object.values(cleanupTimers).forEach((t) => clearTimeout(t))
  cleanupTimers = {}

  // 重启时彻底清空人类阻挡圆、追击目标、缩圈点、内部随机状态
  initHumanField()

  // 音频：先停掉所有 bg 循环，initGame 会重启 ambient + 物种 bg
  stopAllBackgrounds()

  initGame(seed)
  // 重新开始时跳过 intro / human 引导，直接进入正式对局
  state.tutorialCompletedIntro = true
  state.tutorialCompletedHuman = true
  // 启动计时 + 立即补任务（startGame 内部已经有 spawn 兜底）
  startGame()
  // 兜底再保底一次，避免"地图已重置但没有任务"的状态
  replenishAtLeastOneWaiting('restart')
}

/**
 * 推进一帧（v9）
 * 1) 任务倒计时 & 迁移动画
 * 2) 季节切换
 * 3) 任务生成（基于 elapsedTime / taskSpawnInterval 概率）
 * 4) 人类系统：缩圈点刷新 + 人类吃缩圈点
 * 5) 人类系统：吞噬正在迁徙的物种（task.status === 'migrating'）
 *
 * 节点揭示不在 tickGame 里做：每成功一次迁徙，
 * 由 completeTask → revealNodeForSuccessfulMigration 推一个。
 *
 * 不再负责：
 * - 人类阻挡圆移动（由 HumanHeatLayer 的 RAF 调 stepHumanBlocker）
 * - 递增 humanFieldVersion
 */
function tickGame(dt: number) {
  // v11：游戏未开始前不推进任何游戏逻辑（玩法窗口期间不应该感觉游戏在跑）
  // 教学 intro 阶段也走这条路径（不计时、不计分、任务不倒计时）
  if (!state.gameStarted) return
  if (state.gameOver) return
  // 暂停原因集合：人类教程 / 未来可扩展其他原因
  // 这是"游戏逻辑层"的安全保护，与 useGameLoop 层的 isRunning 互不依赖
  if (isGameplayPaused()) return

  // 人类活动层打开时，等待任务倒计时按 HUMAN_LAYER_TIME_SCALE 减速
  // 这样玩家不会被系统瞬间惩罚，但仍能感受到压力。
  const pressureDt =
    state.humanActive && state.humanLayerVisible
      ? dt * HUMAN_LAYER_TIME_SCALE
      : dt

  // 0) 缩圈点：每帧推进；只检查当前 active 人类
  if (state.humanActive) {
    tickShrinkPoint(pressureDt, undefined, () => {
      const anchors: { x: number; y: number; r: number }[] = []
      // 节点：禁止生成在节点附近
      for (const n of state.mapNodes) {
        if (n.status === 'disabled') continue
        anchors.push({ x: n.x, y: n.y, r: 30 })
      }
      // 人类圆：不能重叠
      const b = getHumanBlocker()
      if (b) anchors.push({ x: b.x, y: b.y, r: b.blockR + 20 })
      // 季节风险圈：避免缩圈点刷在风暴/干旱圈里
      for (const z of getActiveRiskZones(state.season, state.mapNodes)) {
        if (z.shape === 'circle' && typeof z.cx === 'number' && typeof z.cy === 'number' && typeof z.r === 'number') {
          anchors.push({ x: z.cx, y: z.cy, r: z.r + 20 })
        }
      }
      return anchors
    })
    // 人类吃缩圈点（只有玩家拖过去时才会真正吃）
    if (tryConsumeShrinkPoint(true)) {
      pushToast('人类吞下缩圈点，体型缩小', 'info', 1800)
    }
  }

  // 1) 任务推进
  for (let i = state.activeTasks.length - 1; i >= 0; i--) {
    const task = state.activeTasks[i]
    if (task.status === 'waiting') {
      task.remaining -= pressureDt
      if (task.remaining <= 0) {
        task.remaining = 0
        failTask(task.id)
      }
    } else if (task.status === 'migrating') {
      // v12：迁移动画时长按物种差异化（飞行快 / 陆地慢）
      const dur = getTaskMoveDuration(task)
      task.progress += pressureDt / dur
      // v9 吞噬检测：migrating 状态 + 当前位置在人类圆内 → 立刻失败
      if (state.humanActive) {
        if (tryDevourMigratingTask(task)) {
          continue  // task 已被移除
        }
      }
      if (task.progress >= 1) {
        task.progress = 1
        completeTask(task.id)
      }
    } else if (task.status === 'fading') {
      task.fadeProgress = Math.min(1, task.fadeProgress + pressureDt / 1.2)
    }
  }
  for (const route of state.completedRoutes) {
    if (route.status === 'fading') {
      route.fadeProgress = Math.min(1, route.fadeProgress + pressureDt / 1.2)
    }
  }

  // 1.5) 人类追击：模式判定 + 预测目标重算
  // - 不重新创建 humanBlocker
  // - 不刷新人类位置
  // - 不因动物完成/失败/被吞噬而瞬移
  updateHumanHuntMode()
  updateHumanHuntTarget(dt)

  // 1.6) 生态健康 tick：人类活动覆盖扣血 + 无干扰自然恢复
  // - 状态变化时给出轻量 toast
  // - 不会"突然把整局搞崩"：扣血被 rate 限制 + 自动恢复
  tickEcoHealth(pressureDt)

  state.year = 1 + Math.floor(state.elapsedTime / 60)
  if (state.stage >= 2 && state.nextSeasonIn < 999) {
    state.nextSeasonIn -= pressureDt
    if (state.nextSeasonIn <= 0) switchSeason()
  }

  // 3) v11 任务生成节奏
  // - 始终保证至少有 1 个 waiting（不依赖补满到 maxConcurrent）
  // - 已有 waiting 时：按 taskSpawnInterval（6.0s）随机补一个
  // - 没有 waiting 时：仅补 1 个
  // 这样玩家不会因为连续完成/失败/被吞噬而被瞬间刷满
  const hasWaiting = state.activeTasks.some((t) => t.status === 'waiting')

  if (!hasWaiting) {
    replenishAtLeastOneWaiting('tick_no_waiting')
  } else if (liveTaskCount() < state.maxConcurrent) {
    const interval = Math.max(TASK_SPAWN_INTERVAL_MIN, state.taskSpawnInterval)
    const spawnChance = pressureDt / interval
    if (rng.range(0, 1) < spawnChance) {
      // 已有 waiting 时只补 1 个，不直接补满
      tryGenerateTask()
    }
  }
}

/**
 * 人类吞噬正在迁徙的物种
 * - 只吞噬 status === 'migrating' 的任务
 * - 同一任务在同一帧不会重复触发（任务被立刻 splice）
 * - 失败后清理 completedRoutes 对应 route，返还 usedSegments
 * - 人类圆半径 +HUMAN_SIZE_STEP
 * - 返回 true 表示成功吞噬
 */
function tryDevourMigratingTask(task: SpeciesTask): boolean {
  if (task.status !== 'migrating') return false
  const b = getHumanBlocker()
  if (!b || !b.active) return false
  const pt = getPointAtProgress(task.path, task.progress, state.mapNodes)
  if (!pt) return false
  const d = Math.hypot(pt.x - b.x, pt.y - b.y)
  if (d > b.blockR) return false
  // 防止同一任务在同一帧重复触发
  if (task.devouredAt && Math.abs(task.devouredAt - state.elapsedTime) < 0.01) {
    return false
  }
  task.devouredAt = state.elapsedTime

  // 吞噬：立即让任务失败
  const species = findSpecies(task.speciesId)
  const speciesName = species?.name || '物种'
  // 返还 usedSegments（route 取消前 segmentCount 还在）
  const route = state.completedRoutes.find((r) => r.taskId === task.id)
  if (route) {
    state.usedSegments = Math.max(0, state.usedSegments - route.segmentCount)
  }
  // 移除 task
  const idx = state.activeTasks.indexOf(task)
  if (idx >= 0) state.activeTasks.splice(idx, 1)
  // 移除 route
  if (route) {
    const rIdx = state.completedRoutes.indexOf(route)
    if (rIdx >= 0) state.completedRoutes.splice(rIdx, 1)
  }
  // 人类变大
  const grew = growHuman()
  // 失败计数（旧字段仍累加，但不再作为失败判定）
  state.failures += 1
  const extinctThisFrame = bumpSpeciesFailure(task.speciesId)
  pushToast(
    `人类吞噬了${speciesName}，迁徙失败${grew ? '，人类体型变大' : ''}`,
    'error',
    2200
  )
  // 物种灭绝 / 多样性过低才触发 gameOver
  if (extinctThisFrame) {
    checkBiodiversityGameOver()
  }
  refreshAllTaskVisualPositions()
  // v11 节奏：被吞噬后优先保证 1 个 waiting，不立刻补满
  replenishAtLeastOneWaiting('devour')
  return true
}

function refreshVisualPositions() {
  refreshAllTaskVisualPositions()
}

export const gameStore = {
  state,
  nodeHitTimestamps,
  rng,
  initGame,
  restart,
  startGame,
  pushToast,
  tryGenerateTask,
  ensureWaitingMigrationTask,
  submitRoute,
  completeTask,
  failTask,
  selectTask,
  startDrag,
  pushDragNode,
  setDragPreview,
  setDragHumanBlocked,
  cancelDrag,
  setDragPointer,
  setDragOverCancel,
  setDragOverNode,
  setPointerPos,
  setHumanPressActive,
  spawnNewNode,
  tickGame,
  refreshVisualPositions,
  getTaskVisualPosition,
  findSpecies,
  getNode,
  getNodeMap,
  // 暂停原因集中式 API
  setGameplayPause,
  isGameplayPaused,
  // 物种多样性 / 灭绝
  getSpeciesFailureCount,
  getSpeciesSuccessCount,
  isSpeciesExtinct,
  getBiodiversityPercent,
  // 引导系统方法
  ensureTutorialTask,
  startTutorial,
  startHumanTutorial,
  nextTutorialStep,
  prevTutorialStep,
  skipTutorial,
  finishIntroTutorial,
  finishHumanTutorial,
  onTutorialTaskCompleted,
  applyTutorialStepEnter
}

// 开发模式：暴露 __allive
if (typeof window !== 'undefined') {
  ;(window as any).__allive = {
    setSeed: (s: number | string) => {
      const seed = typeof s === 'string' ? hashSeed(s) : s
      gameStore.restart(seed)
    },
    state
  }
}

// 距离工具（暴露给 composable 使用，避免再次 import）
export { distance }
// 抑制未使用变量警告
void SPECIES_TEMPLATES
void TASK_SPAWN_INTERVAL_MIN
void findSolvableRouteForSpecies
type _UnusedHumanCluster = HumanCluster

// ============================================================
// 引导系统（Tutorial）方法
// ============================================================

/** 保证教学阶段有 1 个候鸟任务存在（intro 用） */
function ensureTutorialTask(): SpeciesTask | null {
  // 已经有一个教学任务
  if (state.tutorialTaskId) {
    const existing = state.activeTasks.find((t) => t.id === state.tutorialTaskId)
    if (existing) return existing
    state.tutorialTaskId = null
  }
  // 只在 intro 阶段使用；human 阶段不强制
  if (state.tutorialPhase !== 'intro') return null

  // 已有 waiting 任务时，直接复用
  const waiting = state.activeTasks.find((t) => t.status === 'waiting')
  if (waiting) {
    state.tutorialTaskId = waiting.id
    return waiting
  }

  // 没有就生成一个（候鸟优先）
  let t = tryGenerateTask('bird')
  if (!t) t = tryGenerateTask()
  if (t) {
    state.tutorialTaskId = t.id
    // 教学阶段：拉长到不会倒计时跑完的 60s
    t.remaining = 60
    t.totalTime = 60
    state.selectedTaskId = t.id
  }
  return t
}

/** 启动 intro 引导 */
function startTutorial(): void {
  if (state.tutorialCompletedIntro) return
  state.tutorialActive = true
  state.tutorialPhase = 'intro'
  state.tutorialStep = 0
  // 生成一个候鸟任务作为引导目标
  ensureTutorialTask()
  // 触发 onEnter 副作用（由调用方 setCurrentStep 决定；这里只是占位）
}

/** 启动 human 引导（在 human 激活时自动调用） */
function startHumanTutorial(): void {
  if (state.tutorialCompletedHuman) return
  if (state.tutorialPhase === 'intro') return // intro 还没走完就别打扰
  // 用完整的 cancelDrag 清掉拖线状态（包括 path / pointer / overNodeId 等），
  // 避免只手动改 dragState.active / taskId 留下半截脏数据
  cancelDrag()
  // 清理人类长按状态，避免暂停前残留 pointer 控制
  setHumanPressActive(false)
  // 加入 human-tutorial 暂停原因；只有该原因消失时才恢复
  setGameplayPause('human-tutorial', true)

  state.tutorialActive = true
  state.tutorialPhase = 'human'
  state.tutorialStep = 0
}

/** 教学任务被提交后由调用方调用：自动判定是否进入"完成"步骤 */
function onTutorialTaskCompleted(): void {
  if (!state.tutorialActive) return
  if (state.tutorialPhase !== 'intro') return
  // 当前步骤若有"等待操作"标识，由 TutorialOverlay 推进；这里不做强制跳转
}

/** 玩家在引导中切图层 / 选中任务等 */
function applyTutorialStepEnter(stepId: string): void {
  // 步骤级副作用通过教程文件回调注入；保留这个 hook 以便未来扩展
  void stepId
}

/** 玩家点"下一步" */
function nextTutorialStep(): void {
  const total = getTutorialStepCount(state.tutorialPhase)
  if (state.tutorialStep < total - 1) {
    state.tutorialStep += 1
  } else {
    // 已到最后一步：完成当前阶段
    finishCurrentTutorial()
  }
}

/** 玩家点"上一步" */
function prevTutorialStep(): void {
  if (state.tutorialStep > 0) state.tutorialStep -= 1
}

/** 玩家点"直接跳过" */
function skipTutorial(): void {
  finishCurrentTutorial()
}

/** 完成当前 phase（intro / human） */
function finishCurrentTutorial(): void {
  if (state.tutorialPhase === 'intro') {
    finishIntroTutorial()
  } else if (state.tutorialPhase === 'human') {
    finishHumanTutorial()
  }
}

/** 完成 intro 引导：标记完成 + 启动正式游戏 */
function finishIntroTutorial(): void {
  if (state.tutorialPhase !== 'intro') return
  state.tutorialCompletedIntro = true
  state.tutorialActive = false
  state.tutorialPhase = null
  state.tutorialStep = 0
  // 清理教学任务标记（不删除任务，让它作为正式任务继续走）
  state.tutorialTaskId = null
  // 正式开赛
  startGame()
}

/** 完成 human 引导：标记完成 + 切回迁徙图层 */
function finishHumanTutorial(): void {
  if (state.tutorialPhase !== 'human') return
  state.tutorialCompletedHuman = true
  state.tutorialActive = false
  state.tutorialPhase = null
  state.tutorialStep = 0
  // 切回迁徙图层
  state.humanLayerVisible = false
  // 解除 human-tutorial 暂停原因（点击最后一步 / 跳过时均调用）
  setGameplayPause('human-tutorial', false)
  // 给一个简短提示，告诉玩家"现在可以继续迁徙"
  pushToast('回到迁徙图层，继续规划', 'info', 1800)
}
