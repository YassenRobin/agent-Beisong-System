import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography, message } from 'antd';
import {
  ApiOutlined,
  BookOutlined,
  BulbOutlined,
  FireOutlined,
  RobotOutlined,
  SnippetsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { invoke } from '../api/ipc';

type AgentAction = {
  type: string;
  title: string;
  description: string;
  route: string;
  priority: 1 | 2 | 3;
};

type AgentPlan = {
  status: string;
  headline: string;
  summary: string;
  insights: string[];
  primaryAction: AgentAction;
  actions: AgentAction[];
  snapshot: {
    texts: number;
    questions: number;
    weakPoints: unknown[];
    wrongItems: unknown[];
    recentRuns: unknown[];
    dungeons: unknown[];
    activeProvider: { name: string } | null;
  };
};

type AiPlanStep = {
  type: string;
  title: string;
  reason: string;
  route: string;
  text_ids?: string[];
  weak_point_id?: string;
  dungeon_id?: string;
  count_per_text?: number;
  question_types?: string[];
  estimated_questions?: number;
};

type AiLearningPlan = {
  title: string;
  rationale: string;
  generated_by: 'ai' | 'fallback';
  steps: AiPlanStep[];
};

const statusColor: Record<string, string> = {
  setup: 'default',
  needs_api: 'orange',
  needs_questions: 'blue',
  weak_point_focus: 'red',
  wrong_review: 'volcano',
  ready: 'green',
};

function actionIcon(type: string) {
  if (type === 'setup_articles') return <BookOutlined />;
  if (type === 'configure_api') return <ApiOutlined />;
  if (type === 'generate_questions') return <BulbOutlined />;
  if (type === 'review_wrong') return <SnippetsOutlined />;
  if (type === 'start_rogue') return <FireOutlined />;
  return <ThunderboltOutlined />;
}

export default function LearningAgent() {
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [aiPlan, setAiPlan] = useState<AiLearningPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPlan(await invoke<AgentPlan>('agent:summary'));
    } catch (e: any) {
      message.error(e?.message || '学习 Agent 加载失败');
    } finally {
      setLoading(false);
    }
  };

  const generateAiPlan = async () => {
    setPlanning(true);
    try {
      setAiPlan(await invoke<AiLearningPlan>('agent:ai-plan'));
    } catch (e: any) {
      message.error(e?.message || 'AI 学习计划生成失败');
    } finally {
      setPlanning(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!plan) {
    return (
      <Card className="textbook-card">
        <Empty description={loading ? '学习 Agent 正在分析' : '暂无学习诊断'} />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" wrap>
        <RobotOutlined style={{ color: '#5d3fd3', fontSize: 24 }} />
        <Typography.Title level={3} style={{ margin: 0 }}>学习 Agent</Typography.Title>
        <Tag color={statusColor[plan.status] || 'purple'}>{plan.status}</Tag>
        {plan.snapshot.activeProvider ? <Tag color="purple">AI: {plan.snapshot.activeProvider.name}</Tag> : <Tag>未配置 AI</Tag>}
      </Space>

      <Card className="textbook-card">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type={plan.status === 'ready' ? 'success' : 'info'}
            showIcon
            message={plan.headline}
            description={plan.summary}
          />
          <Space wrap>
            <Link to={plan.primaryAction.route}>
              <Button type="primary" size="large" icon={actionIcon(plan.primaryAction.type)}>
                {plan.primaryAction.title}
              </Button>
            </Link>
            <Button onClick={load} loading={loading}>重新分析</Button>
            <Button icon={<RobotOutlined />} onClick={generateAiPlan} loading={planning}>
              生成 AI 学习计划
            </Button>
          </Space>
        </Space>
      </Card>

      {aiPlan ? (
        <Card
          title={
            <Space wrap>
              <RobotOutlined />
              <span>{aiPlan.title}</span>
              <Tag color={aiPlan.generated_by === 'ai' ? 'purple' : 'default'}>
                {aiPlan.generated_by === 'ai' ? 'AI 规划' : '规则兜底'}
              </Tag>
            </Space>
          }
          className="textbook-card"
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {aiPlan.rationale}
            </Typography.Paragraph>
            <List
              dataSource={aiPlan.steps}
              renderItem={(item, index) => (
                <List.Item
                  actions={[
                    <Link key="open" to={item.route}>
                      <Button type={index === 0 ? 'primary' : 'default'} icon={actionIcon(item.type)}>
                        进入
                      </Button>
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Tag color={index === 0 ? 'red' : 'blue'}>{index + 1}</Tag>}
                    title={item.title}
                    description={(
                      <Space direction="vertical" size={4}>
                        <Typography.Text type="secondary">{item.reason}</Typography.Text>
                        {item.type === 'generate_questions' ? (
                          <Typography.Text type="secondary">
                            预计生成 {item.estimated_questions || item.count_per_text || 0} 题
                            {item.question_types?.length ? ` · ${item.question_types.join(' / ')}` : ''}
                          </Typography.Text>
                        ) : null}
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
          </Space>
        </Card>
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card className="textbook-card">
            <Statistic title="文章" value={plan.snapshot.texts} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="textbook-card">
            <Statistic title="题目" value={plan.snapshot.questions} prefix={<BulbOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="textbook-card">
            <Statistic title="薄弱点" value={plan.snapshot.weakPoints.length} prefix={<ThunderboltOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="textbook-card">
            <Statistic title="错题" value={plan.snapshot.wrongItems.length} prefix={<SnippetsOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="诊断依据" className="textbook-card">
            <List
              size="small"
              dataSource={plan.insights}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>{item}</Typography.Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="下一步行动" className="textbook-card">
            <List
              dataSource={plan.actions}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Link key="open" to={item.route}>
                      <Button type={item.priority === 1 ? 'primary' : 'default'} icon={actionIcon(item.type)}>
                        进入
                      </Button>
                    </Link>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Tag color={item.priority === 1 ? 'red' : item.priority === 2 ? 'orange' : 'blue'}>P{item.priority}</Tag>}
                    title={item.title}
                    description={item.description}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
