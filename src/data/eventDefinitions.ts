// 季节描述文本
import type { SeasonId } from './gameConfig'

export const SEASON_INFO: Record<SeasonId, { name: string; description: string; color: string }> = {
  normal: {
    name: '平稳期',
    description: '当前没有特殊风险',
    color: '#7DFFB2'
  },
  storm: {
    name: '暴风季',
    description: '海上风险区域激活，候鸟需要绕行',
    color: '#8FB5E2'
  },
  drought: {
    name: '干旱季',
    description: '干旱带激活，蝴蝶需要绕行',
    color: '#E2B96A'
  }
}
