// 节点视觉身份系统 v1
// =============================================================
// 目标：地图上的节点与右侧详情面板中的节点，必须共享同一套
//       "logo + 主色 + 辅色 + 形状"。
//
// 关键原则：
// 1) 视觉身份 key 优先用 RuntimeMapNode.equivalenceKey；
//    缺失时退回 displayName；再缺失时退回 "unknown"。
// 2) 不同节点（不同 displayName / equivalenceKey）拥有不同的
//    primary / secondary / shape / logo 组合。
// 3) waypoint 是任务里"按 tag 描述的途经要求"，不是具体节点；
//    对外暴露 waypointVisualFor() 给出对应规则 badge。
// 4) 所有 SVG 几何都集中在本文件中以方便统一调整；
//    渲染逻辑统一在 NodeBadge.vue 中复用。
// =============================================================
import type { RuntimeMapNode } from './gameData'
import type { RequiredWaypoint } from './speciesTemplates'
import type { NodeTag } from './gameConfig'

/** 外轮廓形状枚举（与 NodeBadge.vue 渲染的 <g shape> 配套） */
export type NodeShape =
  | 'circle'
  | 'diamond'
  | 'triangle'
  | 'square'
  | 'hexagon'
  | 'pentagon'
  | 'octagon'
  | 'rounded-square'

/** 内部 logo 种类（与 NodeBadge.vue 渲染的 <g logo> 配套） */
export type NodeLogoKind =
  | 'bird-egg'      // 北方繁殖地
  | 'wave'          // 沿海湿地
  | 'sun'           // 南方越冬地
  | 'flower'        // 高山花带
  | 'tree'          // 南方山林
  | 'fish'          // 冷水海域
  | 'branch'        // 河口
  | 'arrow-up'      // 鱼道
  | 'stream'        // 上游产卵溪
  | 'grass'         // 草场 / 草原
  | 'bridge'        // 河流渡口
  | 'crystal'       // 苔原台地
  | 'rock'          // 礁石海岸
  | 'cave'          // 岩洞栖息地
  | 'forest-patch'  // 林间空地
  | 'compass'       // 草原中转
  | 'mountain'      // 通用山地
  | 'sea'           // 通用海域
  | 'wetland'       // 通用湿地
  | 'any'           // 任意地点（规则 badge）
  | 'generic'       // 兜底

export interface NodeVisual {
  /** 视觉身份 key（debug / 测试用） */
  key: string
  /** 主色：描边 / 主色块 */
  primary: string
  /** 辅色：内部 logo / 填色 */
  secondary: string
  /** 外轮廓形状 */
  shape: NodeShape
  /** 内部 logo 种类 */
  logo: NodeLogoKind
  /** 简短描述（debug 用） */
  description: string
}

// -------------------------------------------------------------
// 节点视觉身份注册表
// -------------------------------------------------------------
// 这里集中维护"每个节点显示名 / equivalenceKey 对应的视觉"。
// 新增节点时，必须在这里登记，否则会回退到 generic 兜底。
// -------------------------------------------------------------

