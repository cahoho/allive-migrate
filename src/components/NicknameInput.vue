<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSupabase } from '../composables/useSupabase'

const TUTORIAL_PREF_KEY = 'allive_tutorial_enabled'

const emit = defineEmits<{
  confirm: [nickname: string, tutorialEnabled: boolean]
  switchIdentity: []
}>()

const { getSavedNickname } = useSupabase()

const savedName = getSavedNickname() || ''
const isReturning = savedName.length > 0

// ============================================================
// 教程偏好
// ============================================================
function getTutorialPref(): boolean {
  try {
    const val = localStorage.getItem(TUTORIAL_PREF_KEY)
    if (val === null) return !isReturning // 首次默认勾选，回头客默认不勾选
    return val === 'true'
  } catch {
    return !isReturning
  }
}

function saveTutorialPref(enabled: boolean) {
  try {
    localStorage.setItem(TUTORIAL_PREF_KEY, String(enabled))
  } catch { /* silent */ }
}

const tutorialEnabled = ref(getTutorialPref())

// ============================================================
// 昵称输入（仅新玩家）
// ============================================================
const nickname = ref(savedName)
const showValidation = ref(false)

const isValid = computed(() => {
  const trimmed = nickname.value.trim()
  return trimmed.length >= 1 && trimmed.length <= 50
})

const validationMessage = computed(() => {
  const trimmed = nickname.value.trim()
  if (trimmed.length === 0) return '请输入你的昵称'
  if (trimmed.length > 50) return '昵称不能超过 50 个字符'
  return ''
})

// ============================================================
// 提交
// ============================================================
function handleSubmit() {
  showValidation.value = true
  if (!isValid.value) return
  saveTutorialPref(tutorialEnabled.value)
  emit('confirm', nickname.value.trim(), tutorialEnabled.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSubmit()
}

function handleSwitchIdentity() {
  emit('switchIdentity')
}
</script>

<template>
  <div class="home-mask">
    <div class="home-card">
      <!-- 顶部折角装饰 -->
      <div class="card-corner"></div>

      <!-- ============================================================ -->
      <!-- 标题区 -->
      <!-- ============================================================ -->
      <div class="card-header">
        <div class="title-line">
          <h1 class="main-title">众生迁徙</h1>
          <span class="divider-dot">·</span>
          <span class="sub-title">Allive Migration</span>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- 回头客：欢迎回来 -->
      <!-- ============================================================ -->
      <template v-if="isReturning">
        <div class="welcome-section">
          <p class="welcome-greeting">欢迎回来，<strong class="welcome-name">{{ savedName }}</strong></p>
          <p class="welcome-hint">你的迁徙数据已就绪，随时可以继续冒险</p>
        </div>

        <div class="tutorial-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="tutorialEnabled"
              class="tutorial-checkbox"
            />
            <span class="checkbox-text">进入游戏时打开教程</span>
          </label>
        </div>

        <button class="start-btn" @click="handleSubmit">
          <span class="btn-text">进入游戏</span>
          <span class="btn-arrow">→</span>
        </button>

        <button class="switch-link" @click="handleSwitchIdentity">
          换一个身份重新开始
        </button>
      </template>

      <!-- ============================================================ -->
      <!-- 新玩家：输入昵称 -->
      <!-- ============================================================ -->
      <template v-else>
        <p class="welcome-text">输入你的昵称，开始迁徙之旅</p>

        <div class="input-section">
          <div class="input-wrapper">
            <input
              id="nickname-input"
              v-model="nickname"
              type="text"
              class="nickname-input"
              placeholder="取个名字吧…"
              maxlength="50"
              autocomplete="off"
              spellcheck="false"
              @keydown="handleKeydown"
            />
            <span class="char-count">{{ nickname.length }}/50</span>
          </div>
          <p v-if="showValidation && !isValid" class="validation-msg">
            {{ validationMessage }}
          </p>
        </div>

        <!-- 新手指引 -->
        <div class="guide-section">
          <div class="guide-card">
            <span class="guide-icon">🌍</span>
            <div class="guide-text">
              <strong>规划迁徙路线</strong>
              <span>点击生态节点，为物种画出安全路线</span>
            </div>
          </div>
          <div class="guide-card">
            <span class="guide-icon">🛡️</span>
            <div class="guide-text">
              <strong>应对环境变化</strong>
              <span>季节更替、人类活动都会影响迁徙</span>
            </div>
          </div>
        </div>

        <!-- 信息卡片 -->
        <div class="info-cards">
          <div class="info-card">
            <span class="info-dot"></span>
            <span>无需注册，无需密码</span>
          </div>
          <div class="info-card">
            <span class="info-dot"></span>
            <span>本设备自动识别为你的身份</span>
          </div>
          <div class="info-card">
            <span class="info-dot"></span>
            <span>游戏结束后可查看全服排行榜</span>
          </div>
        </div>

        <div class="tutorial-row">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="tutorialEnabled"
              class="tutorial-checkbox"
            />
            <span class="checkbox-text">进入游戏时打开教程</span>
          </label>
        </div>

        <button class="start-btn" :disabled="!isValid" @click="handleSubmit">
          <span class="btn-text">开始游戏</span>
          <span class="btn-arrow">→</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================ */
/* 白色手账风格 — 首页 */
/* ============================================================ */

.home-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-main);
  background-image: var(--grid-dots);
}

