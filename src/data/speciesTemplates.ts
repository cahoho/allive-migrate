// 物种模板：v4
// - startNode / targetNode 改为"标签池"，每条任务从中随机抽取
// - 鲑鱼、草原兽群：必经点改为 tag 形式（河口/鱼道/渡口）
//   不再绑定到具体固定 ID 节点
// - 同一物种不同任务的起终点/必经点都不同
// - 季节/风暴/干旱 + 人类密度 共同决定可解性
// - 保持向后兼容：旧调用点若传 startNodeId/targetNodeId 仍可工作
// - 物种模板里的"额外途径点"改用 kind: 'any'，不允许伪造"途经节点"语义
//
// v5 关键新增：successScore（单次成功迁徙的"迁徙得分"）
// 单一事实源 — TopBar 状态栏、SpeciesPanel 详情面板都从这里读取。
//
// 表格（来源：策划需求）
// 阶段  物种 id      名称         migrationSpeed  速度层级        成功迁徙得分
// 1     bird        雁鸭候鸟     0.55            极快             1.0
// 2     butterfly   帝王蝶       0.85            快               1.2
// 2     bar_goose   斑头雁       0.42            极快，最快         0.9
// 3     salmon      鲑鱼         1.25            中等偏快          1.5
// 4     herd        角马兽群     7.20            很慢             3.4
// 5     eel         美洲鳗       1.65            中等             1.7
// 5     sea_turtle  绿海龟       4.80            慢               2.7
// 6     wood_frog   林蛙         9.20            极慢，最慢         3.8
//
// 设计原则：
// - 飞行越快、迁徙距离越短、风险越低 → 得分越低
// - 越慢 / 越依赖连续通道的物种（陆地、两栖） → 得分越高
//   因为它们的迁徙通道更脆弱，生态保护价值更大
// - 同一阶段内不同物种之间最多 0.3 差距（差异化但不过分）
// - 相邻阶段大约 0.2~0.3 跃迁（保持阶段推进感）
import type { NodeTag, DisasterType, SpeciesIcon } from './gameConfig'

export interface SpeciesDef {
  id: string
  name: string
  englishName: string
  icon: SpeciesIcon
  color: string

  /**
   * 起点的标签池：每条任务从当前地图中匹配这些标签的节点里随机抽一个
   */
  startTagPool: NodeTag[]
  /**
   * 终点的标签池
   */
  targetTagPool: NodeTag[]

  /**
   * 兼容：旧版固定起终点（v3 不再使用；保留字段防止外部引用编译错误）
   */
  startNode: string
  targetNode: string

  /** 必经点（类型需求或固定节点） */
  requiredWaypoints: RequiredWaypoint[]
  /** 是否要求按顺序经过必经点 */
  requiredWaypointOrder?: boolean
  /** 允许经过的节点标签（白名单；不设置则不限制） */
  allowedNodeTags?: NodeTag[]

  /**
   * 抽签：每条任务额外随机抽 minCount~maxCount 个"任意可通行中转点"（kind: 'any'）
   * - 任意可通行中转点的真实含义：起点/终点/禁用/生态不可用/物种禁行之外
   *   的任何可通行中间节点。不再以 tag 池或白名单暗加限制。
   */
  waypointPicker?: { minCount: number; maxCount: number }

  /**
   * 允许在已有"显式必经点"的同时继续抽随机中转点。
   * - 默认 false：与 v4 行为一致（带 tag 必经点时不再叠加 any 中转）
   * - true：butterfly / herd / eel / wood_frog 这类需要"主路径 + 弹性中转"的物种
   */
  allowRandomWaypointWithRequired?: boolean

