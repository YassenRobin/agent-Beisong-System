import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/global.css';

// 启动诊断:确认 React 应用运行时的实际环境
console.log('[beisong:renderer] boot. typeof window.beisong=', typeof window.beisong,
  'has=', !!window.beisong, 'isInIframe=', window.parent !== window);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#7d2b20',
          colorInfo: '#7d2b20',
          colorSuccess: '#5e7258',
          colorWarning: '#b67a22',
          colorError: '#9c3d32',
          colorText: '#2b2119',
          colorTextSecondary: '#716457',
          colorBgLayout: '#eee4d0',
          colorBgContainer: '#fffaf0',
          colorBorder: '#d8c8aa',
          colorBorderSecondary: '#e6dac2',
          colorFillAlter: '#f4ead6',
          borderRadius: 8,
          fontFamily: '"Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntdApp>
        <HashRouter>
          <App />
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
