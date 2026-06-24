// =============================================================
// 人类永久阻挡圆系统 v9
// =============================================================
// 核心规则：
// - 全地图只有 1 个永久阻挡圆
// - 人类一开始很小（HUMAN_MIN_RADIUS）
// - 人类不再自动游动；只有 pointer 按下 / 拖动时才移动
// - pointer 关闭后保持原地不动
// - 玩家引导人类去"吞噬"正在迁徙的物种，吞噬后人类圆半径 +HUMAN_SIZE_STEP
// - 地图边缘随机刷新"缩圈点"，人类吃到后半径 -HUMAN_SIZE_STEP
// - 半径限制在 [HUMAN_MIN_RADIUS, HUMAN_MAX_RADIUS] 区间
// - 不写 Vue state；不递增 humanFieldVersion
// - segmentHitsHumanCluster / pointInHumanCluster 仍是唯一几何入口
// =============================================================
import {
  HUMAN_BLOCKER_RADIUS,
  HUMAN_BLOCKER_VISUAL_RADIUS,
  HUMAN_BLOCKER_PADDING,
  HUMAN_BLOCKER_POINTER_SPEED,
  HUMAN_BLOCKER_POINTER_FOLLOW,
  HUMAN_BLOCKER_AUTO_SPEED,
  HUMAN_BLOCKER_AUTO_FOLLOW,
  HUMAN_AUTO_SHRINK_AVOID_RADIUS,
  HUMAN_BLOCKER_HUNT_SPEED,
  HUMAN_BLOCKER_HUNT_FOLLOW,
  HUMAN_BLOCKER_EDGE_PADDING,
  HUMAN_SIZE_STEP,
  HUMAN_MIN_RADIUS,
  HUMAN_MAX_RADIUS,
  HUMAN_SHRINK_POINT_RADIUS,
  HUMAN_SHRINK_POINT_MIN_INTERVAL,
  HUMAN_SHRINK_POINT_MAX_INTERVAL,
  HUMAN_SHRINK_POINT_EDGE_MARGIN_X,
  HUMAN_SHRINK_POINT_EDGE_MARGIN_Y,
  WORLD_WIDTH,
  WORLD_HEIGHT
} from '../data/gameConfig'
import { SeededRandom, hashSeed } from './seededRandom'

// ============================================================
// 类型
// ============================================================

/** 缩圈点 */
export interface HumanShrinkPoint {
  x: number
  y: number
  r: number
  active: boolean
}

/** 唯一阻挡圆实体 */
export interface HumanBlocker {
  id: 'human-blocker'
  active: boolean

  x: number
  y: number

  /** 屏保式自动移动的当前速度（像素/秒） */
  vx: number
  vy: number

  /** 逻辑阻挡半径 */
  blockR: number
  /** 视觉半径（中心圆） */
  visualR: number

  pointerActive: boolean
  pointerX: number | null
  pointerY: number | null

  /** 上次推进时刻（秒）；null 表示尚未初始化 */
  lastTime: number | null
}

/**
 * HumanCluster 兼容接口
 * - r == blockR + padding （路线逻辑阻挡半径）
 * - visualR == 视觉半径
 * - blocking == (humanBlocker.active)
 */
export interface HumanCluster {
  id: string
  x: number
  y: number
  r: number
  visualR?: number
  count: number
  density: number
  compactness: number
  blocking: boolean
}

/** 兼容旧 v6 HumanColony 类型 */
export type HumanColony = HumanBlocker

/** 兼容旧 v5 HumanHotspot */
export interface HumanHotspot {
  id: string
  x: number
  y: number
  r: number
  density: number
  mass: number
  blocking: boolean
}

/** 主动追击目标（成功迁徙达到阈值后由 gameStore 设置） */
export interface HumanHuntTarget {
  x: number
  y: number
  taskId: string
  speciesId: string
  reason: 'hunt'
}

/** 旧 HumanPressureTarget 保留为兼容（不再使用） */
export interface HumanPressureTarget {
  x: number
  y: number
  strength: number
  source: string
}

// ============================================================
// 内部状态
// ============================================================

const BLOCKER_ID: 'human-blocker' = 'human-blocker'
let humanBlocker: HumanBlocker | null = null
let _seededRng: SeededRandom | null = null

