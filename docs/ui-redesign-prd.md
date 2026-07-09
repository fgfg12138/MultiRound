# UI 重新设计 PRD

---

## 项目信息

- **Language**: 中文
- **Project Name**: multiround
- **技术栈**: Vite + React + TypeScript + Tailwind CSS (已配置 `@tailwindcss/vite`)
- **项目路径**: `E:\ai\multiround`

### 原始需求

将整个 MultiRound（AI 圆桌模拟器）React 项目的 UI 替换为 `ai-roundtable-desktop-complete.html` 设计稿的深色紫渐变主题风格。**保留现有的路由逻辑、数据流、交互行为**（按钮点击、表单提交、API 调用等），只改动样式和布局结构的视觉表现。

---

## 1. 产品定义

### Product Goals

1. **视觉一致性** — 所有页面统一使用深色紫渐变 Sidebar + 白色/浅灰 Content 的布局框架，消除当前各页面风格不统一的问题
2. **沉浸式讨论体验** — 将讨论页面的布局从当前三栏结构（Left Sidebar/Center/Right Sidebar）迁移为设计稿的 Layout(Sidebar + TopBar + Content with Chat + Right Panel) 结构，提升阅读专注度
3. **设计系统复用** — 提取设计稿的 CSS 变量为 Tailwind 主题扩展（`theme.extend`），使后续维护只需修 Tailwind 配置文件即可全局生效

### User Stories

- **As a** 用户, **I want** 在 Sidebar 中看到统一的主菜单导航 **so that** 我能快速切换首页、讨论、创建圆桌等功能页面
- **As a** 用户, **I want** 讨论页有清晰的消息气泡样式（发言者 vs 主持人）**so that** 我能一眼分辨谁在发言
- **As a** 用户, **I want** 右侧面板显示参与者和私密消息 Tab **so that** 我能在讨论中方便地管理成员和发送私信
- **As a** 用户, **I want** 创建圆桌页面有风格统一的面板卡片和表单 **so that** 操作体验一致
- **As a** 用户, **I want** 暂停/停止/插话等状态有视觉 Overlay 提示 **so that** 我能清晰感知讨论状态变化

---

## 2. 设计规范提取

从 `ai-roundtable-desktop-complete.html` 的 CSS `:root` 及组件样式中提取。

### 2.1 配色系统

| Token | CSS 变量 | 值 | 用途 |
|-------|----------|-----|------|
| Primary 50 | `--p50` | `#f5f3ff` | 浅紫背景 |
| Primary 100 | `--p100` | `#ede9fe` | 浅紫边框/标签 |
| Primary 200 | `--p200` | `#ddd6fe` | 浅紫边框 |
| Primary 400 | `--p400` | `#a78bfa` | 次要紫 |
| Primary 500 | `--p500` | `#8b5cf6` | 主色 500 |
| Primary 600 | `--p600` | `#7c3aed` | 主色按钮/激活项 |
| Primary 700 | `--p700` | `#6d28d9` | Hover/深紫文字 |
| Primary 900 | `--p900` | `#4c1d95` | Sidebar 渐变顶部 |
| Gray 50 | `--g50` | `#f9fafb` | 页面背景 |
| Gray 100 | `--g100` | `#f3f4f6` | 浅灰背景/悬停 |
| Gray 200 | `--g200` | `#e5e7eb` | 边框/分割线 |
| Gray 300 | `--g300` | `#d1d5db` | 浅灰文本/滚动条 |
| Gray 400 | `--g400` | `#9ca3af` | 次要文字 |
| Gray 500 | `--g500` | `#6b7280` | 正文次级文字 |
| Gray 600 | `--g600` | `#4b5563` | 正文文字 |
| Gray 700 | `--g700` | `#374151` | 强调文字 |
| Gray 800 | `--g800` | `#1f2937` | 深色文字 |
| Gray 900 | `--g900` | `#111827` | 标题文字 |
| Success | `--success` | `#10b981` | 成功/进行中 |
| Warning | `--warning` | `#f59e0b` | 警告 |
| Error | `--error` | `#ef4444` | 错误/停止 |
| Info | `--info` | `#3b82f6` | 信息 |

**Sidebar 渐变**: `linear-gradient(180deg, #4c1d95 0%, #3b0764 100%)`

### 2.2 字体

- **Font Family**: `'Inter', 'Noto Sans SC', system-ui, sans-serif`
- Sidebar 字体颜色: `rgba(255,255,255,.7)`（普通项）, `#fff`（活跃项/logo）

### 2.3 间距系统

