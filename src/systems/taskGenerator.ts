// 任务生成器 v5
// - 起终点从物种 startTagPool / targetTagPool 中随机抽（不固定）
// - 中间途经点从物种 waypointPicker 抽签，使用 kind: 'any'（不再伪造"途经节点 ×1"）
// - 多解保证：至少 1 条合法路线才接受
// - 任务签名去重：避免连续 2 局出现完全相同的起终点
// - 起终点/必经点必须存在、非禁用、且与上一局/上一条任务不同
// - 必经点在生成时通过 routeRequirements.normalizeTaskWaypoints 处理：
//   删除与起终点重复的 waypoint（用户规则：起点/终点已经是该区域时该要求直接删除）
// - 任务保存 targetEquivalenceKey，提交时按等价 key 匹配
// - 求解时传入 humanClusters（如果 gameStore 已经设置了当前 cluster）
// - v5: 改用 isSpeciesSolvableQuick 做廉价检查；不再先 canSpawn 再 generate
//   （之前会重复调用 stateSearch，导致主线程卡死）
// - v6: 起终点生成时按节点 ecoState 过滤：health<=0 不可用、health<=15 尽量避开、
//   damaged 节点降低生成权重；保留最低可用候选保护（避免无解）
import { SeededRandom } from './seededRandom'
import { RuntimeMapNode, SpeciesTask } from '../data/gameData'
import { SpeciesDef, RequiredWaypoint } from '../data/speciesTemplates'
import { findSolvableRouteForSpecies, isSpeciesSolvableQuick, type HumanSolveOptions } from './solvability'
import { SeasonId, NodeTag } from '../data/gameConfig'
import { getBlockingHumanClusters } from './humanFieldSystem'
import { normalizeTaskWaypoints, precheckWaypointCandidates } from './routeRequirements'
import {
  getEcoTaskWeight,
  isNodeEcoUnavailable,
  shouldAvoidAsEndpoint
} from './ecoHealthSystem'

export interface GenerateOptions {
  rng: SeededRandom
  species: SpeciesDef
  nodes: RuntimeMapNode[]
  elapsedTime: number
  season: SeasonId
  /** 已被占用的节点（被当前正在 waiting 任务的起终点占用，避免覆盖） */
  reservedNodeIds?: Set<string>
  /** 历史任务签名：避免生成完全重复的 (物种+起+终+必经) 任务 */
  historySignatures?: string[]
  /** 单次尝试最多试几次（内部默认 24） */
  maxAttempts?: number
  /** 求解时使用的人类 cluster 列表；不传则自动获取 */
  humanClusters?: import('./humanFieldSystem').HumanCluster[]
  /** 跳过廉价检查（由调用方确认物种可解时使用） */
  skipSolvabilityCheck?: boolean
}

let taskIdSeq = 0
function nextTaskId(): string {
  return `t${Date.now().toString(36)}_${++taskIdSeq}`
}

/** 从 nodes 中挑选包含指定标签的节点（不重复、不在禁用状态、不在生态不可用） */
function pickNodesByTags(
  nodes: RuntimeMapNode[],
  tags: NodeTag[],
  rng: SeededRandom,
  reserved: Set<string> | undefined,
  options?: { role?: 'start' | 'target' | 'waypoint' | 'any' }
): RuntimeMapNode[] {
  const role = options?.role ?? 'any'
  const out: RuntimeMapNode[] = []
  for (const n of nodes) {
    if (n.status === 'disabled') continue
    if (reserved && reserved.has(n.id)) continue
    // 生态健康：health <= 0 节点任何角色都不可用
    if (isNodeEcoUnavailable(n)) continue
    // 起点 / 终点：尽量避开 health <= 15 节点（除非候选不够）
    if ((role === 'start' || role === 'target') && shouldAvoidAsEndpoint(n)) continue
    // 途经点：仍允许 damaged，但避开 degraded
    if (role === 'waypoint' && n.ecoState === 'degraded') continue
    if (n.tags.some((t) => tags.includes(t))) out.push(n)
  }
  rng.shuffle(out)
  return out
}

