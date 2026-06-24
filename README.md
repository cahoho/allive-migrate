# Allive Migration · 众生迁徙（动态生态网络版）

一个使用 Vue 3 + Vite + TypeScript + Composition API + SVG + CSS 构建的单屏网页小游戏，地图节点与任务在游戏过程中持续随机生成，所有物种共享同一张全局生态网络。

## 技术栈

- Vue 3 + Composition API + `<script setup>`
- Vite 5 + TypeScript（严格模式）
- SVG + CSS（无 Canvas / Phaser / Three / PNG / 外部素材）
- 自研 `gameStore.ts`（基于 Vue `reactive`，不使用 Pinia）
- `src/systems/*` 自研模块：种子随机、地图生成、图生成、任务生成、路线求解、世界事件

## 启动

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```

> 开发模式可在浏览器控制台通过 `__allive.setSeed("foo")` 复现同一局地图。

## 项目结构

```
src/
├─ main.ts
├─ App.vue
├─ env.d.ts
├─ styles/
│  ├─ variables.css
│  └─ global.css
├─ data/
│  ├─ gameConfig.ts          # 全局常量（地图尺寸/资源/事件/灾害类型）
│  ├─ gameData.ts            # 运行时类型：RuntimeMapNode/Edge/Task/Event
│  ├─ nodeTemplates.ts       # 节点视觉/命名模板
│  ├─ speciesTemplates.ts    # 6 种物种模板（候鸟/蝴蝶/鲑鱼/草原兽群/海龟/蛙群）
│  └─ eventDefinitions.ts    # 5 种事件定义
├─ systems/
│  ├─ seededRandom.ts        # mulberry32 + 通用工具
│  ├─ mapGenerator.ts        # 节点坐标 + 初始/新增生成
│  ├─ graphGenerator.ts      # 动态连边 + 度数限制
│  ├─ taskGenerator.ts       # 任务起点/终点/需求抽取 + 多解保证
│  ├─ routeSolver.ts         # BFS / 多解 DFS / 需求校验 / 资源成本
│  └─ worldEventSystem.ts    # 事件生命周期 + 公平性预检
├─ store/
│  └─ gameStore.ts           # 共享状态 + 所有操作入口
├─ composables/
│  ├─ useDragRoute.ts        # 拖线 / 吸附 / 取消区 / 资源检查
│  ├─ useRouteValidation.ts  # 动态任务/地图/事件的统一验证
│  └─ useGameLoop.ts         # RAF 主循环：倒计时/动画/节点/任务/物种/事件
├─ components/
│  ├─ TopBar.vue
│  ├─ GameMap.vue
│  ├─ MapNode.vue
│  ├─ RouteLine.vue
│  ├─ SpeciesMarker.vue
│  ├─ SpeciesIcon.vue        # 6 种动物 SVG 图标
│  ├─ SpeciesPanel.vue
│  ├─ CancelZone.vue（合并入 GameMap）
│  ├─ EventOverlay.vue       # 灾害区域 / 警告 / 效果
│  └─ GameOverModal.vue
└─ utils/
   ├─ geometry.ts
   └─ svgPath.ts
```

## 核心设计

### 1. 动态地图

- 开局生成 6 个节点，类型覆盖湿地 / 花蜜 / 繁殖或越冬；每局位置随机。
- 游戏进行中每 18–30 秒新增 1 个节点，最快 12 秒一个；最多 24 个。
- 节点需满足：`distance ≥ 90`、能连接到 ≥2 个已有节点。
- 全图通过 `NODE_CONNECT_DISTANCE = 330` 自动连边；每节点上限 5 个基础连接。
- 整体保证单一连通分量。
- 不存在物种专属区域 / 物种专属边。

### 2. 动态任务

- 任务起点/终点根据当前可见节点随机抽取，图距离至少 2（早期）~3（中后期）。
- 需求从物种 `requirementTemplates` 中按概率抽取，支持：
  - `visitTag`、`visitNode`、`visitTagsInOrder`、`avoidTag`、`maxSegments`
- 多解保证：使用 `findMultipleRoutes` 找最多 2 条合法路线，只有至少 1 条存在才接受。
- 任务签名（物种+起终点+归一化需求）保留最近 8 次，避免完全重复。
- 资源消耗：`pathCost = Σ ceil(distance / 170)`，上限 14 单位。

### 3. 连续难度曲线

```
maxConcurrent = clamp(1 + floor(elapsedTime/55), 1, 4)
taskSpawnInterval = max(7, 15 - score * 0.3) × jitter
timeLimitMultiplier = max(0.75, 1 - elapsedTime/900)
```

### 4. 随机物种解锁

- 开局随机解锁 2 种；之后每 55–85 秒尝试解锁 1 种。
- 只有当当前地图拥有满足该物种 `startTagWeights` 的节点时，新物种才进入候选池。
- 解锁顺序每局不同，6 个物种都可能被加入。

### 5. 世界事件

- 5 种：暴风 / 野火 / 干旱 / 山体滑坡 / 栖息地繁盛。
- 三阶段：`warning(6s) → active(18-30s) → recovery(3s)`。
- 开局前 40 秒不出事件；之后每 35–55 秒尝试一次。
- 早期最多 1 个并发；120 秒后最多 2 个。
- **公平性**：`canActivateEvent` 模拟事件生效后的状态，遍历所有 waiting 任务，确保每个任务仍至少存在一条合法路径；否则重生成或放弃。

### 6. 路线验证

按顺序校验：
1. 起点 == 任务起点
2. 终点 == 任务目标
3. 节点存在且可用
4. 相邻边存在且未封锁
5. 无重复节点
6. 满足 visitTag / visitNode / visitTagsInOrder / avoidTag / maxSegments
7. 当前任务物种的 `disasterVulnerabilities` 不被该事件影响
8. 资源消耗 ≤ 14

## 保留的旧功能

- 一次性拖线（Pointer Events，支持鼠标+触摸）
- 节点吸附（桌面 28，移动 38）
- 取消区（拖线时显示）
- 资源条 / 淡出 / 迁移 / 失败 3 次
- 环形倒计时 + 最后 5 秒闪烁
- 任务详情面板（动态读取任务数据）
- 游戏结束模态（总分 / 节点数 / 随机种子）

## 不再使用

- 固定的 12 个节点 / 14 条边
- `STAGES` / `unlockStage` / `getStageByScore`
- `RiskCard` / `seasonId` 轮转
- 物种 `startNode` / `targetNode` / `requiredNodeIds`
- 旧 `useRouteValidation` 中的 `getEdge` / `getNode` / `EDGES` / `NODES`
- 旧 `useDragRoute` 中的 `NODES.forEach`