  /**
   * 最大单段迁徙距离（抽象单位）
   */
  maxSegmentDistance: number
  /**
   * 迁徙速度：每个节点段所需的秒数（progress = 1 所需时长 = path.length * migrationSpeed）
   * - 飞行物种（候鸟、蝴蝶）：速度快 → 数值小
   * - 水生物种（鲑鱼）：中等
   * - 陆地物种（草原兽群）：比飞行慢 → 数值大
   * 缺省时回退到 0.55，兼容旧数据
   */
  migrationSpeed: number
  /**
   * 速度层级（与 migrationSpeed 配套，用于 UI 分档说明）
   * - 0.4 ~ 0.5  极快：高强度飞行迁徙
   * - 0.5 ~ 0.9  较快：昆虫或普通飞行迁徙
   * - 0.9 ~ 1.8  中等：水生洄游
   * - 1.8 ~ 5.5  慢：海洋爬行动物迁徙
   * - >= 5.5     极慢：陆地/两栖迁徙
   */
  speedTier: string
  /**
   * 单次成功迁徙获得的"得分"（迁徙得分，区别于成功次数）。
   * - 得分与该物种的迁徙难度（速度、迁徙距离、风险敏感性）正相关
   * - 越慢 / 越长的迁徙 → 得分越高（保护通道的生态价值更大）
   * - 玩家在 TopBar / 物种详情中都能看到这个值
   * - 顶栏的"迁徙得分" = Σ 成功迁徙数 × species.successScore
   * - 顶栏的"成功迁徙" = 成功次数（不再等于得分）
   */
  successScore: number
  /** 倒计时（秒） */
  timeLimit: number
  /** 风险描述（始终显示在面板上） */
  riskText: string

  /** 风险敏感类型（用于风险区域判定） */
  disasterVulnerabilities: DisasterType[]

  /**
   * 人类密度容忍上限：v4 起已废弃（人类阻挡由 cluster blocking 决定）
   * 保留字段以兼容旧代码
   */
  humanTolerance?: number

  /**
   * 生态启示：物种详情面板上展示的"一句话生态学启示"
   * - 玩家直观理解"为什么这个物种要保护通道"
   * - 与游戏机制无关，仅用于教学
   */
  ecoInsight?: string
}

/**
 * RequiredWaypoint 三种形态：
 * - 'tag'  : 必须经过特定 tag 的中间节点（count 个，任意顺序）
 * - 'node' : 必须经过特定 nodeId 的中间节点
 * - 'any'  : 任意可通行的中间节点（count 个，任意顺序；不含起点/终点；
 *            受物种 allowedNodeTags、节点禁用、生态可用、风险、人类阻挡、
 *            距离和资源等既有规则限制）
 *
 * 'any' 是"通用随机途径点"的真实语义：玩家经过任意合法可通行的中间节点即可。
 * 不允许再用 tagPool / eligibleTags 等字段把 any 暗中限制成花地、草地、河流等标签。
 */
export type RequiredWaypoint =
  | { kind: 'tag'; tag: NodeTag; label: string; count: number }
  | { kind: 'node'; nodeId: string; label: string }
  | {
      kind: 'any'
      label?: string
      count: number
    }