/** 主动追击目标（成功迁徙达到阈值后由 gameStore 设置） */
let humanHuntTarget: HumanHuntTarget | null = null

/** 缩圈点状态：要么 null 要么 active=true */
let shrinkPoint: HumanShrinkPoint | null = null
/** 下一次刷新缩圈点的剩余时间（秒） */
let shrinkPointTimer: number = 0

function ensureRng(): SeededRandom {
  if (!_seededRng) {
    _seededRng = new SeededRandom(hashSeed('allive-human-blocker-v9'))
  }
  return _seededRng
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ============================================================
// 初始化 / 激活
// ============================================================

export interface BlockerBounds {
  mapWidth: number
  mapHeight: number
}

/**
 * 初始化（幂等）：如果 humanBlocker 已存在，直接返回。
 * 否则在地图中心附近创建。
 */
export function ensureHumanBlocker(
  bounds?: BlockerBounds,
  _seed?: number
): HumanBlocker {
  if (humanBlocker) return humanBlocker
  const mapW = bounds?.mapWidth ?? WORLD_WIDTH
  const mapH = bounds?.mapHeight ?? WORLD_HEIGHT
  // 在地图中心附近创建
  const x = clamp(mapW * 0.5, HUMAN_BLOCKER_EDGE_PADDING, mapW - HUMAN_BLOCKER_EDGE_PADDING)
  const y = clamp(mapH * 0.5, HUMAN_BLOCKER_EDGE_PADDING, mapH - HUMAN_BLOCKER_EDGE_PADDING)
  const rng = ensureRng()
  const angle = rng.range(0, Math.PI * 2)
  humanBlocker = {
    id: BLOCKER_ID,
    active: false,
    x,
    y,
    vx: Math.cos(angle) * HUMAN_BLOCKER_AUTO_SPEED,
    vy: Math.sin(angle) * HUMAN_BLOCKER_AUTO_SPEED,
    blockR: HUMAN_MIN_RADIUS,
    visualR: HUMAN_BLOCKER_VISUAL_RADIUS,
    pointerActive: false,
    pointerX: null,
    pointerY: null,
    lastTime: null
  }
  // 初始化缩圈点计时器
  shrinkPoint = null
  shrinkPointTimer = rng.range(HUMAN_SHRINK_POINT_MIN_INTERVAL, HUMAN_SHRINK_POINT_MAX_INTERVAL)
  return humanBlocker
}

export function getHumanBlocker(): HumanBlocker | null {
  return humanBlocker
}

/**
 * 同步阻挡圆时钟：仅刷新 lastTime，不移动实体。
 * - 暂停期间由 HumanHeatLayer 调用，避免恢复时 lastTime 与真实时间
 *   相差过大导致 stepHumanBlocker 一次性补帧跳动
 * - 不写 Vue state、不重置半径/位置
 */
export function syncHumanBlockerClock(nowSeconds: number): void {
  if (!humanBlocker) return
  humanBlocker.lastTime = nowSeconds
}

/**
 * 设置/清除主动追击目标。
 * 注意：只允许改变目标坐标，不允许改 humanBlocker.x/y，不允许重置 lastTime。
 */
export function setHumanHuntTarget(target: HumanHuntTarget | null): void {
  humanHuntTarget = target
}

/** 获取当前主动追击目标（可能为 null） */
export function getHumanHuntTarget(): HumanHuntTarget | null {
  return humanHuntTarget
}

/** 兼容旧 API：返回 HumanBlob/Colony 数组 */
export function getHumanColonies(): HumanBlocker[] {
  if (!humanBlocker) return []
  return [humanBlocker]
}

/**
 * 激活 / 关闭永久阻挡圆
 */
export function setHumanBlockerActive(active: boolean): void {
  if (!humanBlocker) {
    ensureHumanBlocker()
  }
  if (humanBlocker) {
    humanBlocker.active = !!active
  }
}

/** 旧 API 兼容：什么都不做（不再有状态机切换） */
export function setBlobAmbient(_now: number): boolean { return false }
export function setBlobCooldown(_now: number): boolean { return false }
export function setBlobBlocking(_x: number, _y: number, _key: string, _now: number): boolean { return false }
export function setBlobMovingToCorridor(_x: number, _y: number, _now: number): boolean { return false }

export function initHumanField(): void {
  humanBlocker = null
  humanHuntTarget = null
  _seededRng = null
  shrinkPoint = null
  shrinkPointTimer = 0
}

// ============================================================
// 鼠标 / 触摸交互
// ============================================================

export function setHumanPointerTarget(
  x: number | null,
  y: number | null,
  active: boolean
): void {
  if (!humanBlocker) ensureHumanBlocker()
  if (!humanBlocker) return
  humanBlocker.pointerActive = !!active
  if (active && x !== null && y !== null) {
    humanBlocker.pointerX = x
    humanBlocker.pointerY = y
  } else if (!active) {
    humanBlocker.pointerX = null
    humanBlocker.pointerY = null
  }
}

export function applyPressGuidance(
  active: boolean,
  x: number,
  y: number,
  _now: number
): void {
  if (!active) {
    setHumanPointerTarget(null, null, false)
    return
  }
  setHumanPointerTarget(x, y, true)
}

// ============================================================
// 移动（仅 pointer 激活时移动）
// ============================================================

/**
 * 单步推进唯一阻挡圆。
 * - 不写 Vue state、不递增 humanFieldVersion
 * - pointer 关闭时进入屏保式自动移动
 * - 屏保移动必须避开缩圈点
 */
export function stepHumanBlocker(
  nowSeconds: number,
  bounds?: BlockerBounds
): boolean {
  if (!humanBlocker) {
    ensureHumanBlocker(bounds)
  }
  if (!humanBlocker) return false

  const b = humanBlocker
  const mapW = bounds?.mapWidth ?? WORLD_WIDTH
  const mapH = bounds?.mapHeight ?? WORLD_HEIGHT

  if (b.lastTime === null) {
    b.lastTime = nowSeconds
    return false
  }

  const dt = Math.max(0, Math.min(0.05, nowSeconds - b.lastTime))
  b.lastTime = nowSeconds
  if (dt <= 0) return false

  const beforeX = b.x
  const beforeY = b.y

  // 边界限制基准改为"内圈不能碰到屏幕边缘"：
  // - 内圈半径 = b.visualR（中心实心小圆）
  // - 外圈（虚线，半径 = b.blockR + HUMAN_BLOCKER_PADDING）允许压到屏幕边缘
  // 原因：缩圈点在地图边缘带（边缘 220/160 像素）内生成，
  //     如果按外圈限制 edge，玩家根本移不到缩圈点位置。
  const edge = b.visualR

  // 三档优先级：玩家 > 追击 > 屏保
  // 1) 玩家按住人类图层拖动：玩家控制优先
  // 2) 成功迁徙达到阈值且有追击目标：追击
  // 3) 否则屏保式自动游动
  let tx: number
  let ty: number
  let speed: number
  let follow: number
  let inHuntMode = false

  if (b.pointerActive && b.pointerX !== null && b.pointerY !== null) {
    // 最高优先级：玩家控制（允许靠近缩圈点）
    tx = b.pointerX
    ty = b.pointerY
    speed = HUMAN_BLOCKER_POINTER_SPEED
    follow = HUMAN_BLOCKER_POINTER_FOLLOW
  } else if (humanHuntTarget) {
    // 主动追击：移动到 gameStore 计算出的预测拦截点
    tx = humanHuntTarget.x
    ty = humanHuntTarget.y
    speed = HUMAN_BLOCKER_HUNT_SPEED
    follow = HUMAN_BLOCKER_HUNT_FOLLOW
    inHuntMode = true
  } else {
    // 默认屏保式自动游动
    if (!Number.isFinite(b.vx) || !Number.isFinite(b.vy) || Math.hypot(b.vx, b.vy) < 1) {
      const rng = ensureRng()
      const angle = rng.range(0, Math.PI * 2)
      b.vx = Math.cos(angle) * HUMAN_BLOCKER_AUTO_SPEED
      b.vy = Math.sin(angle) * HUMAN_BLOCKER_AUTO_SPEED
    }
    tx = b.x + b.vx * dt * 60  // 临时占位：屏保模式仍按自己的 vx/vy 推
    ty = b.y + b.vy * dt * 60
    speed = HUMAN_BLOCKER_AUTO_SPEED
    follow = HUMAN_BLOCKER_AUTO_FOLLOW
  }

  // 追击 + 屏保（非玩家）必须避开缩圈点；只有玩家拖过去时才允许吃
  if (!b.pointerActive && shrinkPoint && shrinkPoint.active) {
    const targetDx = tx - shrinkPoint.x
    const targetDy = ty - shrinkPoint.y
    const targetD = Math.hypot(targetDx, targetDy)
    const avoidR = b.blockR + shrinkPoint.r + HUMAN_AUTO_SHRINK_AVOID_RADIUS

    if (targetD < avoidR) {
      const awayDx = b.x - shrinkPoint.x
      const awayDy = b.y - shrinkPoint.y
      const awayD = Math.hypot(awayDx, awayDy)

      if (awayD > 1e-6) {
        tx = shrinkPoint.x + (awayDx / awayD) * avoidR
        ty = shrinkPoint.y + (awayDy / awayD) * avoidR
      } else if (targetD > 1e-6) {
        tx = shrinkPoint.x + (targetDx / targetD) * avoidR
        ty = shrinkPoint.y + (targetDy / targetD) * avoidR
      } else {
        tx = shrinkPoint.x + avoidR
        ty = shrinkPoint.y
      }
    }
  }

  if (b.pointerActive && b.pointerX !== null && b.pointerY !== null) {
    // 玩家控制：直接用指数平滑 + 限速向 (tx, ty) 移动
    const dx = tx - b.x
    const dy = ty - b.y
    const dist = Math.hypot(dx, dy)
    if (dist > 1e-6) {
      const smooth = 1 - Math.exp(-follow * dt)
      let stepX = dx * smooth
      let stepY = dy * smooth
      const maxStep = speed * dt
      const stepDist = Math.hypot(stepX, stepY)
      if (stepDist > maxStep) {
        const k = maxStep / stepDist
        stepX *= k
        stepY *= k
      }
      b.x += stepX
      b.y += stepY
    }
  } else if (inHuntMode) {
    // 追击模式：按 follow 平滑 + speed 限速
    const dx = tx - b.x
    const dy = ty - b.y
    const dist = Math.hypot(dx, dy)
    if (dist > 1e-6) {
      const smooth = 1 - Math.exp(-follow * dt)
      let stepX = dx * smooth
      let stepY = dy * smooth
      const maxStep = speed * dt
      const stepDist = Math.hypot(stepX, stepY)
      if (stepDist > maxStep) {
        const k = maxStep / stepDist
        stepX *= k
        stepY *= k
      }
      b.x += stepX
      b.y += stepY
      // 同步 vx/vy 用于上层读取方向信息
      b.vx = (dx / dist) * speed
      b.vy = (dy / dist) * speed
    }
  } else {
    // 屏保模式：保持原 vx/vy 单步推进 + 边界反弹
    let nextX = b.x + b.vx * dt
    let nextY = b.y + b.vy * dt

    if (nextX < edge) {
      nextX = edge
      b.vx = Math.abs(b.vx)
    } else if (nextX > mapW - edge) {
      nextX = mapW - edge
      b.vx = -Math.abs(b.vx)
    }

    if (nextY < edge) {
      nextY = edge
      b.vy = Math.abs(b.vy)
    } else if (nextY > mapH - edge) {
      nextY = mapH - edge
      b.vy = -Math.abs(b.vy)
    }

    b.x = nextX
    b.y = nextY
  }

  b.x = clamp(b.x, edge, mapW - edge)
  b.y = clamp(b.y, edge, mapH - edge)

  return b.x !== beforeX || b.y !== beforeY
}

/** 兼容旧 API */
export function stepHumanColoniesFixed(
  _dt: number,
  _now?: number
): boolean {
  return false
}

export function tickHumanField(
  _dt: number,
  _ctx?: { elapsedTime?: number; totalSuccess?: number }
): void {
  // no-op（v9 不再有 setTimeout-based 调度）
}

// ============================================================
// 兜底：把唯一阻挡圆移到地图安全位置（远离中央）
// ============================================================

export function repositionHumanBlockerToSafeArea(bounds?: BlockerBounds): void {
  if (!humanBlocker) ensureHumanBlocker(bounds)
  if (!humanBlocker) return
  const mapW = bounds?.mapWidth ?? WORLD_WIDTH
  const mapH = bounds?.mapHeight ?? WORLD_HEIGHT
  const candidates = [
    { x: mapW * 0.18, y: mapH * 0.30 },
    { x: mapW * 0.82, y: mapH * 0.30 },
    { x: mapW * 0.18, y: mapH * 0.78 },
    { x: mapW * 0.82, y: mapH * 0.78 }
  ]
  let best = candidates[0]!
  let bestD = -Infinity
  for (const c of candidates) {
    const d = Math.hypot(c.x - mapW * 0.5, c.y - mapH * 0.5)
    if (d > bestD) {
      bestD = d
      best = c
    }
  }
  humanBlocker.x = clamp(best.x, HUMAN_BLOCKER_EDGE_PADDING, mapW - HUMAN_BLOCKER_EDGE_PADDING)
  humanBlocker.y = clamp(best.y, HUMAN_BLOCKER_EDGE_PADDING, mapH - HUMAN_BLOCKER_EDGE_PADDING)
}

// ============================================================
// 半径缩放：吞噬 / 缩圈点
// ============================================================

/**
 * 人类吞噬迁徙中的物种：人类圆半径 +HUMAN_SIZE_STEP
 * - 不超过 HUMAN_MAX_RADIUS
 * - 返回 true 表示真的变大了
 */
export function growHuman(): boolean {
  if (!humanBlocker) return false
  if (humanBlocker.blockR >= HUMAN_MAX_RADIUS) return false
  humanBlocker.blockR = Math.min(HUMAN_MAX_RADIUS, humanBlocker.blockR + HUMAN_SIZE_STEP)
  return true
}

/**
 * 人类吞噬缩圈点：人类圆半径 -HUMAN_SIZE_STEP
 * - 不低于 HUMAN_MIN_RADIUS
 * - 返回 true 表示真的变小了
 */
export function shrinkHuman(): boolean {
  if (!humanBlocker) return false
  if (humanBlocker.blockR <= HUMAN_MIN_RADIUS) return false
  humanBlocker.blockR = Math.max(HUMAN_MIN_RADIUS, humanBlocker.blockR - HUMAN_SIZE_STEP)
  return true
}

/** 重置人类圆半径（用于游戏重启） */
export function resetHumanRadius(): void {
  if (!humanBlocker) return
  humanBlocker.blockR = HUMAN_MIN_RADIUS
}

// ============================================================
// 缩圈点
// ============================================================

/** 当前缩圈点（可能为 null） */
export function getShrinkPoint(): HumanShrinkPoint | null {
  return shrinkPoint
}

/**
 * 每帧推进缩圈点：
 * - 若当前没有缩圈点，倒计时减小
 * - 倒计时归零且人类圆"缩小一格后仍大于阈值"时，在地图边缘生成新缩圈点
 * - 缩圈点不能与节点 / 风险区 / 人类圆重叠
 */
export function tickShrinkPoint(
  dt: number,
  bounds?: BlockerBounds,
  getBlockedAnchors?: () => { x: number; y: number; r: number }[]
): void {
  if (!humanBlocker || !humanBlocker.active) {
    shrinkPoint = null
    return
  }
  const mapW = bounds?.mapWidth ?? WORLD_WIDTH
  const mapH = bounds?.mapHeight ?? WORLD_HEIGHT
  // 还没到能缩小一格的状态：不做刷新
  // 改为 < HUMAN_MIN_RADIUS，这样人类吞噬一次（blockR 从 36 → 48）
  // 仍然 blockR - STEP == HUMAN_MIN_RADIUS（36），也能进刷新流程，
  // 让玩家第一次失败后就能看到缩圈点。
  if (humanBlocker.blockR - HUMAN_SIZE_STEP < HUMAN_MIN_RADIUS) {
    shrinkPoint = null
    const rng = ensureRng()
    shrinkPointTimer = rng.range(
      HUMAN_SHRINK_POINT_MIN_INTERVAL,
      HUMAN_SHRINK_POINT_MAX_INTERVAL
    )
    return
  }
  if (shrinkPoint && shrinkPoint.active) {
    // 已存在缩圈点，不刷新
    return
  }
  shrinkPointTimer -= dt
  if (shrinkPointTimer > 0) return
  // 倒计时归零 → 尝试生成
  const rng = ensureRng()
  const point = pickShrinkPoint(rng, mapW, mapH, getBlockedAnchors)
  if (point) {
    shrinkPoint = { x: point.x, y: point.y, r: HUMAN_SHRINK_POINT_RADIUS, active: true }
  } else {
    // 找不到合法位置 → 50ms 后再试
    shrinkPointTimer = 0.05
    return
  }
  shrinkPointTimer = rng.range(HUMAN_SHRINK_POINT_MIN_INTERVAL, HUMAN_SHRINK_POINT_MAX_INTERVAL)
}

function pickShrinkPoint(
  rng: SeededRandom,
  mapW: number,
  mapH: number,
  getBlockedAnchors?: () => { x: number; y: number; r: number }[]
): { x: number; y: number } | null {
  // 边缘区域：x < edgeX | x > mapW-edgeX | y < edgeY | y > mapH-edgeY
  const edgeX = HUMAN_SHRINK_POINT_EDGE_MARGIN_X
  const edgeY = HUMAN_SHRINK_POINT_EDGE_MARGIN_Y
  const blocked = getBlockedAnchors ? getBlockedAnchors() : []
  // 试 30 次随机采样
  for (let i = 0; i < 30; i++) {
    // 4 个边缘带随机选一个
    const side = Math.floor(rng.range(0, 4))
    let x = 0, y = 0
    if (side === 0) {
      // 左带
      x = rng.range(40, edgeX)
      y = rng.range(40, mapH - 40)
    } else if (side === 1) {
      // 右带
      x = rng.range(mapW - edgeX, mapW - 40)
      y = rng.range(40, mapH - 40)
    } else if (side === 2) {
      // 上带
      x = rng.range(40, mapW - 40)
      y = rng.range(40, edgeY)
    } else {
      // 下带
      x = rng.range(40, mapW - 40)
      y = rng.range(mapH - edgeY, mapH - 40)
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    let ok = true
    for (const a of blocked) {
      if (Math.hypot(x - a.x, y - a.y) < a.r + HUMAN_SHRINK_POINT_RADIUS + 20) {
        ok = false
        break
      }
    }
    if (ok) return { x, y }
  }
  return null
}

/**
 * 人类圆是否碰到缩圈点
 * - 如果碰到：吃掉缩圈点，缩小人类圆
 * - 默认 requirePointerGuidance=true：自动屏保移动不允许吃缩圈点
 * - 返回 true 表示吃到了
 */
export function tryConsumeShrinkPoint(requirePointerGuidance = true): boolean {
  if (!shrinkPoint || !shrinkPoint.active) return false
  if (!humanBlocker || !humanBlocker.active) return false

  // 自动屏保移动不允许吃缩圈点；
  // 只有玩家按住并带着人类过去时才允许触发。
  if (requirePointerGuidance && !humanBlocker.pointerActive) return false

  const d = Math.hypot(shrinkPoint.x - humanBlocker.x, shrinkPoint.y - humanBlocker.y)
  if (d <= humanBlocker.blockR + shrinkPoint.r) {
    shrinkPoint = null
    shrinkHuman()
    return true
  }

  return false
}

// =============================================================
// 兼容 HumanCluster API
// =============================================================

function toHumanCluster(b: HumanBlocker): HumanCluster {
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    r: b.blockR + HUMAN_BLOCKER_PADDING,
    visualR: b.visualR,
    count: 1,
    density: 1,
    compactness: 1,
    blocking: true
  }
}

export function getHumanClusters(): HumanCluster[] {
  if (!humanBlocker || !humanBlocker.active) return []
  return [toHumanCluster(humanBlocker)]
}

export function getBlockingHumanClusters(): HumanCluster[] {
  if (!humanBlocker || !humanBlocker.active) return []
  return [toHumanCluster(humanBlocker)]
}

export function getHumanAgents(): [] {
  return []
}

// ============================================================
// 几何入口（唯一对外的阻挡判断）
// ============================================================

function segmentIntersectsCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, r: number
): boolean {
  if ((ax - cx) * (ax - cx) + (ay - cy) * (ay - cy) <= r * r) return true
  if ((bx - cx) * (bx - cx) + (by - cy) * (by - cy) <= r * r) return true
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return false
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2))
  const px = ax + t * dx
  const py = ay + t * dy
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r
}

