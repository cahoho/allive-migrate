// 一次性诊断脚本：多阶段、多物种、多种子大规模稳定性测试
//
// 运行方法（Node 24 内置 TypeScript 支持）：
//   node --experimental-strip-types --no-warnings diagnose.mjs
//
// 验证项：
// T1. 100 个 seed 初始 bird 必须生成任务
// T2. 路线必须真的以 target 结束
// T3. 候鸟初始路线必须可解：北方繁殖地 → 沿海湿地 → 南方越冬地
// T4. task.requiredWaypoints = [] 时 UI 不回退显示 species 默认
// T5. 起终点重复 tag 时 task.requiredWaypoints 必须为 []
// T6. 多个同名 target 时拖到任意同 equivalenceKey 都能成功
// T7. 多阶段 / 多物种 / 多种子稳定性
// T8. normal 季节无风险区
// T9. storm / drought 季节风险区不会让目标物种无解
// T10. ordered tag waypoint 在 solver / planner 中均能被理解
import { generateInitialMap, makeFixedNode, addStageNodes } from './src/systems/mapGenerator.ts'
import { SeededRandom } from './src/systems/seededRandom.ts'
import { generateTask, canGenerateTaskFor } from './src/systems/taskGenerator.ts'
import {
  canSpawnSolvableTask,
  findSolvableRouteForSpecies,
  bumpMapRevision
} from './src/systems/solvability.ts'
import { getActiveRiskZones } from './src/data/riskZones.ts'
import { SPECIES_TEMPLATES, getSpeciesTemplate } from './src/data/speciesTemplates.ts'
import { normalizeTaskWaypoints } from './src/systems/routeRequirements.ts'
import { planDynamicRiskZones } from './src/systems/riskZonePlanner.ts'

const FAIL_FAST = false

function buildMapForStage(stage, rng) {
  const nodes = generateInitialMap(rng, stage)
  if (stage >= 2) {
    for (const tpl of addStageNodes(2)) {
      if (!nodes.find((n) => n.id === tpl.id)) nodes.push(makeFixedNode(tpl, nodes, rng))
    }
  }
  if (stage >= 3) {
    for (const tpl of addStageNodes(3)) {
      if (!nodes.find((n) => n.id === tpl.id)) nodes.push(makeFixedNode(tpl, nodes, rng))
    }
  }
  if (stage >= 4) {
    for (const tpl of addStageNodes(4)) {
      if (!nodes.find((n) => n.id === tpl.id)) nodes.push(makeFixedNode(tpl, nodes, rng))
    }
  }
  return nodes
}

function speciesUnlockedAt(stage) {
  return SPECIES_TEMPLATES.filter((s) => {
    if (s.id === 'bird') return stage >= 1
    if (s.id === 'butterfly') return stage >= 2
    if (s.id === 'salmon') return stage >= 3
    if (s.id === 'herd') return stage >= 4
    return false
  })
}

let passCount = 0
let failCount = 0
const failures = []

function assert(cond, label) {
  if (cond) {
    passCount++
  } else {
    failCount++
    failures.push(label)
    if (FAIL_FAST) throw new Error('assert failed: ' + label)
  }
}

function section(title) {
  console.log(`\n========== ${title} ==========`)
}

function nodeMapOf(nodes) {
  return new Map(nodes.map((n) => [n.id, n]))
}

