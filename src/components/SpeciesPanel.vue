<script setup lang="ts">
// 物种详情面板 v3
// 关键变化：
// 1) 路线展示从"纵向"改为"横向" route-strip：
//      [起点]  ───  [途经]  ───  [终点]
// 2) 起点 / 终点 / 途经 都使用 NodeBadge.vue 渲染，
//    和地图节点视觉完全一致。
// 3) 途经根据 requiredWaypoints.kind 决定展示：
//      - 'node' : 取该节点真实 visual
//      - 'tag'  : 用对应 waypoint 规则 badge
//      - 'any'  : 用"任意可通行节点"中性 badge
// 多个途经要求可以纵向堆叠在"途经"列内。
// 4) 新增两个区：
//    - 必须经过（required-waypoints-row）：
//        严格使用任务级（normalize 后）的 requiredWaypoints
//        按 kind 决定 logo + 候选节点：
//          - tag  → 计算候选节点列表，过滤禁用/起终点/物种禁行
//          - node → 直接展示该节点
//          - any  → 文字"可经过任意一个可通行的中间节点（不含起点、终点）"
//    - 禁止通过（forbidden-nodes-row）：
//        当前地图中所有"不在 allowedNodeTags 白名单内"的节点；
//        鲑鱼：自动列出 山地花带 / 南方山林 / 北方繁殖地 等陆地类节点
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { RuntimeMapNode } from '../data/gameData'
import { SpeciesDef, RequiredWaypoint } from '../data/speciesTemplates'
import type { NodeTag } from '../data/gameConfig'
import { getActiveRiskZones } from '../data/riskZones'
import { SEASON_INFO } from '../data/eventDefinitions'
import { formatWaypointsChain } from '../systems/routeRequirements'
import {
  waypointVisualFor,
  waypointLabelFor,
  nodeTagLabel,
  type NodeVisual
} from '../data/nodeVisuals'
import { isNodeAllowedByTags } from '../systems/routeEligibility'
import NodeBadge from './NodeBadge.vue'

const selectedTask = computed(() => {
  if (!gameStore.state.selectedTaskId) return null
  return gameStore.state.activeTasks.find((t) => t.id === gameStore.state.selectedTaskId) || null
})

const selectedSpecies = computed(() => {
  if (!selectedTask.value) return null
  return gameStore.findSpecies(selectedTask.value.speciesId) || null
})

const waitingTasks = computed(() =>
  gameStore.state.activeTasks.filter((t) => t.status === 'waiting' || t.status === 'migrating')
)

const remainingStr = computed(() => {
  if (!selectedTask.value) return ''
  if (selectedTask.value.status === 'migrating') return '迁徙中'
  if (selectedTask.value.status === 'fading') return '即将完成'
  return selectedTask.value.remaining.toFixed(1) + ' 秒'
})

const isWarning = computed(
  () => selectedTask.value && selectedTask.value.status === 'waiting' && selectedTask.value.remaining <= 5
)

function getNodeById(id: string): RuntimeMapNode | undefined {
  return gameStore.state.mapNodes.find((n) => n.id === id)
}

/**
 * 任务实际使用的 waypoints（顺序）：只看任务自己的字段
 * 关键：即使任务级 requiredWaypoints 是空数组 []，也绝不能回退到物种默认值。
 * 任务生成时已经 normalizeTaskWaypoints 去掉了与起终点重复的途径点。
 */
function getTaskWaypoints(): { wps: RequiredWaypoint[]; ordered: boolean } {
  if (!selectedTask.value) return { wps: [], ordered: false }

  const task = selectedTask.value

  if (Array.isArray(task.requiredWaypoints)) {
    return {
      wps: task.requiredWaypoints,
      ordered: task.requiredWaypointOrder ?? false
    }
  }

  if (selectedSpecies.value) {
    return {
      wps: selectedSpecies.value.requiredWaypoints || [],
      ordered: selectedSpecies.value.requiredWaypointOrder ?? false
    }
  }

  return { wps: [], ordered: false }
}

/** 当前风险文字（结合季节） */
function getCurrentRiskText(species: SpeciesDef | null): string {
  if (!species) return '当前没有正在生效的事件'
  const season = gameStore.state.season
  const seasonInfo = SEASON_INFO[season]
  const zones = getActiveRiskZones(season, gameStore.state.mapNodes).filter((z) => z.forbiddenFor.includes(species.id))
  if (zones.length === 0) {
    if (species.riskText) return species.riskText + '（当前季节无影响）'
    return seasonInfo.description
  }
  return zones.map((z) => z.reason).join('；')
}

