# 🎨 AI 圆桌模拟器 — UI 设计交付报告

> 日期：2026-07-01 | 设计师：像素君

---

## 📋 组件交付总结

| 组件 | 交付状态 | 变更说明 |
|------|---------|---------|
| **GroupTab.tsx** | ✅ **完整实现** | P1 占位 → 完整群聊 UI |
| **CreateGroupDialog.tsx** | ✅ **完整实现** | 空组件 → 完整建群弹窗 |
| **WhisperPanel.tsx** | ✅ **增强** | 接入 CreateGroupDialog |
| **OneOnOneTab.tsx** | ✅ **微调** | 空状态 UI 升级、发送按钮渐变 |
| **MessageBubble.tsx** | ✅ **微调** | 私密消息 🔒 标签样式优化 |
| **Discussion.tsx** | ✅ **微调** | 右侧面板 224px → 256px |

---

## 🧱 新增 / 修改组件详情

### 1. `GroupTab.tsx` — 群聊视图（完整实现）

**布局结构**：
```
┌──────────────────────────────────┐
│  群列表 (w-28)   │  对话区          │
│  ┌──────────────┐ │  ┌───────────┐ │
│  │ + 创建群组    │ │  │ 群头標    │ │
│  │ ● 策略组 3人  │ │  │ 消息流    │ │
│  │ ● 吃瓜群 5人  │ │  │ 消息流    │ │
│  └──────────────┘ │  ├───────────┤ │
│                    │  │ 输入框[发送]│ │
│                    │  └───────────┘ │
└──────────────────────────────────┘
```

**视觉规范**：
- 群列表左侧 112px，选中态紫色左框 + 紫色背景
- 群卡片显示：渐变圆点 + 群名 + 成员数 + 发言顺序
- 群头显示群名 + 成员数量
- 主持人消息：紫色渐变气泡（右对齐）
- 角色消息：白底灰边框（左对齐）+ 角色名标注
- 输入框：暂停态禁用（灰底 + 提示文字）
- 空状态：萌系图标 + 引导文案 + 创建按钮

**空群列表状态**：图标 + "暂无群组" + "创建群组" 快捷按钮

---

### 2. `CreateGroupDialog.tsx` — 创建群弹窗（完整实现）

**弹窗结构**：
```
┌──────────────────────────────┐
│ [图标] 创建群组           [✕] │
├──────────────────────────────┤
│ 群组名称                      │
│ [输入框  placeholder]        │
│                              │
│ 选择成员（至少 2 人）         │
│ ┌──────────────────────────┐ │
│ │ ☐ 角色A   身份          │ │
│ │ ☑ 角色B   身份          │ │
│ │ ☐ 角色C   身份          │ │
│ └──────────────────────────┘ │
│                              │
│ 发言顺序                      │
│ [自由发言] [顺序发言] [指定]  │
│                              │
│ [错误提示（如有）]            │
├──────────────────────────────┤
│          [取消]  [创建群组]   │
└──────────────────────────────┘
```

**视觉规范**：
- 背景遮罩：黑 30% + backdrop-blur-sm
- 弹窗：白色 rounded-2xl + shadow-2xl + border
- 入场动画：scale-in 0.2s ease-out
- 成员选择：自定义 checkbox（紫色填充 + 白色勾）
- 选中态：紫色底
- 发言顺序：三选一按钮组，选中态紫色边框 + 紫色底 + shadow
- 创建按钮：紫色渐变 + loading 动画
- 错误提示：红底红字

---

### 3. `WhisperPanel.tsx` — 增强

**变更**：
- 新增 `createGroupOpen` 状态
- GroupTab 传入 `onCreateGroup` → 打开弹窗
- CreateGroupDialog 传入 `characters` + `createGroup`
- 创建成功后自动刷新加载

---

### 4. `OneOnOneTab.tsx` — 微调

**变更**：
- 空状态 UI 升级：加入图标装饰 + 引导文案"讨论暂停时可与角色秘密交流"
- 发送按钮：纯色 → 渐变 `from-purple-600 to-purple-700`

---

### 5. `MessageBubble.tsx` — 私密消息样式优化

**变更**：
- `🔒 私密消息` 标签：独立行 + 紫色字体
- 底部标注改为：紫色斜体 + 上分割线
- 视觉层次更清晰

---

## 🎨 统一视觉规范

### 颜色系统（继承项目）

| Token | 值 | 用途 |
|-------|---|------|
| `purple-50` | `#f5f3ff` | 选中态背景 |
| `purple-400` | `#a78bfa` | 装饰色 |
| `purple-500` | `#a855f7` | 默认紫色 |
| `purple-600` | `#9333ea` | 主要按钮 |
| `purple-700` | `#7e22ce` | 按钮 hover |
| `red-500` | `#ef4444` | 未读 Badge |
| `gray-50` | `#f9fafb` | 列表背景 |

### 渐变体系

群组采用了多色渐变圆点（for 视觉区分），OneOnOne 的发送按钮和群聊的发送按钮统一风格：

```
主持人消息：bg-gradient-to-br from-purple-500 to-purple-700（群聊）
主持人消息：bg-purple-50 border-purple-300 虚线（私信）
发送按钮：  bg-gradient-to-br from-purple-600 to-purple-700
```

### 空格间距

- 基准单位：8px（Tailwind spacing）
- 联系人/群列表项：py-2.5（20px）
- 输入框区域：p-3（24px）
- 消息间隔：space-y-3（12px）

---

## 🔗 对接的 Hook 接口

### `useWhisper()` — 全部按设计接入

| 方法/数据 | 使用组件 | 状态 |
|----------|---------|------|
| `whispers` | — | 预留 |
| `groups` | GroupTab | ✅ 群列表渲染 |
| `selectedGroupId` | GroupTab | ✅ 选中态跟踪 |
| `getGroupConversation()` | GroupTab | ✅ 消息流 |
| `sendGroupMessage()` | GroupTab | ✅ 发送 |
| `createGroup()` | CreateGroupDialog | ✅ 创建群 |
| `loadWhispers()` | WhisperPanel → CreateGroupDialog | ✅ 创建后刷新 |

---

## 🏷️ 验收清单

- [ ] GroupTab 群列表空状态正常渲染
- [ ] 创建群组按钮打开弹窗
- [ ] CreateGroupDialog 成员多选正常
- [ ] 发言顺序三选一切换正常
- [ ] 表单验证（空名称、少于 2 成员）正常提示
- [ ] 创建成功后自动关闭弹窗 + 刷新群列表
- [ ] 群聊消息发送正常
- [ ] 暂停态输入框禁用（私信 + 群聊均正常）
- [ ] OneOnOne 空状态图标文案正确
- [ ] 右侧面板宽度由 224px 变为 256px

---

## 📁 修改文件清单

```
✅ src/components/GroupTab.tsx          — P1 占位 → 完整实现
✅ src/components/CreateGroupDialog.tsx — 空组件 → 完整实现
✅ src/components/WhisperPanel.tsx      — 接入 CreateGroupDialog
✅ src/components/OneOnOneTab.tsx       — 空状态 + 按钮微调
✅ src/components/MessageBubble.tsx     — 私密消息样式优化
✅ src/pages/Discussion.tsx             — 右侧面板宽度扩展
```

---

*设计师签字：* **像素君**  ✅

*交付确认：* 2026-07-01
