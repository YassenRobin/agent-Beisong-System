import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, List, Row, Space, Statistic, Tag, Tooltip, Typography, message } from 'antd';
import {
  ApiOutlined,
  BookOutlined,
  BulbOutlined,
  FireOutlined,
  RobotOutlined,
  SnippetsOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { questionTypeListLabel } from '../utils/labels';

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
    learnerProfile?: {
      summary: {
        tracked_scopes: number;
        due_reviews: number;
        average_mastery: number;
      };
      priorities: Array<{
        scope_type: string;
        scope_id: string;
        label: string;
        mastery_score: number;
        forgetting_risk: number;
        review_due: boolean;
        next_review_at: string;
      }>;
    };
  };
};

type AiPlanStep = {
  type: string;
  title: string;
  reason: string;
  route: string;
  tool_call?: {
    tool: string;
    risk: 'read' | 'write_safe';
    params: Record<string, unknown>;
  };
  requires_confirmation?: boolean;
  execution_status?: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  result?: any;
  error?: string;
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

type MasterAgentRun = {
  mode: 'ai' | 'deterministic';
  status: 'completed' | 'partial' | 'failed';
  title: string;
  summary: string;
  next_route: string;
  roles: Array<{
    role: 'master' | 'planner' | 'question' | 'coach' | 'evaluator';
    status: 'completed' | 'failed' | 'skipped';
    summary: string;
  }>;
  steps: Array<{
    tool: string;
    risk?: 'read' | 'write_safe';
    status: 'completed' | 'failed' | 'skipped';
    result?: any;
    error?: string;
  }>;
};

type WeakPointLearningSession = {
  run_id: string;
  route: string;
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

const executionColor: Record<string, string> = {
  pending: 'default',
  running: 'processing',
  completed: 'green',
  skipped: 'default',
  failed: 'red',
};

const statusLabel: Record<string, string> = {
  setup: '待建立文章库',
  needs_api: '需要配置 AI',
  needs_questions: '题库待扩充',
  weak_point_focus: '薄弱点优先',
  wrong_review: '错题待复习',
  ready: '可以训练',
};

const executionLabel: Record<string, string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  skipped: '已跳过',
  failed: '失败',
  partial: '部分完成',
};

const riskLabel: Record<string, string> = {
  read: '读取',
  write_safe: '安全写入',
};

const toolLabel: Record<string, string> = {
  'snapshot.learning_context': '读取学习概况',
  'article.list_enabled': '读取可用文章',
  'question.agent_generate': 'AI 出题子 Agent',
  'question.generate_for_articles': '按文章生成题目',
  'question.generate_for_weak_point': '薄弱点专项出题',
  'rogue.generate_and_save': '生成 Rogue 副本',
  'wrong.review_queue': '读取错题复习队列',
  'favorite.recommend_questions': '推荐重点题目',
  'training.start_recommendation': '推荐普通训练',
};

const agentRoleLabel: Record<string, string> = {
  master: 'Master Agent',
  planner: 'Planner Agent',
  question: 'Question Agent',
  coach: 'Coach Agent',
  evaluator: 'Evaluator Agent',
};

const routeLabel: Record<string, string> = {
  '/agent': '学习智能助手',
  '/questions': '题目管理',
  '/weak-points': '薄弱点',
  '/wrong': '错题本',
  '/train': '普通训练',
  '/favorites': '收藏夹',
  '/rogue': 'Rogue 副本',
};

function routeDisplay(route?: string) {
  if (!route) return '推荐页面';
  if (route.startsWith('/rogue/')) return 'Rogue 副本';
  return routeLabel[route] || '推荐页面';
}

function routeActionLabel(route?: string) {
  if (!route) return '查看下一步';
  if (route === '/questions') return '查看生成题目';
  if (route === '/wrong') return '复习错题';
  if (route === '/train' || route.startsWith('/train?')) return '开始推荐训练';
  if (route === '/weak-points') return '查看薄弱点';
  if (route.startsWith('/rogue/')) return '进入推荐副本';
  return `前往${routeDisplay(route)}`;
}

function errorDisplay(error?: string) {
  if (!error) return '';
  if (error === 'Tool handler is not available.') return '该 Agent 工具暂不可用';
  if (/Weak point does not exist/i.test(error)) return '薄弱点不存在';
  if (/article does not exist/i.test(error)) return '文章不存在';
  return error
    .replace(/question\.generate_for_articles/g, '按文章生成题目')
    .replace(/question\.generate_for_weak_point/g, '薄弱点专项出题')
    .replace(/wrong\.review_queue/g, '错题复习队列')
    .replace(/training\.start_recommendation/g, '普通训练推荐')
    .replace(/write_safe/g, '安全写入')
    .replace(/\bcompleted\b/g, '已完成')
    .replace(/\bfailed\b/g, '失败')
    .replace(/\bskipped\b/g, '已跳过');
}

function summarizeToolResult(result: any): string {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.created_count === 'number') {
    const fallback = typeof result.fallback_count === 'number' && result.fallback_count > 0
      ? `，其中 ${result.fallback_count} 道为系统保底题`
      : '';
    return `生成 ${result.created_count} 道题${fallback}`;
  }
  if (result.dungeon_id) return '已生成副本';
  if (Array.isArray(result.items)) return `待复习 ${result.items.length} 项`;
  if (Array.isArray(result.questions)) return `推荐 ${result.questions.length} 道题`;
  if (Array.isArray(result.question_ids)) return `推荐 ${result.question_ids.length} 道训练题`;
  if (result.route) return `下一步：${routeDisplay(result.route)}`;
  return '';
}

