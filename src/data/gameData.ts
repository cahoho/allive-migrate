// 运行期类型与状态
// 规则：
// - 玩家可自由连线到任何已解锁、可见的节点
// - 每个 species 有固定 startNode / targetNode / requiredWaypoints / maxSegmentDistance
// - 风险通过几何区域判定，不依赖内部边
import type { NodeTag, NodeType, NodeStatus, SeasonId } from './gameConfig'

export interface RuntimeMapNode {
  id: string
  name: string
  /**
   * 节点显示名称（玩家视角的"同名"判定依据）
   * 多个同 displayName 的节点在玩家眼里视为同类
   * 默认与 name 保持一致，保留向后兼容
   */
  displayName: string
  /**
   * 节点生态语义 key，例如 south_wintering / estuary / fishway。
   * 同一个 semanticKey 表示真正同类地点。
   * 内部等价判定（生成 cluster / 选择 waypoint）应使用该字段。
   */
  semanticKey: string
  /**
   * 玩家视角下用于起点、终点等价判断的 key。
   * 同名同类节点必须相同。
   * 任意同 equivalenceKey 的节点都可以作为该任务的起点/终点。
   */
  equivalenceKey: string
  type: NodeType
  tags: NodeTag[]
  x: number
  y: number
  status: NodeStatus
  /** 阶段解锁标记 */
  stage: number
  spawnedAt: number
  /** 是否固定节点（用于显示特殊性） */
  isFixed: boolean
  // ============================================================
  // 生态健康值（栖息地完整度）v1
  // 替代传统"节点血量"概念
  // ============================================================
  /** 当前生态健康值，0~100。默认 100 */
  health: number
  /** 健康上限（固定 100，留字段以便后续扩展） */
  maxHealth: number
  /**
   * 生态状态：仅用于 UI 提示，不影响节点 status（status 仍由地图系统控制）
   * - 'healthy'   : 70~100
   * - 'pressured' : 40~70
   * - 'damaged'   : 15~40
   * - 'degraded'  : 0~15（依然可用，但任务生成尽量避开）
   */
  ecoState: EcoState
  /** 最近一次被损伤时刻（elapsedTime 秒）；用于延迟恢复 */
  lastDamagedAt?: number
  /**
   * 最近一次受到人类活动持续扣血的时刻（elapsedTime 秒）。
   * 只用于地图节点的即时受击/闪烁反馈，不参与生态恢复延迟逻辑。
   */
  lastHumanDamagedAt?: number
  /**
   * 最近一次被使用时刻（elapsedTime 秒）。
   * 包括：动物迁徙路线经过；任务起终点被选中。
   * 动物迁徙路径上的"承载压力"在结算时按一次 ECO_ANIMAL_ROUTE_PRESSURE 扣血，
   * 不再每帧扣；lastUsedAt 用于排查 / 提示。
   */
  lastUsedAt?: number
}

/** 节点生态状态枚举 */
export type EcoState = 'healthy' | 'pressured' | 'damaged' | 'degraded'

export interface SpeciesTask {
  id: string
  speciesId: string
  startNodeId: string
  targetNodeId: string
  /**
   * 任务生成时的目标节点等价 key。
   * 提交时通过 equivalenceKey 进行匹配。
   */
  targetEquivalenceKey?: string
  /** 剩余时间（秒） */
  remaining: number
  totalTime: number
  status: 'waiting' | 'migrating' | 'fading' | 'done'
  path: string[]
  progress: number
  fadeProgress: number
  spawnedAt: number
  errorMsg?: string
  pulseAt: number
  errorFlashAt: number
  /** 闪烁某条风险区域（用于错误时显示） */
  flashRiskZoneId?: string
  flashRiskZoneAt?: number
  /** 视觉起点：拖线时 logo 实际所在位置（不和 startNode 重合时使用） */
  visualStartX?: number
  visualStartY?: number
  /** 途经点（任务级别而非物种级别，每条任务可能不同） */
  requiredWaypoints?: import('./speciesTemplates').RequiredWaypoint[]
  requiredWaypointOrder?: boolean
  /**
   * v9：被人类吞噬的时间戳（elapsedTime 秒）
   * 用于同一帧防重入：吞噬检测在 migrating 推进循环里每帧都会被调
   * 如果不在该帧立即删除任务并打标，下一帧仍可能再次命中
   */
  devouredAt?: number
}

