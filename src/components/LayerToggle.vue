<script setup lang="ts">
/**
 * v13：迁徙 / 人类活动 切换按钮
 * - 放在 GameMap 右上方（绝对定位）
 * - 单个方块按钮，点一下切换，再点切回
 * - 人类系统未激活时按钮显示"未激活"状态，并给出进度提示
 * - tooltip 始终显示当前模式 / 提示语
 */
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { HUMAN_ACTIVATION_SUCCESS } from '../data/gameConfig'

const humanActive = computed(() => gameStore.state.humanActive)
const humanLayerVisible = computed(
  () => gameStore.state.humanActive && gameStore.state.humanLayerVisible
)
const totalSuccess = computed(() => gameStore.state.totalSuccess)
const activationProgress = computed(() => Math.min(HUMAN_ACTIVATION_SUCCESS, totalSuccess.value))

/** 点击切换：
 *  - 当前迁移模式 → 切到人类模式（需人类系统已激活）
 *  - 当前人类模式 → 切回迁移模式
 *  - 人类未激活：点不动（按钮 disabled）
 */
function onToggle() {
  if (!gameStore.state.humanActive) return
  gameStore.state.humanLayerVisible = !gameStore.state.humanLayerVisible
}

/** 当前状态文案 */
const modeLabel = computed(() => {
  if (!humanActive.value) return '人类未激活'
  return humanLayerVisible.value ? '人类活动' : '迁徙'
})

/** 主按钮 hover tooltip */
const tipText = computed(() => {
  if (!humanActive.value) {
    return `完成迁徙 ${activationProgress.value} / ${HUMAN_ACTIVATION_SUCCESS} 后激活人类系统`
  }
  return humanLayerVisible.value
    ? '人类活动图层（长按引导密度）—— 点击切回迁徙'
    : '迁徙图层（可拖线）—— 点击切到人类活动'
})

/** 方块图标：迁移 = 鸟；人类 = 人 */
const iconKind = computed(() => (humanLayerVisible.value ? 'human' : 'migration'))

/** 状态类 */
const stateClass = computed(() => {
  if (!humanActive.value) return 'layer-disabled'
  return humanLayerVisible.value ? 'layer-human' : 'layer-migration'
})
</script>

<template>
  <div class="layer-toggle" :class="stateClass" data-tutorial-target="layer-toggle">
    <!--
      v13：单一按钮同时承担"迁徙 / 人类活动"两个角色。
      data-tutorial-target 兼容旧引导：
      - migration-button：高亮迁徙状态时的同一按钮
      - human-button：高亮人类状态时的同一按钮
      由于 HTML 不允许重复属性，这里使用统一的 class + data-tutorial-target，
      旧 [data-tutorial-target="human-button"] / [data-tutorial-target="migration-button"]
      引导选择器需要切换为统一的 [data-tutorial-target="layer-toggle"]。
    -->
    <button
      type="button"
      class="layer-square"
      :class="{ active: humanActive && humanLayerVisible, disabled: !humanActive }"
      :disabled="!humanActive"
      :title="tipText"
      :aria-label="tipText"
      data-tutorial-target="layer-toggle"
      @click="onToggle"
    >
      <span class="layer-icon" v-if="iconKind === 'migration'" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <!-- 鸟类迁徙 -->
          <path
            d="M3 17 Q9 7, 14 13 T 21 9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M14 13 q-1 -2 -3 -2 M14 13 q1 -1 2 -2"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
          <circle cx="3" cy="17" r="1.4" fill="currentColor" />
          <circle cx="21" cy="9" r="1.4" fill="currentColor" />
        </svg>
      </span>
      <span class="layer-icon" v-else aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <!-- 人类头像 -->
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="2" fill="none" />
          <path
            d="M5 21 c0 -4 3 -7 7 -7 s7 3 7 7"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </span>
      <span class="layer-mode">{{ modeLabel }}</span>
    </button>
    <div v-if="!humanActive" class="layer-progress-hint">
      {{ activationProgress }} / {{ HUMAN_ACTIVATION_SUCCESS }}
    </div>
  </div>
</template>

<style scoped>
.layer-toggle {
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  pointer-events: auto;
}

.layer-square {
  width: 56px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: var(--bg-sticker);
  border: 1.5px dashed rgba(90, 172, 200, 0.35);
  color: var(--text);
  border-radius: 10px 6px 12px 8px;
  cursor: pointer;
  font-family: var(--font-hand);
  padding: 4px;
  transition: all 0.2s;
  box-shadow: var(--shadow-sticker);
}
.layer-square:hover:not(:disabled) {
  border-color: rgba(90, 172, 200, 0.60);
  background: rgba(90, 172, 200, 0.08);
  transform: translateY(-1px);
  box-shadow: var(--shadow-hover);
  border-style: solid;
}
.layer-square:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(90, 172, 200, 0.55);
}
.layer-square.active {
  border-color: rgba(232, 160, 76, 0.60);
  background: rgba(232, 160, 76, 0.10);
  color: var(--butterfly);
  border-style: solid;
  box-shadow: var(--shadow-sticker);
}
.layer-square.disabled {
  cursor: not-allowed;
  opacity: 0.45;
  filter: grayscale(0.4);
}
.layer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}
.layer-mode {
  font-size: 10px;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.layer-progress-hint {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--bg-sticker);
  color: var(--text-dim);
  border-radius: 6px;
  border: 1px dashed var(--border-light);
  font-family: var(--font);
}

/* 主题色 */
.layer-human .layer-square {
  color: var(--butterfly);
}
</style>