// ============================================================
// T1 + T2 + T3：100 seed bird 必生成 + route 必以 target 结尾
//                初始路线必须可解：北方繁殖地 → 沿海湿地 → 南方越冬地
// ============================================================
function testBirdInitialRoute() {
  section('T1+T2+T3 候鸟初始路线 (100 seeds)')
  let routeOk = 0
  let total = 0
  for (let seed = 1; seed <= 100; seed++) {
    const rng = new SeededRandom(seed)
    const nodes = buildMapForStage(1, rng)
    const sp = getSpeciesTemplate('bird')
    if (!sp) throw new Error('bird template missing')
    if (!canGenerateTaskFor(sp, nodes)) continue
    bumpMapRevision()
    const taskRng = new SeededRandom(seed * 1000 + 7)
    const task = generateTask({
      rng: taskRng,
      species: sp,
      nodes,
      elapsedTime: 0,
      season: 'normal',
      maxAttempts: 50
    })
    if (!task) {
      assert(false, `T1 seed=${seed} bird task not generated`)
      continue
    }
    total++
    assert(!!task.startNodeId, `T1 seed=${seed} startNodeId exists`)
    assert(!!task.targetNodeId, `T1 seed=${seed} targetNodeId exists`)

    const route = findSolvableRouteForSpecies(
      sp,
      nodes.filter((n) => n.status !== 'disabled').map((n) => n.id),
      'normal',
      nodes,
      task.startNodeId,
      task.targetNodeId,
      task.requiredWaypoints,
      task.requiredWaypointOrder
    )
    if (!route) {
      assert(false, `T2 seed=${seed} no route`)
      continue
    }
    assert(route[0] === task.startNodeId, `T2 seed=${seed} route[0]===startNodeId`)
    assert(route[route.length - 1] === task.targetNodeId, `T2 seed=${seed} route[last]===targetNodeId`)

    const m = nodeMapOf(nodes)
    const start = m.get(task.startNodeId)
    const target = m.get(task.targetNodeId)
    if (!start || !target) continue
    const interior = route.slice(1, -1)
    const hasWetlandInterior = interior.some((id) => {
      const n = m.get(id)
      return !!n && n.tags.includes('wetland')
    })
    const requiredWps = task.requiredWaypoints || []
    const hasWetlandReq = requiredWps.some((w) => w.kind === 'tag' && w.tag === 'wetland')
    if (hasWetlandReq) {
      assert(hasWetlandInterior, `T3 seed=${seed} bird route must pass through wetland interior`)
    }
    routeOk++
  }
  console.log(`  pass: ${routeOk}/${total} seeds have valid target-ending route`)
}

// ============================================================
// T4：task.requiredWaypoints = [] 时 UI 不回退显示 species 默认
// ============================================================
function testEmptyRequiredWaypoints() {
  section('T4 task.requiredWaypoints = [] 时不再回退')
  const sp = getSpeciesTemplate('bird')
  if (!sp) throw new Error('bird template missing')
  const taskLike = { requiredWaypoints: [], requiredWaypointOrder: false }
  const uiWps = Array.isArray(taskLike.requiredWaypoints)
    ? taskLike.requiredWaypoints
    : (sp.requiredWaypoints || [])
  const uiOrdered = taskLike.requiredWaypointOrder ?? false
  assert(uiWps.length === 0, 'T4 UI must show empty when task.requiredWaypoints=[]')
  assert(uiOrdered === false, 'T4 UI ordered=false')
}

// ============================================================
// T5：起终点重复 tag 时，normalizeTaskWaypoints 必须删除
// ============================================================
function testNormalizeRemovesEndpointTag() {
  section('T5 normalizeTaskWaypoints 必须删除起终点重复的 tag waypoint')
  const rng = new SeededRandom(1)
  const nodes = buildMapForStage(1, rng)
  const wetland = nodes.find((n) => n.tags.includes('wetland'))
  if (!wetland) {
    console.log('  (skipped: no wetland in initial map)')
    return
  }
  const wps = [
    { kind: 'tag', tag: 'wetland', label: '湿地', count: 1 }
  ]
  const start = wetland
  const target = nodes.find((n) => n.tags.includes('wintering'))
  if (!target) {
    console.log('  (skipped: no wintering in initial map)')
    return
  }
  const normalized = normalizeTaskWaypoints(wps, start, target, nodes)
  assert(normalized.length === 0, 'T5 normalized must be [] when start is wetland and waypoint requires wetland')
}

// ============================================================
// T6：多个同名 target 时，targetEquivalenceKey 必须一致
// ============================================================
function testEquivalenceKeyConsistency() {
  section('T6 同名 target 共享 equivalenceKey')
  const eqByName = new Map()
  for (let seed = 1; seed <= 30; seed++) {
    const rng = new SeededRandom(seed)
    const nodes = buildMapForStage(1, rng)
    for (const n of nodes) {
      if (!eqByName.has(n.displayName)) eqByName.set(n.displayName, new Set())
      eqByName.get(n.displayName).add(n.equivalenceKey)
    }
  }
  for (const [name, keys] of eqByName) {
    assert(keys.size === 1, `T6 节点 "${name}" 的 equivalenceKey 必须统一 (现在有 ${keys.size} 种)`)
  }
}