const VISUALS: Record<string, NodeVisual> = {
  // 候鸟路线
  north_breeding: {
    key: 'north_breeding',
    primary: '#7DBF8A',
    secondary: '#E8F5D8',
    shape: 'triangle',
    logo: 'bird-egg',
    description: '北方繁殖地'
  },
  coastal_wetland: {
    key: 'coastal_wetland',
    primary: '#5CA8FF',
    secondary: '#D6ECFF',
    shape: 'circle',
    logo: 'wave',
    description: '沿海湿地'
  },
  south_wintering: {
    key: 'south_wintering',
    primary: '#FFB45C',
    secondary: '#FFE7C8',
    shape: 'diamond',
    logo: 'sun',
    description: '南方越冬地'
  },

  // 蝴蝶路线
  mountain_flower: {
    key: 'mountain_flower',
    primary: '#E08DB6',
    secondary: '#FFD6E7',
    shape: 'hexagon',
    logo: 'flower',
    description: '高山花带'
  },
  south_forest: {
    key: 'south_forest',
    primary: '#3F8C5C',
    secondary: '#C5E8C9',
    shape: 'rounded-square',
    logo: 'tree',
    description: '南方山林'
  },

  // 鲑鱼路线
  cold_sea: {
    key: 'cold_sea',
    primary: '#3A7CB8',
    secondary: '#B9DAEF',
    shape: 'circle',
    logo: 'fish',
    description: '冷水海域'
  },
  estuary: {
    key: 'estuary',
    primary: '#4FB7A8',
    secondary: '#CDEBE5',
    shape: 'octagon',
    logo: 'branch',
    description: '河口'
  },
  fishway: {
    key: 'fishway',
    primary: '#3FC0C0',
    secondary: '#C8F1F1',
    shape: 'square',
    logo: 'arrow-up',
    description: '鱼道'
  },
  spawning_stream: {
    key: 'spawning_stream',
    primary: '#7AB7E8',
    secondary: '#D8ECFB',
    shape: 'diamond',
    logo: 'stream',
    description: '上游产卵溪'
  },

  // 草原兽群路线
  south_grassland: {
    key: 'south_grassland',
    primary: '#D9C27A',
    secondary: '#F1E5BD',
    shape: 'circle',
    logo: 'grass',
    description: '南部草场'
  },
  river_crossing: {
    key: 'river_crossing',
    primary: '#B68A4E',
    secondary: '#EFD9B2',
    shape: 'square',
    logo: 'bridge',
    description: '河流渡口'
  },
  north_grassland: {
    key: 'north_grassland',
    primary: '#9DAE5A',
    secondary: '#E1E7C2',
    shape: 'pentagon',
    logo: 'grass',
    description: '北部草场'
  },

  // 通用节点
  tundra_steppe: {
    key: 'tundra_steppe',
    primary: '#A6A2B8',
    secondary: '#E1DFF0',
    shape: 'hexagon',
    logo: 'crystal',
    description: '苔原台地'
  },
  reef_shore: {
    key: 'reef_shore',
    primary: '#2F6E8A',
    secondary: '#C2DBE6',
    shape: 'pentagon',
    logo: 'rock',
    description: '礁石海岸'
  },
  cave_shelter: {
    key: 'cave_shelter',
    primary: '#8C7A66',
    secondary: '#E0D4C2',
    shape: 'rounded-square',
    logo: 'cave',
    description: '岩洞栖息地'
  },
  wood_patch: {
    key: 'wood_patch',
    primary: '#5BAE73',
    secondary: '#D2EED9',
    shape: 'circle',
    logo: 'forest-patch',
    description: '林间空地'
  },
  grassland_relay: {
    key: 'grassland_relay',
    primary: '#C7A24A',
    secondary: '#F2E2B1',
    shape: 'octagon',
    logo: 'compass',
    description: '草原中转'
  }
}

/** 兜底视觉：未登记的节点使用此身份 */
const FALLBACK_VISUAL: NodeVisual = {
  key: 'unknown',
  primary: '#DCE7F2',
  secondary: '#2A3A4D',
  shape: 'circle',
  logo: 'generic',
  description: '未知节点'
}

/**
 * 取一个节点的"视觉身份 key"
 * 优先级：equivalenceKey > displayName > name > 'unknown'
 */
export function getNodeVisualKey(node: RuntimeMapNode | null | undefined): string {
  if (!node) return 'unknown'
  if (node.equivalenceKey) return node.equivalenceKey
  if (node.displayName) return node.displayName
  if (node.name) return node.name
  return 'unknown'
}

/**
 * 根据节点取出其视觉身份定义。
 * - 命中注册表则返回对应定义
 * - 命中不了时退到 displayName 二次查
 * - 最终兜底为 FALLBACK_VISUAL
 */
export function getNodeVisual(node: RuntimeMapNode | null | undefined): NodeVisual {
  if (!node) return FALLBACK_VISUAL
  const k1 = node.equivalenceKey
  if (k1 && VISUALS[k1]) return VISUALS[k1]
  const k2 = node.displayName || node.name
  if (k2 && VISUALS[k2]) return VISUALS[k2]
  return FALLBACK_VISUAL
}

/**
 * 用任意 visualKey（不一定是 RuntimeMapNode）取视觉身份。
 * 供 NodeBadge 在没有 node 的情况下，根据 visualKey 渲染。
 */
