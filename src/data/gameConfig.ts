// 全局游戏配置常量
export const WORLD_WIDTH = 1200
export const WORLD_HEIGHT = 760

// 地图可视区域的安全边距
export const SAFE_MARGIN_LEFT = 40
export const SAFE_MARGIN_RIGHT = 40
export const SAFE_MARGIN_TOP = 40
export const SAFE_MARGIN_BOTTOM = 100

export const NODE_MIN_DISTANCE = 90
export const NODE_CONNECT_DISTANCE = 360
export const MAX_BASIC_CONNECTIONS_PER_NODE = 5

// 拖线吸附半径
export const NODE_SNAP_RADIUS_DESKTOP = 32
export const NODE_SNAP_RADIUS_MOBILE = 44

// 失败次数上限（保留旧字段，运行时不再使用：失败判定已改为物种多样性）
export const MAX_FAILURES = 5

// 物种灭绝阈值：同一物种失败达到该次数后，标记为"已灭绝"
export const SPECIES_EXTINCTION_FAILURES = 3
// 物种多样性低于该百分比时游戏失败（100 / 3 ≈ 33.3）
export const BIODIVERSITY_FAILURE_THRESHOLD = 100 / 3

// 成功迁徙达到该数量后，人类进入主动追击模式
export const HUMAN_HUNT_SUCCESS_THRESHOLD = 12

// 人类追击正在迁徙动物时的速度，略快于屏保移动，但不要过快
export const HUMAN_BLOCKER_HUNT_SPEED = 76

// 人类追击目标时的平滑系数
export const HUMAN_BLOCKER_HUNT_FOLLOW = 2.35

// 预测动物未来位置的最大时间窗口，单位秒
export const HUMAN_HUNT_LOOKAHEAD_SECONDS = 3.2

// 预测采样步长，越小越准但越耗性能
export const HUMAN_HUNT_SAMPLE_STEP = 0.25

// 追击目标重算间隔，不要每帧重算
export const HUMAN_HUNT_REPLAN_INTERVAL = 0.16

// 线路资源：不再以段数计，而是按段数
// MAX_ROUTE_SEGMENTS 是同时存在的最大段数
export const MAX_ROUTE_SEGMENTS = 14

// 阶段定义
export const STAGE_UNLOCK_SCORES = [2, 5, 9, 13, 18]
export const STAGE_COUNT = 6
// 阶段 5 的最大同时任务数
export const STAGE5_MAX_CONCURRENT = 4
// 阶段 6 的最大同时任务数
export const STAGE6_MAX_CONCURRENT = 5

// 季节切换
export const SEASON_INTERVAL = 45 // 阶段 2 开始每 45 秒切换一次

// 任务生成
// 节奏要求：玩家会忙，但不会被瞬间刷满
export const TASK_SPAWN_INTERVAL_BASE = 12.0
export const TASK_SPAWN_INTERVAL_MIN = 7.0

// 人类系统激活阈值：完成 3 次迁徙后激活
export const HUMAN_ACTIVATION_SUCCESS = 3

// 打开人类活动层时，等待任务倒计时的压力倍率
// 不是暂停，只是给玩家一个处理人类活动的心流窗口
export const HUMAN_LAYER_TIME_SCALE = 0.6

// 节点生成
// MVP 阶段解锁 12 个固定节点 + 后期蹦出节点；总上限 24
// 关键规则：每成功一次迁徙，尝试揭示一个节点；
// 失败（超时 / 被吞噬 / 玩家不操作）和时间流逝都不会生成新节点。
export const MAX_MAP_NODES = 24

// =============================================================
// 人类单 Blob 系统 v8（唯一永久阻挡圆）
// =============================================================
// 核心规则：
// - 全地图只有 1 个永久阻挡圆（human blocker）
// - 鼠标按住时圆朝鼠标方向缓慢移动；松开后回到屏保式自动游动
// - 不再使用 状态机 / 密度 / 分裂 / 合并 / corridor 评分 / planner / cooldown
// - 不再使用 SVG filter / feGaussianBlur / SMIL animate
// - 视觉移动由 HumanHeatLayer 的 requestAnimationFrame 改 transform
//   不写 Vue state，不递增 humanFieldVersion
// =============================================================
export const HUMAN_BLOCKER_ENABLED = true

// 路线逻辑阻挡半径（用于 segmentHitsHumanCluster / pointInHumanCluster）
// v9 改造：小圆起步
export const HUMAN_BLOCKER_RADIUS = 36
// 视觉半径（中心人类活动圆的大小）
export const HUMAN_BLOCKER_VISUAL_RADIUS = 22
// 视觉外圈到逻辑半径的额外 padding
export const HUMAN_BLOCKER_PADDING = 12