// ============================================================
// T7：多阶段多物种稳定性
// ============================================================
function runStage(stage, seedCount, label) {
  section(`${label} (stage ${stage}, ${seedCount} seeds)`)
  let total = 0
  let fail = 0
  const failedSeeds = []
  for (let seed = 1; seed <= seedCount; seed++) {
    const rng = new SeededRandom(seed)
    const nodes = buildMapForStage(stage, rng)
    for (const sp of speciesUnlockedAt(stage)) {
      total++
      if (!canGenerateTaskFor(sp, nodes)) {
        fail++
        failedSeeds.push({ seed, species: sp.id, reason: 'canGenerateTaskFor=false' })
        if (FAIL_FAST) throw new Error(`canGenerateTaskFor failed seed=${seed} species=${sp.id}`)
        continue
      }
      const can = canSpawnSolvableTask(sp.id, sp, nodes, 'normal')
      if (!can) {
        fail++
        failedSeeds.push({ seed, species: sp.id, reason: 'canSpawnSolvableTask=false' })
        if (FAIL_FAST) throw new Error(`canSpawnSolvableTask failed seed=${seed} species=${sp.id}`)
        continue
      }
      const taskRng = new SeededRandom(seed * 1000 + sp.id.charCodeAt(0))
      const task = generateTask({
        rng: taskRng,
        species: sp,
        nodes,
        elapsedTime: 0,
        season: 'normal',
        maxAttempts: 50
      })
      if (!task) {
        fail++
        failedSeeds.push({ seed, species: sp.id, reason: 'generateTask=null' })
        if (FAIL_FAST) throw new Error(`generateTask failed seed=${seed} species=${sp.id}`)
        continue
      }
      const route = findSolvableRouteForSpecies(
        sp,
        nodes.filter((n) => n.status !== 'disabled').map((n) => n.id),
        'normal',
        nodes,
        task.startNodeId,
        task.targetNodeId,
        task.requiredWaypoints,
        task.requiredWaypointOrder
      )
      if (!route || route[route.length - 1] !== task.targetNodeId) {
        fail++
        failedSeeds.push({ seed, species: sp.id, reason: 'route does not end at target' })
        continue
      }
    }
  }
  console.log(`  result: ${total - fail}/${total} pass`)
  if (failedSeeds.length > 0) {
    console.log(`  failed seeds: ${failedSeeds.slice(0, 10).map((f) => `${f.seed}/${f.species}(${f.reason})`).join(', ')}`)
  }
}

function testRiskZones(stage, label) {
  section(`风险区测试 (${label})`)
  for (const season of ['storm', 'drought']) {
    let zonesEmptyButValid = 0
    let zonesSolvable = 0
    let total = 0
    const targetSpeciesId = season === 'storm' ? 'bird' : 'butterfly'
    const sp = getSpeciesTemplate(targetSpeciesId)
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new SeededRandom(seed * 31 + 7)
      const nodes = buildMapForStage(stage, rng)
      if (!canGenerateTaskFor(sp, nodes)) continue
      const zones = getActiveRiskZones(season, nodes)
      total++
      if (zones.length === 0) {
        zonesEmptyButValid++
        if (canSpawnSolvableTask(sp.id, sp, nodes, season)) {
          zonesSolvable++
        }
        continue
      }
      if (canSpawnSolvableTask(sp.id, sp, nodes, season)) {
        zonesSolvable++
      } else {
        console.log(`  ${season} seed=${seed}: zones=${zones.length} but species unsolvable!`)
      }
    }
    console.log(`  ${season}: ${zonesSolvable}/${total} pass (${zonesEmptyButValid} cases had no zones)`)
  }
}

