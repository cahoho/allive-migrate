// 节点模板 v2
// 引入 NodeArchetype（节点原型）概念，替代 v1 的固定节点 ID。
// - 同一 archetype 可以生成多个不同 id 的节点
// - 节点由 tag 而不是 id 决定语义
// - 任务使用 tag 来引用必经点（河口/鱼道/渡口/产卵溪等）
// - 显示名可以重复，id 必须唯一
// - semanticKey / equivalenceKey 提供更严格的语义/玩家视角等价
//   - semanticKey：内部"真的同类地点"（cluster / 任务起终点池）
//   - equivalenceKey：玩家视角下"视觉同名 + 同类"的节点等价 key
//                     任务提交时通过该 key 匹配任意同语义节点
import type { NodeTag, NodeType } from './gameConfig'

export interface NodeTemplate {
  type: NodeType
  displayName: string
  id: string
  baseTags: NodeTag[]
  stage: number
}

/**
 * 节点原型：用于"渐进式一次只生成一个节点"的核心数据
 * - role: 唯一 archetype 标识
 * - displayName: 显示名称（多个同名同标签节点可同时存在）
 * - type: 节点类型（决定形状）
 * - tags: 节点标签集合
 * - weight: 抽取权重
 * - minSuccess / minElapsed: 解锁条件（玩家达到此条件后该 archetype 才允许出现）
 * - speciesUtility: 此 archetype 倾向服务于哪些物种（用作加权依据）
 * - semanticKey: 内部"同类地点"标识。同 archetype 自动相同
 * - equivalenceKey: 玩家视角下"视觉同名"等价标识。同 archetype 自动相同
 */
export interface NodeArchetype {
  role: string
  semanticKey: string
  equivalenceKey: string
  displayName: string
  type: NodeType
  tags: NodeTag[]
  weight: number
  minSuccess?: number
  minElapsed?: number
  speciesUtility?: string[]
}

/**
 * 固定节点 ID（兼容旧引用）
 * 仍保留 FIXED_NODES_STAGE1..4 的列表，使 taskGenerator / solvability
 * 中要求"必经 node" 也能在 v4 阶段被 archetype 系统自动产出。
 *
 * 这些 ID 仅作为 archetype 池中"开局必现"的特殊角色。
 * 玩家看到的具体节点仍是 archetype 生成的 tag 节点。
 */
export const FIXED_NODE_IDS = {
  NORTH_BREEDING:    'north_breeding',
  COASTAL_WETLAND:   'coastal_wetland',
  SOUTH_WINTERING:   'south_wintering',
  MOUNTAIN_FLOWER:   'mountain_flower',
  SOUTH_FOREST:      'south_forest',
  COLD_SEA:          'cold_sea',
  RIVER_MOUTH:       'river_mouth',
  FISH_LADDER:       'fish_ladder',
  SPAWNING_STREAM:   'spawning_stream',
  SOUTH_GRASSLAND:   'south_grassland',
  RIVER_CROSSING:    'river_crossing',
  NORTH_GRASSLAND:   'north_grassland'
} as const

/** 阶段 1 固定节点（兼容旧数据：保留以避免破坏引用） */
export const FIXED_NODES_STAGE1: NodeTemplate[] = []
/** 阶段 2 固定节点 */
export const FIXED_NODES_STAGE2: NodeTemplate[] = []
/** 阶段 3 固定节点 */
export const FIXED_NODES_STAGE3: NodeTemplate[] = []
/** 阶段 4 固定节点 */
export const FIXED_NODES_STAGE4: NodeTemplate[] = []

/** 全部 MVP 固定节点（兼容旧引用） */
export const ALL_FIXED_NODES: NodeTemplate[] = []

/** @deprecated 不再使用 */
export function getFixedNodesForStage(_stage: number): NodeTemplate[] {
  return []
}

// ============================================================
// NodeArchetype 池
// ============================================================

