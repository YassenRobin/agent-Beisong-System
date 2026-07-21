import { useEffect, useState } from 'react';
import { Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  BookOutlined,
  BulbOutlined,
  EditOutlined,
  FireOutlined,
  ReadOutlined,
  SnippetsOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { invoke } from '../api/ipc';

type DashboardSummary = {
  texts: number;
  questions: number;
  weakPoints: number;
  favorites: number;
  dungeons: number;
  wrongItems: number;
  runs: number;
  providers: number;
  activeProvider?: { id: string; name: string; provider_type: string } | null;
};

type RecentRun = {
  id: string;
  result?: string | null;
  dungeon_name?: string | null;
  created_at: string;
  stars?: number | null;
};

const RUN_STATUS: Record<string, { label: string; color: string }> = {
  win: { label: '已通关', color: 'green' },
  lose: { label: '未通关', color: 'red' },
  running: { label: '未完成', color: 'default' },
};

function formatRunTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [runs, setRuns] = useState<RecentRun[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    invoke('dashboard:summary').then((value) => setSummary(value as DashboardSummary)).catch((e) => {
      console.error('[Dashboard] summary failed:', e);
      setError(String(e?.message || e));
    });
    invoke('dashboard:recent-runs', { limit: 8 }).then((value) => setRuns(value as RecentRun[])).catch((e) => {
      console.error('[Dashboard] runs failed:', e);
      setError(String(e?.message || e));
    });
  }, []);

  if (error) {
    return (
      <Card className="textbook-card" style={{ maxWidth: 720 }}>
        <Typography.Title level={4} type="danger">数据加载失败</Typography.Title>
        <Typography.Paragraph>
          <pre className="dashboard-error-detail">{error}</pre>
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          请先重新启动应用；如果问题仍然存在，请打开开发者工具查看错误详情。
        </Typography.Paragraph>
      </Card>
    );
  }

  if (!summary) return <Typography.Text type="secondary">正在加载学习概览…</Typography.Text>;

  const metrics = [
    {
      icon: <BookOutlined />,
      title: '已收录文章',
      description: '管理背诵原文、作者和朝代',
      value: summary.texts,
      color: 'var(--ui-cinnabar)',
      link: '/articles',
    },
    {
      icon: <EditOutlined />,
      title: '练习题目',
      description: '查看和维护当前练习题库',
      value: summary.questions,
      color: 'var(--ui-gold-deep)',
      link: '/questions',
    },
    {
      icon: <BulbOutlined />,
      title: '待巩固薄弱点',
      description: '根据练习结果识别的薄弱知识',
      value: summary.weakPoints,
      color: 'var(--ui-gold)',
      link: '/weak-points',
    },
    {
      icon: <StarOutlined />,
      title: '收藏题目',
      description: '主动收藏、准备稍后复习的题目',
      value: summary.favorites,
      color: 'var(--ui-cinnabar-hover)',
      link: '/favorites',
    },
    {
      icon: <FireOutlined />,
      title: '可挑战副本',
      description: '按星级组织的连续闯关题组',
      value: summary.dungeons,
      color: 'var(--ui-danger)',
      link: '/rogue',
    },
    {
      icon: <SnippetsOutlined />,
      title: '待复习错题',
      description: '答错后自动收录的活跃错题',
      value: summary.wrongItems,
      color: '#a35432',
      link: '/wrong',
    },
    {
      icon: <ThunderboltOutlined />,
      title: '成功通关',
      description: '已经完整通过的闯关次数',
      value: summary.runs,
      color: 'var(--ui-pine)',
      link: '/rankings',
    },
    {
      icon: <ApiOutlined />,
      title: 'AI 服务',
      description: summary.activeProvider ? `当前使用：${summary.activeProvider.name}` : '尚未配置，点击进入设置',
      value: summary.activeProvider ? '已启用' : '未配置',
      color: summary.activeProvider ? 'var(--ui-pine)' : 'var(--ui-ink-soft)',
      link: '/api',
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>学习概览</Typography.Title>
        <Typography.Text type="secondary">
          查看资料、复习任务和闯关进度；点击任一卡片即可进入对应功能。
        </Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        {metrics.map((metric) => (
          <Col key={metric.title} xs={24} sm={12} lg={6}>
            <Link to={metric.link} className="dashboard-stat-link">
              <Card hoverable className="textbook-card dashboard-stat-card">
                <Statistic
                  title={<Space>{metric.icon}<span>{metric.title}</span></Space>}
                  value={metric.value}
                  valueStyle={{ color: metric.color }}
                />
                <Typography.Text type="secondary" className="dashboard-stat-card__description">
                  {metric.description}
                </Typography.Text>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title="建议从这里开始"
            extra={<Link to="/agent">查看学习建议</Link>}
            className="textbook-card dashboard-action-card"
          >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                {summary.activeProvider
                  ? `当前已启用 ${summary.activeProvider.name}。可以直接训练，也可以让 AI 根据文章生成新题。`
                  : '尚未配置 AI 服务。普通训练和背诵功能仍可使用；配置后可以生成题目和学习建议。'}
              </Typography.Paragraph>
              <Space wrap>
                <Link to="/train"><Button type="primary" icon={<ThunderboltOutlined />}>开始普通训练</Button></Link>
                <Link to="/creative-recite"><Button icon={<ReadOutlined />}>开始创新背诵</Button></Link>
                <Link to="/wrong"><Button icon={<SnippetsOutlined />}>复习错题</Button></Link>
                {summary.activeProvider ? (
                  <Link to="/ai-generate"><Button icon={<BulbOutlined />}>生成练习题</Button></Link>
                ) : (
                  <Link to="/api"><Button icon={<ApiOutlined />}>配置 AI 服务</Button></Link>
                )}
              </Space>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="最近闯关记录"
            extra={<Link to="/rankings">查看排行榜</Link>}
            className="textbook-card dashboard-run-card"
          >
            {runs.length === 0 ? (
              <Empty description="还没有闯关记录，可以从“可挑战副本”开始" />
            ) : (
              <List
                size="small"
                dataSource={runs}
                renderItem={(run) => {
                  const status = RUN_STATUS[run.result || ''] || { label: '状态未知', color: 'default' };
                  return (
                    <List.Item>
                      <div className="dashboard-run-row">
                        <Space size={8} wrap>
                          <Tag color={status.color}>{status.label}</Tag>
                          <Typography.Text strong>{run.dungeon_name || '临时挑战'}</Typography.Text>
                          {run.stars ? <Tag color="gold">{run.stars} 星</Tag> : null}
                        </Space>
                        <Typography.Text type="secondary" className="dashboard-run-time">
                          {formatRunTime(run.created_at)}
                        </Typography.Text>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