export interface ActiveRoute {
  id: string
  taskId: string
  speciesId: string
  color: string
  nodeIds: string[]
  /** 视觉起点：动物从这里出发，而不是节点中心 */
  visualStartX: number
  visualStartY: number
  /** 段数 = nodeIds.length - 1 */
  segmentCount: number
  status: 'migrating' | 'fading'
  fadeProgress: number
}

export interface DragState {
  active: boolean
  taskId: string | null
  /** 视觉起点（拖线从此处发出，可能是 logo 偏移点） */
  visualStartX: number
  visualStartY: number
  pointer: { x: number; y: number } | null
  /** 真实节点路线（用于验证） */
  path: string[]
  /** 当前预览段距离 */
  previewSegmentDistance: number
  /** 预览段是否超过单段上限 */
  previewOverflow: boolean
  overCancel: boolean
  overNodeId: string | null
  startTime: number
  /** v6：当前指向的"最后节点 -> 候选节点"线段是否被人类阻挡圈覆盖 */
  previewHumanBlocked: boolean
  /** v6：命中的阻挡圈 id（用于调试 / UI） */
  previewHumanClusterId: string | null
}

export interface ToastMsg {
  id: number
  text: string
  kind: 'info' | 'error' | 'success' | 'warning'
  at: number
}

/**
 * 游戏暂停原因集合：
 * - 不再使用单个 isPaused 布尔，避免多个暂停来源互相覆盖
 * - 使用原因字符串集合：每个来源 add/remove 自己的原因
 * - 当前来源：'human-tutorial' 人类活动教程 / 'ranking' 实时排名查看
 * - 未来可扩展，例如 'modal-open' / 'cutscene' 等
 */
export type GamePauseReason = 'human-tutorial' | 'ranking'

export interface GameState {
  seed: number
  /**
   * 总游戏运行时间（游戏循环秒）。即便 gameStarted=false 也不会递增。
   * 仅在游戏开始后由 useGameLoop 累加。
   */
  elapsedTime: number
  year: number

  // 阶段
  stage: number
  // 累计成功数
  totalSuccess: number
  score: number
  failures: number
  maxFailures: number
  /** 当前阶段下最大同时任务数 */
  maxConcurrent: number
  /** 任务生成间隔 */
  taskSpawnInterval: number
  /** 已用段数 */
  usedSegments: number
  maxSegments: number

  // 季节
  season: SeasonId
  nextSeasonIn: number

  // 地图节点
  mapNodes: RuntimeMapNode[]

  // 任务
  activeTasks: SpeciesTask[]
  completedRoutes: ActiveRoute[]

  // 物种
  unlockedSpeciesIds: string[]
  /**
   * 每个物种的失败次数：key = speciesId
   * 累计达到 SPECIES_EXTINCTION_FAILURES 时该物种加入 extinctSpeciesIds
   */
  speciesFailureCounts: Record<string, number>
  /**
   * 每个物种的成功迁徙次数：key = speciesId
   * 与 speciesFailureCounts 对偶：
   * - 用于 TopBar 物种气泡中显示"已成功 N 次"
   * - 不影响阶段解锁（阶段只关心 state.totalSuccess / state.score）
   */
  speciesSuccessCounts: Record<string, number>
  /**
   * 已灭绝物种 id 列表。
   * 灭绝后：
   *  - 该物种未完成任务会被清理
   *  - 不再生成该物种的新任务
   *  - 重新解锁时不会复活
   */
  extinctSpeciesIds: string[]

  // UI
  selectedTaskId: string | null
  dragState: DragState
  gameOver: boolean
  toasts: ToastMsg[]
  startTime: number

  /**
   * 玩家是否已经点击【开始游戏】。true 后才进入正式挑战：
   * - 计时器开始累加
   * - 任务开始生成
   * - 人类追击 / 缩圈点等系统按原规则运行
   * false 时仅展示地图与玩法说明窗口。
   */
  gameStarted: boolean
  /**
   * 玩家坚持时间（秒）。
   * - 从点击【开始游戏】那一刻开始累加
   * - 暂停 / 未开始时不累加
   * - 游戏结束后停止累加
   * 顶部状态栏和结束面板都从这里读取。
   */
  survivalTime: number
  /**
   * 当前生效的暂停原因集合。
   * - 空数组：游戏正常运行
   * - 非空：只要有一个原因，游戏就被视为"暂停"
   * - 集中式管理（gameStore.setGameplayPause / isGameplayPaused），
   *   避免分散的 isPaused 布尔字段互相覆盖
   */
  pauseReasons: import('./gameData').GamePauseReason[]

