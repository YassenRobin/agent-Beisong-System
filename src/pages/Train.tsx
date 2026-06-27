import { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, Tag, Input, Radio, message, Alert, Result, Divider } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';

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

export default function Train() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [choice, setChoice] = useState<string>('');
  const [result, setResult] = useState<any | null>(null);
  const [filter, setFilter] = useState<'all' | 'choice' | 'blank' | 'context_recitation' | 'pure_recitation'>('all');
  const [busy, setBusy] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const all = await invoke<Question[]>('question:list', { enabled: 1 });
      const favorites = await invoke<any[]>('favorite:list-questions', {});
      setFavoriteIds(new Set(favorites.map((f) => f.question_id)));
      const list = filter === 'all' ? all : all.filter((q) => q.type === filter);
      // 打乱
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      setQuestions(list);
      setIdx(0);
      setInput('');
      setChoice('');
      setResult(null);
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => { load(); }, [filter]);

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
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setInput('');
    setChoice('');
    setResult(null);
    setIdx((i) => (i + 1 >= questions.length ? 0 : i + 1));
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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>普通训练</Typography.Title>
        <Space>
          <Radio.Group value={filter} onChange={(e) => setFilter(e.target.value)}>
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="choice">选择</Radio.Button>
            <Radio.Button value="blank">挖空</Radio.Button>
            <Radio.Button value="context_recitation">文脉默写</Radio.Button>
            <Radio.Button value="pure_recitation">纯默写</Radio.Button>
          </Radio.Group>
          <Button onClick={load}>换一组</Button>
        </Space>
      </Space>

      <Card className="textbook-card">
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
            message={result.is_correct ? `正确 (得分 ${(result.score * 100).toFixed(0)})` : `错误 (得分 ${(result.score * 100).toFixed(0)}) · ${result.error_type || 'other'}`}
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
            <Button type="primary" onClick={next}>下一题</Button>
          )}
        </Space>
      </Card>
    </Space>
  );
}

function typeLabel(t: string) {
  return ({
    choice: '选择题',
    blank: '挖空题',
    context_blank: '文脉挖空',
    context_recitation: '文脉默写',
    pure_recitation: '纯默写',
    ordering: '排序题',
  } as any)[t] || t;
}

function optionKey(index: number) {
  return String.fromCharCode(65 + index);
}

function stripOptionPrefix(option: string, index: number) {
  const key = optionKey(index);
  return String(option || '').replace(new RegExp(`^\\s*${key}[\\\\.。．、:：)）]?\\s*`, 'i'), '');
}
