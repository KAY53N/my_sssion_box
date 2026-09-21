# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

Session Switcher 是一个跨浏览器扩展（Chrome、Firefox、Edge），通过保存和恢复 cookies 来管理每个网站的多个登录会话。用户可以在同一域名下的不同账户之间切换，无需手动登录/登出。

## 构建系统

**运行时：** 所有命令都需要 Bun。

**构建命令：**
```bash
# 开发模式（热重载）
bun run dev:firefox    # 为 Firefox 构建并使用 web-ext 启动
bun run dev:chrome     # 为 Chrome 构建并使用 web-ext 启动

# 生产构建
bun run build:firefox  # 为 Firefox 创建 dist/ 目录
bun run build:chrome   # 为 Chrome 创建 dist/ 目录

# 代码质量
bun run lint           # 自动修复 lint 问题
bun run lint:check     # 仅检查不修复
bun run format         # 使用 Prettier 格式化代码
bun run format:check   # 检查格式但不修改

# 工具
bun run clean          # 删除 dist/ 目录
```

**构建流程：**
- 使用 esbuild 编译 TypeScript（参见 `esbuild.config.js`）
- 两个入口点：`src/background/index.ts` → `dist/background/index.js` 和 `src/popup/index.ts` → `dist/popup/index.js`
- 将浏览器特定的 manifest 从 `src/manifest.firefox.json` 或 `src/manifest.chrome.json` 复制到 `dist/manifest.json`
- 将 Popup 的 HTML/CSS 文件从 `src/popup/` 复制到 `dist/popup/`
- 将资源文件从 `src/assets/` 复制到 `dist/assets/`

## 代码架构

### 双组件结构

1. **后台脚本** (`src/background/`)
   - 持久运行的 Service Worker
   - 处理所有 Chrome API 操作（cookies、storage、tabs）
   - 通过 `chrome.runtime.onMessage` 接收来自 popup 的消息
   - 入口点：`src/background/index.ts`
   - 消息处理：`services/message.service.ts` 路由到各个 handler

2. **Popup 界面** (`src/popup/`)
   - 浏览器扩展弹出窗口界面
   - 通过 `chrome.runtime.sendMessage` 与后台脚本通信
   - 入口点：`src/popup/index.ts`（PopupController 类）
   - 基于组件的架构：`components/sessionList.ts`、`components/modalManager.ts` 等

### 基于消息的通信

Popup 和后台脚本通过 `src/shared/types/message.types.ts` 中定义的类型化消息进行通信：
- `getCurrentSession`：获取当前域名的 cookies
- `switchSession`：将保存的会话 cookies 应用到当前标签页
- `clearSession`：删除 cookies 以创建新会话

所有消息遵循以下模式：
```typescript
interface BaseMessage { action: string }
interface MessageResponse<T> { success: boolean; data?: T; error?: string }
```

### 路径别名

TypeScript 路径别名在 `tsconfig.json` 中配置：
- `@background/*` → `src/background/*`
- `@popup/*` → `src/popup/*`
- `@shared/*` → `src/shared/*`

**重要：** esbuild 原生不支持路径别名。如果添加新别名，必须更新 `esbuild.config.js` 以正确配置打包。

### 数据存储

会话存储在 `chrome.storage.local` 中，使用两个键（定义在 `src/shared/constants/storageKeys.ts`）：
- `sessions`：所有已保存会话及其元数据的数组
- `activeSessions`：`域名 → sessionId` 的映射，追踪每个域名当前激活的会话

会话数据结构（`src/shared/types/session.types.ts`）：
```typescript
interface SessionData {
  id: string;
  name: string;
  domain: string;
  cookies: chrome.cookies.Cookie[];
  createdAt: number;
  updatedAt: number;
}
```

### 核心服务

- **后台脚本：**
  - `services/message.service.ts`：路由传入消息到相应的 handler
  - `services/storageData.service.ts`：集中化的存储操作
  - `handlers/session.handler.ts`：会话 CRUD 操作
  - `handlers/cookie.handler.ts`：Cookie 获取/设置/清除操作

- **Popup：**
  - `services/popup.service.ts`：Popup 的业务逻辑（状态管理、会话操作）
  - `services/chromeApi.service.ts`：chrome.runtime.sendMessage 的封装
  - `components/sessionList.ts`：渲染会话列表及激活状态指示器

## 代码风格

**Linting：** ESLint 配合 TypeScript 插件强制执行：
- 字符串使用双引号
- 必须使用分号
- 2 空格缩进
- 导入排序（按字母顺序，按类型分组）
- 未使用的变量必须以 `_` 开头

**格式化：** Prettier 配合 multiline-arrays 插件

## 浏览器兼容性

该扩展支持 Firefox 和基于 Chromium 的浏览器（Chrome、Edge）。主要差异：
- Firefox 使用 Manifest V2，Chrome 使用 V3（使用单独的 manifest 文件）
- 构建脚本根据目标在构建时选择正确的 manifest
- TypeScript 类型包含 `@types/chrome` 和 `@types/firefox-webext-browser`

## 本地测试扩展

构建后，加载未打包的扩展：
- **Chrome/Edge：** 导航到 `chrome://extensions/`，启用开发者模式，点击"加载已解压的扩展程序"，选择 `dist/` 目录
- **Firefox：** 导航到 `about:debugging`，点击"此 Firefox" → "临时载入附加组件"，选择 `dist/manifest.json`

或使用 `bun run dev:firefox` 或 `bun run dev:chrome` 通过 web-ext 自动构建和启动。
