import { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, Tag, Input, Radio, message, Alert, Result, Divider, Statistic, Row, Col } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';
import { errorTypeLabel, questionTypeLabel } from '../utils/labels';
import { useNavigate, useSearchParams } from 'react-router-dom';

type Question = {
  id: string;
  text_id: string;
  type: string;
  star: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  hint?: string;
  explanation?: string;
};

type TrainingRecommendation = {
  title: string;
  description: string;
  question_ids: string[];
  summary: {
    total: number;
    wrong: number;
    weak: number;
    fresh: number;
  };
};

type TrainingAttempt = {
  question_id: string;
  is_correct: boolean;
  score: number;
  error_type?: string;
};

type AgentRunDetail = {
  id: string;
  status: string;
  title: string;
  summary?: string;
  result?: {
    question_ids?: string[];
  };
  goal?: {
    title: string;
  } | null;
};

type WeakPointLearningEvaluation = {
  outcome: 'mastered' | 'continue' | 'incomplete';
  total: number;
  correct: number;
  accuracy: number;
  target_accuracy: number;
  minimum_attempts: number;
  next_run_id?: string;
  route: string;
};

export default function Train() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const agentRunId = searchParams.get('agent_run_id');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [choice, setChoice] = useState<string>('');
  const [result, setResult] = useState<any | null>(null);
  const [filter, setFilter] = useState<'all' | 'choice' | 'blank' | 'context_recitation' | 'pure_recitation'>('all');
  const [busy, setBusy] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [recommendation, setRecommendation] = useState<TrainingRecommendation | null>(null);
  const [attempts, setAttempts] = useState<TrainingAttempt[]>([]);
  const [finished, setFinished] = useState(false);
  const [agentRun, setAgentRun] = useState<AgentRunDetail | null>(null);
  const [agentEvaluation, setAgentEvaluation] = useState<WeakPointLearningEvaluation | null>(null);
  const [evaluatingAgent, setEvaluatingAgent] = useState(false);

  const load = async () => {
    try {
      const all = await invoke<Question[]>('question:list', { enabled: 1 });
      const favorites = await invoke<any[]>('favorite:list-questions', {});
      setFavoriteIds(new Set(favorites.map((f) => f.question_id)));
      if (agentRunId) {
        const detail = await invoke<AgentRunDetail>('agent:run-detail', { id: agentRunId });
        if (!detail || detail.status !== 'awaiting_student') throw new Error('该专项训练已结束或暂不可继续。');
        const questionIds = detail.result?.question_ids || [];
        const scopedQuestions = questionIds
          .map((id) => all.find((q) => q.id === id))
          .filter(Boolean) as Question[];
        if (!scopedQuestions.length) throw new Error('专项训练题目不存在。');
        setAgentRun(detail);
        setRecommendation({
          title: detail.goal?.title || detail.title,
          description: detail.summary || '完成本轮专项题后，Agent 会自动评价并决定是否继续。',
          question_ids: questionIds,
          summary: { total: scopedQuestions.length, wrong: 0, weak: scopedQuestions.length, fresh: scopedQuestions.length },
        });
        setQuestions(scopedQuestions);
      } else {
        const rec = await invoke<TrainingRecommendation>('training:recommendation', { type: filter, limit: 10 });
        setAgentRun(null);
        setRecommendation(rec);
        const recIds = new Set(rec.question_ids || []);
        const recommended = (rec.question_ids || [])
          .map((id) => all.find((q) => q.id === id))
          .filter(Boolean) as Question[];
        const fallback = (filter === 'all' ? all : all.filter((q) => q.type === filter))
          .filter((q) => !recIds.has(q.id));
        setQuestions([...recommended, ...fallback].slice(0, Math.max(10, recommended.length)));
      }
      setIdx(0);
      setInput('');
      setChoice('');
      setResult(null);
      setAttempts([]);
      setFinished(false);
      setAgentEvaluation(null);
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => { load(); }, [filter, agentRunId]);

  const cur = questions[idx];

  const toggleFavorite = async (q: Question) => {
    try {
      if (favoriteIds.has(q.id)) {
        await invoke('favorite:question-remove', { question_id: q.id });
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(q.id);
          return next;
        });
        message.success('已取消收藏');
      } else {
        await invoke('favorite:question', { question_id: q.id, text_id: q.text_id });
        setFavoriteIds((prev) => new Set(prev).add(q.id));
        message.success('已收藏题目');
      }
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onSubmit = async () => {
    if (!cur) return;
    let userAnswer = '';
    if (cur.type === 'choice') userAnswer = choice;
    else userAnswer = input;

    if (!userAnswer) return message.warning('请先作答');

    setBusy(true);
    try {
      const res = await invoke<any>('question:judge', {
        question_id: cur.id,
        prompt: cur.prompt,
        expected: cur.answer,
        actual: userAnswer,
        questionType: cur.type,
        star: cur.star,
      });
      setResult(res);
      setAttempts((prev) => ([
        ...prev,
        {
          question_id: cur.id,
          is_correct: !!res.is_correct,
          score: Number(res.score || 0),
          error_type: res.error_type,
        },
      ]));
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    if (idx + 1 >= questions.length) {
      if (agentRunId) {
        setEvaluatingAgent(true);
        try {
          const evaluation = await invoke<WeakPointLearningEvaluation>('agent:weak-point-evaluate', { run_id: agentRunId });
          setAgentEvaluation(evaluation);
          if (evaluation.outcome === 'mastered') message.success('专项学习目标已达成');
          if (evaluation.outcome === 'continue') message.info('本轮未达目标，学习智能助手已生成下一轮训练');
        } catch (e: any) {
          message.error(e?.message || '专项学习评价失败');
        } finally {
          setEvaluatingAgent(false);
        }
      }
      setFinished(true);
      return;
    }
    setInput('');
    setChoice('');
    setResult(null);
    setIdx((i) => i + 1);
  };

  if (questions.length === 0) {
    return (
      <Card className="textbook-card">
        <Result
          status="info"
          title="暂无题目"
          subTitle="先到「文章管理」添加文章,然后用「AI 出题」生成题目。"
          extra={<Button type="primary" onClick={load}>重新加载</Button>}
        />
      </Card>
    );
  }

  if (!cur) return null;

  const correctCount = attempts.filter((item) => item.is_correct).length;
  const accuracy = attempts.length ? Math.round((correctCount / attempts.length) * 100) : 0;
  const averageScore = attempts.length
    ? Math.round((attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length) * 100)
    : 0;
  const errorTypes = attempts.reduce<Record<string, number>>((acc, item) => {
    if (item.is_correct) return acc;
    const key = item.error_type || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (finished) {
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{agentRun ? '薄弱点专项总结' : '普通训练总结'}</Typography.Title>
        <Card className="textbook-card">
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type={accuracy >= 80 ? 'success' : 'info'}
              showIcon
              message={accuracy >= 80 ? '本轮训练完成得不错' : '本轮训练已完成'}
              description={recommendation?.description || '已根据本轮答题结果生成总结。'}
            />
            {agentEvaluation ? (
              <Alert
                type={agentEvaluation.outcome === 'mastered' ? 'success' : 'warning'}
                showIcon
                message={agentEvaluation.outcome === 'mastered' ? '学习目标已达成' : '学习智能助手已完成重规划'}
                description={agentEvaluation.outcome === 'mastered'
                  ? `正确率 ${Math.round(agentEvaluation.accuracy * 100)}%，已达到 ${Math.round(agentEvaluation.target_accuracy * 100)}% 目标。`
                  : `正确率 ${Math.round(agentEvaluation.accuracy * 100)}%，下一轮将继续围绕同一薄弱点训练。`}
              />
            ) : null}
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}><Statistic title="题数" value={attempts.length} /></Col>
              <Col xs={12} md={6}><Statistic title="正确" value={correctCount} /></Col>
              <Col xs={12} md={6}><Statistic title="正确率" value={accuracy} suffix="%" /></Col>
              <Col xs={12} md={6}><Statistic title="平均得分" value={averageScore} suffix="%" /></Col>
            </Row>
            {Object.keys(errorTypes).length ? (
              <Space wrap>
                {Object.entries(errorTypes).map(([key, count]) => (
                  <Tag key={key} color="red">{errorTypeLabel(key)}: {count}</Tag>
                ))}
              </Space>
            ) : null}
            <Space wrap>
              {agentEvaluation?.outcome === 'continue' && agentEvaluation.next_run_id ? (
                <Button type="primary" onClick={() => setSearchParams({ agent_run_id: agentEvaluation.next_run_id! })}>
                  开始下一轮专项训练
                </Button>
              ) : agentEvaluation?.outcome === 'mastered' ? (
                <Button type="primary" onClick={() => navigate('/agent')}>返回学习智能助手</Button>
              ) : !agentRun ? (
                <Button type="primary" onClick={load}>再来一轮智能助手推荐训练</Button>
              ) : null}
              <Button onClick={() => setFinished(false)}>回看最后一题</Button>
            </Space>
          </Space>
        </Card>
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{agentRun ? '薄弱点专项训练' : '普通训练'}</Typography.Title>
        <Space>
          {!agentRun ? (
            <>
              <Radio.Group value={filter} onChange={(e) => setFilter(e.target.value)}>
                <Radio.Button value="all">全部</Radio.Button>
                <Radio.Button value="choice">选择</Radio.Button>
                <Radio.Button value="blank">挖空</Radio.Button>
                <Radio.Button value="context_recitation">文脉默写</Radio.Button>
                <Radio.Button value="pure_recitation">纯默写</Radio.Button>
              </Radio.Group>
              <Button onClick={load}>换一组</Button>
            </>
          ) : <Tag color="purple">智能助手目标训练</Tag>}
        </Space>
      </Space>

      <Card className="textbook-card">
        {recommendation ? (
          <Alert
            style={{ marginBottom: 16 }}
            type="info"
            showIcon
            message={recommendation.title}
            description={`${recommendation.description} 共 ${recommendation.summary.total} 题，错题 ${recommendation.summary.wrong}，薄弱点 ${recommendation.summary.weak}，新题 ${recommendation.summary.fresh}。`}
          />
        ) : null}
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag color="purple">{typeLabel(cur.type)}</Tag>
          <Tag color="orange">{'★'.repeat(cur.star)}</Tag>
          <Typography.Text type="secondary">{idx + 1} / {questions.length}</Typography.Text>
          <Button
            size="small"
            icon={favoriteIds.has(cur.id) ? <StarFilled /> : <StarOutlined />}
            onClick={() => toggleFavorite(cur)}
          >
            {favoriteIds.has(cur.id) ? '已收藏' : '收藏'}
          </Button>
        </Space>
        <div className="question-prompt"><MarkedText text={cur.prompt} /></div>

        <Divider />

        {cur.type === 'choice' ? (
          <Radio.Group value={choice} onChange={(e) => setChoice(e.target.value)} disabled={!!result}>
            <Space direction="vertical">
              {(cur.options || []).map((o, i) => (
                <Radio key={i} value={optionKey(i)} style={{ fontFamily: 'serif', fontSize: 15 }}>
                  {optionKey(i)}. {stripOptionPrefix(o, i)}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        ) : (
          <Input.TextArea
            rows={4}
            placeholder="在此填写答案…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!result}
          />
        )}

        {result && (
          <Alert
            style={{ marginTop: 16 }}
            type={result.is_correct ? 'success' : 'error'}
            message={result.is_correct ? `正确 (得分 ${(result.score * 100).toFixed(0)})` : `错误 (得分 ${(result.score * 100).toFixed(0)}) · ${errorTypeLabel(result.error_type)}`}
            description={
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <div><b>你的答案:</b> <span className="serif">{choice || input}</span></div>
                <div><b>参考答案:</b> <span className="serif">{cur.answer}</span></div>
                {result.feedback && <div><b>反馈:</b> {result.feedback}</div>}
                {cur.explanation && <Typography.Paragraph type="secondary">{cur.explanation}</Typography.Paragraph>}
              </Space>
            }
            showIcon
          />
        )}

        <Space style={{ marginTop: 16 }}>
          {!result ? (
            <Button type="primary" loading={busy} onClick={onSubmit}>提交</Button>
          ) : (
            <Button type="primary" loading={evaluatingAgent} onClick={next}>
              {idx + 1 >= questions.length && agentRun ? '完成并由 Agent 评价' : '下一题'}
            </Button>
          )}
        </Space>
      </Card>
    </Space>
  );
}

function typeLabel(t: string) {
  return questionTypeLabel(t);
}

function optionKey(index: number) {
  return String.fromCharCode(65 + index);
}

function stripOptionPrefix(option: string, index: number) {
  const key = optionKey(index);
  return String(option || '').replace(new RegExp(`^\\s*${key}[\\\\.。．、:：)）]?\\s*`, 'i'), '');
}