/**
 * 在初筛之后给候选"按生态健康权重"排序。
 * 权重越高的越靠前。
 * 作用：自然地把"健康节点"排前面，不健康的节点不消失（兜底仍可选）。
 */
function sortCandidatesByEcoHealth(
  candidates: RuntimeMapNode[]
): RuntimeMapNode[] {
  // 先按 ecoState 排序，再随机打散
  const order: Record<string, number> = { healthy: 4, pressured: 3, damaged: 2, degraded: 1 }
  return [...candidates].sort((a, b) => {
    const wa = order[a.ecoState] ?? 0
    const wb = order[b.ecoState] ?? 0
    if (wa !== wb) return wb - wa
    return 0
  })
}

/** 加权随机挑一个候选：健康节点被挑中概率高 */
function pickWeightedByEco(
  candidates: RuntimeMapNode[],
  rng: SeededRandom
): RuntimeMapNode | null {
  if (candidates.length === 0) return null
  const weights: { item: RuntimeMapNode; weight: number }[] = candidates.map((n) => ({
    item: n,
    weight: Math.max(0.01, getEcoTaskWeight(n))
  }))
  return rng.weighted(weights) ?? candidates[0] ?? null
}

/** 任务签名：用于去重（使用 waypoint 标准化后的形态） */
function buildSignature(
  speciesId: string,
  startId: string,
  targetId: string,
  wps: RequiredWaypoint[]
): string {
  const wpStr = wps
    .map((w) => {
      if (w.kind === 'node') return `n:${w.nodeId}`
      if (w.kind === 'tag') return `t:${w.tag}*${w.count}`
      if (w.kind === 'any') {
        // 任意可通行中转点：不再用 tagPool / eligibleTags 区分；
        // 统一用 a:* 表示"任意可通行的中间节点"
        return `a:*${w.count}`
      }
      return ''
    })
    .sort()
    .join('|')
  return `${speciesId}:${startId}->${targetId}:${wpStr}`
}

/**
 * 收集 species 中所有 "固定 node 类型" 必经点的 nodeId。
 * 这些节点不应该被选为任务起点或终点。
 */
function getRequiredNodeIds(species: SpeciesDef): Set<string> {
  const ids = new Set<string>()
  for (const w of species.requiredWaypoints) {
    if (w.kind === 'node') {
      ids.add(w.nodeId)
    }
  }
  return ids
}

/**
 * 判定当前地图（不依赖任务）下，该物种是否至少能生成一条任务
 * - 起终点池中各自有 >=1 个节点
 * - 至少存在一对 (start, target)，让当前 species 走通
 *
 * v5: 改为只走廉价检查；不再调 stateSearch
 *   调用方 (gameStore.tryUnlockSpeciesForStage) 在 tickGame 中高频调用此函数，
 *   必须廉价。真正"生成"由 generateTask 内部的 findSolvableRouteForSpecies 兜底。
 */
export function canGenerateTaskFor(species: SpeciesDef, nodes: RuntimeMapNode[]): boolean {
  if (nodes.length < 2) return false
  // v6: 起 / 终点的"可用"定义为：status !== disabled && health > 0
  // （不剔除 health<=15 节点：避免边缘情况下"零候选"导致物种无法解锁）
  for (const tag of species.startTagPool) {
    if (nodes.some((n) =>
      n.status !== 'disabled' &&
      !isNodeEcoUnavailable(n) &&
      n.tags.includes(tag)
    )) {
      for (const tTag of species.targetTagPool) {
        if (nodes.some((n) =>
          n.status !== 'disabled' &&
          !isNodeEcoUnavailable(n) &&
          n.tags.includes(tTag)
        )) {
          return true
        }
      }
    }
  }
  return false
}

/**
 * v5: 物种级别（带人类阻挡 + 季节风险区）的廉价可解性检查
 *   不调 stateSearch；只判断"是否存在一对起终点 (BFS 可达 + 候选预检查通过)"
 *   真正生成时再调 findSolvableRouteForSpecies 兜底
 */