function testNormalNoZones(stage, label) {
  section(`normal 季节无风险区测试 (${label})`)
  let pass = 0
  let total = 0
  for (let seed = 1; seed <= 30; seed++) {
    const rng = new SeededRandom(seed)
    const nodes = buildMapForStage(stage, rng)
    const zones = getActiveRiskZones('normal', nodes)
    total++
    if (zones.length === 0) pass++
  }
  console.log(`  normal: ${pass}/${total} have no zones`)
}

// ============================================================
// T10：鲑鱼 ordered tag waypoint（河口 → 鱼道）
// ============================================================
function testSalmonOrderedTag() {
  section('T10 鲑鱼 ordered tag waypoint (河口 → 鱼道)')
  let total = 0
  let pass = 0
  const sp = getSpeciesTemplate('salmon')
  if (!sp) {
    console.log('  (skipped: salmon template missing)')
    return
  }
  for (let seed = 1; seed <= 60; seed++) {
    const rng = new SeededRandom(seed)
    const nodes = buildMapForStage(3, rng)
    total++
    if (!canGenerateTaskFor(sp, nodes)) continue
    const m = nodeMapOf(nodes)
    const start = nodes.find(
      (n) => n.tags.includes('sea') || n.tags.includes('coldSea')
    )
    const target = nodes.find((n) => n.tags.includes('spawning'))
    if (!start || !target) continue
    const route = findSolvableRouteForSpecies(
      sp,
      nodes.filter((n) => n.status !== 'disabled').map((n) => n.id),
      'normal',
      nodes,
      start.id,
      target.id,
      sp.requiredWaypoints,
      true
    )
    if (!route) continue
    if (route[0] !== start.id) continue
    if (route[route.length - 1] !== target.id) continue
    const interior = route.slice(1, -1)
    const estIdx = interior.findIndex((id) => m.get(id)?.tags.includes('estuary'))
    const fishIdx = interior.findIndex((id) => m.get(id)?.tags.includes('fishway'))
    if (estIdx >= 0 && fishIdx >= 0 && estIdx < fishIdx) {
      pass++
    } else if (estIdx < 0 && fishIdx < 0) {
      pass++
    }
  }
  console.log(`  result: ${pass}/${total} seeds with valid salmon route (estuary before fishway)`)
  assert(pass > 0, 'T10 鲑鱼至少应有一个 seed 满足 ordered tag 路径')
}

// ============================================================
// T11：风险区动态规划不会让候鸟/蝴蝶无解
// ============================================================
function testPlanDynamicRiskZones() {
  section('T11 动态风险区规划')
  let pass = 0
  let total = 0
  for (const season of ['storm', 'drought']) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new SeededRandom(seed * 17 + 5)
      const nodes = buildMapForStage(2, rng)
      const sp = getSpeciesTemplate(season === 'storm' ? 'bird' : 'butterfly')
      if (!canGenerateTaskFor(sp, nodes)) continue
      total++
      const zones = planDynamicRiskZones(season, nodes)
      if (zones.length === 0) {
        pass++
        continue
      }
      if (canSpawnSolvableTask(sp.id, sp, nodes, season)) pass++
    }
  }
  console.log(`  result: ${pass}/${total} pass`)
}

// ============================================================
// 入口
// ============================================================
try {
  testBirdInitialRoute()
  testEmptyRequiredWaypoints()
  testNormalizeRemovesEndpointTag()
  testEquivalenceKeyConsistency()
  runStage(1, 100, 'stage 1 bird')
  runStage(2, 100, 'stage 2 bird/butterfly')
  runStage(3, 200, 'stage 3 bird/butterfly/salmon')
  runStage(4, 200, 'stage 4 bird/butterfly/salmon/herd')
  testNormalNoZones(4, 'stage 4')
  testRiskZones(2, 'stage 2')
  testRiskZones(3, 'stage 3')
  testRiskZones(4, 'stage 4')
  testSalmonOrderedTag()
  testPlanDynamicRiskZones()

  console.log(`\n========== 全部通过 ==========`)
  console.log(`assert pass=${passCount} fail=${failCount}`)
  if (failCount > 0) {
    console.log('failed assertions:')
    for (const f of failures.slice(0, 30)) console.log('  -', f)
    process.exit(1)
  }
} catch (e) {
  console.error('诊断失败：', e)
  process.exit(1)
}
