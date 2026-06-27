import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Typography, List, Tag, Space, Empty, Button, message } from 'antd';
import { BookOutlined, EditOutlined, BulbOutlined, StarOutlined, FireOutlined, SnippetsOutlined, ApiOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { invoke } from '../api/ipc';

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    invoke('dashboard:summary').then(setSummary).catch((e) => {
      console.error('[Dashboard] summary failed:', e);
      setError(String(e?.message || e));
    });
    invoke('dashboard:recent-runs', { limit: 8 }).then(setRuns).catch((e) => {
      console.error('[Dashboard] runs failed:', e);
      setError(String(e?.message || e));
    });
  }, []);

  if (error) {
    return (
      <Card className="textbook-card" style={{ maxWidth: 720 }}>
        <Typography.Title level={4} type="danger">数据加载失败</Typography.Title>
        <Typography.Paragraph>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#fff1f0', padding: 12, borderRadius: 6 }}>
            {error}
          </pre>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          请尝试:1) 重启应用;2) 打开 DevTools (F12) 看 Console 红字;
          3) 如果显示「IPC 桥未就绪」,检查 electron/preload.ts 是否被加载。
        </Typography.Paragraph>
      </Card>
    );
  }

  if (!summary) return <Typography.Text type="secondary">加载中…</Typography.Text>;

  const items = [
    { icon: <BookOutlined />, title: '文章', value: summary.texts, color: '#5d3fd3', link: '/articles' },
    { icon: <EditOutlined />, title: '题目', value: summary.questions, color: '#1677ff', link: '/questions' },
    { icon: <BulbOutlined />, title: '易错点', value: summary.weakPoints, color: '#fa8c16', link: '/weak-points' },
    { icon: <StarOutlined />, title: '收藏', value: summary.favorites, color: '#eb2f96', link: '/favorites' },
    { icon: <FireOutlined />, title: '副本', value: summary.dungeons, color: '#f5222d', link: '/rogue' },
    { icon: <SnippetsOutlined />, title: '错题', value: summary.wrongItems, color: '#fa541c', link: '/wrong' },
    { icon: <ThunderboltOutlined />, title: '通关局数', value: summary.runs, color: '#13c2c2', link: '/rankings' },
    { icon: <ApiOutlined />, title: 'AI Provider', value: summary.providers, color: '#52c41a', link: '/api' },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>仪表盘</Typography.Title>

      <Row gutter={[16, 16]}>
        {items.map((it) => (
          <Col key={it.title} xs={12} sm={8} md={6} lg={6} xl={3}>
            <Link to={it.link}>
              <Card hoverable className="textbook-card">
                <Statistic
                  title={<Space>{it.icon}<span>{it.title}</span></Space>}
                  value={it.value}
                  valueStyle={{ color: it.color }}
                />
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="快速开始" className="textbook-card">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary">
                还没有配置 AI Provider?先到「API 配置」添加 Qwen / MiniMax / Kimi / DeepSeek 任意一家的 API Key。
              </Typography.Paragraph>
              <Space wrap>
                <Link to="/api"><Button type="primary" icon={<ApiOutlined />}>配置 API</Button></Link>
                <Link to="/articles"><Button icon={<BookOutlined />}>添加文章</Button></Link>
                <Link to="/ai-generate"><Button icon={<BulbOutlined />}>AI 出题</Button></Link>
                <Link to="/rogue"><Button icon={<FireOutlined />}>生成副本</Button></Link>
              </Space>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="最近通关记录" className="textbook-card">
            {runs.length === 0 ? (
              <Empty description="还没有通关记录" />
            ) : (
              <List
                size="small"
                dataSource={runs}
                renderItem={(r: any) => (
                  <List.Item>
                    <Space>
                      <Tag color={r.result === 'win' ? 'green' : r.result === 'lose' ? 'red' : 'default'}>
                        {r.result || '进行中'}
                      </Tag>
                      <span>{r.dungeon_name || '(临时副本)'}</span>
                      <Typography.Text type="secondary">{new Date(r.created_at).toLocaleString()}</Typography.Text>
                      {r.stars ? <Tag color="purple">{r.stars}★</Tag> : null}
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}