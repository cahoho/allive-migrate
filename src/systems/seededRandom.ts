// 基于种子的伪随机数生成器（mulberry32）+ 通用工具
// 所有随机行为必须通过本模块，避免直接使用 Math.random

export class SeededRandom {
  private state: number
  constructor(seed: number) {
    this.state = (seed | 0) || 1
  }
  /** 0..1 之间均匀分布 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  /** [min, max) 浮点 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }
  /** [min, max] 整数 */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }
  /** 0..n-1 整数 */
  pickIndex(n: number): number {
    if (n <= 0) return 0
    return Math.floor(this.next() * n)
  }
  /** 从数组中随机选一项 */
  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined
    return arr[this.pickIndex(arr.length)]
  }
  /** 加权随机：从 (item, weight) 列表中抽取 */
  weighted<T>(items: { item: T; weight: number }[]): T | undefined {
    if (items.length === 0) return undefined
    let total = 0
    for (const it of items) total += Math.max(0, it.weight)
    if (total <= 0) return items[this.pickIndex(items.length)].item
    let r = this.next() * total
    for (const it of items) {
      const w = Math.max(0, it.weight)
      if (r < w) return it.item
      r -= w
    }
    return items[items.length - 1].item
  }
  /** 数组洗牌（原地） */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.pickIndex(i + 1)
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
    return arr
  }
  /** boolean 概率 */
  chance(p: number): boolean {
    return this.next() < p
  }
}

/** 由字符串生成 32 位整数种子 */
export function hashSeed(input: string): number {
  let h = 2166136261 | 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 生成一个 0..0x7fffffff 的随机种子（仅用于生成新对局） */
export function newRandomSeed(): number {
  return (Math.random() * 0x7fffffff) | 0
}
