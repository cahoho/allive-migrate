<script setup lang="ts">
// v12：旧的整屏说明弹窗已废弃
// 引导改用 TutorialOverlay.vue（分步小窗 + 高亮圈点）
// 本文件保留为空壳组件，避免外部引用断裂但不再渲染
import { computed } from 'vue'

// 显式置 false 永远不显示
const visible = computed(() => false)
</script>

<template>
  <!-- v12：已废弃，不再渲染 -->
  <div v-if="visible" style="display: none"></div>
</template>

<style scoped>
/* v12：组件已废弃，样式清空 */
</style>