export default function LearningAgent() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [aiPlan, setAiPlan] = useState<AiLearningPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [runningAgent, setRunningAgent] = useState(false);
  const [runningAgentSeconds, setRunningAgentSeconds] = useState(0);
  const [agentRun, setAgentRun] = useState<MasterAgentRun | null>(null);
  const [startingWeakPointLoop, setStartingWeakPointLoop] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setPlan(await invoke<AgentPlan>('agent:summary'));
    } catch (e: any) {
      message.error(e?.message || '学习智能助手加载失败');
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

  const executePlan = async () => {
    if (!aiPlan) return;
    setExecuting(true);
    try {
      setAiPlan(await invoke<AiLearningPlan>('agent:execute-plan', { plan: aiPlan }));
      message.success('Agent 安全计划执行完成');
      await load();
    } catch (e: any) {
      message.error(e?.message || 'Agent 安全计划执行失败');
    } finally {
      setExecuting(false);
    }
  };

  const runMasterAgent = async () => {
    setRunningAgent(true);
    try {
      const result = await invoke<MasterAgentRun>('agent:run');
      setAgentRun(result);
      message.success(result.mode === 'ai' ? '本轮学习已自动安排完成' : '已按安全规则安排本轮学习');
      await load();
    } catch (e: any) {
      message.error(e?.message || '自动安排本轮学习失败');
    } finally {
      setRunningAgent(false);
    }
  };

  const startWeakPointLoop = async () => {
    setStartingWeakPointLoop(true);
    try {
      const session = await invoke<WeakPointLearningSession>('agent:weak-point-start', {});
      message.success('薄弱点专项目标已建立，进入第一轮训练');
      navigate(session.route);
    } catch (e: any) {
      message.error(e?.message || '薄弱点专项学习启动失败');
    } finally {
      setStartingWeakPointLoop(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!runningAgent) {
      setRunningAgentSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setRunningAgentSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runningAgent]);

  if (!plan) {
    return (
      <Card className="textbook-card">
        <Empty description={loading ? '学习智能助手正在分析' : '暂无学习诊断'} />
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" wrap>
        <RobotOutlined style={{ color: '#5d3fd3', fontSize: 24 }} />
        <Typography.Title level={3} style={{ margin: 0 }}>学习智能助手</Typography.Title>
        <Tag color={statusColor[plan.status] || 'purple'}>{statusLabel[plan.status] || '学习状态'}</Tag>
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
            <Tooltip title="分析题库、错题、薄弱点和学生模型，并立即执行白名单内的安全操作，例如准备专项题和推荐训练队列。">
              <Button icon={<RobotOutlined />} onClick={runMasterAgent} loading={runningAgent}>
                {runningAgent ? `正在安排（${runningAgentSeconds} 秒）` : '自动安排本轮学习'}
              </Button>
            </Tooltip>
            {plan.snapshot.weakPoints.length ? (
              <Button
                icon={<ThunderboltOutlined />}
                onClick={startWeakPointLoop}
                loading={startingWeakPointLoop}
              >
                开始薄弱点闭环
              </Button>
            ) : null}
          </Space>
          <Typography.Text type="secondary">
            不知道先练什么时使用“自动安排本轮学习”；想先查看方案时使用“生成 AI 学习计划”。
          </Typography.Text>
          {runningAgent ? (
            <Alert
              type="info"
              showIcon
              message={runningAgentSeconds < 5 ? '正在读取学习记录' : runningAgentSeconds < 20 ? 'Planner 正在选择本轮动作' : 'AI 正在准备学习资源'}
              description="可以切换到其他页面，完成后结果会保留在学习智能助手中。"
            />
          ) : null}
        </Space>
      </Card>

      {agentRun ? (
        <Card
          title={
            <Space wrap>
              <RobotOutlined />
              <span>本轮自动安排结果</span>
              <Tag color={agentRun.mode === 'ai' ? 'purple' : 'blue'}>
                {agentRun.mode === 'ai' ? 'AI 调度' : '确定性接管'}
              </Tag>
              <Tag color={agentRun.status === 'completed' ? 'green' : 'orange'}>
                {executionLabel[agentRun.status] || '已处理'}
              </Tag>
            </Space>
          }
          className="textbook-card"
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {agentRun.summary}
            </Typography.Paragraph>
            <Space wrap>
              {agentRun.roles?.map((role, index) => (
                <Tag key={`${role.role}-${index}`} color={role.status === 'completed' ? 'purple' : role.status === 'failed' ? 'red' : 'default'}>
                  {agentRoleLabel[role.role] || role.role} · {role.status === 'completed' ? '完成' : role.status === 'failed' ? '失败' : '跳过'}
                </Tag>
              ))}
            </Space>
            {agentRun.roles?.length ? (
              <List
                size="small"
                dataSource={agentRun.roles}
                renderItem={(role) => (
                  <List.Item>
                    <List.Item.Meta title={agentRoleLabel[role.role] || role.role} description={role.summary} />
                  </List.Item>
                )}
              />
            ) : null}
            <List
              dataSource={agentRun.steps}
              renderItem={(item, index) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Tag color={item.status === 'completed' ? 'green' : item.status === 'failed' ? 'red' : 'default'}>{index + 1}</Tag>}
                    title={(
                      <Space wrap>
                        <span>{toolLabel[item.tool] || 'Agent 工具'}</span>
                        {item.risk ? (
                          <Tag color={item.risk === 'write_safe' ? 'orange' : 'blue'}>
                            {riskLabel[item.risk] || '安全操作'}
                          </Tag>
                        ) : null}
                        <Tag color={executionColor[item.status] || 'default'}>
                          {executionLabel[item.status] || '已处理'}
                        </Tag>
                      </Space>
                    )}
                    description={(
                      <Space direction="vertical" size={4}>
                        {item.error ? <Typography.Text type="danger">{errorDisplay(item.error)}</Typography.Text> : null}
                        {item.result ? <Typography.Text type="secondary">{summarizeToolResult(item.result)}</Typography.Text> : null}
                      </Space>
                    )}
                  />
                </List.Item>
              )}
            />
            <Link to={agentRun.next_route}>
              <Button type="primary" icon={<ThunderboltOutlined />}>{routeActionLabel(agentRun.next_route)}</Button>
            </Link>
          </Space>
        </Card>
      ) : null}

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
            <Space wrap>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={executePlan}
                loading={executing}
                disabled={!aiPlan.steps.some((step) => step.tool_call)}
              >
                执行安全计划
              </Button>
            </Space>
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
                            {item.question_types?.length ? ` · ${questionTypeListLabel(item.question_types)}` : ''}
                          </Typography.Text>
                        ) : null}
                        {item.tool_call ? (
                          <Space wrap size={4}>
                            <Tag color={item.tool_call.risk === 'write_safe' ? 'orange' : 'blue'}>
                              {riskLabel[item.tool_call.risk] || '安全操作'}
                            </Tag>
                            <Tag>{toolLabel[item.tool_call.tool] || 'Agent 工具'}</Tag>
                            {item.execution_status ? (
                              <Tag color={executionColor[item.execution_status] || 'default'}>
                                {executionLabel[item.execution_status] || '已处理'}
                              </Tag>
                            ) : null}
                          </Space>
                        ) : null}
                        {item.error ? (
                          <Typography.Text type="danger">{errorDisplay(item.error)}</Typography.Text>
                        ) : null}
                        {item.result ? (
                          <Typography.Text type="secondary">{summarizeToolResult(item.result)}</Typography.Text>
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

      {plan.snapshot.learnerProfile ? (
        <Card title="学生模型" className="textbook-card">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="purple">已跟踪 {plan.snapshot.learnerProfile.summary.tracked_scopes} 项</Tag>
              <Tag color={plan.snapshot.learnerProfile.summary.due_reviews ? 'red' : 'green'}>
                待复习 {plan.snapshot.learnerProfile.summary.due_reviews} 项
              </Tag>
              <Tag color="blue">
                平均掌握度 {Math.round(plan.snapshot.learnerProfile.summary.average_mastery * 100)}%
              </Tag>
            </Space>
            <List
              size="small"
              locale={{ emptyText: '完成训练后，Agent 会逐步建立学生模型。' }}
              dataSource={plan.snapshot.learnerProfile.priorities.slice(0, 5)}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={(
                      <Space wrap>
                        <span>{item.label}</span>
                        <Tag>{learnerScopeLabel(item.scope_type)}</Tag>
                        {item.review_due ? <Tag color="red">该复习了</Tag> : null}
                      </Space>
                    )}
                    description={`掌握度 ${Math.round(item.mastery_score * 100)}% · 遗忘风险 ${Math.round(item.forgetting_risk * 100)}% · 下次复习 ${new Date(item.next_review_at).toLocaleDateString()}`}
                  />
                </List.Item>
              )}
            />
          </Space>
        </Card>
      ) : null}

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

function learnerScopeLabel(scopeType: string) {
  if (scopeType === 'article') return '文章';
  if (scopeType === 'weak_point') return '薄弱点';
  if (scopeType === 'question_type') return '题型';
  return '题目';
}
