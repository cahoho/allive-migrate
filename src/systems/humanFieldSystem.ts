// =============================================================
// 人类系统兼容层 v8
// =============================================================
// 本文件 v8 起只作为兼容转发层。
// 唯一的人类阻挡圆实现在 src/systems/humanBlockerSystem.ts。
// 旧 API（getHumanClusters / getBlockingHumanClusters / segmentHitsHumanCluster /
// pointInHumanCluster / HumanCluster / HumanColony / HumanHotspot / HumanPressureTarget
// / getHumanHotspots / setHumanPointerTarget / applyPressGuidance / setHumanPressureTargets
// / getHumanAgents 等）都通过 humanBlockerSystem 提供。
// =============================================================
export {
  HUMAN_BLOCKER_ENABLED,
  HUMAN_BLOCKER_RADIUS,
  HUMAN_BLOCKER_VISUAL_RADIUS,
  HUMAN_BLOCKER_PADDING,
  HUMAN_BLOCKER_AUTO_SPEED,
  HUMAN_BLOCKER_POINTER_SPEED,
  HUMAN_BLOCKER_AUTO_FOLLOW,
  HUMAN_BLOCKER_POINTER_FOLLOW,
  HUMAN_BLOCKER_EDGE_PADDING,
  HUMAN_POINTER_DOT_RADIUS
} from '../data/gameConfig'

export {
  // 类型
  type HumanBlocker,
  type HumanCluster,
  type HumanColony,
  type HumanHotspot,
  type HumanPressureTarget,
  type BlockerBounds,
  // 实体
  ensureHumanBlocker,
  getHumanBlocker,
  getHumanColonies,
  setHumanBlockerActive,
  initHumanField,
  // 指针
  setHumanPointerTarget,
  applyPressGuidance,
  // 移动
  stepHumanBlocker,
  stepHumanColoniesFixed,
  tickHumanField,
  repositionHumanBlockerToSafeArea,
  // 兼容状态切换（v8 不再使用）
  setBlobAmbient,
  setBlobCooldown,
  setBlobBlocking,
  setBlobMovingToCorridor,
  // 兼容旧 cluster API
  getHumanClusters,
  getBlockingHumanClusters,
  getHumanAgents,
  // 几何入口
  segmentHitsHumanCluster,
  pointInHumanCluster,
  // 兼容旧 hotspot API
  getHumanHotspots,
  segmentHitsHumanHotspot,
  pointInHumanHotspot,
  isNodeSurroundedByHumans,
  increaseHumanPressure,
  lockPressForCriticalClusters,
  setHumanPressureTargets,
  setHumanPress,
  isHumanPressActive,
  getHumanPress,
  getHumanPressDuration,
  isHumanPressStrong,
  getHumanFieldState,
  HUMAN_GRID_COLS,
  HUMAN_GRID_ROWS
} from './humanBlockerSystem'
