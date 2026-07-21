import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Space, Tag } from 'antd';
import {
  HomeOutlined, BookOutlined, EditOutlined, BulbOutlined, SettingOutlined,
  ThunderboltOutlined, FireOutlined, StarOutlined, HeartOutlined, BarChartOutlined,
  SnippetsOutlined, TrophyOutlined, AuditOutlined, ReadOutlined, RobotOutlined,
} from '@ant-design/icons';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { invoke } from './api/ipc';
import { KEEP_ALIVE_PATHS, getKeepAlivePath, type KeepAlivePath } from './utils/keepAliveRoutes';
import OpeningCurtain from './components/OpeningCurtain';

import Dashboard from './pages/Dashboard';
import LearningAgent from './pages/LearningAgent';
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
  { key: '/agent', icon: <RobotOutlined />, label: <Link to="/agent">学习智能助手</Link> },
  { key: '/articles', icon: <BookOutlined />, label: <Link to="/articles">文章管理</Link> },
  { key: '/questions', icon: <EditOutlined />, label: <Link to="/questions">题目管理</Link> },
  { key: '/ai-generate', icon: <BulbOutlined />, label: <Link to="/ai-generate">AI 出题</Link> },
  { key: '/weak-points', icon: <AuditOutlined />, label: <Link to="/weak-points">易错点</Link> },
  { key: '/train', icon: <ThunderboltOutlined />, label: <Link to="/train">普通训练</Link> },
  { key: '/creative-recite', icon: <ReadOutlined />, label: <Link to="/creative-recite">创新背诵</Link> },
  { key: '/rogue', icon: <FireOutlined />, label: <Link to="/rogue">闯关副本</Link> },
  { key: '/favorites', icon: <StarOutlined />, label: <Link to="/favorites">收藏夹</Link> },
  { key: '/wrong', icon: <SnippetsOutlined />, label: <Link to="/wrong">错题本</Link> },
  { key: '/rankings', icon: <BarChartOutlined />, label: <Link to="/rankings">排行榜</Link> },
  { key: '/api', icon: <SettingOutlined />, label: <Link to="/api">AI 服务配置</Link> },
];

const KEEP_ALIVE_COMPONENTS: Record<KeepAlivePath, JSX.Element> = {
  '/': <Dashboard />,
  '/agent': <LearningAgent />,
  '/articles': <ArticleList />,
  '/questions': <QuestionList />,
  '/ai-generate': <AiGenerate />,
  '/weak-points': <WeakPointList />,
  '/train': <Train />,
  '/creative-recite': <CreativeRecite />,
  '/rogue': <RogueGenerate />,
  '/favorites': <Favorites />,
  '/wrong': <WrongBook />,
  '/rankings': <Rankings />,
  '/api': <ApiConfig />,
};

export default function App() {
  const location = useLocation();
  const [activeProvider, setActiveProvider] = useState<any>(null);
  const [showOpeningCurtain, setShowOpeningCurtain] = useState(true);

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
  const activeKeepAlivePath = getKeepAlivePath(location.pathname);
  const [mountedKeepAlivePaths, setMountedKeepAlivePaths] = useState<KeepAlivePath[]>(
    () => activeKeepAlivePath ? [activeKeepAlivePath] : [],
  );

  useEffect(() => {
    if (!activeKeepAlivePath) return;
    setMountedKeepAlivePaths((paths) => (
      paths.includes(activeKeepAlivePath) ? paths : [...paths, activeKeepAlivePath]
    ));
  }, [activeKeepAlivePath]);

  return (
    <>
      <Layout className="app-shell">
        <Sider width={220} theme="light" className="app-sidebar">
          <div className="app-brand">
            <Typography.Title level={4} className="serif app-brand__title">
              <HeartOutlined className="app-brand__icon" />
              古诗文背诵闯关
            </Typography.Title>
            <Typography.Text type="secondary" className="app-brand__subtitle">
              桌面版 · 本地优先
            </Typography.Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selected]}
            items={MENU}
          />
        </Sider>
        <Layout className="app-main-shell">
          <Header className="app-header">
            <Space size="middle">
              <TrophyOutlined className="app-header__trophy" />
              <Typography.Text strong className="app-header__title">高中古诗文背诵闯关系统</Typography.Text>
              {activeProvider ? (
                <Tag color="purple">当前 AI: {activeProvider.name}</Tag>
              ) : (
                <Tag color="default">未配置 AI</Tag>
              )}
            </Space>
          </Header>
          <Content className="app-content">
            {KEEP_ALIVE_PATHS.filter((path) => mountedKeepAlivePaths.includes(path)).map((path) => (
              <div
                key={path}
                className="app-content-scroll"
                style={{ display: activeKeepAlivePath === path ? 'block' : 'none' }}
              >
                {KEEP_ALIVE_COMPONENTS[path]}
              </div>
            ))}
            {!activeKeepAlivePath ? (
              <div className="app-content-scroll">
                <Routes>
                  <Route path="/articles/new" element={<ArticleEditor />} />
                  <Route path="/articles/:id" element={<ArticleEditor />} />
                  <Route path="/weak-points/new" element={<WeakPointEditor />} />
                  <Route path="/weak-points/:id" element={<WeakPointEditor />} />
                  <Route path="/rogue/:dungeonId" element={<RogueDetail />} />
                  <Route path="/rogue/play/:dungeonId" element={<RoguePlay />} />
                  <Route path="/result/:runId" element={<Result />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            ) : null}
          </Content>
        </Layout>
      </Layout>
      {showOpeningCurtain ? (
        <OpeningCurtain onComplete={() => setShowOpeningCurtain(false)} />
      ) : null}
    </>
  );
}