// v9 新增：人类圆半径动态缩放参数
export const HUMAN_SIZE_STEP = 12         // 吞噬 / 缩圈点的每步半径变化
export const HUMAN_MIN_RADIUS = 36         // 最小阻挡半径
export const HUMAN_MAX_RADIUS = 132        // 最大阻挡半径

// v9 新增：缩圈点参数
export const HUMAN_SHRINK_POINT_RADIUS = 14  // 缩圈点的视觉半径
export const HUMAN_SHRINK_POINT_MIN_INTERVAL = 8
export const HUMAN_SHRINK_POINT_MAX_INTERVAL = 14
// 缩圈点优先生成的边缘带
export const HUMAN_SHRINK_POINT_EDGE_MARGIN_X = 220
export const HUMAN_SHRINK_POINT_EDGE_MARGIN_Y = 160

// 人类自动屏保移动时，必须主动避开缩圈点，避免自己吃掉
export const HUMAN_AUTO_SHRINK_AVOID_RADIUS = 110

// 自动 / 指针移动最大速度（像素/秒）
export const HUMAN_BLOCKER_AUTO_SPEED = 42
export const HUMAN_BLOCKER_POINTER_SPEED = 86

// exponential smoothing follow 系数（越大越快跟随）
export const HUMAN_BLOCKER_AUTO_FOLLOW = 0.75
export const HUMAN_BLOCKER_POINTER_FOLLOW = 1.65

// 阻挡圆在地图内的安全边距
export const HUMAN_BLOCKER_EDGE_PADDING = 120

// 鼠标在 human 模式下显示的小点半径
export const HUMAN_POINTER_DOT_RADIUS = 6

// 兼容旧 v7 / v6 常量（仅用于类型兼容，运行时不再使用）
export const HUMAN_BLOB_VISUAL_RADIUS = HUMAN_BLOCKER_VISUAL_RADIUS
export const HUMAN_BLOB_BLOCK_RADIUS = HUMAN_BLOCKER_RADIUS
export const HUMAN_BLOB_BLOCK_PADDING = HUMAN_BLOCKER_PADDING
export const HUMAN_BLOB_BLOCK_SECONDS = 0
export const HUMAN_BLOB_COOLDOWN_SECONDS = 0
export const HUMAN_BLOB_PLANNER_INTERVAL_SECONDS = 0
export const HUMAN_BLOB_SIMULATION_STEP = 1 / 60
export const HUMAN_BLOB_SIMULATION_HZ = 60
export const HUMAN_BLOB_POINTER_PULL = HUMAN_BLOCKER_POINTER_FOLLOW
export const HUMAN_BLOB_POINTER_DAMPING = 0
export const HUMAN_BLOB_AUTO_PULL = HUMAN_BLOCKER_AUTO_FOLLOW
export const HUMAN_BLOB_AUTO_DRAG = 0
export const HUMAN_BLOB_MAX_SPEED = HUMAN_BLOCKER_POINTER_SPEED
export const HUMAN_SINGLE_BLOB_ENABLED = HUMAN_BLOCKER_ENABLED

// 旧 v6 群落化系统常量（保留导出，运行时不再使用）
export const HUMAN_COLONY_MIN_COUNT = 1
export const HUMAN_COLONY_MAX_COUNT = 1
export const HUMAN_COLONY_INITIAL_COUNT = 1
export const HUMAN_SIMULATION_HZ = HUMAN_BLOB_SIMULATION_HZ
export const HUMAN_SIMULATION_STEP = HUMAN_BLOB_SIMULATION_STEP
export const HUMAN_COLONY_VISUAL_RADIUS_MIN = HUMAN_BLOCKER_VISUAL_RADIUS
export const HUMAN_COLONY_VISUAL_RADIUS_MAX = HUMAN_BLOCKER_VISUAL_RADIUS
export const HUMAN_BLOCK_RADIUS_MIN = HUMAN_BLOCKER_RADIUS
export const HUMAN_BLOCK_RADIUS_MAX = HUMAN_BLOCKER_RADIUS
export const HUMAN_BLOCK_ROUTE_PADDING = HUMAN_BLOCKER_PADDING
export const HUMAN_CONVERGE_SECONDS = 0
export const HUMAN_BLOCK_SECONDS = 0
export const HUMAN_DISSIPATE_SECONDS = 0
export const HUMAN_EVENT_COOLDOWN_SECONDS = 0
export const HUMAN_COLONY_ATTRACTION = 0
export const HUMAN_COLONY_DAMPING = 0
export const HUMAN_COLONY_MAX_SPEED = 0
export const HUMAN_COLONY_MERGE_RATIO = 0
export const HUMAN_PRESS_INFLUENCE_RADIUS_COLONY = 0