/**
 * 节点是否对该物种"可通行"
 * - 内部直接复用 isNodeAllowedByTags
 * - 这样"禁止通过"列表、tag 候选节点过滤、拖线禁行、最终路线校验
 *   都使用同一事实源
 */
function isNodeAllowedForSpecies(node: RuntimeMapNode, species: SpeciesDef | null): boolean {
  if (!species) return true
  return isNodeAllowedByTags(node, species.allowedNodeTags)
}

/**
 * 计算一个 tag waypoint 的候选节点列表
 * - 排除 disabled
 * - 排除起点 / 终点
 * - 排除物种禁行节点
 * - 必须带该 tag
 * - 按 equivalenceKey 去重（同 archetype 视为同一个候选项）
 */
function candidateNodesForTagWaypoint(
  tag: NodeTag,
  startId: string | undefined,
  targetId: string | undefined,
  allowed: NodeTag[] | undefined
): RuntimeMapNode[] {
  const out: RuntimeMapNode[] = []
  const seen = new Set<string>()
  for (const n of gameStore.state.mapNodes) {
    if (n.status === 'disabled') continue
    if (startId && n.id === startId) continue
    if (targetId && n.id === targetId) continue
    if (allowed && allowed.length > 0) {
      if (!n.tags.some((t) => allowed.includes(t))) continue
    }
    if (!n.tags.includes(tag)) continue
    const dedupKey = n.equivalenceKey || n.displayName || n.id
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    out.push(n)
  }
  return out
}

/**
 * 把一个任务级 waypoint 渲染成"必须经过"区一行内容
 * - 'node' : 真实节点 visual + label
 * - 'tag'  : waypoint 规则 visual + label + 候选节点列表
 * - 'any'  : "任意可通行节点" 中性 badge + 文字说明
 */
interface RequiredRow {
  wp: RequiredWaypoint
  visual: NodeVisual
  label: string
  /** 候选节点列表（仅 tag 有意义；node 自身；any 为空） */
  candidates: RuntimeMapNode[]
  /** 候选节点显示名（用"、"连接；空时不显示） */
  candidateNames: string
  /** any 文字 */
  anyText: string | null
  /**
   * 属性标签：用于 NodeBadge 角标判定
   * - tag: [wp.tag]（例如 ['mountain']）
   * - node / any: null（让 NodeBadge 回退到 node?.tags）
   */
  attributeTags: readonly import('../data/gameConfig').NodeTag[] | null
}

function buildRequiredRow(
  wp: RequiredWaypoint,
  sp: SpeciesDef,
  startId: string,
  targetId: string
): RequiredRow {
  const allowed = sp.allowedNodeTags
  if (wp.kind === 'node') {
    const node = gameStore.state.mapNodes.find((n) => n.id === wp.nodeId) || null
    return {
      wp,
      visual: waypointVisualFor(wp, gameStore.state.mapNodes),
      label: node?.displayName || node?.name || wp.label,
      candidates: node ? [node] : [],
      candidateNames: node ? (node.displayName || node.name) : '',
      anyText: null,
      attributeTags: null
    }
  }
  if (wp.kind === 'tag') {
    const candidates = candidateNodesForTagWaypoint(wp.tag, startId, targetId, allowed)
    return {
      wp,
      visual: waypointVisualFor(wp, gameStore.state.mapNodes),
      label: waypointLabelFor(wp),
      candidates,
      candidateNames: candidates.map((n) => n.displayName || n.name).join('、'),
      anyText: null,
      attributeTags: [wp.tag]
    }
  }
  // kind === 'any'
  return {
    wp,
    visual: waypointVisualFor(wp, gameStore.state.mapNodes),
    label: '任意可通行节点',
    candidates: [],
    candidateNames: '',
    anyText: wp.count > 1
      ? `可经过任意 ${wp.count} 个可通行的中间节点（不含起点、终点）`
      : '可经过任意一个可通行的中间节点（不含起点、终点）',
    attributeTags: null
  }
}

