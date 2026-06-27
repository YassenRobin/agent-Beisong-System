import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Progress, Radio, Result, Row, Select, Slider, Space, Tabs, Tag, Typography, message } from 'antd';
import { CheckCircleOutlined, EyeInvisibleOutlined, RetweetOutlined } from '@ant-design/icons';
import { invoke } from '../api/ipc';
import {
  ReciteCategory,
  ReciteParagraph,
  ReciteUnit,
  createPracticeParagraphs,
  inferReciteCategory,
  isRecitationMatch,
  makeDeterministicShuffle,
  maskTextByLevel,
} from '../utils/reciteTraining';

type Article = {
  id: string;
  title: string;
  author?: string;
  type?: string;
  length_type?: string;
  full_text: string;
};

export default function CreativeRecite() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [category, setCategory] = useState<ReciteCategory>('poetry');
  const [articleId, setArticleId] = useState<string>();
  const [paragraphId, setParagraphId] = useState<string>();

  useEffect(() => {
    invoke<Article[]>('article:list', { enabled: 1 })
      .then((rows) => {
        setArticles(rows);
        const firstPoetry = rows.find((item) => inferReciteCategory(item) === 'poetry');
        setArticleId((firstPoetry || rows[0])?.id);
      })
      .catch((e: any) => message.error(e.message));
  }, []);

  const filteredArticles = useMemo(
    () => articles.filter((item) => inferReciteCategory(item) === category),
    [articles, category],
  );
  const article = filteredArticles.find((item) => item.id === articleId);
  const paragraphs = useMemo(
    () => createPracticeParagraphs(article?.full_text || '', category),
    [article?.full_text, category],
  );
  const activeParagraph = paragraphs.find((item) => item.id === paragraphId) || paragraphs[0];

  useEffect(() => {
    if (!filteredArticles.length) {
      setArticleId(undefined);
      return;
    }
    if (!filteredArticles.some((item) => item.id === articleId)) {
      setArticleId(filteredArticles[0].id);
    }
  }, [articleId, filteredArticles]);

  useEffect(() => {
    setParagraphId(paragraphs[0]?.id);
  }, [articleId, category, paragraphs[0]?.id]);

  if (!articles.length) {
    return (
      <Card className="textbook-card">
        <Result status="info" title="暂无文章" subTitle="先在文章管理中添加古诗文，再进入创新背诵。" />
      </Card>
    );
  }

  const categoryLabel = category === 'poetry' ? '诗词' : '文言文';

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>创新背诵</Typography.Title>
          <Typography.Text type="secondary">诗词全文训练，文言文按段推进。</Typography.Text>
        </div>
        <Space wrap>
          <Radio.Group value={category} onChange={(e) => setCategory(e.target.value)}>
            <Radio.Button value="poetry">诗词</Radio.Button>
            <Radio.Button value="prose">文言文</Radio.Button>
          </Radio.Group>
          <Select
            showSearch
            value={articleId}
            style={{ width: 300 }}
            optionFilterProp="label"
            placeholder={`选择${categoryLabel}篇目`}
            onChange={setArticleId}
            options={filteredArticles.map((item) => ({
              value: item.id,
              label: item.author ? `${item.title} · ${item.author}` : item.title,
            }))}
          />
          {category === 'prose' ? (
            <Select
              value={activeParagraph?.id}
              style={{ width: 160 }}
              onChange={setParagraphId}
              options={paragraphs.map((item) => ({ value: item.id, label: `${item.title} · ${item.units.length} 句` }))}
            />
          ) : (
            <Tag color="purple">全文训练</Tag>
          )}
        </Space>
      </Space>

      <Alert
        type="info"
        showIcon
        message={category === 'poetry'
          ? '诗词使用全文机制：乱序复原、遮罩朗读、空格递减都围绕整首作品训练。'
          : '文言文使用分段机制：先选择单个段落，再进行乱序复原、遮罩朗读和空格递减背诵。'}
      />

      {!filteredArticles.length ? (
        <Card className="textbook-card"><Empty description={`暂无${categoryLabel}文章`} /></Card>
      ) : !article || !activeParagraph ? (
        <Card className="textbook-card"><Empty description="当前文章暂无可训练内容" /></Card>
      ) : (
        <Tabs
          items={[
            { key: 'ordering', label: '乱序复原', children: <OrderingRestore paragraph={activeParagraph} /> },
            { key: 'mask', label: '遮罩朗读', children: <MaskedRecite paragraph={activeParagraph} /> },
            { key: 'gap', label: '空格递减背诵', children: <GapRecite paragraph={activeParagraph} /> },
          ]}
        />
      )}
    </Space>
  );
}