// 兼容旧 v5 节流常量
export const HUMAN_CLUSTER_UPDATE_INTERVAL = HUMAN_BLOB_SIMULATION_STEP
export const HUMAN_PRESSURE_PLAN_INTERVAL = HUMAN_BLOB_PLANNER_INTERVAL_SECONDS
export const HUMAN_FAIRNESS_CHECK_INTERVAL = HUMAN_BLOB_PLANNER_INTERVAL_SECONDS

// =============================================================
// 旧 v5 粒子式系统：仅作为兼容参考保留，不再参与运行时模拟
// 旧的 HUMAN_MAX_COUNT / 空间哈希 / 单粒子 wander / BFS cluster 不再使用
// =============================================================

// 人类系统：粒子式（一个圆点 = 一个人类） — 已废弃
export const HUMAN_MAX_COUNT = 160
export const HUMAN_DOT_MIN_RADIUS = 2
export const HUMAN_DOT_MAX_RADIUS = 4
export const HUMAN_EDGE_SPAWN_INTERVAL = 0.45
export const HUMAN_ENTER_SPEED = 18
export const HUMAN_WANDER_SPEED = 10

// 人类聚类（密度 + 紧凑度共同决定是否形成阻碍迁徙的破坏区域） — 已废弃
export const HUMAN_CLUSTER_RADIUS = 85            // 视觉/聚类基准半径
export const HUMAN_CLUSTER_MIN_COUNT = 14         // 形成 cluster 的最小人数
export const HUMAN_CLUSTER_LINK_RADIUS = 72       // BFS 连通半径
export const HUMAN_CLUSTER_RADIUS_MIN = 48
export const HUMAN_CLUSTER_RADIUS_MAX = 140

// 密度 / 紧凑度阈值（带 hysteresis 防止闪烁） — 已废弃
export const HUMAN_BLOCK_DENSITY_ENTER = 5.0     // 每 10000 像素² 的人数
export const HUMAN_BLOCK_DENSITY_EXIT = 4.2
export const HUMAN_BLOCK_COMPACTNESS_ENTER = 0.52
export const HUMAN_BLOCK_COMPACTNESS_EXIT = 0.42

// 旧版"按总数阻挡"阈值保留为兼容参考 — 已废弃
export const HUMAN_CLUSTER_BLOCK_COUNT = 20

// 人类聚类 -> 视觉/阻挡（旧版基于密度场的阈值） — 已废弃
export const HUMAN_BLOCK_THRESHOLD = 0.65
export const HUMAN_SPLIT_THRESHOLD = 0.80

// 人类长按：分离"视觉半径"和"物理吸引半径"
// 视觉半径：人类图层中跟随式光标圈的大小
export const HUMAN_PRESS_RADIUS = 180
// 物理吸引半径：实际影响人类加速度的最大距离（旧版）
export const HUMAN_PRESS_INFLUENCE_RADIUS = 280
export const HUMAN_PRESS_CAPTURE_RADIUS = 110

// 长按吸引加速度区间 — 已废弃（v6 改为对单个群落施加轻微引导）
export const HUMAN_PRESS_MAX_ACCEL = 310
export const HUMAN_PRESS_MIN_ACCEL = 38
export const HUMAN_PRESS_RAMP_SECONDS = 0.12
export const HUMAN_PRESS_FALLOFF_POWER = 1.7

// 兼容旧 API：仍保留这些字段名 — 已废弃
export const HUMAN_PRESS_ATTRACT_MAX = HUMAN_PRESS_MAX_ACCEL
export const HUMAN_PRESS_WEAK_DURATION = 0
export const HUMAN_PRESS_WEAK_FACTOR = 1.0

// =============================================================
// 生态健康值（Eco Health）v1
// =============================================================
// 目标：用"栖息地完整度 / 生态健康"替代传统"节点血量"概念
// - 人类活动覆盖节点时缓慢扣除
// - 动物迁徙成功结算时，对路径上节点造成"承载压力"
// - 无干扰时缓慢恢复，避免永久死局
// - 节点 logo 直接按健康度从下往上显示彩色 = 直观可见
// =============================================================
/** 节点默认初始生态健康值 */
export const NODE_ECO_HEALTH_DEFAULT = 100
/** 节点生态健康上限 */
export const NODE_ECO_HEALTH_MAX = 100

