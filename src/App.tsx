import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Space, Tag } from 'antd';
import {
  HomeOutlined, BookOutlined, EditOutlined, BulbOutlined, SettingOutlined,
  ThunderboltOutlined, FireOutlined, StarOutlined, HeartOutlined, BarChartOutlined,
  SnippetsOutlined, TrophyOutlined, AuditOutlined, ReadOutlined,
} from '@ant-design/icons';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { invoke } from './api/ipc';

import Dashboard from './pages/Dashboard';
import ArticleList from './pages/ArticleList';
import ArticleEditor from './pages/ArticleEditor';
import ApiConfig from './pages/ApiConfig';
import QuestionList from './pages/QuestionList';
import AiGenerate from './pages/AiGenerate';
import WeakPointList from './pages/WeakPointList';
import WeakPointEditor from './pages/WeakPointEditor';
import Train from './pages/Train';
import CreativeRecite from './pages/CreativeRecite';
import RogueGenerate from './pages/RogueGenerate';
import RoguePlay from './pages/RoguePlay';
import RogueDetail from './pages/RogueDetail';
import Result from './pages/Result';
import Favorites from './pages/Favorites';
import WrongBook from './pages/WrongBook';
import Rankings from './pages/Rankings';

const { Sider, Content, Header } = Layout;

const MENU = [
  { key: '/', icon: <HomeOutlined />, label: <Link to="/">仪表盘</Link> },
  { key: '/articles', icon: <BookOutlined />, label: <Link to="/articles">文章管理</Link> },
  { key: '/questions', icon: <EditOutlined />, label: <Link to="/questions">题目管理</Link> },
  { key: '/ai-generate', icon: <BulbOutlined />, label: <Link to="/ai-generate">AI 出题</Link> },
  { key: '/weak-points', icon: <AuditOutlined />, label: <Link to="/weak-points">易错点</Link> },
  { key: '/train', icon: <ThunderboltOutlined />, label: <Link to="/train">普通训练</Link> },
  { key: '/creative-recite', icon: <ReadOutlined />, label: <Link to="/creative-recite">创新背诵</Link> },
  { key: '/rogue', icon: <FireOutlined />, label: <Link to="/rogue">Rogue 副本</Link> },
  { key: '/favorites', icon: <StarOutlined />, label: <Link to="/favorites">收藏夹</Link> },
  { key: '/wrong', icon: <SnippetsOutlined />, label: <Link to="/wrong">错题本</Link> },
  { key: '/rankings', icon: <BarChartOutlined />, label: <Link to="/rankings">排行榜</Link> },
  { key: '/api', icon: <SettingOutlined />, label: <Link to="/api">API 配置</Link> },
];

export default function App() {
  const location = useLocation();
  const [activeProvider, setActiveProvider] = useState<any>(null);

  const refreshActiveProvider = () => {
    invoke('dashboard:summary').then((s: any) => setActiveProvider(s.activeProvider)).catch(() => {});
  };

  useEffect(() => {
    refreshActiveProvider();
    window.addEventListener('beisong:provider-changed', refreshActiveProvider);
    return () => window.removeEventListener('beisong:provider-changed', refreshActiveProvider);
  }, []);

  const selected = MENU.find((m) => location.pathname === m.key)?.key
    || MENU.find((m) => location.pathname.startsWith(m.key) && m.key !== '/')?.key
    || '/';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="light" style={{ borderRight: '1px solid #ece9f6' }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #ece9f6' }}>
          <Typography.Title level={4} style={{ margin: 0, color: '#5d3fd3' }} className="serif">
            <HeartOutlined style={{ marginRight: 8 }} />
            古诗文背诵闯关
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            桌面版 · 本地优先
          </Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={MENU}
          style={{ borderRight: 0, paddingTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #ece9f6', padding: '0 24px' }}>
          <Space size="middle">
            <TrophyOutlined style={{ color: '#fa8c16', fontSize: 18 }} />
            <Typography.Text strong style={{ fontSize: 16 }}>高中古诗文背诵闯关系统</Typography.Text>
            {activeProvider ? (
              <Tag color="purple">当前 AI: {activeProvider.name}</Tag>
            ) : (
              <Tag color="default">未配置 AI</Tag>
            )}
          </Space>
        </Header>
        <Content style={{ padding: 24, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/articles" element={<ArticleList />} />
            <Route path="/articles/new" element={<ArticleEditor />} />
            <Route path="/articles/:id" element={<ArticleEditor />} />
            <Route path="/questions" element={<QuestionList />} />
            <Route path="/ai-generate" element={<AiGenerate />} />
            <Route path="/weak-points" element={<WeakPointList />} />
            <Route path="/weak-points/new" element={<WeakPointEditor />} />
            <Route path="/weak-points/:id" element={<WeakPointEditor />} />
            <Route path="/train" element={<Train />} />
            <Route path="/creative-recite" element={<CreativeRecite />} />
            <Route path="/rogue" element={<RogueGenerate />} />
            <Route path="/rogue/:dungeonId" element={<RogueDetail />} />
            <Route path="/rogue/play/:dungeonId" element={<RoguePlay />} />
            <Route path="/result/:runId" element={<Result />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/wrong" element={<WrongBook />} />
            <Route path="/rankings" element={<Rankings />} />
            <Route path="/api" element={<ApiConfig />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
