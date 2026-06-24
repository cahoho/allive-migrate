<script setup lang="ts">
import { computed } from 'vue'
import { gameStore } from '../store/gameStore'
import { getSpeciesTemplate } from '../data/speciesTemplates'

const score = computed(() => gameStore.state.score)
const failures = computed(() => gameStore.state.failures)
const totalSuccess = computed(() => gameStore.state.totalSuccess)
const seed = computed(() => gameStore.state.seed)
const survivalTime = computed(() => gameStore.state.survivalTime)
const finalNodeCount = computed(() => gameStore.state.mapNodes.length)

/** 物种多样性 */
const biodiversityPercent = computed(() => gameStore.getBiodiversityPercent())
const biodiversityText = computed(() => `${biodiversityPercent.value.toFixed(1)}%`)

/** 灭绝物种列表（仅名称） */
const extinctSpeciesNames = computed(() => {
  return gameStore.state.extinctSpeciesIds
    .map((id) => getSpeciesTemplate(id)?.name || id)
    .filter((name) => !!name)
})

/**
 * v11：坚持时间自然语言格式化
 * - < 60s : 你坚持了 38 秒
 * - >= 60s: 你坚持了 3 分 08 秒
 */
const survivalText = computed(() => {
  const sec = Math.max(0, Math.floor(survivalTime.value))
  if (sec < 60) return `你坚持了 ${sec} 秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `你坚持了 ${m} 分 ${s.toString().padStart(2, '0')} 秒`
})

function restart() {
  gameStore.restart()
}
</script>

<template>
  <div v-if="gameStore.state.gameOver" class="modal-mask">
    <div class="modal-card">
      <h1>旅程结束</h1>
      <div class="subtitle">生态地图上的迁徙者，完成了它们的旅行</div>
      <div class="stats">
        <div class="row highlight">
          <span class="label">最终坚持时间</span>
          <span class="value survival">{{ survivalText }}</span>
        </div>
        <div class="row">
          <span class="label" title="按各物种 successScore 加权求和：飞行快的物种得分低，陆地/两栖慢速物种得分高">本局迁徙得分</span>
          <span class="value">{{ score.toFixed(1) }} <span class="unit">分</span></span>
        </div>
        <div class="row">
          <span class="label" title="完成迁徙任务的总数（整数计数，与得分严格分开）">成功迁徙数量</span>
          <span class="value">{{ totalSuccess }} <span class="unit">次</span></span>
        </div>
        <div class="row">
          <span class="label">物种多样性</span>
          <span class="value">{{ biodiversityText }}</span>
        </div>
        <div class="row">
          <span class="label">迁徙失败总次数</span>
          <span class="value">{{ failures }}</span>
        </div>
        <div class="row">
          <span class="label">灭绝物种</span>
          <span class="value extinct-list">
            <span v-if="extinctSpeciesNames.length === 0">无</span>
            <span v-else>{{ extinctSpeciesNames.join('、') }}</span>
          </span>
        </div>
        <div class="row"><span class="label">最终生态节点数</span><span class="value">{{ finalNodeCount }}</span></div>
        <div class="row"><span class="label">随机种子</span><span class="value">{{ seed }}</span></div>
      </div>
      <button class="restart" @click="restart">重新开始</button>
    </div>
  </div>
</template>

<style scoped>
.row.highlight {
  background: rgba(108, 192, 128, 0.08);
  border: 1.5px dashed rgba(108, 192, 128, 0.35);
  border-radius: 10px 6px 12px 8px;
}
.row.highlight .value.survival {
  color: var(--success);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-family: var(--font-hand);
}
.value.extinct-list {
  color: var(--danger);
  font-weight: 600;
}
</style>