| Token | 值 |
|-------|----|
| `--s1` | 4px |
| `--s2` | 8px |
| `--s3` | 12px |
| `--s4` | 16px |
| `--s5` | 20px |
| `--s6` | 24px |
| `--s8` | 32px |
| `--s10` | 40px |
| `--s12` | 48px |

### 2.4 圆角

| Token | 值 |
|-------|----|
| `--r` | 8px |
| `--r-lg` | 12px |
| `--r-xl` | 16px |

### 2.5 阴影

| Token | 值 |
|-------|----|
| `--shadow-sm` | `0 1px 2px 0 rgba(0,0,0,.05)` |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,.1)` |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,.1)` |
| `--shadow-xl` | `0 20px 25px -5px rgba(0,0,0,.1)` |

### 2.6 过渡

| Token | 值 |
|-------|----|
| `--t` | `200ms ease` |

### 2.7 布局关键尺寸

| 区域 | 宽度 | 说明 |
|------|------|------|
| Sidebar | 240px | 左侧导航 |
| Top Bar | 100% (flex) | 顶部栏 56px 高 |
| Content Chat | flex: 1 | 消息区域 |
| Right Panel | 260px | 右侧参与者/私信面板 |
| 消息气泡 max-width | 85% | 对话内容区 |

---

## 3. 改造范围清单

### 3.1 Tailwind 主题扩展 (`src/index.css`)

**文件**: `src/index.css`
**改动**: 用 `@theme` 指令定义设计 token（取代原有简单 CSS 变量）

```css
@import "tailwindcss";

@theme {
  --color-p50: #f5f3ff;
  --color-p100: #ede9fe;
  --color-p200: #ddd6fe;
  --color-p400: #a78bfa;
  --color-p500: #8b5cf6;
  --color-p600: #7c3aed;
  --color-p700: #6d28d9;
  --color-p900: #4c1d95;
  --color-g50: #f9fafb;
  /* ... 完整 gray scale ... */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --spacing-s1: 4px;
  --spacing-s2: 8px;
  /* ... 全部 spacing token ... */
}
```

**优先级**: P0

### 3.2 全局布局重构 — 新增 Sidebar + TopBar 组件

当前 `Layout.tsx` 只有一个简单的 header + content。需要改为设计稿的完整布局：

**文件**: `src/components/Layout.tsx`
**改动**:
- 替换为 Sidebar (240px, 深紫渐变) + Main Content 区域结构
- Sidebar 包含 logo、导航项（高亮当前路由）、底部用户信息
- Main Content 包含 TopBar (56px) + `children`
- 导航项按现有路由映射（Home → `/` , Create → `/create` , Discussion → `/discussion/:id` , Result → `/result/:id` , Settings → `/settings`）
- 保留 `showBack` / `backTo` / `actions` props 用于内页

**优先级**: P0

### 3.3 Discussion 页面重新布局

**文件**: `src/pages/Discussion.tsx`
**改动**:
- 当前布局：Layout → flex-row(Left Sidebar char list | Center feed | Right sidebar info/whisper)
- 新布局：Layout(已包含 Sidebar) → TopBar → Content Area(Chat View | Right Panel 260px)
- 左侧角色列表 → 移到 Right Panel 的 "参与者" Tab 中
- 消息 feed → 使用设计稿的 `.chat-view` / `.chat-messages` / `.msg` 样式
- 聊天输入 → 使用设计稿的 `.chat-input-area` 风格
- 暂停/停止 Overlay → 使用设计稿的 `.pause-overlay` / `.stopped-overlay`
- 保留所有现有逻辑：`useDiscussion` hook 调用、按钮事件、`MessageBubble` 渲染、`WhisperPanel` 渲染
- 保留 `generateStatus`, `isPaused`, `awaitingHostInput` 等状态的交互逻辑

**优先级**: P0

### 3.4 MessageBubble 样式更新

**文件**: `src/components/MessageBubble.tsx`
**改动**:
- 更新为设计稿的消息气泡样式
  - 主持人消息 (host) → 右侧紫色渐变气泡 `msg--host`
  - 角色发言消息 → 左侧白色气泡带边框 `msg--role`
  - 私密消息 (whisper) → 虚线边框 `msg--whisper`
- 添加 name 标签和时间戳（设计稿 `.msg-name` / `.msg-time` 风格）
- 保留 `streaming` 打字光标效果
- 保持 `isWhisper` props 功能

**优先级**: P0

### 3.5 右侧面板 (Right Panel)