export function canSpawnSolvableTaskQuick(
  species: SpeciesDef,
  nodes: RuntimeMapNode[],
  season: SeasonId,
  humanClusters?: import('./humanFieldSystem').HumanCluster[]
): boolean {
  return isSpeciesSolvableQuick(species, nodes, season, { humanClusters })
}

/**
 * 抽取额外"任意可通行中转点"（kind: 'any'）
 * - 不再读取 tagPool / eligibleTags / excludeStartEnd
 * - 只按 minCount/maxCount 随机数量，并返回一条 { kind: 'any', label, count } waypoint
 * - "任意可通行"的真实含义：起点/终点/禁用/生态不可用/物种禁行之外的中转点，
 *   具体的筛选与求解在 routeRequirements / routeSearch / solvability 中
 *   通过 allowedNodeTags、风险、人类阻挡、距离和资源等既有规则完成。
 */
function pickAnyWaypoints(
  species: SpeciesDef,
  rng: SeededRandom,
  picker: NonNullable<SpeciesDef['waypointPicker']>
): RequiredWaypoint[] {
  if (picker.maxCount <= 0) return []
  const want = picker.minCount === picker.maxCount
    ? picker.minCount
    : rng.int(picker.minCount, picker.maxCount)
  if (want <= 0) return []
  void species
  return [
    {
      kind: 'any',
      label: '任意可通行中转点',
      count: want
    }
  ]
}