export function getNodeVisualByKey(key: string | null | undefined): NodeVisual {
  if (!key) return FALLBACK_VISUAL
  if (VISUALS[key]) return VISUALS[key]
  return FALLBACK_VISUAL
}

// -------------------------------------------------------------
// waypoint 视觉映射
// -------------------------------------------------------------
// requiredWaypoints 中 kind === 'tag' 描述的是"任意具有某 tag 的节点"
// 这不是具体节点实例，所以不能直接用 getNodeVisual；
// 必须用下列 waypoint 规则 badge 替代。
// -------------------------------------------------------------

/**
 * tag 名称 -> waypoint 视觉
 * 注意：tag 名称采用 NodeTag，可能存在多种写法（例如 estuary / crossing）。
 */
const WAYPOINT_VISUALS: Record<string, NodeVisual> = {
  // 自然类
  wetland: {
    key: 'wp:wetland',
    primary: '#5CA8FF',
    secondary: '#D6ECFF',
    shape: 'circle',
    logo: 'wetland',
    description: '湿地'
  },
  flower: {
    key: 'wp:flower',
    primary: '#E08DB6',
    secondary: '#FFD6E7',
    shape: 'hexagon',
    logo: 'flower',
    description: '花蜜地'
  },
  grassland: {
    key: 'wp:grassland',
    primary: '#D9C27A',
    secondary: '#F1E5BD',
    shape: 'circle',
    logo: 'grass',
    description: '草原'
  },
  forest: {
    key: 'wp:forest',
    primary: '#3F8C5C',
    secondary: '#C5E8C9',
    shape: 'rounded-square',
    logo: 'tree',
    description: '森林'
  },
  mountain: {
    key: 'wp:mountain',
    primary: '#A6A2B8',
    secondary: '#E1DFF0',
    shape: 'triangle',
    logo: 'mountain',
    description: '高山通道'
  },
  sea: {
    key: 'wp:sea',
    primary: '#3A7CB8',
    secondary: '#B9DAEF',
    shape: 'circle',
    logo: 'sea',
    description: '海域'
  },
  river: {
    key: 'wp:river',
    primary: '#4FB7A8',
    secondary: '#CDEBE5',
    shape: 'octagon',
    logo: 'branch',
    description: '河流'
  },
  // 鲑鱼路线专属
  estuary: {
    key: 'wp:estuary',
    primary: '#4FB7A8',
    secondary: '#CDEBE5',
    shape: 'octagon',
    logo: 'branch',
    description: '河口'
  },
  fishway: {
    key: 'wp:fishway',
    primary: '#3FC0C0',
    secondary: '#C8F1F1',
    shape: 'square',
    logo: 'arrow-up',
    description: '鱼道'
  },
  crossing: {
    key: 'wp:crossing',
    primary: '#B68A4E',
    secondary: '#EFD9B2',
    shape: 'square',
    logo: 'bridge',
    description: '河流渡口'
  },
  // 草原路线专属
  grass: {
    key: 'wp:grass',
    primary: '#D9C27A',
    secondary: '#F1E5BD',
    shape: 'circle',
    logo: 'grass',
    description: '草场'
  },
  spawning: {
    key: 'wp:spawning',
    primary: '#7AB7E8',
    secondary: '#D8ECFB',
    shape: 'diamond',
    logo: 'stream',
    description: '产卵地'
  },
  coldSea: {
    key: 'wp:coldSea',
    primary: '#3A7CB8',
    secondary: '#B9DAEF',
    shape: 'circle',
    logo: 'fish',
    description: '冷水海域'
  },
  coastal: {
    key: 'wp:coastal',
    primary: '#5CA8FF',
    secondary: '#D6ECFF',
    shape: 'circle',
    logo: 'wave',
    description: '沿海'
  },
  // 任意可通行节点
  any: {
    key: 'wp:any',
    primary: '#9FB1C7',
    secondary: '#E0E7F1',
    shape: 'octagon',
    logo: 'any',
    description: '任意可通行节点'
  }
}

/** 任意可通行节点的视觉定义（供外部直接 import） */
export const ANY_WAYPOINT_VISUAL: NodeVisual = WAYPOINT_VISUALS.any!

/**
 * 通过 waypoint 取视觉身份。
 * - kind === 'node'：取该节点真实视觉
 * - kind === 'tag'：取对应 tag 的规则 badge
 * - kind === 'any'：取"任意地点"规则 badge
 */