/**
 * 构造 archetype 池
 * 默认 semanticKey === role，equivalenceKey === role
 * 不同语义节点必须使用不同 displayName
 */
function defineArchetypes(
  raw: Omit<NodeArchetype, 'semanticKey' | 'equivalenceKey'>[]
): NodeArchetype[] {
  return raw.map((a) => ({
    ...a,
    semanticKey: a.role,
    equivalenceKey: a.role
  }))
}

/** 全部 archetype 列表（按角色） */
export const NODE_ARCHETYPES: NodeArchetype[] = defineArchetypes([
  // ---------------- 候鸟（鸟）路线相关 ----------------
  {
    role: 'north_breeding',
    displayName: '北方繁殖地',
    type: 'breeding',
    tags: ['breeding', 'forest', 'wood'],
    weight: 1.0,
    speciesUtility: ['bird', 'butterfly', 'bar_goose']
  },
  {
    role: 'coastal_wetland',
    displayName: '沿海湿地',
    type: 'rest',
    tags: ['wetland', 'coastal'],
    weight: 1.4,
    minSuccess: 0,
    speciesUtility: ['bird', 'bar_goose', 'sea_turtle']
  },
  {
    role: 'south_wintering',
    displayName: '南方越冬地',
    type: 'wintering',
    tags: ['wintering', 'forest', 'wood'],
    weight: 1.0,
    minSuccess: 0,
    speciesUtility: ['bird', 'butterfly', 'bar_goose']
  },
  // ---------------- 蝴蝶路线相关 ----------------
  {
    role: 'mountain_flower',
    displayName: '高山花带',
    type: 'rest',
    tags: ['flower', 'mountain'],
    weight: 1.2,
    minSuccess: 1,
    speciesUtility: ['butterfly', 'bar_goose']
  },
  {
    role: 'south_forest',
    displayName: '南方山林',
    type: 'wintering',
    tags: ['forest', 'wintering', 'wood'],
    weight: 1.0,
    minSuccess: 1,
    speciesUtility: ['butterfly', 'bird', 'wood_frog']
  },
  // ---------------- 鲑鱼路线相关 ----------------
  {
    role: 'cold_sea',
    displayName: '冷水海域',
    type: 'rest',
    tags: ['sea', 'wetland', 'coldSea'],
    weight: 1.2,
    minSuccess: 3,
    speciesUtility: ['salmon', 'eel', 'sea_turtle']
  },
  {
    role: 'estuary',
    displayName: '河口',
    type: 'passage',
    tags: ['river', 'estuary', 'passage'],
    weight: 1.4,
    minSuccess: 3,
    speciesUtility: ['salmon', 'eel']
  },
  {
    role: 'fishway',
    displayName: '鱼道',
    type: 'passage',
    tags: ['river', 'fishway', 'passage'],
    weight: 1.4,
    minSuccess: 3,
    speciesUtility: ['salmon', 'eel']
  },
  {
    role: 'spawning_stream',
    displayName: '上游产卵溪',
    type: 'wintering',
    tags: ['river', 'wetland', 'spawning'],
    weight: 1.2,
    minSuccess: 3,
    speciesUtility: ['salmon', 'eel', 'wood_frog']
  },
  // ---------------- 草原兽群路线相关 ----------------
  {
    role: 'south_grassland',
    displayName: '南部草场',
    type: 'rest',
    tags: ['grassland', 'grass'],
    weight: 1.0,
    minSuccess: 7,
    speciesUtility: ['herd']
  },
  {
    role: 'river_crossing',
    displayName: '河流渡口',
    type: 'passage',
    tags: ['grassland', 'river', 'crossing', 'passage'],
    weight: 1.4,
    minSuccess: 7,
    speciesUtility: ['herd']
  },
  {
    role: 'north_grassland',
    displayName: '北部草场',
    type: 'rest',
    tags: ['grassland', 'grass'],
    weight: 1.0,
    minSuccess: 7,
    speciesUtility: ['herd']
  },
  // ---------------- 通用节点（不绑定某物种） ----------------
  {
    role: 'tundra_steppe',
    displayName: '苔原台地',
    type: 'rest',
    tags: ['tundra', 'grass', 'rest'],
    weight: 0.6,
    minSuccess: 0
  },
  {
    role: 'reef_shore',
    displayName: '礁石海岸',
    type: 'rest',
    tags: ['reef', 'sea', 'coastal', 'rest'],
    weight: 0.8,
    minSuccess: 0,
    speciesUtility: ['sea_turtle']
  },
  {
    role: 'cave_shelter',
    displayName: '岩洞栖息地',
    type: 'rest',
    tags: ['cave', 'mountain', 'rest'],
    weight: 0.8,
    minSuccess: 1,
    speciesUtility: ['wood_frog']
  },
  {
    role: 'wood_patch',
    displayName: '林间空地',
    type: 'rest',
    tags: ['forest', 'wood', 'grass', 'rest'],
    weight: 0.7,
    minSuccess: 0,
    speciesUtility: ['butterfly', 'wood_frog', 'bar_goose']
  },
  {
    role: 'grassland_relay',
    displayName: '草原中转',
    type: 'passage',
    tags: ['grassland', 'grass', 'passage'],
    weight: 0.7,
    minSuccess: 0
  }
])

