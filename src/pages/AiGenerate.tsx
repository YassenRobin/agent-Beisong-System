import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Divider, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Typography, message } from 'antd';
import { CheckSquareOutlined, DeleteOutlined, EyeOutlined, ImportOutlined, RobotOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';
import { releaseArticleHoverLock, toggleAllArticleSelection, toggleArticleSelection } from '../utils/articleSelection';

const TYPE_OPTIONS = [
  { value: 'choice', label: '选择题' },
  { value: 'blank', label: '单空挖空' },
  { value: 'context_blank', label: '文脉挖空' },
  { value: 'context_recitation', label: '文脉默写' },
  { value: 'pure_recitation', label: '纯默写' },
  { value: 'ordering', label: '排序题' },
];

type DraftQuestion = {
  draft_id: string;
  text_id: string;
  paragraph_id?: string;
  weak_point_id?: string;
  type: string;
  star: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  logic_role?: string;
  hint?: string;
  explanation?: string;
};

function typeLabel(type: string) {
  return (TYPE_OPTIONS.find((t) => t.value === type) || { label: type }).label;
}

function normalizeStarRange(stars?: number[]): [number, number] {
  const valid = (stars || []).map(Number).filter((n) => n >= 1 && n <= 5);
  if (!valid.length) return [1, 5];
  return [Math.min(...valid), Math.max(...valid)];
}

function distributeCount(total: number, buckets: number) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeBuckets = Math.max(1, buckets);
  const base = Math.floor(safeTotal / safeBuckets);
  const remainder = safeTotal % safeBuckets;
  return Array.from({ length: safeBuckets }, (_, idx) => base + (idx < remainder ? 1 : 0)).map((n) => Math.max(1, n));
}

