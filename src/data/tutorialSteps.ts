// 引导步骤数据
// ============================================================
// 设计原则（来自用户需求文档 §八）：
// - 每步最多一句话（≤ 16 字最佳）
// - 玩家通过圈点 + 实际操作理解系统
// - 教学任务在 intro 阶段自动生成（gameStore.ensureTutorialTask）
//
// 数据结构：
// - TARGETS 用 CSS 选择器定位 DOM 元素（通过 data-tutorial-target 标记）
// - shape: 'circle' | 'rect' | 'line'
// - 步骤 6（让玩家拖一次）后，通过监听 submitRoute 自动推进到 step 7
// ============================================================
import type { TutorialStep } from './gameData'

// ----- INTRO 阶段：8 步（用户文档 §四）-----

const introSteps: TutorialStep[] = [
  // Step 0：欢迎，不圈任何东西
  {
    id: 'intro-welcome',
    text: '帮助物种完成迁徙，跟着界面提示走。',
    targets: [],
    canPrev: false
  },

  // Step 1：圈出动物任务图标
  {
    id: 'intro-marker',
    text: '这是迁徙任务，点击它开始。',
    targets: [
      {
        id: 'tutorial-marker',
        shape: 'circle',
        selector: '[data-tutorial-target="species-marker"]',
        padding: 14
      }
    ]
  },

  // Step 2：圈出右侧详情面板
  {
    id: 'intro-panel',
    text: '右侧显示起点、途经和终点。',
    targets: [
      {
        id: 'tutorial-panel',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="species-panel"]',
        padding: 10
      }
    ]
  },

  // Step 3：圈出起点节点（地图 + 右侧起点卡 同时高亮）
  {
    id: 'intro-start',
    text: '路线从这个节点出发。',
    targets: [
      {
        id: 'tutorial-start-node',
        shape: 'circle',
        selector: '[data-tutorial-target="start-node"]',
        padding: 18
      },
      {
        id: 'tutorial-panel-start-node',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="panel-start-node"]',
        padding: 8
      }
    ]
  },

  // Step 4：圈出途经要求
  {
    id: 'intro-waypoint',
    text: '有些迁徙必须经过这里。',
    targets: [
      {
        id: 'tutorial-waypoint',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="waypoint"]',
        padding: 10
      }
    ]
  },

  // Step 5：圈出终点节点
  {
    id: 'intro-target',
    text: '最后要连到终点。',
    targets: [
      {
        id: 'tutorial-target-node',
        shape: 'circle',
        selector: '[data-tutorial-target="target-node"]',
        padding: 18
      }
    ]
  },

  // Step 6（v13 改版）：
  // v13 改版后这里就是 intro 阶段的最后一步：
  // 圈出"物种多样性 + 物种 logo"区域，告知玩家失败判定。
  // 删除了原 step 6 的"现在拖动它"——玩家已经在前置步骤看
  // 到了任务和起终点说明，可以直接尝试拖动。
  {
    id: 'intro-done',
    text: '这里标记了每个物种的失败次数，物种多样性低于33.3%将失败。',
    targets: [
      {
        id: 'tutorial-biodiv-and-species',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="biodiv-and-species"]',
        padding: 8
      }
    ],
    canPrev: false,
    canSkip: false,
    nextLabel: '开始游戏'
  }
]

// ----- HUMAN 阶段：4 步（用户文档 §五）-----

const humanSteps: TutorialStep[] = [
  // Human Step 1：圈出右上方图层切换按钮
  {
    id: 'human-button',
    text: '人类活动已出现，切过去处理。',
    targets: [
      {
        id: 'tutorial-human-btn',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="layer-toggle"]',
        padding: 6
      }
    ],
    onEnter: () => {
      // 自动切到人类图层
      const s = (window as any).__allive?.state
      if (s) s.humanLayerVisible = true
    }
  },

  // Human Step 2：圈出人类活动圈
  {
    id: 'human-circle',
    text: '人类圈阻碍迁徙并扣除节点生态健康值。节点在空闲时会生态恢复。',
    targets: [
      {
        id: 'tutorial-human-circle',
        shape: 'circle',
        selector: '[data-tutorial-target="human-blocker"]',
        padding: 12
      }
    ]
  },

  // Human Step 3：圈出缩圈点
  {
    id: 'human-shrink',
    text: '长按拖动，引导它到缩圈点。',
    targets: [
      {
        id: 'tutorial-shrink-point',
        shape: 'circle',
        selector: '[data-tutorial-target="shrink-point"]',
        padding: 14
      }
    ]
  },

  // Human Step 4：圈出"迁徙"按钮
  {
    id: 'human-back',
    text: '处理完切回迁徙。',
    targets: [
      {
        id: 'tutorial-migration-btn',
        shape: 'rect',
        rectSelector: '[data-tutorial-target="layer-toggle"]',
        padding: 6
      }
    ],
    nextLabel: '切回迁徙'
  }
]

const allSteps: Record<'intro' | 'human', TutorialStep[]> = {
  intro: introSteps,
  human: humanSteps
}

export function getTutorialSteps(phase: 'intro' | 'human' | null): TutorialStep[] {
  if (!phase) return []
  return allSteps[phase] || []
}

export function getTutorialStepCount(phase: 'intro' | 'human' | null): number {
  return getTutorialSteps(phase).length
}

export function getCurrentStep(phase: 'intro' | 'human' | null, index: number): TutorialStep | null {
  const list = getTutorialSteps(phase)
  if (index < 0 || index >= list.length) return null
  return list[index]
}