export function waypointVisualFor(
  wp: RequiredWaypoint,
  nodes: RuntimeMapNode[] = []
): NodeVisual {
  if (wp.kind === 'node') {
    const n = nodes.find((x) => x.id === wp.nodeId)
    return getNodeVisual(n)
  }
  if (wp.kind === 'tag') {
    const v = WAYPOINT_VISUALS[wp.tag as string]
    if (v) return v
    return WAYPOINT_VISUALS.any!
  }
  // kind === 'any'
  return WAYPOINT_VISUALS.any!
}

/**
 * waypoint 显示文本（带 count 修饰）
 * - count <= 1：不显示 "1处" / "×1"
 * - count > 1：显示 "(N处)" 后缀
 * - any：明确为"任意可通行节点"，告知玩家地图上任意一处允许的中转点
 * - tag：统一为"任意{基础标签}"格式（高山 tag 走"高山节点"特例），
 *         彻底移除"任一候选节点"文案，让 UI 文案单一事实源。
 *
 * 注意：NODE_TAG_LABELS.mountain 保持原有业务命名"高山通道"；
 *       "高山节点"仅作为本函数对 tag 标签的展示适配。
 */
export function waypointLabelFor(wp: RequiredWaypoint): string {
  if (wp.kind === 'any') {
    return wp.count > 1
      ? `任意可通行节点（${wp.count}处）`
      : '任意可通行节点'
  }

  if (wp.kind === 'tag') {
    const baseLabel =
      wp.tag === 'mountain'
        ? '高山节点'
        : nodeTagLabel(wp.tag)

    return wp.count > 1
      ? `任意${baseLabel}（${wp.count}处）`
      : `任意${baseLabel}`
  }

  // kind === 'node'
  return wp.label
}

/**
 * 完整的 NodeTag → 中文标签字典
 * - 用于 UI 显示（例如"任意湿地 / 任意高山节点"等）
 * - 优先以"玩家可读 + 直观"为标准
 *
 * 注意：这是单一事实源。任何"把 tag 翻成人类可读"的逻辑
 * 都要从这里取，不要在调用方各自硬编码。
 *
 * mountain 字段维持"高山通道"业务命名；
 * "高山节点"的展示文案在 waypointLabelFor() 内做适配。
 */
export const NODE_TAG_LABELS: Record<NodeTag, string> = {
  wetland: '湿地',
  flower: '花蜜地',
  grassland: '草原',
  forest: '森林',
  mountain: '高山通道',
  breeding: '繁殖地',
  wintering: '越冬地',
  rest: '休憩地',
  passage: '通道',
  river: '河流',
  sea: '海域',
  grass: '草场',
  wood: '林地',
  tundra: '苔原',
  reef: '礁石',
  cave: '岩洞',
  spawning: '产卵地',
  estuary: '河口',
  fishway: '鱼道',
  crossing: '渡口',
  coldSea: '冷水海域',
  coastal: '海岸'
}

/**
 * NodeTag → 中文标签。未知 tag 退回到原始字符串。
 */
export function nodeTagLabel(tag: NodeTag | string | null | undefined): string {
  if (!tag) return ''
  return NODE_TAG_LABELS[tag as NodeTag] ?? String(tag)
}

/**
 * 把 NodeTag 转成 waypoint 视觉（主要给 UI 元素按 tag 上色用）。
 */
export function visualForTag(tag: NodeTag | string | null | undefined): NodeVisual {
  if (!tag) return WAYPOINT_VISUALS.any!
  return WAYPOINT_VISUALS[tag as string] || WAYPOINT_VISUALS.any!
}

/** 是否已登记某 visual key */
export function hasNodeVisual(key: string): boolean {
  return !!VISUALS[key]
}

/** 暴露给 dev tools / 调试面板用 */
export const ALL_NODE_VISUALS: ReadonlyArray<NodeVisual> = Object.freeze(
  Object.values(VISUALS)
)

/** 暴露给 dev tools / 调试面板用 */
export const ALL_WAYPOINT_VISUALS: ReadonlyArray<NodeVisual> = Object.freeze(
  Object.values(WAYPOINT_VISUALS)
)