const panelData = computed(() => {
  if (!selectedSpecies.value || !selectedTask.value) return null
  const sp = selectedSpecies.value
  const task = selectedTask.value
  const startNode = getNodeById(task.startNodeId)
  const targetNode = getNodeById(task.targetNodeId)
  const { wps, ordered } = getTaskWaypoints()
  // 任务级"必须经过"区数据：基于 normalize 后的任务 waypoints
  const requiredRows: RequiredRow[] = wps.map((wp) =>
    buildRequiredRow(wp, sp, task.startNodeId, task.targetNodeId)
  )
  return {
    title: sp.name,
    englishName: sp.englishName,
    color: sp.color,
    start: startNode,
    target: targetNode,
    waypoints: wps,
    // 横向 route-strip 仍用 task requiredWaypoints；展示 visual/label
    waypointInfos: wps.map((wp) => ({
      node: wp.kind === 'node' ? (gameStore.state.mapNodes.find((n) => n.id === wp.nodeId) || null) : null,
      visual: waypointVisualFor(wp, gameStore.state.mapNodes),
      label: waypointLabelFor(wp),
      // tag 类型显式带上属性标签；node / any 让 NodeBadge 回退到 node?.tags
      attributeTags: wp.kind === 'tag' ? [wp.tag] : null
    })),
    waypointOrdered: ordered,
    via: formatWaypointsChain(wps, false, gameStore.state.mapNodes),
    maxSegmentDistance: sp.maxSegmentDistance,
    riskText: getCurrentRiskText(sp),
    remainingTime: task.remaining,
    status: task.status,
    // 关键：用任务级 normalize 后的 waypoints，而不是回退物种模板
    requiredRows,
    requiredOrdered: ordered,
    ecoInsight: sp.ecoInsight || '',
    // v5：单次成功迁徙得分（区别于顶栏的成功迁徙次数）
    successScore: sp.successScore,
    // 当前物种已成功次数（用于"已成功 N 次 / X 分"展示）
    speciesSuccessCount: gameStore.getSpeciesSuccessCount(sp.id)
  }
})

/**
 * 禁止通过的节点（去重 equivalenceKey）
 * - 没有 allowedNodeTags 的物种显示"无固定禁行节点"提示
 * - 鲑鱼：列出所有非 sea/river/wetland/spawning/coldSea/estuary/fishway 的节点
 */
const forbiddenNodes = computed<RuntimeMapNode[]>(() => {
  if (!selectedSpecies.value) return []
  const sp = selectedSpecies.value
  if (!sp.allowedNodeTags || sp.allowedNodeTags.length === 0) return []
  const nodes = gameStore.state.mapNodes.filter((n) => n.status !== 'disabled')
  // 任务起点/终点不显示为禁行（哪怕它们在白名单外，任务已选定）
  const task = selectedTask.value
  const startId = task?.startNodeId
  const targetId = task?.targetNodeId
  const seen = new Set<string>()
  const out: RuntimeMapNode[] = []
  for (const n of nodes) {
    if (n.id === startId || n.id === targetId) continue
    if (isNodeAllowedForSpecies(n, sp)) continue
    // 用 equivalenceKey 去重，缺失时退到 displayName，再缺失时退到 id
    const dedupKey = n.equivalenceKey || n.displayName || n.id
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    out.push(n)
  }
  return out
})

const hasAllowedTags = computed(() => {
  if (!selectedSpecies.value) return false
  return !!(selectedSpecies.value.allowedNodeTags && selectedSpecies.value.allowedNodeTags.length > 0)
})

function selectTask(id: string) {
  gameStore.selectTask(id)
}

function getTaskSub(task: { speciesId: string; status: string; remaining: number }) {
  const sp = gameStore.findSpecies(task.speciesId)
  if (!sp) return ''
  if (task.status === 'migrating') return '迁徙中'
  if (task.status === 'fading') return '即将完成'
  return `剩余 ${task.remaining.toFixed(1)} 秒`
}
</script>

