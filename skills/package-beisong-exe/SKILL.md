---
name: package-beisong-exe
description: 为 Beisong Electron 项目构建并验证 Windows EXE。用于用户要求打包、重新打包、生成安装版、生成便携版、检查 win-unpacked、定位 release 产物，或排查打包后闪退、ERR_FILE_NOT_FOUND、ffmpeg.dll 缺失和 better-sqlite3 ABI 问题时。
---

# 打包 Beisong Windows EXE

## 目标

从当前 Beisong 源码生成 Windows 安装版、便携版和 `win-unpacked` 调试目录，并在交付前验证关键运行文件。以项目当前 `package.json` 为准，不依赖历史文件名。

## 执行流程

1. 优先使用当前工作区；只有当前目录不是 Beisong 项目时，才尝试 `D:\gitClone\Beisong`。
2. 检查 `git status --short`、`package.json`、Node、npm 和 `node_modules`。保留用户的所有未提交改动；不要运行清理、重置或递归删除命令。
3. 如依赖缺失，先检查锁文件并报告。当前仓库没有锁文件，取得同意后只能运行 `npm install`，同时说明依赖版本可能漂移；不要自行升级 Electron、electron-builder 或 better-sqlite3。
4. 默认运行本技能的脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "<技能目录>\scripts\package_beisong.ps1" -ProjectPath "D:\gitClone\Beisong"
```

5. 只需要 `win-unpacked` 调试目录时使用 `-DirectoryOnly`。只检查已有产物时使用 `-VerifyOnly`。只有用户明确允许跳过检查时才使用 `-SkipTests`。
6. 脚本成功后，根据 `package.json` 报告安装版和便携版的绝对路径、大小、修改时间和 SHA-256。
7. 用户要求上传、提交或发布时，另行核对 Git 状态和远端并取得授权；打包请求本身不授权 Git 提交、推送或上传。

## 验证标准

只有同时满足以下条件才报告打包成功：

- `npm run pack` 或 `npm run pack:dir` 返回 0。
- `release\win-unpacked\resources\app.asar`、`ffmpeg.dll` 和主程序 EXE 存在且非空。
- `app.asar` 包含 `dist/index.html`、Electron 主进程、preload 和内置文章数据，且不含 `.env` 或本机数据库。
- 便携版 EXE 内部包含 `ffmpeg.dll`、`resources/app.asar` 和 better-sqlite3 原生模块，并且内嵌 `app.asar` 与 `win-unpacked` 中的版本大小、CRC 一致。
- `scripts/test-packaged-load-path.cjs` 通过，确保生产入口从 `app.getAppPath()` 解析。
- 可用时，用 Electron 运行 `scripts/smoke-electron-builtin-articles.cjs`，验证编译产物和 better-sqlite3 ABI。
- 完整打包时，`package.json` 配置的 NSIS 安装版和 portable 便携版均存在。

Vite 的大分块提示、CJS API 弃用提示和未签名提示在退出码为 0 时属于警告，不等同于打包失败。
隔离冒烟测试偶尔会打印 `os_crypt_win.cc Failed to decrypt`；若测试最终退出码为 0，可作为旧机器加密状态警告处理。API Key 不应随包迁移，新电脑仍需重新填写。

## 交付区别

- **便携版 EXE**：单文件交付，适合直接复制到新电脑。
- **安装版 EXE**：运行安装向导，适合长期使用。
- **win-unpacked**：调试目录。必须完整复制整个文件夹，不能只复制其中的主程序 EXE；否则新电脑会提示缺少 `ffmpeg.dll` 或其他资源。

只交付 `package.json` 当前 `artifactName` 对应的文件。`release` 中可能残留旧版本或历史英文别名；不要按目录中第一个 EXE 猜测，也不要擅自删除旧文件。

不要把 `%LOCALAPPDATA%\beisong\data\beisong.db`、真实 API Key、`.env` 或其他用户数据塞进安装包。

## 失败处理

- **找不到 ffmpeg.dll**：先确认用户拿到的是 release 根目录的便携版 EXE；若使用 `win-unpacked`，必须保留完整目录。
- **ERR_FILE_NOT_FOUND / 白屏 / 闪退**：运行 `node scripts/test-packaged-load-path.cjs`，检查 `electron/main.ts` 是否从 `app.getAppPath()` 加载 `dist/index.html`。
- **better-sqlite3 NODE_MODULE_VERSION/ABI 错误**：让 electron-builder 重新构建原生模块；用 Electron 而不是系统 Node 执行 ABI 冒烟测试。
- **release 文件被占用**：检查是否仍有本次应用进程运行；不要擅自终止不属于本次任务的进程。
- **Electron/NSIS 下载失败**：如网络受限，按环境要求申请网络权限后重试；不要把旧产物冒充本次成功结果。
- **便携版仍无法启动**：先运行 `win-unpacked` 中的完整应用进行诊断，记录终端中的 preload、数据库路径和 renderer 加载错误，再定位真实失败点。