export function segmentHitsHumanCluster(
  ax: number, ay: number, bx: number, by: number,
  _speciesTolerance?: number,
  clusters?: HumanCluster[]
): HumanCluster | null {
  const list = clusters ?? getBlockingHumanClusters()
  for (const c of list) {
    if (!c.blocking) continue
    if (segmentIntersectsCircle(ax, ay, bx, by, c.x, c.y, c.r)) {
      return c
    }
  }
  return null
}

export function pointInHumanCluster(
  x: number, y: number,
  _speciesTolerance?: number,
  clusters?: HumanCluster[]
): HumanCluster | null {
  const list = clusters ?? getBlockingHumanClusters()
  for (const c of list) {
    if (!c.blocking) continue
    const dx = x - c.x
    const dy = y - c.y
    if (dx * dx + dy * dy <= c.r * c.r) return c
  }
  return null
}

// =============================================================
// 兼容旧 API（仅保留符号，运行时不再使用）
// =============================================================

export const HUMAN_GRID_COLS = 16
export const HUMAN_GRID_ROWS = 10

export function getHumanHotspots(_minDensity?: number): HumanHotspot[] {
  return getHumanClusters().map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    r: c.r,
    density: c.density,
    mass: c.count,
    blocking: true
  }))
}

export function segmentHitsHumanHotspot(
  ax: number, ay: number, bx: number, by: number, _tolerance?: number
): HumanHotspot | null {
  const hit = segmentHitsHumanCluster(ax, ay, bx, by)
  if (!hit) return null
  return {
    id: hit.id,
    x: hit.x,
    y: hit.y,
    r: hit.r,
    density: hit.density,
    mass: hit.count,
    blocking: true
  }
}

