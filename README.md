# 高中古诗文背诵闯关系统 — 桌面版

一个本地优先的桌面软件,帮助你高效背诵、训练、闯关高中古诗文。
**Qwen / MiniMax / Kimi / DeepSeek** 等多家 AI 服务商统一接入,SQLite 本地存储,无需登录即可使用。

## 核心功能

- **文章管理**:增删改查、AI 结构化(段落 / 句子 / 关键词)、手动或 AI 拆分
- **AI 出题**:选择题、挖空题、文脉挖空、文脉默写、纯默写、排序题;星级 1—5
- **即时判题 + 错因解释**:AI 评分 + 错误类型分析(同音 / 形近 / 近义 / 漏句 / 错序 …)
- **老师易错点**:管理错点、启停、AI 专项生题、易错点排名
- **Rogue 闯关**:1—5 星副本、AI 动态生成路线、安全/普通/危险/精英/休息/Boss 房间
- **血量 + 道具 + 星级评价**:扣血规则按错误类型和题目星级动态调整
- **收藏与统计**:单题收藏、整套副本收藏、文章 / 题型 / 易错点排行榜
- **错题本**:自动记录错误,可标记掌握 / 重新加入训练
- **离线优先**:不联网也能打开软件、查看已有内容、做已保存副本

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面壳 | Electron 32 |
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 |
| 状态 | React Hooks (轻量) |
| 路由 | React Router 6 |
| 数据库 | better-sqlite3 (本地 SQLite) |
| AI | OpenAI 兼容 Chat Completions(Qwen / MiniMax / Kimi / DeepSeek) |
| 打包 | electron-builder (Windows NSIS + portable) |

## 项目结构

```
Beisong/
├─ electron/             # Electron 主进程
│  ├─ main.ts
│  ├─ preload.ts
│  └─ tsconfig.json
├─ src-server/           # 后端逻辑(主进程执行)
│  ├─ ai/                # AI 服务层 + 4 家厂商适配
│  ├─ db/                # SQLite schema + helpers
│  ├─ services/          # 业务服务(article/question/weakPoint/rogue/...)
│  └─ ipc/handlers.ts    # IPC 路由
├─ src/                  # React 前端
│  ├─ pages/             # 14 个页面
│  ├─ api/ipc.ts         # IPC 客户端
│  └─ App.tsx            # 路由
├─ scripts/dev.cjs       # 同时启动 Vite + Electron
├─ package.json
├─ vite.config.ts
└─ tsconfig.json
```

## 快速开始

### 前置环境

- Node.js >= 18 (推荐 20 LTS)
- Windows 10/11 (macOS / Linux 也可,本项目主要验证 Windows)
- npm 或 pnpm 或 yarn

### 安装依赖

```powershell
# Windows PowerShell
npm install
```

> 注: `better-sqlite3` 在 Windows 上需要 C++ 编译工具链。如果遇到编译错误,
> 请安装 [Visual Studio Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe) (含 "Desktop development with C++") 后重试。

### 开发模式

```powershell
npm run dev
```

Vite 启动后,等待 `http://localhost:5173` 可访问,Electron 自动加载该 URL 并打开窗口。

### 打包 EXE

```powershell
npm run pack
```

打包完成后,产物在 `release/` 目录下:

- `古诗文背诵闯关 Setup x.y.z.exe` —— NSIS 安装包
- `古诗文背诵闯关 x.y.z.exe` —— 单文件便携版

## 配置 AI

启动后,左侧菜单进入 **API 配置**,点击「新增 Provider」:

1. 厂商选择 **MiniMax** (或 Qwen / Kimi / DeepSeek)
2. 填入 API Key
3. 填入 Base URL(默认已填,可不动)
4. 填入默认模型(如 `MiniMax-M2`)
5. 保存后点击「激活」+「测试连接」

> API Key 在本地以 **AES-256-GCM** 加密存储,密钥由设备信息派生,不出设备。

## MVP 进度

按需求文档的 10 步开发顺序,本仓库当前已完成:

- [x] **Step 1** 本地文章管理(CRUD + 段落结构 + AI 结构化)
- [x] **Step 2** API 配置管理(cc-switch 风格,Key 加密)
- [x] **Step 3** AI 出题(选择/挖空/文脉/纯默写)
- [x] **Step 4** 基础训练页(填写—判题—反馈闭环)
- [x] **Step 5** 老师易错点管理(CRUD + 启停 + AI 专项生题 + 排名)
- [x] **Step 6** 错题本 + 单题收藏
- [x] **Step 7** Rogue 基础副本(房间/血量/Boss/扣血)
- [x] **Step 8** AI 动态副本生成(星级/范围/类型/易错点加权)
- [x] **Step 9** 收藏整套副本 + 排行榜
- [x] **Step 10** Electron 打包配置(electron-builder)

## 数据存储位置

- 开发模式: `C:\Users\<you>\AppData\Roaming\古诗文背诵闯关\data\beisong.db`
- 打包后: 同上路径(用户目录,不污染安装目录)

可以通过「API 配置」页右上角的 `打开数据目录` 按钮访问。

## 已知限制

- **AI 模型依赖**:除本地 CRUD / 训练 / Rogue 等离线功能外,所有 AI 能力(出题 / 判题 / 解释 / 动态副本)依赖你配置的 API Key。
- **数据库**:首次启动自动建表;若需迁移旧版本,自行 `sqlite3 beisong.db .dump`。
- **样式**:UI 已尽量对齐「古典书卷」气质,但不同分辨率下个别细节可能不一致。

## 开发指南

### 后端开发

- `src-server/ai/` 新增厂商:实现一个继承 `OpenAICompatibleProvider` 的类,在 `registry.ts` 注册。
- `src-server/services/` 新增业务:在 `ipc/handlers.ts` 中注册 IPC channel。

### 前端开发

- `src/pages/` 一个页面一个文件;新增页面后在 `App.tsx` 注册路由。
- IPC 调用一律走 `src/api/ipc.ts` 的 `invoke<T>(channel, payload)`。

### 添加新的 Prompt

修改 `src-server/ai/prompts.ts`,新增 `buildXxxUserPrompt` 函数。

## License

MIT