**文件**: 新增 `src/components/RightPanel.tsx`（可选），或在 `Discussion.tsx` 内联实现
**改动**:
- 实现设计稿的 `.right-panel` (260px) 结构
- 两个 Tab："参与者" 和 "私密消息"
- 参与者列表：显示角色头像、名称、身份、在线状态（`speaking`/`online`/`offline` 三种状态指示器）
- 私密消息 Tab → 嵌入现有的 `WhisperPanel` 组件
- 暂停时自动切换到私密 Tab（现有逻辑已实现）

**优先级**: P0

### 3.6 Home 页面样式更新

**文件**: `src/pages/Home.tsx`
**改动**:
- 移除页面内部的自定义 header（由 Layout 统一提供）
- Hero 区域保持 Feature Card 但更新配色为设计稿风格
- 使用设计稿的 button/badge/card 样式 token
- 保持所有现有功能：搜索、历史列表、删除/导出/重新运行

**优先级**: P1

### 3.7 Create 页面样式更新

**文件**: `src/pages/Create.tsx`
**改动**:
- 表单卡片使用 `rounded-2xl border border-g200 bg-white p-6` 风格
- 输入框/选择框使用设计稿的 focus ring（`focus:ring-2 focus:ring-p500` / `focus:border-p500`）
- 按钮样式的紫色统一为 `bg-p600 hover:bg-p700`
- 底部固定提交栏保持但更新配色
- 表格风格（角色列表）按设计稿统一
- 保持所有现有表单逻辑和功能

**优先级**: P1

### 3.8 Result 页面样式更新

**文件**: `src/pages/Result.tsx`
**改动**:
- 主题卡片用设计稿紫色渐变风格
- 角色摘要卡片用 `bg-white border rounded-2xl` + 圆角色点
- 轮次标题用紫色圆标
- 总结区域用 `bg-gradient-to-r from-amber-50 to-orange-50`
- 底部按钮用 `bg-p600` 风格
- 保持现有的复制/继续讨论/新讨论功能

**优先级**: P1

### 3.9 Settings 页面样式更新

**文件**: `src/pages/Settings.tsx`
**改动**:
- 使用设计稿的设置卡片风格（`.stng-group`, `.stng-label`, `.stng-input`, `.stng-select`, `.stng-toggle`）
- 厂商卡片用 `rounded-2xl border border-g200 p-5 hover:border-p200`
- 保持所有现有功能：添加/测试/删除厂商、预设选择、显示 Key、数据目录

**优先级**: P1

### 3.10 子组件样式更新

**文件**: 以下组件进行样式微调以符合设计系统

| 文件 | 改动内容 | 优先级 |
|------|---------|--------|
| `src/components/WhisperPanel.tsx` | Tab 样式、整体风格一致化 | P1 |
| `src/components/RoundIndicator.tsx` | 进度条颜色 `bg-p500`、数字圈 `bg-p100 text-p700` | P1 |
| `src/components/OneOnOneTab.tsx` | 联系人列表样式、消息气泡使用 `.msg--whisper` 风格 | P1 |
| `src/components/GroupTab.tsx` | 群组列表、消息气泡统一风格 | P1 |
| `src/components/CreateGroupDialog.tsx` | Modal 使用设计稿 `.interject-modal` 风格 | P1 |
| `src/components/Toast.tsx` | Toast 样式基本符合设计（白色背景+圆角），微调 shadow 和 spacing | P2 |
| `src/components/ErrorBoundary.tsx` | 错误页面使用 `bg-p600` 按钮 | P2 |
| `src/components/CharacterForm.tsx` | 目前 Create 页面已内联表单，此组件可能未被使用，确认后更新 | P2 |

### 3.11 index.css 动画保留

**文件**: `src/index.css`
**改动**: 保留 Toast 滑入动画 `slide-in-right`，新增设计稿所需的过渡效果：

```css
@keyframes slide-in-right { /* 保留 */ }
```

**优先级**: P2

---

## 4. 改造范围总表