function OrderingRestore({ paragraph }: { paragraph: ReciteParagraph }) {
  const source = paragraph.units;
  const [pool, setPool] = useState<ReciteUnit[]>(() => makeDeterministicShuffle(source));
  const [picked, setPicked] = useState<ReciteUnit[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setPool(makeDeterministicShuffle(paragraph.units));
    setPicked([]);
    setChecked(false);
  }, [paragraph.id, paragraph.units]);

  const isCorrect = picked.length === source.length && picked.every((item, index) => item.id === source[index].id);
  const progress = source.length ? Math.round((picked.length / source.length) * 100) : 0;

  return (
    <Card className="textbook-card">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <ModeHeader title="乱序复原" desc={`${paragraph.title}：按原文顺序把句子放回右侧。`} progress={progress} />
        <Row gutter={16}>
          <Col xs={24} lg={12}>
            <Card size="small" title="待选择" className="recite-column-card">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {pool.map((unit) => (
                  <Button key={unit.id} block className="recite-choice" onClick={() => {
                    setPool((items) => items.filter((item) => item.id !== unit.id));
                    setPicked((items) => [...items, unit]);
                    setChecked(false);
                  }}>
                    {unit.text}
                  </Button>
                ))}
                {!pool.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="已全部选择" /> : null}
              </Space>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="复原结果" className="recite-column-card">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {picked.length ? picked.map((unit, index) => (
                  <div key={unit.id} className="recite-picked-line">
                    <Tag>{index + 1}</Tag>
                    <span className="serif">{unit.text}</span>
                    <Button size="small" onClick={() => {
                      setPicked((items) => items.filter((item) => item.id !== unit.id));
                      setPool((items) => [...items, unit]);
                      setChecked(false);
                    }}>撤回</Button>
                  </div>
                )) : <Typography.Text type="secondary">从左侧选择句子开始复原。</Typography.Text>}
              </Space>
            </Card>
          </Col>
        </Row>

        <Space>
          <Button icon={<CheckCircleOutlined />} type="primary" disabled={picked.length !== source.length} onClick={() => setChecked(true)}>检查顺序</Button>
          <Button icon={<RetweetOutlined />} onClick={() => {
            setPool(makeDeterministicShuffle(source));
            setPicked([]);
            setChecked(false);
          }}>重来</Button>
        </Space>
        {checked ? <Alert type={isCorrect ? 'success' : 'warning'} message={isCorrect ? '顺序正确' : '顺序还不对，再对照原文调整。'} showIcon /> : null}
      </Space>
    </Card>
  );
}