/** 生成任务 v3：随机抽起终点 + 抽签途经 + 多解保证 */
export function generateTask(opts: GenerateOptions): SpeciesTask | null {
  const {
    species,
    nodes,
    rng,
    elapsedTime,
    season,
    reservedNodeIds,
    historySignatures,
    maxAttempts = 24
  } = opts

  if (!canGenerateTaskFor(species, nodes)) return null
  if (nodes.length < 2) return null

  // 1) 收集所有"固定 node 类型"必经点
  const requiredNodeIds = getRequiredNodeIds(species)
  for (const nodeId of requiredNodeIds) {
    if (!nodes.some((n) => n.id === nodeId && n.status !== 'disabled')) return null
  }

  // 2) 起点 / 终点池：排除所有固定 node 必经点
  // v6: 按生态健康做加权（健康节点优先、damaged 节点降权、degraded 仅在兜底时使用）
  const startPool = pickNodesByTags(nodes, species.startTagPool, rng, reservedNodeIds, { role: 'start' })
    .filter((n) => !requiredNodeIds.has(n.id))
  const targetPool = pickNodesByTags(nodes, species.targetTagPool, rng, reservedNodeIds, { role: 'target' })
    .filter((n) => !requiredNodeIds.has(n.id))

  // 兜底：起点池为空时，把 health<=15 的"退化"节点也纳入
  let starts: RuntimeMapNode[]
  let targets: RuntimeMapNode[]
  if (startPool.length === 0) {
    starts = pickNodesByTags(nodes, species.startTagPool, rng, reservedNodeIds)
      .filter((n) => !requiredNodeIds.has(n.id) && !isNodeEcoUnavailable(n))
  } else {
    starts = startPool
  }
  if (targetPool.length === 0) {
    targets = pickNodesByTags(nodes, species.targetTagPool, rng, reservedNodeIds)
      .filter((n) => !requiredNodeIds.has(n.id) && !isNodeEcoUnavailable(n))
  } else {
    targets = targetPool
  }
  if (starts.length === 0 || targets.length === 0) return null

  // 健康度排序：把 healthy / pressured 排前面，damaged 排后面
  // （不是简单 shuffled，而是用 weighted 抽签）
  const startsSorted = sortCandidatesByEcoHealth(starts)
  const targetsSorted = sortCandidatesByEcoHealth(targets)

  // 时间限制
  // 调整时间压缩公式：120 秒后只压到 90%（原 80%），让中期任务有更宽松的窗口
  const diff = Math.max(0.9, 1 - elapsedTime / 1200)
  const baseTime = species.timeLimit * diff
  const totalTime = Math.max(12, baseTime + rng.range(-2, 2))

  // 求解时使用的人类 cluster 列表：优先使用 opts.humanClusters
  // 否则使用 system 当前的 blocking clusters
  const humanClusters = opts.humanClusters ?? getBlockingHumanClusters()
  const solveOpts: HumanSolveOptions = {
    humanClusters,
    // v5: 单次求解墙钟预算 4ms；调用方可通过 opts 进一步收紧
    maxTimeMs: 4,
    maxExpanded: 1500
  }

  // 多次尝试不同的 (start, target, extraWaypoints) 组合
  // v6: 起终点先按 eco 排序（健康优先），前 1/2 尝试走"健康节点"，
  // 后 1/2 兜底允许 damaged 节点（如果健康节点都已尝试过）
  const tried = new Set<string>()
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1/2 尝试走"健康起点" + "健康终点"
    // 1/2 兜底：让 weighted pick 给 damaged 一点机会
    let start: RuntimeMapNode | null = null
    let target: RuntimeMapNode | null = null
    if (attempt < Math.max(2, Math.floor(maxAttempts / 2))) {
      // 前半段：在"健康度排序后的池子"前 N 个里挑
      const headStarts = startsSorted.slice(0, Math.max(1, Math.ceil(startsSorted.length * 0.6)))
      const headTargets = targetsSorted.slice(0, Math.max(1, Math.ceil(targetsSorted.length * 0.6)))
      start = rng.pick(headStarts) ?? null
      target = rng.pick(headTargets) ?? null
    } else {
      // 后半段：让加权选签给 damaged / degraded 一点机会
      start = pickWeightedByEco(starts, rng)
      target = pickWeightedByEco(targets, rng)
    }
    if (!start || !target || start.id === target.id) continue

    // 抽签额外途经点：统一使用 'any' 类型
    // 当 species.requiredWaypoints 已经有显式 tag 必经点时：
    //   - 默认不再叠加 any 中转（保持 v4 行为）
    //   - 若 species.allowRandomWaypointWithRequired === true，则允许
    //     在必经点之上再抽 0~N 个 any 中转（butterfly / herd / eel / wood_frog）
    const hasExplicitTagWaypoint = species.requiredWaypoints.some((w) => w.kind === 'tag')
    const allowExtraAny =
      !!species.waypointPicker &&
      (!hasExplicitTagWaypoint || species.allowRandomWaypointWithRequired === true)
    const extraWps: RequiredWaypoint[] = allowExtraAny
      ? pickAnyWaypoints(species, rng, species.waypointPicker!)
      : []

    // 原始必经点：species 必经过 + 抽签 any
    const rawWps: RequiredWaypoint[] = [...species.requiredWaypoints, ...extraWps]

    // 关键：标准化途经点 —— 删除与起终点重复的 waypoint
    const mergedWps: RequiredWaypoint[] = normalizeTaskWaypoints(
      rawWps,
      start,
      target,
      nodes
    )

    // 关键：必经点候选预检查
    // 当必经点（如 herd 的 crossing）在当前节点集合里没有足够候选时，
    // 不进入 findSolvableRouteForSpecies / stateSearch，
    // 避免求解器枚举所有简单路径来证明"无解"而阻塞主线程。
    // 传入 species.allowedNodeTags，确保 any/tag 候选池与物种白名单一致。
    const pre = precheckWaypointCandidates(mergedWps, start, target, nodes, species.allowedNodeTags)
    if (!pre.ok) continue

    const sig = buildSignature(species.id, start.id, target.id, mergedWps)
    if (tried.has(sig)) continue
    if (historySignatures && historySignatures.includes(sig)) continue
    tried.add(sig)

    // 鲑鱼额外约束：必须存在非重复的
    //   start → estuary → fishway → target
    // 链路；任何一段 >= maxSegmentDistance 或节点重复都视为不合格。
    // 这一步优先于 route 求解，避免"先找到解再被规则否决"。
    if (species.id === 'salmon') {
      const chainOk = findValidSalmonCoreChain(start, target, nodes, species.maxSegmentDistance)
      if (!chainOk) continue
    }

    // 求解：传入 start/target/wps 让 solvability 找一条合法路线
    const route = findSolvableRouteForSpecies(
      species,
      nodes.filter((n) => n.status !== 'disabled').map((n) => n.id),
      season,
      nodes,
      start.id,
      target.id,
      mergedWps,
      species.requiredWaypointOrder,
      solveOpts
    )
    if (!route || route.length < 2) continue

    // 鲑鱼再次防御：route 中所有节点必须不同
    if (species.id === 'salmon' && routeHasDuplicateNodes(route)) continue

    // 成功
    return {
      id: nextTaskId(),
      speciesId: species.id,
      startNodeId: start.id,
      targetNodeId: target.id,
      targetEquivalenceKey: target.equivalenceKey,
      remaining: totalTime,
      totalTime,
      status: 'waiting',
      path: [start.id],
      progress: 0,
      fadeProgress: 0,
      spawnedAt: Date.now(),
      pulseAt: 0,
      errorFlashAt: 0,
      requiredWaypoints: mergedWps,
      requiredWaypointOrder: species.requiredWaypointOrder
    }
  }

  return null
}