.home-card {
  position: relative;
  width: 440px;
  max-width: 92vw;
  max-height: 92vh;
  overflow-y: auto;
  background: var(--bg-sticker);
  background-image: var(--paper-noise);
  border: 1.5px dashed var(--border-dashed);
  border-radius: 12px 8px 14px 6px;
  padding: 36px 32px 28px;
  box-shadow: var(--shadow-sticker);
  animation: cardIn 0.45s cubic-bezier(0.16, 1, 0.3, 1);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.card-corner {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 36px 36px 0;
  border-color: transparent var(--bg-paper) transparent transparent;
  filter: drop-shadow(-1px 1px 2px rgba(90, 70, 50, 0.12));
  border-radius: 0 8px 0 0;
}

/* 标题区 */
.card-header {
  text-align: center;
  margin-bottom: 22px;
}

.title-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
}

.main-title {
  margin: 0;
  font-family: var(--font-hand);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 2px;
}

.divider-dot {
  color: var(--border);
  font-size: 18px;
  font-weight: 300;
}

.sub-title {
  font-size: 13px;
  color: var(--text-dim);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.welcome-text {
  margin: 0 0 8px;
  text-align: center;
  font-size: 14px;
  color: var(--text-dim);
}

/* 回头客欢迎区 */
.welcome-section {
  text-align: center;
  padding: 20px 16px;
  margin-bottom: 16px;
  background: var(--bg-paper);
  background-image: var(--grid-lines);
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border-light);
}

.welcome-greeting {
  margin: 0 0 6px;
  font-family: var(--font-hand);
  font-size: 20px;
  color: var(--text);
  letter-spacing: 1px;
}

.welcome-name {
  color: var(--success);
}

.welcome-hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-dim);
}

/* 输入区 */
.input-section {
  margin-bottom: 14px;
}

.input-wrapper {
  position: relative;
}

.nickname-input {
  width: 100%;
  padding: 14px 48px 14px 16px;
  background: var(--bg-paper);
  border: 1.5px dashed var(--border);
  border-radius: 10px 6px 12px 8px;
  color: var(--text);
  font-size: 16px;
  font-family: var(--font);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.nickname-input::placeholder {
  color: var(--text-dim);
  opacity: 0.5;
}

.nickname-input:focus {
  border-color: var(--info);
  border-style: solid;
  box-shadow: 0 0 0 3px rgba(90, 172, 200, 0.1);
}

.char-count {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
}

.validation-msg {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--danger);
  text-align: center;
}

/* 新手指引 */
.guide-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.guide-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-paper);
  border-radius: 10px 6px 12px 8px;
  border: 1.5px dashed var(--border-light);
}

.guide-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 1px;
}

.guide-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.guide-text strong {
  font-size: 13px;
  color: var(--text);
}

.guide-text span {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.4;
}

/* 信息卡片 */
.info-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  padding: 14px 16px;
  background: var(--bg-paper);
  border: 1.5px dashed var(--border-light);
  border-radius: 10px 6px 12px 8px;
  background-image: var(--grid-lines);
}

.info-card {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-dim);
}

.info-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border);
}

/* 教程复选框行 */
.tutorial-row {
  margin-bottom: 16px;
  text-align: center;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.tutorial-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--success);
  cursor: pointer;
}

.checkbox-text {
  font-size: 14px;
  color: var(--text-dim);
}

/* 按钮 */
.start-btn {
  width: 100%;
  padding: 14px 0;
  background: linear-gradient(135deg, #6CC080 0%, #5AAC6E 100%);
  border: none;
  border-radius: 10px 6px 12px 8px;
  color: #FFF;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: var(--font-hand);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(108, 192, 128, 0.2);
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(108, 192, 128, 0.3);
}

.start-btn:active:not(:disabled) {
  transform: translateY(0);
}

.start-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-text {
  font-family: var(--font-hand);
}

.btn-arrow {
  font-size: 18px;
  transition: transform 0.2s;
}

.start-btn:hover:not(:disabled) .btn-arrow {
  transform: translateX(3px);
}

/* 切换身份 */
.switch-link {
  display: block;
  margin: 14px auto 0;
  padding: 6px 16px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.2s;
  text-decoration: underline;
  text-decoration-color: var(--border-light);
  text-underline-offset: 3px;
}

.switch-link:hover {
  color: var(--text);
  text-decoration-color: var(--border);
}
</style>