| # | 文件 | 改动类型 | 优先级 | 预计行数影响 |
|---|------|---------|--------|------------|
| 1 | `src/index.css` | 重写 - 替换为 `@theme` 定义 | P0 | ~60 行 |
| 2 | `src/components/Layout.tsx` | 重写 - 新增 Sidebar + TopBar | P0 | ~200 行 |
| 3 | `src/pages/Discussion.tsx` | 重写布局 - 三栏→双栏 | P0 | ~400 行 |
| 4 | `src/components/MessageBubble.tsx` | 重写样式 | P0 | ~80 行 |
| 5 | `src/pages/Home.tsx` | 样式更新 | P1 | ~100 行 |
| 6 | `src/pages/Create.tsx` | 样式更新 | P1 | ~200 行 |
| 7 | `src/pages/Result.tsx` | 样式更新 | P1 | ~100 行 |
| 8 | `src/pages/Settings.tsx` | 样式更新 | P1 | ~100 行 |
| 9 | `src/components/RightPanel.tsx` (新增) | 新增组件 | P0 | ~80 行 |
| 10 | `src/components/WhisperPanel.tsx` | 样式微调 | P1 | ~20 行 |
| 11 | `src/components/RoundIndicator.tsx` | 样式微调 | P1 | ~20 行 |
| 12 | `src/components/OneOnOneTab.tsx` | 样式更新 | P1 | ~30 行 |
| 13 | `src/components/GroupTab.tsx` | 样式更新 | P1 | ~30 行 |
| 14 | `src/components/CreateGroupDialog.tsx` | 样式微调 | P1 | ~20 行 |
| 15 | `src/components/Toast.tsx` | 样式微调 | P2 | ~10 行 |
| 16 | `src/components/ErrorBoundary.tsx` | 样式微调 | P2 | ~10 行 |
| 17 | `src/components/CharacterForm.tsx` | 确认是否需要 | P2 | ~10 行 |

**注意**: hooks (`useDiscussion.ts`, `useWhisper.ts`) 和 lib 目录下的逻辑文件**不需要**任何改动。

---

## 5. 实施建议

### 实施顺序

1. **Phase 1 (P0)** — 基础框架
   - (1) `index.css` → 定义 `@theme` token
   - (2) `Layout.tsx` → 重写为 Sidebar + TopBar 结构
   - (5) 新增 `RightPanel.tsx`（可选）或 Discussion 内联
   
2. **Phase 2 (P0)** — 核心页面
   - (3) `Discussion.tsx` → 布局和消息区域重写
   - (4) `MessageBubble.tsx` → 新气泡样式

3. **Phase 3 (P1)** — 其他页面
   - (6) `Home.tsx`
   - (7) `Create.tsx`
   - (8) `Result.tsx`
   - (9) `Settings.tsx`
   - 子组件样式更新

4. **Phase 4 (P2)** — 润色
   - 剩余小组件样式微调
   - 动画和过渡效果审查

### 注意事项

- **不要修改** `src/lib/` 和 `src/hooks/` 下的逻辑代码
- **不要修改** `src/types/` 类型定义
- **不要修改** `src/main.tsx` 和 `src/App.tsx` 的路由结构
- 所有样式使用 Tailwind 类名 + `@theme` token，避免内联 style
- Sidebar 导航高亮基于当前 React Router 路径（使用 `useLocation`），而非手动 class 切换
- 设计稿中的 `dp-overlay`（辩论/剧本杀/知识竞赛等深度模式页面）目前仅为视觉演示，对应的 React 页面尚未实现，**暂不实现**，只保留主页面改造

---

## 6. Open Questions / 待确认问题

1. **Sidebar 导航项匹配** — 设计稿中有"深度模式"子菜单（辩论赛、剧本杀、自由讨论、知识竞赛、最新动态），这些功能在现有 React 项目中尚未实现路由。**方案**: 暂时隐藏这些导航项，或保留但禁用（不可点击），等后续功能开发时再启用。

2. **Right Panel 的 Tab 切换逻辑** — 设计稿中暂停时自动切换到私密 Tab，与现有代码中的 `useEffect` 逻辑一致。确认是否保留现有行为（`whisperTabActive` state）即可。

3. **Result 页面的位置** — 设计稿中没有 Result 页面（为当前项目独有），需要以设计稿风格自由设计，使用相同的 token 系统。

4. **Settings 页面的位置** — 设计稿中 Settings 以 Overlay 形式展现。**方案**: 保持现有独立路由页面 `/settings` 不变，但要使用设计稿的设置表单样式。

5. **响应式行为** — 设计稿假定 `overflow:hidden; height:100vh` 桌面全屏。当前项目为 Electron 桌面应用，需确认是否需要适配小屏幕或窗口缩放。**方案**: 保持桌面优先，暂不处理 mobile 响应式。

6. **CharacterForm 组件的使用** — `src/components/CharacterForm.tsx` 存在但 Create 页面使用的是内联表单。需确认此组件是否在项目中被实际引用。如果未被使用，可以跳过其改造或直接删除。

7. **设计稿中 Overlay 类页面的处理** — 设计稿的 `dp-overlay`（辩论赛、剧本杀等深度模式）当前项目不存在。建议在 Sidebar 中保留这些导航项但置灰/隐藏，以免用户困惑。