export const SPECIES_TEMPLATES: SpeciesDef[] = [
  {
    id: 'bird',
    name: '雁鸭候鸟',
    englishName: 'Migratory Waterbird',
    icon: 'bird',
    color: '#7AD7FF',
    // 候鸟（v4 修复版）：起点只允许 breeding；终点只允许 wintering
    // 不再用 wetland/forest 作为通用起点/终点，否则湿地和森林
    // 会在起点 / 终点 / 途径之间互相错乱，导致首任务不稳定。
    startTagPool: ['breeding'],
    targetTagPool: ['wintering'],
    // 旧字段（保留兼容，不再使用）
    startNode: 'north_breeding',
    targetNode: 'south_wintering',
    requiredWaypoints: [
      { kind: 'tag', tag: 'wetland', label: '湿地', count: 1 }
    ],
    // 显式 tag 必经点 + 不允许叠加随机中转点（保持 v4 行为）
    waypointPicker: { minCount: 0, maxCount: 0 },
    allowRandomWaypointWithRequired: false,
    maxSegmentDistance: 420,
    // 候鸟：飞行，速度快
    migrationSpeed: 0.55,
    speedTier: '极快',
    // 成功迁徙得分：阶段 1 入门物种
    // - 飞行、距离短、生态通道较稳 → 最低档
    successScore: 1.0,
    timeLimit: 32,
    riskText: '暴风季时，海上风险区域不可穿越；人类聚集区不可穿越',
    disasterVulnerabilities: ['storm'],
    humanTolerance: 0.65,
    ecoInsight: '湿地是候鸟长途飞行中的补给站，保护湿地能让迁徙不断线。'
  },
  {
    id: 'butterfly',
    name: '帝王蝶',
    englishName: 'Monarch Butterfly',
    icon: 'butterfly',
    color: '#FFB45C',
    startTagPool: ['breeding', 'flower', 'forest'],
    targetTagPool: ['wintering', 'forest', 'mountain'],
    startNode: 'north_breeding',
    targetNode: 'south_forest',
    requiredWaypoints: [
      { kind: 'tag', tag: 'flower', label: '花蜜地', count: 1 }
    ],
    // 同时允许在花蜜地基础上叠加 0~1 个任意可通行中转
    waypointPicker: { minCount: 0, maxCount: 1 },
    allowRandomWaypointWithRequired: true,
    maxSegmentDistance: 390,
    // 帝王蝶：飞行，速度较快
    migrationSpeed: 0.85,
    speedTier: '快',
    // 成功迁徙得分：阶段 2，比候鸟略高（迁徙世代数 + 路径更长）
    successScore: 1.2,
    timeLimit: 34,
    riskText: '干旱季时，干旱区域不可穿越；人类聚集区不可穿越',
    disasterVulnerabilities: ['drought'],
    humanTolerance: 0.65,
    ecoInsight: '花蜜地像迁徙途中的能量站，连续花带越完整，帝王蝶越容易完成跨区域迁徙。'
  },
  {
    id: 'bar_goose',
    name: '斑头雁',
    englishName: 'Bar-headed Goose',
    icon: 'bird',
    color: '#CFEAFF',
    startTagPool: ['breeding'],
    targetTagPool: ['wintering'],
    startNode: 'north_breeding',
    targetNode: 'south_wintering',
    // 必须经过高山通道 + 湿地补给
    requiredWaypoints: [
      { kind: 'tag', tag: 'mountain', label: '高山通道', count: 1 },
      { kind: 'tag', tag: 'wetland', label: '湿地补给', count: 1 }
    ],
    allowedNodeTags: ['breeding', 'wintering', 'mountain', 'wetland', 'forest', 'wood', 'flower', 'coastal', 'passage', 'rest'],
    // 不再额外叠加随机中转点（必经点本身足够约束路线）
    waypointPicker: { minCount: 0, maxCount: 0 },
    allowRandomWaypointWithRequired: false,
    maxSegmentDistance: 430,
    // 斑头雁：能飞越极高海拔，但每段速度中等
    migrationSpeed: 0.42,
    speedTier: '极快，最快',
    // 成功迁徙得分：阶段 2 但速度最快 → 得分低于帝王蝶
    // （速度越快、通道越稳定，单次保护动作的边际价值越低）
    successScore: 0.9,
    timeLimit: 31,
    riskText: '需要经过高山通道和湿地补给；暴风季和人类活动热点会阻断迁飞路线',
    disasterVulnerabilities: ['storm'],
    humanTolerance: 0.65,
    ecoInsight: '即使能飞越高山，斑头雁仍依赖湿地停歇；高山通道和湿地补给同样重要。'
  },
  {
    id: 'salmon',
    name: '鲑鱼',
    englishName: 'Salmon',
    icon: 'fish',
    color: '#5CA8FF',
    // v4: 鲑鱼不再依赖唯一 河口/鱼道
    // 改为：起点 = 冷水海域；终点 = 上游产卵地
    // 必经点：先经过任意 estuary，再经过任意 fishway（ordered）
    startTagPool: ['coldSea'],
    targetTagPool: ['spawning'],
    startNode: 'cold_sea',
    targetNode: 'spawning_stream',
    requiredWaypoints: [
      { kind: 'tag', tag: 'estuary', label: '河口', count: 1 },
      { kind: 'tag', tag: 'fishway', label: '鱼道', count: 1 }
    ],
    requiredWaypointOrder: true,
    allowedNodeTags: ['sea', 'river', 'wetland', 'spawning', 'coldSea', 'estuary', 'fishway'],
    waypointPicker: { minCount: 0, maxCount: 0 },
    allowRandomWaypointWithRequired: false,
    maxSegmentDistance: 320,
    // 鲑鱼：水生洄游
    migrationSpeed: 1.25,
    speedTier: '中等偏快',
    // 成功迁徙得分：阶段 3
    // - 路径依赖（河口→鱼道→产卵地）使得通道连通价值很高
    // - 但单次迁徙速度尚可，单段路程较短
    successScore: 1.5,
    timeLimit: 40,
    riskText: '必须按顺序经过河口和鱼道，最终抵达上游产卵地；人类活动热点不可穿越',
    disasterVulnerabilities: ['drought'],
    humanTolerance: 0.65,
    ecoInsight: '河口和鱼道连接海洋与上游产卵地，河流连通是鲑鱼回家的关键。'
  },
  {
    id: 'herd',
    name: '角马兽群',
    englishName: 'Wildebeest Herd',
    icon: 'herd',
    color: '#D9C27A',
    // 角马迁徙依赖草场 + 渡口；起终点都在草场
    startTagPool: ['grass', 'grassland'],
    targetTagPool: ['grass', 'grassland'],
    startNode: 'south_grassland',
    targetNode: 'north_grassland',
    requiredWaypoints: [
      { kind: 'tag', tag: 'crossing', label: '河流渡口', count: 1 }
    ],
    allowedNodeTags: ['grassland', 'grass', 'river', 'crossing', 'passage', 'tundra', 'rest'],
    // 在河流渡口基础上，可叠加 0~1 个任意可通行中转
    waypointPicker: { minCount: 0, maxCount: 1 },
    allowRandomWaypointWithRequired: true,
    maxSegmentDistance: 360,
    // 角马：陆地哺乳动物，每段约 7.2 秒
    // - 段速度 ≈ 50 单位/秒（约 50 px/s），远低于人类追击 76 px/s
    // - 比飞行物种（候鸟 0.55s/段，帝王蝶 0.85s/段）慢一个数量级
    // - 因此视觉上：人类追击圆比兽群跑得快，能追上并拦截
    migrationSpeed: 7.2,
    speedTier: '很慢',
    // 成功迁徙得分：阶段 4
    // - 陆地哺乳动物，迁徙速度慢、通道脆弱、易被追击
    // - 保护草原廊道的边际价值远高于飞行物种
    successScore: 3.4,
    timeLimit: 52,
    riskText: '需要经过草原、水源和渡口；高密度人类活动热点不可穿越',
    disasterVulnerabilities: [],
    humanTolerance: 0.65,
    ecoInsight: '草场、水源和渡口共同组成兽群迁徙廊道，通道被切断会让族群衰退。'
  },
  {
    id: 'eel',
    name: '美洲鳗',
    englishName: 'American Eel',
    icon: 'fish',
    color: '#76D0C4',
    startTagPool: ['fishway', 'spawning'],
    targetTagPool: ['coldSea'],
    startNode: 'spawning_stream',
    targetNode: 'cold_sea',
    // 必须经过河口（连接淡水和海洋的关键通道）
    requiredWaypoints: [
      { kind: 'tag', tag: 'estuary', label: '河口', count: 1 }
    ],
    requiredWaypointOrder: true,
    allowedNodeTags: ['river', 'wetland', 'spawning', 'fishway', 'estuary', 'sea', 'coldSea', 'coastal', 'passage'],
    // 在河口基础上，可叠加 0~1 个任意可通行中转
    waypointPicker: { minCount: 0, maxCount: 1 },
    allowRandomWaypointWithRequired: true,
    maxSegmentDistance: 300,
    // 鳗鱼：水生洄游
    migrationSpeed: 1.65,
    speedTier: '中等',
    // 成功迁徙得分：阶段 5
    // - 水生洄游，路径同样依赖河海连通，但单次速度与鲑鱼接近
    // - 略高于鲑鱼（路径更长、连通过程更复杂）
    successScore: 1.7,
    timeLimit: 44,
    riskText: '成鳗从淡水河段回到海洋产卵，必须经过河口；干旱和人类活动会切断河海连通',
    disasterVulnerabilities: ['drought'],
    humanTolerance: 0.65,
    ecoInsight: '鳗鱼提醒玩家：河流、河口和海洋不是孤立栖息地，而是一整条生命通道。'
  },
  {
    id: 'sea_turtle',
    name: '绿海龟',
    englishName: 'Green Sea Turtle',
    icon: 'turtle',
    color: '#7EDC93',
    startTagPool: ['reef'],
    targetTagPool: ['coastal'],
    startNode: 'reef_shore',
    targetNode: 'coastal_wetland',
    // 海龟不强制必经点（觅食海域 ↔ 产卵海岸本身就够约束）
    requiredWaypoints: [],
    allowedNodeTags: ['sea', 'reef', 'coastal', 'wetland', 'coldSea', 'rest'],
    // 强制至少 1 个中转点（任意可通行的中间节点），让玩家在海面上规划路线
    waypointPicker: { minCount: 1, maxCount: 1 },
    allowRandomWaypointWithRequired: true,
    maxSegmentDistance: 340,
    // 海龟：海洋爬行动物，速度慢
    migrationSpeed: 4.8,
    speedTier: '慢',
    // 成功迁徙得分：阶段 5
    // - 海洋爬行动物，速度比飞行慢、迁徙距离长
    // - 通道（礁石觅食地 ↔ 产卵海岸）一旦被破坏极难恢复
    successScore: 2.7,
    timeLimit: 58,
    riskText: '在觅食海域和产卵海岸之间迁移；暴风季与人类活动热点会增加海上风险',
    disasterVulnerabilities: ['storm'],
    humanTolerance: 0.65,
    ecoInsight: '海龟的一生连接礁石觅食地和产卵海岸，海岸开发会让回巢更困难。'
  },
  {
    id: 'wood_frog',
    name: '林蛙',
    englishName: 'Wood Frog',
    icon: 'frog',
    color: '#8CCB5E',
    startTagPool: ['cave'],
    targetTagPool: ['spawning'],
    startNode: 'cave_shelter',
    targetNode: 'spawning_stream',
    // 必须穿过林地缓冲带（连接越冬地和繁殖湿地）
    requiredWaypoints: [
      { kind: 'tag', tag: 'forest', label: '林地缓冲带', count: 1 }
    ],
    allowedNodeTags: ['cave', 'mountain', 'forest', 'wood', 'wetland', 'river', 'spawning', 'rest'],
    // 在林地缓冲带基础上，可叠加 0~1 个任意可通行中转
    waypointPicker: { minCount: 0, maxCount: 1 },
    allowRandomWaypointWithRequired: true,
    maxSegmentDistance: 260,
    // 林蛙：两栖迁徙，视觉上最慢（每段 9.2s）
    migrationSpeed: 9.2,
    speedTier: '极慢，最慢',
    // 成功迁徙得分：阶段 6
    // - 视觉上最慢、迁徙距离最短，但通道最脆弱
    //   （林地断裂 + 城市路面都会让林蛙局部灭绝）
    // - 单次保护迁徙通道的生态价值最高
    successScore: 3.8,
    timeLimit: 68,
    riskText: '春季从越冬隐蔽地前往繁殖湿地；必须穿过林地缓冲带，干旱和人类活动会让局部迁徙中断',
    disasterVulnerabilities: ['drought'],
    humanTolerance: 0.65,
    ecoInsight: '林蛙迁徙距离不一定远，但非常依赖连续林地与繁殖湿地，小尺度断裂也会造成繁殖失败。'
  }
]

/**
 * 物种 → 解锁所需阶段
 * - 阶段 1：雁鸭候鸟        成功迁徙得分 1.0
 * - 阶段 2：帝王蝶、斑头雁   成功迁徙得分 1.2 / 0.9
 * - 阶段 3：鲑鱼            成功迁徙得分 1.5
 * - 阶段 4：角马兽群        成功迁徙得分 3.4
 * - 阶段 5：美洲鳗、绿海龟   成功迁徙得分 1.7 / 2.7
 * - 阶段 6：林蛙            成功迁徙得分 3.8
 *
 * 单一事实源：gameStore.tryUnlockSpeciesForStage 与 TopBar 都从这里读取，
 * 不再各自硬编码。
 */
export const SPECIES_UNLOCK_STAGES: Record<string, number> = {
  bird: 1,
  butterfly: 2,
  bar_goose: 2,
  salmon: 3,
  herd: 4,
  eel: 5,
  sea_turtle: 5,
  wood_frog: 6
}

export function getSpeciesTemplate(id: string): SpeciesDef | undefined {
  return SPECIES_TEMPLATES.find((s) => s.id === id)
}