/**
 * 开发期校验：所有 archetype 共享的 displayName 必须对应同一个 equivalenceKey
 * - 防止"两个不同语义节点都叫南方越冬地"这类认知错乱
 * - 同 archetype 的节点天然具有相同的 displayName + equivalenceKey，不会冲突
 * - 不同 archetype 共享 displayName 会在初始化时直接抛错
 */
let _consistencyChecked = false
export function assertDisplayNameSemanticConsistency(): void {
  if (_consistencyChecked) return
  _consistencyChecked = true
  const seen = new Map<string, string>()
  for (const arch of NODE_ARCHETYPES) {
    const existing = seen.get(arch.displayName)
    if (existing && existing !== arch.equivalenceKey) {
      throw new Error(
        `[nodeTemplates] 节点显示名称冲突：${arch.displayName} 对应多个 equivalenceKey ` +
        `(${existing} vs ${arch.equivalenceKey})。` +
        `不同语义节点必须改成不同显示名称。`
      )
    }
    seen.set(arch.displayName, arch.equivalenceKey)
  }
}

/** 节点显示形状 */
export function shapeForType(type: NodeType): 'triangle' | 'diamond' | 'circle' | 'square' {
  switch (type) {
    case 'breeding': return 'triangle'
    case 'wintering': return 'diamond'
    case 'rest': return 'circle'
    case 'passage': return 'square'
  }
}

/** 节点配色（按标签） */
export function nodeTintByTags(tags: NodeTag[]): string {
  if (tags.includes('wetland')) return '#5CA8FF'
  if (tags.includes('flower')) return '#FFB45C'
  if (tags.includes('grassland')) return '#D9C27A'
  if (tags.includes('forest')) return '#7DBF8A'
  if (tags.includes('mountain')) return '#A6A2B8'
  if (tags.includes('river')) return '#5CA8FF'
  if (tags.includes('sea')) return '#5CA8FF'
  if (tags.includes('breeding')) return '#FFD8A6'
  if (tags.includes('wintering')) return '#A0D8FF'
  if (tags.includes('passage')) return '#C9B27A'
  return '#DCE7F2'
}

/** 标签相关的视觉装饰 */
export function tagDecorationTags(tags: NodeTag[]): NodeTag | null {
  if (tags.includes('wetland')) return 'wetland'
  if (tags.includes('flower')) return 'flower'
  if (tags.includes('grassland')) return 'grassland'
  if (tags.includes('passage')) return 'passage'
  if (tags.includes('river')) return 'river'
  if (tags.includes('forest')) return 'forest'
  if (tags.includes('mountain')) return 'mountain'
  return null
}