<template>
  <div class="species-panel" data-tutorial-target="species-panel">
    <template v-if="!panelData">
      <div class="empty">
        <div class="icon">🧭</div>
        <div>选择一个迁徙物种</div>
        <div class="empty-sub">查看动态起点/终点、需求和当前风险。点击地图上的动物图标，或在下方任务列表中选择。</div>
      </div>
      <div class="tasks-list" v-if="waitingTasks.length > 0">
        <div
          v-for="task in waitingTasks"
          :key="task.id"
          class="task-item"
          :class="{ selected: gameStore.state.selectedTaskId === task.id }"
          @click="selectTask(task.id)"
        >
          <div class="mini-icon">
            <span class="dot" :style="{ background: gameStore.findSpecies(task.speciesId)?.color }"></span>
          </div>
          <div class="meta">
            <div class="name">{{ gameStore.findSpecies(task.speciesId)?.name }}</div>
            <div class="sub">{{ getTaskSub(task) }}</div>
          </div>
        </div>
      </div>
      <div v-else class="empty-sub" style="text-align: center; padding: 12px;">暂无任务，等待生成...</div>
    </template>

    <template v-else>
      <!-- 标题 -->
      <div class="species-header" :style="{ '--species-color': panelData.color } as any">
        <h2>
          {{ panelData.title }}
          <span class="en">{{ panelData.englishName }}</span>
        </h2>
      </div>

      <!-- 横向迁徙线路（route strip） -->
      <div class="route-strip">
        <div class="route-strip-header">
          <div class="route-strip-col-label">起点</div>
          <div class="route-strip-col-label">途经</div>
          <div class="route-strip-col-label">终点</div>
        </div>

        <div class="route-strip-line">
          <div class="route-strip-dot start-dot"></div>
          <div class="route-strip-segment"></div>
          <div class="route-strip-dot mid-dots">
            <span class="mini-dot" v-for="i in Math.max(1, panelData.waypointInfos.length)" :key="i"></span>
          </div>
          <div class="route-strip-segment"></div>
          <div class="route-strip-dot end-dot"></div>
        </div>

        <div class="route-strip-body">
          <!-- 起点 -->
          <div class="route-strip-col">
            <div class="route-node-card" data-tutorial-target="panel-start-node">
              <div class="route-node-logo">
                <NodeBadge
                  v-if="panelData.start"
                  :node="panelData.start"
                  :size="36"
                  :health="typeof panelData.start.health === 'number' ? panelData.start.health : null"
                  :flicker="(panelData.start.health ?? 100) <= 15"
                />
                <NodeBadge v-else visual-key="unknown" :size="36" />
              </div>
              <div class="route-node-name">{{ panelData.start?.displayName || panelData.start?.name || '未知' }}</div>
            </div>
          </div>

          <!-- 途经：堆叠多个 badge + label -->
          <div
            class="route-strip-col route-strip-col-via"
            data-tutorial-target="waypoint"
          >
            <div v-if="panelData.waypointInfos.length === 0" class="route-node-card route-node-card-empty">
              <div class="route-node-logo">
                <NodeBadge visual-key="wp:any" :size="28" />
              </div>
              <div class="route-node-name route-node-name-dim">无强制途经</div>
            </div>
            <div
              v-for="(info, idx) in panelData.waypointInfos"
              :key="idx"
              class="route-node-card"
            >
              <div class="route-node-logo">
                <NodeBadge
                  v-if="info.node"
                  :node="info.node"
                  :size="30"
                  :health="typeof info.node.health === 'number' ? info.node.health : null"
                  :flicker="(info.node.health ?? 100) <= 15"
                />
                <NodeBadge
                  v-else
                  :visual="info.visual"
                  :attribute-tags="info.attributeTags"
                  :size="30"
                />
              </div>
              <div class="route-node-name">{{ info.label }}</div>
            </div>
          </div>

          <!-- 终点 -->
          <div class="route-strip-col">
            <div class="route-node-card">
              <div class="route-node-logo">
                <NodeBadge
                  v-if="panelData.target"
                  :node="panelData.target"
                  :size="36"
                  :health="typeof panelData.target.health === 'number' ? panelData.target.health : null"
                  :flicker="(panelData.target.health ?? 100) <= 15"
                />
                <NodeBadge v-else visual-key="unknown" :size="36" />
              </div>
              <div class="route-node-name">{{ panelData.target?.displayName || panelData.target?.name || '未知' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 必须经过：严格基于任务级（normalize 后）的 waypoints
           - tag waypoint 计算并显示候选节点
           - any waypoint 显式文字说明"可经过任意一个可通行的中间节点（不含起点、终点）" -->
      <div class="rule-section required-waypoints-row" v-if="panelData.requiredRows.length > 0">
        <div class="rule-section-label">
          <span class="rule-icon order-icon" v-if="panelData.requiredOrdered">⇉</span>
          <span class="rule-icon" v-else>●</span>
          <span>{{ panelData.requiredOrdered ? '必须按顺序经过' : '必须经过' }}</span>
        </div>
        <div class="required-waypoints-list">
          <template v-for="(row, idx) in panelData.requiredRows" :key="idx">
            <div class="node-rule-chip required-waypoint-chip">
              <div class="node-rule-logo">
                <NodeBadge
                  v-if="row.wp.kind === 'node' && row.candidates[0]"
                  :node="row.candidates[0]"
                  :size="22"
                />
                <NodeBadge
                  v-else
                  :visual="row.visual"
                  :attribute-tags="row.attributeTags"
                  :size="22"
                />
              </div>
              <span class="node-rule-label">{{ row.label }}</span>
            </div>
            <span
              v-if="panelData.requiredOrdered && idx < panelData.requiredRows.length - 1"
              class="waypoint-chain-arrow"
            >→</span>
          </template>
        </div>
        <!-- 每个 waypoint 的详细候选节点说明 -->
        <div class="required-waypoint-details">
          <div
            v-for="(row, idx) in panelData.requiredRows"
            :key="`detail-${idx}`"
            class="required-waypoint-detail"
          >
            <span class="required-waypoint-detail-label">
              <template v-if="row.wp.kind === 'tag'">候选节点：</template>
              <template v-else-if="row.wp.kind === 'node'">必经节点：</template>
              <template v-else>可通行节点：</template>
            </span>
            <span class="required-waypoint-detail-text" v-if="row.anyText">
              {{ row.anyText }}
            </span>
            <span class="required-waypoint-detail-text" v-else>
              {{ row.candidateNames || '（当前地图暂无可用候选）' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 禁止通过（当前地图节点 vs allowedNodeTags 白名单） -->
      <div class="rule-section forbidden-nodes-row">
        <div class="rule-section-label">
          <span class="rule-icon forbidden-icon">⛔</span>
          <span>禁止通过</span>
        </div>
        <div v-if="!hasAllowedTags" class="forbidden-nodes-empty">
          无固定禁行节点，注意避开风险区和人类活动热点
        </div>
        <div v-else-if="forbiddenNodes.length === 0" class="forbidden-nodes-empty">
          当前地图节点都可通行
        </div>
        <div v-else class="forbidden-nodes-list">
          <div
            v-for="n in forbiddenNodes"
            :key="n.id"
            class="forbidden-node-chip"
            :title="`${n.displayName || n.name}：tag=[${n.tags.join(', ')}]`"
          >
            <div class="node-rule-logo">
              <NodeBadge :node="n" :size="20" />
            </div>
            <span class="node-rule-label">{{ n.displayName || n.name }}</span>
          </div>
        </div>
      </div>

      <!-- 单段距离上限 -->
      <div class="rule-row">
        <div class="rule-label">单段上限</div>
        <div class="rule-value">
          <span class="big-num">{{ panelData.maxSegmentDistance }}</span>
          <span class="unit">/段</span>
        </div>
      </div>

      <!-- v5：成功迁徙得分（与"成功迁徙次数"严格分开）
           - 得分 = 单次该物种迁徙所获的分数（species.successScore）
           - 与"成功迁徙次数"区分：次数是整数计数，得分按物种难度加权
           - 与顶栏的"迁徙得分"一致：顶栏 = Σ 得分 × 次数 -->
      <div class="rule-row success-score-row" :title="`每次成功迁徙将获得 ${panelData.successScore.toFixed(1)} 分迁徙得分`">
        <div class="rule-label">成功迁徙得分</div>
        <div class="rule-value success-score-value">
          <span class="big-num">{{ panelData.successScore.toFixed(1) }}</span>
          <span class="unit">分/次</span>
        </div>
      </div>
      <div
        v-if="panelData.speciesSuccessCount > 0"
        class="rule-row success-sub-row"
        :title="`该物种已成功 ${panelData.speciesSuccessCount} 次，贡献 ${(panelData.speciesSuccessCount * panelData.successScore).toFixed(1)} 分`"
      >
        <div class="rule-label">本物种已成功</div>
        <div class="rule-value">
          <span class="big-num">{{ panelData.speciesSuccessCount }}</span>
          <span class="unit">次 · 累计 {{ (panelData.speciesSuccessCount * panelData.successScore).toFixed(1) }} 分</span>
        </div>
      </div>

      <!-- 当前风险 -->
      <div class="rule-row">
        <div class="rule-label">当前风险</div>
        <div class="rule-value risk-text">{{ panelData.riskText }}</div>
      </div>

      <!-- 生态启示 -->
      <div v-if="panelData.ecoInsight" class="rule-row eco-insight-row" :title="panelData.ecoInsight">
        <div class="rule-label">生态启示</div>
        <div class="rule-value eco-insight-text">{{ panelData.ecoInsight }}</div>
      </div>

      <!-- 剩余时间 -->
      <div class="rule-row timer-row">
        <div class="rule-label">剩余时间</div>
        <div class="rule-value">
          <span class="timer-big" :class="{ warning: isWarning }">{{ remainingStr }}</span>
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="selectedTask?.errorMsg" class="error-msg">
        <span class="error-icon">!</span>
        <span>{{ selectedTask.errorMsg }}</span>
      </div>

      <!-- 操作提示 -->
      <div class="hint">
        操作：长按物种图标，依次拖过节点，到达目标节点后松手提交。
      </div>
    </template>
  </div>
</template>