function MaskedRecite({ paragraph }: { paragraph: ReciteParagraph }) {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [selfChecks, setSelfChecks] = useState<Array<'ok' | 'again'>>([]);

  useEffect(() => {
    setRevealedIds(new Set());
    setSelfChecks([]);
  }, [paragraph.id]);

  const okCount = selfChecks.filter((item) => item === 'ok').length;
  const progress = paragraph.units.length ? Math.round((revealedIds.size / paragraph.units.length) * 100) : 0;

  return (
    <Card className="textbook-card">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <ModeHeader
          title="遮罩朗读"
          desc={`${paragraph.title}：整段背诵，逐句点击揭开；再次点击可遮回。`}
          progress={progress}
          actions={(
            <Space wrap>
              <Button onClick={() => setRevealedIds(new Set())}>全部遮盖</Button>
              <Button onClick={() => setRevealedIds(new Set(paragraph.units.map((unit) => unit.id)))}>全部揭开</Button>
            </Space>
          )}
        />
        <div className="recite-mask-paragraph">
          {paragraph.units.map((unit, index) => {
            const revealed = revealedIds.has(unit.id);
            return (
              <button
                key={unit.id}
                type="button"
                className={`recite-mask-sentence${revealed ? ' revealed' : ''}`}
                onClick={() => setRevealedIds((ids) => {
                  const next = new Set(ids);
                  if (next.has(unit.id)) next.delete(unit.id);
                  else next.add(unit.id);
                  return next;
                })}
              >
                {revealed ? unit.text : <span><EyeInvisibleOutlined /> 点击揭开第 {index + 1} 句</span>}
              </button>
            );
          })}
        </div>
        <Space wrap>
          <Tag color="green">已掌握 {okCount}</Tag>
          <Button onClick={() => { setSelfChecks((items) => [...items, 'ok']); setRevealedIds(new Set()); }}>本段背对了</Button>
          <Button onClick={() => setSelfChecks((items) => [...items, 'again'])}>本段还不熟</Button>
        </Space>
      </Space>
    </Card>
  );
}

function GapRecite({ paragraph }: { paragraph: ReciteParagraph }) {
  const [index, setIndex] = useState(0);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const unit = paragraph.units[index] || paragraph.units[0];
  const matched = isRecitationMatch(unit?.text || '', answer);

  useEffect(() => {
    setIndex(0);
    setLevel(1);
    setAnswer('');
    setChecked(false);
  }, [paragraph.id]);

  return (
    <Card className="textbook-card">
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <ModeHeader title="空格递减背诵" desc={`${paragraph.title}：拖动进度选择要背的语句。`} progress={Math.round(((index + 1) / paragraph.units.length) * 100)} />
        <Slider
          min={0}
          max={Math.max(0, paragraph.units.length - 1)}
          value={index}
          onChange={(value) => {
            setIndex(value);
            setAnswer('');
            setChecked(false);
          }}
          marks={paragraph.units.reduce<Record<number, string>>((acc, _, unitIndex) => {
            acc[unitIndex] = String(unitIndex + 1);
            return acc;
          }, {})}
        />
        <Radio.Group value={level} onChange={(e) => { setLevel(e.target.value); setChecked(false); }}>
          <Radio.Button value={1}>轻遮罩</Radio.Button>
          <Radio.Button value={2}>中遮罩</Radio.Button>
          <Radio.Button value={3}>强遮罩</Radio.Button>
        </Radio.Group>
        <Typography.Paragraph className="serif recite-large-text">{maskTextByLevel(unit.text, level)}</Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={answer}
          onChange={(e) => { setAnswer(e.target.value); setChecked(false); }}
          placeholder="默写当前语句，再检查。"
        />
        <Space>
          <Button type="primary" onClick={() => setChecked(true)}>检查</Button>
          <Button onClick={() => setAnswer(unit.text)}>填入原文</Button>
          <Button disabled={index >= paragraph.units.length - 1} onClick={() => {
            setIndex((value) => Math.min(value + 1, paragraph.units.length - 1));
            setAnswer('');
            setChecked(false);
          }}>下一句</Button>
        </Space>
        {checked ? (
          <Alert
            type={matched ? 'success' : 'warning'}
            message={matched ? '完全匹配' : '还不完全一致'}
            description={<span className="serif">原文：{unit.text}</span>}
            showIcon
          />
        ) : null}
      </Space>
    </Card>
  );
}

function ModeHeader({ title, desc, progress, actions }: { title: string; desc: string; progress: number; actions?: ReactNode }) {
  return (
    <Row gutter={12} align="middle">
      <Col flex="auto">
        <Typography.Title level={4} style={{ margin: 0 }}>{title}</Typography.Title>
        <Typography.Text type="secondary">{desc}</Typography.Text>
      </Col>
      {actions ? <Col>{actions}</Col> : null}
      <Col flex="220px">
        <Progress percent={progress} size="small" />
      </Col>
    </Row>
  );
}