function makeDraftId(prefix: string, index: number) {
  return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiGenerate() {
  const [sp] = useSearchParams();
  const [texts, setTexts] = useState<any[]>([]);
  const [weakPoints, setWeakPoints] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<DraftQuestion[]>([]);
  const [active, setActive] = useState<DraftQuestion | null>(null);
  const [articleQuery, setArticleQuery] = useState('');
  const [hoverLockedIds, setHoverLockedIds] = useState<string[]>([]);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    invoke<any[]>('article:list', {}).then((rows) => {
      setTexts(rows);
      const initial = sp.get('textId');
      if (initial) form.setFieldValue('text_ids', [initial]);
    });
    invoke<any[]>('weak-point:list', { enabled: 1 }).then((rows) => {
      setWeakPoints(rows);
      const initial = sp.get('weakPointId');
      if (initial) {
        const weakPoint = rows.find((w) => w.id === initial);
        form.setFieldsValue({ mode: 'weak_point', weak_point_id: initial, text_ids: weakPoint?.text_id ? [weakPoint.text_id] : [] });
      }
    });
  }, [form, sp]);

  useEffect(() => {
    if (!results.length) return;
    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [results.length]);

  const filteredTexts = useMemo(() => {
    const q = articleQuery.trim().toLowerCase();
    if (!q) return texts;
    return texts.filter((t) => `${t.title || ''} ${t.author || ''}`.toLowerCase().includes(q));
  }, [texts, articleQuery]);

  const onGenerate = async () => {
    const v = await form.validateFields();
    setGenerating(true);
    setResults([]);
    setActive(null);
    try {
      const list = v.mode === 'weak_point'
        ? await generateByWeakPoint(v)
        : await generateByArticles(v);
      setResults(list);
      message.success(`已生成 ${list.length} 道待导入题目`);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const generateByArticles = async (v: any): Promise<DraftQuestion[]> => {
    const ids: string[] = v.text_ids || [];
    const selected = ids.map((id) => texts.find((t) => t.id === id)).filter(Boolean);
    if (!selected.length) throw new Error('请选择文章');

    const counts = distributeCount(v.count, selected.length);
    const all: DraftQuestion[] = [];
    for (let i = 0; i < selected.length; i++) {
      const article = selected[i];
      const items = await invoke<any[]>('question:ai-preview', {
        paragraph: article.full_text,
        title: article.title,
        author: article.author,
        types: v.types,
        count: counts[i],
        starRange: normalizeStarRange(v.star_range),
      });
      all.push(...items.map((q, idx) => ({
        ...q,
        draft_id: makeDraftId(article.id, idx),
        text_id: article.id,
        paragraph_id: v.paragraph_id,
      })));
    }
    return all;
  };

  const generateByWeakPoint = async (v: any): Promise<DraftQuestion[]> => {
    const weakPoint = weakPoints.find((w) => w.id === v.weak_point_id);
    if (!weakPoint) throw new Error('请选择易错点');
    const items = await invoke<any[]>('weak-point:ai-preview', {
      weak_point_id: v.weak_point_id,
      text_id: v.text_ids?.[0],
      types: v.types,
      count: v.count,
      stars: v.star_range,
    });
    return items.map((q, idx) => ({
      ...q,
      draft_id: makeDraftId(v.weak_point_id, idx),
      text_id: weakPoint.text_id,
      paragraph_id: weakPoint.paragraph_id,
      weak_point_id: v.weak_point_id,
    }));
  };

  const onRemoveDraft = (draftId: string) => {
    setResults((list) => list.filter((q) => q.draft_id !== draftId));
    setActive((cur) => (cur?.draft_id === draftId ? null : cur));
  };

  const onImport = async () => {
    if (!results.length) return;
    setImporting(true);
    try {
      const weakPointId = results[0]?.weak_point_id;
      let imported: any[] = [];
      if (weakPointId) {
        imported = await invoke<any[]>('weak-point:import-generated', {
          weak_point_id: weakPointId,
          items: results,
        });
      } else {
        const groups = new Map<string, DraftQuestion[]>();
        for (const q of results) {
          const key = `${q.text_id}::${q.paragraph_id || ''}`;
          groups.set(key, [...(groups.get(key) || []), q]);
        }
        for (const group of groups.values()) {
          const created = await invoke<any[]>('question:import-generated', {
            text_id: group[0].text_id,
            paragraph_id: group[0].paragraph_id,
            items: group,
          });
          imported = imported.concat(created);
        }
      }
      setResults([]);
      setActive(null);
      message.success(`已导入 ${imported.length} 道题目到题目库`);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const toggleArticle = (id: string, mode: string) => {
    const current: string[] = form.getFieldValue('text_ids') || [];
    const next = toggleArticleSelection(current, hoverLockedIds, id, mode);
    form.setFieldValue('text_ids', next.selectedIds);
    setHoverLockedIds(next.hoverLockedIds);
    if (mode === 'weak_point') form.setFieldValue('weak_point_id', undefined);
  };

  const toggleAllArticles = (selectedIds: string[]) => {
    const next = toggleAllArticleSelection(texts.map((t) => t.id), selectedIds);
    form.setFieldValue('text_ids', next.selectedIds);
    setHoverLockedIds(next.hoverLockedIds);
  };

  const unlockArticleHover = (id: string) => {
    setHoverLockedIds((ids) => releaseArticleHoverLock(ids, id));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>AI 出题</Typography.Title>
      <Alert
        message="选择文章、题型和星级范围，AI 会先生成待导入题目。你可以剔除不合适的题目，确认后再导入题目库。"
        type="info"
        showIcon
      />

      <Card className="textbook-card">
        <Form form={form} layout="vertical" initialValues={{ mode: 'article', count: 6, star_range: [1, 5], types: ['choice', 'blank', 'context_recitation'] }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="出题方式" name="mode">
                <Select
                  options={[
                    { value: 'article', label: '按文章出题' },
                    { value: 'weak_point', label: '按易错点出题' },
                  ]}
                  onChange={() => {
                    form.setFieldsValue({ text_ids: [], weak_point_id: undefined });
                    setArticleQuery('');
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="题目数量" name="count">
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="星级范围" name="star_range">
                <Select
                  mode="multiple"
                  maxTagCount={2}
                  options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} 星` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="题型" name="types" rules={[{ required: true, message: '请选择题型' }]}>
            <Select mode="multiple" options={TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode || prev.text_ids !== cur.text_ids}>
            {({ getFieldValue }) => {
              const mode = getFieldValue('mode');
              const selectedIds: string[] = getFieldValue('text_ids') || [];
              const allArticlesSelected = texts.length > 0 && texts.every((t) => selectedIds.includes(t.id));
              return (
                <Form.Item
                  label={mode === 'weak_point' ? '文章' : '文章（可多选）'}
                  name="text_ids"
                  rules={[{
                    validator: (_, value) => Array.isArray(value) && value.length
                      ? Promise.resolve()
                      : Promise.reject(new Error('请选择文章')),
                  }]}
                >
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Input
                      allowClear
                      value={articleQuery}
                      onChange={(e) => setArticleQuery(e.target.value)}
                      placeholder="输入标题或作者搜索"
                    />
                    {mode !== 'weak_point' ? (
                      <Space wrap>
                        <Button
                          icon={<CheckSquareOutlined />}
                          onClick={() => toggleAllArticles(selectedIds)}
                          disabled={!texts.length}
                        >
                          {allArticlesSelected ? '取消选择全部文章' : '选择全部文章'}
                        </Button>
                        <Typography.Text type="secondary">
                          已选择 {selectedIds.length} / {texts.length} 篇
                        </Typography.Text>
                      </Space>
                    ) : null}
                    <div className="article-choice-grid">
                      {filteredTexts.map((t) => {
                        const selected = selectedIds.includes(t.id);
                        const hoverLocked = hoverLockedIds.includes(t.id);
                        return (
                          <button
                            type="button"
                            key={t.id}
                            className={`article-choice-box${selected ? ' active' : ''}${hoverLocked ? ' hover-locked' : ''}`}
                            onClick={() => toggleArticle(t.id, mode)}
                            onMouseLeave={() => unlockArticleHover(t.id)}
                          >
                            <span className="article-choice-title">{t.title}</span>
                            {t.author ? <span className="article-choice-author">{t.author}</span> : null}
                          </button>
                        );
                      })}
                      {!filteredTexts.length ? <Typography.Text type="secondary">没有匹配的文章</Typography.Text> : null}
                    </div>
                  </Space>
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.mode !== cur.mode || prev.text_ids !== cur.text_ids}>
            {({ getFieldValue }) => {
              if (getFieldValue('mode') !== 'weak_point') return null;
              const selectedTextId = getFieldValue('text_ids')?.[0];
              const filteredWeakPoints = weakPoints.filter((w) => !selectedTextId || w.text_id === selectedTextId);
              return (
                <Form.Item label="易错点" name="weak_point_id" rules={[{ required: true, message: '请选择易错点' }]}>
                  <Select
                    showSearch
                    placeholder={selectedTextId ? '选择易错点' : '请先选择文章'}
                    options={filteredWeakPoints.map((w) => ({ value: w.id, label: w.title }))}
                    optionFilterProp="label"
                    disabled={!selectedTextId}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Button type="primary" icon={<RobotOutlined />} loading={generating} onClick={onGenerate}>生成题目</Button>
        </Form>
      </Card>

      {results.length > 0 && (
        <div ref={resultRef}>
          <Card
            title={`待导入题目 (${results.length} 道)`}
            className="textbook-card"
            extra={<Button type="primary" icon={<ImportOutlined />} loading={importing} onClick={onImport}>确认导入题目库</Button>}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {results.map((q, idx) => (
                <div key={q.draft_id} className="question-result-card" role="button" tabIndex={0} onClick={() => setActive(q)}>
                  <div className="question-result-head">
                    <Space wrap>
                      <Tag color="purple">{typeLabel(q.type)}</Tag>
                      <Tag color="orange">{'★'.repeat(q.star)}</Tag>
                      {q.logic_role ? <Tag color="cyan">{q.logic_role}</Tag> : null}
                    </Space>
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDraft(q.draft_id);
                      }}
                    >
                      剔除
                    </Button>
                  </div>
                  <Typography.Text type="secondary">第 {idx + 1} 题</Typography.Text>
                  <div className="question-prompt"><MarkedText text={q.prompt} /></div>
                  {q.options?.length ? (
                    <ul className="question-option-list">
                      {q.options.map((o: string, i: number) => <li key={i} className="serif">{String.fromCharCode(65 + i)}. {o}</li>)}
                    </ul>
                  ) : null}
                  <Button size="small" icon={<EyeOutlined />} onClick={(e) => { e.stopPropagation(); setActive(q); }}>查看详情</Button>
                </div>
              ))}
            </Space>
          </Card>
        </div>
      )}

      <Modal
        title="题目详情"
        open={!!active}
        onCancel={() => setActive(null)}
        footer={<Button type="primary" onClick={() => setActive(null)}>知道了</Button>}
        width={720}
        getContainer={false}
        styles={{ mask: { backdropFilter: 'blur(8px)', background: 'rgba(245, 245, 247, 0.58)' } }}
      >
        {active ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="purple">{typeLabel(active.type)}</Tag>
              <Tag color="orange">{'★'.repeat(active.star)}</Tag>
              {active.logic_role ? <Tag color="cyan">{active.logic_role}</Tag> : null}
            </Space>
            <div className="question-prompt"><MarkedText text={active.prompt} /></div>
            {active.options?.length ? (
              <ul className="question-option-list">
                {active.options.map((o: string, i: number) => <li key={i} className="serif">{String.fromCharCode(65 + i)}. {o}</li>)}
              </ul>
            ) : null}
            <Divider style={{ margin: '8px 0' }} />
            <Typography.Title level={5}>答案</Typography.Title>
            <div className="question-answer">{active.answer}</div>
            {active.explanation ? (
              <>
                <Typography.Title level={5}>解析</Typography.Title>
                <Typography.Paragraph type="secondary">{active.explanation}</Typography.Paragraph>
              </>
            ) : null}
            {active.source_text ? (
              <>
                <Typography.Title level={5}>原文依据</Typography.Title>
                <Typography.Paragraph className="serif">{active.source_text}</Typography.Paragraph>
              </>
            ) : null}
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
