// =============================================================
// 人类活动规划器 v8：已弃用 / no-op
// =============================================================
// 旧 v7 规划器不再被 gameStore 调用。
// 全地图只有 1 个永久阻挡圆，不需要 corridor 评分 / 冷却 / fairness 预检。
// 保留本文件仅作为占位，避免外部 import 报错。
// =============================================================
export interface PlannerTask { task: unknown; recommendedRoute: string[] | null }
export interface CorridorCooldown { key: string; usedAt: number }
export interface PlannerInput {
  waitingTasks: PlannerTask[]
  unlockedSpeciesIds: string[]
  season: 'normal' | 'storm' | 'drought'
  currentBlocking: unknown[]
  nodes: unknown[]
  canGenerateTaskFor: (speciesId: string) => boolean
  findSolvableRoute: (speciesId: string, start: string, target: string) => string[] | null
  corridorCooldowns: CorridorCooldown[]
  elapsedTime: number
}
export interface CorridorCandidate {
  fromId: string
  toId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  midX: number
  midY: number
  affectedTaskIds: string[]
  corridorKey: string
  blockR: number
}
export type PlannerOutput = { kind: 'idle' } | { kind: 'cooldown' }

export function corridorKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}
export function isOnCooldown(_k: string, _c: CorridorCooldown[], _now: number): boolean { return false }
export function planHumanActivity(_input: PlannerInput): PlannerOutput { return { kind: 'idle' } }
export function buildPlannerInput(args: {
  waitingTasks: PlannerTask[]
  unlockedSpeciesIds: string[]
  season: 'normal' | 'storm' | 'drought'
  currentBlocking: unknown[]
  nodes: unknown[]
  canGenerateTaskFor: (speciesId: string) => boolean
  findSolvableRoute: (speciesId: string, start: string, target: string) => string[] | null
  corridorCooldowns: CorridorCooldown[]
  elapsedTime: number
}): PlannerInput {
  return args
}