/**
 * 鲑鱼核心链路验证：
 * 寻找 start → estuary → fishway → target 的非重复节点链
 * 每段距离 < maxSegmentDistance（严格 <，不是 <=）
 * 任意一个不满足都返回 null
 */
export function findValidSalmonCoreChain(
  start: RuntimeMapNode,
  target: RuntimeMapNode,
  nodes: RuntimeMapNode[],
  maxSegmentDistance: number
): RuntimeMapNode[] | null {
  if (!start || !target) return null
  if (start.id === target.id) return null

  // 节点标签必须满足
  const startTagOk = start.tags.some((t) => t === 'sea' || t === 'coldSea')
  const targetTagOk = target.tags.includes('spawning')
  if (!startTagOk || !targetTagOk) return null

  // 收集 estuary / fishway 候选
  const estuaries = nodes.filter(
    (n) => n.status !== 'disabled' && n.tags.includes('estuary')
  )
  const fishways = nodes.filter(
    (n) => n.status !== 'disabled' && n.tags.includes('fishway')
  )
  if (estuaries.length === 0 || fishways.length === 0) return null

  for (const e of estuaries) {
    for (const f of fishways) {
      // 4 节点必须互不相同
      if (e.id === start.id || e.id === target.id) continue
      if (f.id === start.id || f.id === target.id) continue
      if (e.id === f.id) continue

      const d1 = dist(start.x, start.y, e.x, e.y)
      const d2 = dist(e.x, e.y, f.x, f.y)
      const d3 = dist(f.x, f.y, target.x, target.y)

      // 严格 < maxSegmentDistance（与 gameStore 行为一致）
      if (d1 >= maxSegmentDistance) continue
      if (d2 >= maxSegmentDistance) continue
      if (d3 >= maxSegmentDistance) continue

      return [start, e, f, target]
    }
  }
  return null
}

/**
 * 检查 route 中是否有重复节点
 * 玩家拖线时 gameStore.pushDragNode 已经做了这个限制；
 * 求解器现在也加 visited，所以这只是防御性检查
 */
export function routeHasDuplicateNodes(route: string[]): boolean {
  const seen = new Set<string>()
  for (const id of route) {
    if (seen.has(id)) return true
    seen.add(id)
  }
  return false
}

/** 距离工具（本地实现，避免循环依赖） */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/** 兼容旧引用 */
export function speciesHasAnyValidTask(species: SpeciesDef, nodes: RuntimeMapNode[]): boolean {
  return canGenerateTaskFor(species, nodes)
}

/** 任务签名（对外） */
export function taskSignature(task: Pick<SpeciesTask, 'speciesId' | 'startNodeId' | 'targetNodeId' | 'requiredWaypoints'>): string {
  const wps = task.requiredWaypoints || []
  return buildSignature(task.speciesId, task.startNodeId, task.targetNodeId, wps)
}