export function pointInHumanHotspot(
  x: number, y: number, _tolerance?: number
): HumanHotspot | null {
  const hit = pointInHumanCluster(x, y)
  if (!hit) return null
  return {
    id: hit.id,
    x: hit.x,
    y: hit.y,
    r: hit.r,
    density: hit.density,
    mass: hit.count,
    blocking: true
  }
}

export function isNodeSurroundedByHumans(
  nx: number, ny: number, _threshold?: number
): boolean {
  return !!pointInHumanCluster(nx, ny)
}

export function increaseHumanPressure(_totalSuccess: number) {
  // no-op
}

export function lockPressForCriticalClusters(_seconds: number) {
  // no-op
}

export function setHumanPressureTargets(_targets: HumanPressureTarget[]): void {
  // no-op
}

export function setHumanPress(_active: boolean, _x: number, _y: number): void {
  // no-op
}

export function isHumanPressActive(): boolean {
  return !!humanBlocker?.pointerActive
}

export function getHumanPress(): { x: number; y: number } | null {
  if (!humanBlocker || !humanBlocker.pointerActive) return null
  if (humanBlocker.pointerX === null || humanBlocker.pointerY === null) return null
  return { x: humanBlocker.pointerX, y: humanBlocker.pointerY }
}

export function getHumanPressDuration(): number {
  return 0
}

export function isHumanPressStrong(): boolean {
  return false
}

export function getHumanFieldState() {
  return {
    cols: HUMAN_GRID_COLS,
    rows: HUMAN_GRID_ROWS,
    cellW: WORLD_WIDTH / HUMAN_GRID_COLS,
    cellH: WORLD_HEIGHT / HUMAN_GRID_ROWS,
    densities: new Array(HUMAN_GRID_COLS * HUMAN_GRID_ROWS).fill(0),
    press: null,
    hottest: null,
    maxDensity: 1,
    seedCount: 0
  }
}

// 抑制未使用警告
void SeededRandom
void HUMAN_BLOCKER_RADIUS