/** 人类活动覆盖节点时，每秒扣的生态健康（基础） */
export const NODE_ECO_DAMAGE_FROM_HUMAN_PER_SEC = 0.5
/** 人类活动覆盖节点时，根据人类圆大小的最大扣血倍率 */
export const NODE_ECO_DAMAGE_FROM_HUMAN_MAX_PER_SEC = 0.8
/** 人类圆半径映射到扣血强度的参考半径（半径 = 此值时取最大扣血） */
export const NODE_ECO_HUMAN_PRESSURE_REF_RADIUS = 120

/** 节点无干扰时，每秒恢复的健康 */
export const NODE_ECO_RECOVERY_PER_SEC = 0.15
/** 节点被扣血后多少秒才开始恢复（延迟） */
export const NODE_ECO_RECOVERY_DELAY_SEC = 2.5

/** 动物迁徙成功结算时，对路径上每个节点造成的"承载压力"（不视为破坏生态） */
export const NODE_ECO_MIGRATION_PRESSURE_MIN = 1.0
export const NODE_ECO_MIGRATION_PRESSURE_MAX = 1.5

/** 生态状态分界（按 health 百分比） */
export const NODE_ECO_STATE_PRESSURED_MAX = 70  // healthy / pressured 分界
export const NODE_ECO_STATE_DAMAGED_MAX = 40    // pressured / damaged 分界
export const NODE_ECO_STATE_DEGRADED_MAX = 15   // damaged / degraded 分界
/** 节点 health <= 0 时不可用，恢复到 35 后重新可用 */
export const NODE_ECO_RECOVER_USABLE_THRESHOLD = 35

/** 任务生成时对受损节点的"权重折扣"（damaged 时使用） */
export const NODE_ECO_TASK_WEIGHT_DAMAGED = 0.35
/** 任务生成时对退化节点的"权重折扣"（degraded 但仍可用时使用） */
export const NODE_ECO_TASK_WEIGHT_DEGRADED = 0.15
/** 节点健康低于此值时任务起终点尽量避开 */
export const NODE_ECO_AVOID_AS_ENDPOINT_HEALTH = 15

/** 任务生成时，最少保留多少个"健康节点"作候选（避免无解） */
export const NODE_ECO_MIN_HEALTHY_CANDIDATES = 2

// =============================================================
// 生态健康 v2（按用户最新要求命名）
// =============================================================
// 视觉/扣血量整体比 v1 更明显：
// - 人类每秒基础扣血 1.2（v1: 0.5）
// - 动物迁徙路径上每节点一次性扣 1.25（一次结算）
// - 节点无干扰 0.45/秒 恢复（v1: 0.15）
// - 节点 health 恢复到 35 后重新可用（与 v1 阈值一致）
// =============================================================
export const ECO_NODE_MAX_HEALTH = 100
export const ECO_HUMAN_DAMAGE_PER_SECOND = 2.0
export const ECO_ANIMAL_ROUTE_PRESSURE = 1.25
export const ECO_RECOVERY_PER_SECOND = 0.45
export const ECO_RECOVERY_DELAY_SECONDS = 2.5
export const ECO_REENABLE_HEALTH = 35

// 状态分界（v2，沿用 v1 阈值以保持视觉一致）
export const ECO_STATE_HEALTHY_MAX = 100
export const ECO_STATE_PRESSURED_MAX = 70
export const ECO_STATE_DAMAGED_MAX = 40
export const ECO_STATE_DEGRADED_MAX = 15

// 灾害类型
export type DisasterType = 'storm' | 'drought'

// 季节 ID：normal / storm / drought
export type SeasonId = 'normal' | 'storm' | 'drought'

export type NodeStatus = 'normal' | 'warning' | 'disabled'

export type NodeTag =
  | 'wetland' | 'flower' | 'grassland' | 'forest' | 'mountain'
  | 'breeding' | 'wintering' | 'rest' | 'passage' | 'river'
  | 'sea' | 'grass' | 'wood' | 'tundra' | 'reef' | 'cave'
  | 'spawning'
  | 'estuary' | 'fishway' | 'crossing' | 'coldSea' | 'coastal'

export type NodeType = 'breeding' | 'wintering' | 'rest' | 'passage'

export type SpeciesIcon = 'bird' | 'butterfly' | 'fish' | 'herd' | 'turtle' | 'frog'