  // 人类系统（完成 HUMAN_ACTIVATION_SUCCESS 次迁徙后激活）
  humanActive: boolean
  /**
   * 成功迁徙达到 HUMAN_HUNT_SUCCESS_THRESHOLD 后开启。
   * 开启后，人类自动移动目标从屏保轨迹变为正在迁徙动物的预测拦截点。
   */
  humanHuntActive: boolean
  /** 人类图层是否正在显示中（玩家在 TopBar 切换） */
  humanLayerVisible: boolean
  /**
   * 人类系统版本号：每帧推进人类密度场后 +1
   * 关键修复：人类密度场在 humanFieldSystem.ts 是模块内部变量
   * Vue 不会自动追踪这个变化
   * 在 HumanHeatLayer.vue 的 computed 中读取此版本号可以强制依赖追踪
   */
  humanFieldVersion: number
  /**
   * 鼠标光标在 SVG 坐标系的当前位置（人类图层激活时持续更新）
   * 用于在 HumanHeatLayer 中渲染跟随式光标（虚线圈 + 中心点）
   * 在人类图层关闭 / 鼠标离开地图时为 null
   */
  pointerPos: { x: number; y: number } | null
  /** v6：玩家是否在人类图层上长按（用于 applyPressGuidance） */
  humanPressActive: boolean

  // ============================================================
  // 引导系统状态（tutorial）
  // ============================================================
  /** 当前是否处于教学阶段。会与 gameStarted 解耦：教学阶段也允许生成任务，但不计时不计分。 */
  tutorialActive: boolean
  /** 当前引导步骤编号（用于从 tutorialSteps 中查表） */
  tutorialStep: number
  /** 当前引导阶段：'intro' 开局基础引导 / 'human' 人类活动引导 / null 未引导 */
  tutorialPhase: 'intro' | 'human' | null
  /** 开局基础引导是否已经走完 */
  tutorialCompletedIntro: boolean
  /** 人类活动引导是否已经走完 */
  tutorialCompletedHuman: boolean
  /** 教学专用任务是否已生成（用于 Step 6 等待玩家操作） */
  tutorialTaskId: string | null

  // ============================================================
  // Supabase 数据库集成字段
  // ============================================================
  /** 服务端签名的会话令牌（反作弊） */
  sessionToken: string | null
  /** 本局分数是否已提交到服务器 */
  scoreSubmitted: boolean
  /** 玩家昵称（在 NicknameInput 中输入） */
  playerNickname: string
  /** 服务端分配的随机种子（用于替换本地种子，防篡改） */
  serverSeed: number | null
}

export type TutorialShape = 'circle' | 'rect' | 'line'

/**
 * 引导步骤目标定位类型。
 * - selector：CSS 选择器（指向被圈点的 DOM 元素）
 * - shape：高亮形状
 * - padding：在目标元素外扩的像素（圈点留白）
 * - fallbackRect：当 selector 找不到时兜底的屏幕坐标
 */
export interface TutorialTargetSpec {
  /** 唯一 id（用于 key / 调试） */
  id: string
  /** 形状：圆形 / 矩形 / 连线 */
  shape: TutorialShape
  /** 中心点选择器（circle/rect 用此居中） */
  selector?: string
  /** 矩形选择器（rect 用此画框） */
  rectSelector?: string
  /** 多点连线（line 用），用 SVG 坐标 (世界坐标系 0..WORLD_WIDTH/HEIGHT) */
  linePoints?: { x: number; y: number }[]
  /** 外扩 padding（px） */
  padding?: number
}

export interface TutorialStep {
  /** 步骤 id（同 phase 内唯一） */
  id: string
  /** 小窗口中央文字（一句话，最好 ≤16 字） */
  text: string
  /** 高亮目标：单目标 / 多目标 / 连线 */
  targets: TutorialTargetSpec[]
  /** 是否允许"上一步"（默认 true） */
  canPrev?: boolean
  /** 是否允许"直接跳过"（默认 true） */
  canSkip?: boolean
  /** 主按钮文案（默认 "下一步"） */
  nextLabel?: string
  /** 步骤级副作用：进入时调用（用于切图层 / 自动选中任务等） */
  onEnter?: () => void
  /** 步骤级副作用：完成时调用（用于提交 / 推进流程） */
  onComplete?: () => void
}
