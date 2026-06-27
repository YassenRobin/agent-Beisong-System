export function getBridgeUnavailableMessage(): string {
  if (typeof window === 'undefined') {
    return '当前环境没有 window，无法连接 Electron IPC。';
  }

  const userAgent = navigator.userAgent || '';
  if (!userAgent.includes('Electron')) {
    return '当前页面是在普通浏览器中打开的，Electron preload 不会注入。请关闭浏览器页面，在项目目录运行 npm run dev，并使用弹出的桌面应用窗口。';
  }

  return 'IPC 桥未就绪，preload 未注入。请完全退出应用后重新运行 npm run dev；如果仍然失败，请查看终端中的 [beisong] preload 日志。';
}
