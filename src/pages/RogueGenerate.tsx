import { useEffect, useState } from 'react';
import { Card, Form, Select, InputNumber, Switch, Button, Space, Typography, message, Alert, Row, Col, Tag, Divider } from 'antd';
import { EyeOutlined, FireOutlined, StarFilled, PlayCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { invoke } from '../api/ipc';

const STAR_DESC = {
  1: '入门热身 · 5 心 · 5—8 题 · 70% 1 星题',
  2: '基础巩固 · 5 心 · 8—10 题 · 50% 2 星题',
  3: '常规训练 · 4 心 · 10—14 题 · 35% 3 星题',
  4: '高难挑战 · 3 心 · 12—16 题 · 30% 4 星题',
  5: 'Boss 综合 · 3 心 · 15—20 题 · 40% 4 星题',
};

const TYPE_OPTIONS = [
  { value: '文言文', label: '文言文' },
  { value: '古代散文', label: '古代散文' },
  { value: '古诗', label: '古诗' },
  { value: '词', label: '词' },
  { value: '赋', label: '赋' },
  { value: '骈文', label: '骈文' },
  { value: '议论文', label: '议论文' },
];

const RANGE_OPTIONS = [
  { value: 'all', label: '全部文章' },
  { value: 'single', label: '单篇 (指定)' },
  { value: 'multiple', label: '多篇 (指定)' },
  { value: 'wrong_high', label: '错题高发文章' },
  { value: 'favorites', label: '收藏文章' },
];

const QUESTION_TYPES = [
  { value: 'choice', label: '选择题' },
  { value: 'blank', label: '挖空题' },
  { value: 'context_recitation', label: '文脉默写' },
  { value: 'pure_recitation', label: '纯默写' },
];

export default function RogueGenerate() {
  const [form] = Form.useForm();
  const [texts, setTexts] = useState<any[]>([]);
  const [weakPoints, setWeakPoints] = useState<any[]>([]);
  const [dungeons, setDungeons] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    invoke<any[]>('article:list', {}).then(setTexts);
    invoke<any[]>('weak-point:list', { enabled: 1 }).then(setWeakPoints);
    invoke<any[]>('rogue:list', {}).then(setDungeons);
  }, []);

  const onGenerate = async () => {
    const v = await form.validateFields();
    setGenerating(true);
    try {
      const r = await invoke<any>('rogue:generate', {
        star: v.star,
        article_range: v.article_range,
        article_types: v.article_types,
        length_mode: v.length_mode,
        preferred_question_types: v.preferred_question_types,
        prefer_wrong_items: v.prefer_wrong_items,
        prefer_enabled_weak_points: v.prefer_enabled_weak_points,
        allow_ai_generate_questions: v.allow_ai_generate,
        text_ids: v.text_ids,
      });
      setResult(r);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const onPlayTemp = async () => {
    if (!result) return;
    try {
      const id = await invoke<string>('rogue:save', { dungeon: result.dungeon, favorite: false, source: 'generated' });
      nav(`/rogue/play/${id}`);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>Rogue 副本生成</Typography.Title>
      <Alert message={STAR_DESC[5]} type="info" showIcon />

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="副本条件" className="textbook-card">
            <Form form={form} layout="vertical" initialValues={{
              star: 3,
              article_range: 'all',
              length_mode: 'mixed',
              prefer_wrong_items: true,
              prefer_enabled_weak_points: true,
              allow_ai_generate: true,
            }}>
              <Form.Item label="难度" name="star" rules={[{ required: true }]}>
                <Select options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} 星 · ${STAR_DESC[v as 1]}` }))} />
              </Form.Item>
              <Form.Item label="文章范围" name="article_range" rules={[{ required: true }]}>
                <Select options={RANGE_OPTIONS} />
              </Form.Item>
              <Form.Item label="指定文章 (单篇/多篇时填)" name="text_ids">
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  placeholder="选择具体文章"
                  options={texts.map((t) => ({ value: t.id, label: t.title }))}
                />
              </Form.Item>
              <Form.Item label="文章类型" name="article_types">
                <Select mode="multiple" options={TYPE_OPTIONS} placeholder="不限" />
              </Form.Item>
              <Form.Item label="文章长度" name="length_mode">
                <Select
                  options={[
                    { value: 'any', label: '不限' },
                    { value: 'short', label: '短文' },
                    { value: 'long', label: '长文' },
                    { value: 'mixed', label: '混合' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="题型偏好" name="preferred_question_types">
                <Select mode="multiple" options={QUESTION_TYPES} placeholder="默认覆盖全部" />
              </Form.Item>
              <Space size="middle" wrap>
                <Form.Item label="优先错题" name="prefer_wrong_items" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item label="优先易错点" name="prefer_enabled_weak_points" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item label="允许 AI 临时出题" name="allow_ai_generate" valuePropName="checked"><Switch /></Form.Item>
              </Space>
              <Button type="primary" loading={generating} icon={<FireOutlined />} onClick={onGenerate}>生成副本</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="副本预览" className="textbook-card">
            {!result ? (
              <Typography.Text type="secondary">点击「生成副本」开始</Typography.Text>
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  <StarFilled style={{ color: '#fa8c16', marginRight: 6 }} />
                  {result.dungeon.name}
                </Typography.Title>
                <Space wrap>
                  <Tag color="purple">{result.dungeon.star} 星</Tag>
                  <Tag color="cyan">初始血量: {result.dungeon.initial_hearts} 心</Tag>
                  <Tag color="orange">题目数: {result.dungeon.question_ids.length}</Tag>
                  <Tag color="green">房间数: {result.dungeon.rooms.length}</Tag>
                </Space>
                <Divider style={{ margin: '8px 0' }} />
                {result.dungeon.rooms.map((r: any, i: number) => (
                  <Space key={r.id} wrap>
                    <Tag color={roomColor(r.type)}>{i + 1}. {r.name} ({roomTypeLabel(r.type)})</Tag>
                    <Typography.Text type="secondary">{r.question_ids.length} 题</Typography.Text>
                  </Space>
                ))}
                <Divider style={{ margin: '8px 0' }} />
                <Space>
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={onPlayTemp}>开始挑战</Button>
                </Space>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="我的副本" className="textbook-card">
        {dungeons.length === 0 ? (
          <Typography.Text type="secondary">还没有保存的副本</Typography.Text>
        ) : (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {dungeons.map((d) => (
              <Space key={d.id} style={{ width: '100%', justifyContent: 'space-between', padding: 8, background: '#fafafa', borderRadius: 8 }}>
                <Space>
                  <Tag color="purple">{d.star} 星</Tag>
                  <span>{d.name}</span>
                  {d.favorite ? <Tag color="magenta">已收藏</Tag> : null}
                </Space>
                <Space>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => nav(`/rogue/${d.id}`)}>查看题目</Button>
                  <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => nav(`/rogue/play/${d.id}`)}>挑战</Button>
                </Space>
              </Space>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  );
}

function roomTypeLabel(t: string) {
  return ({
    safe: '安全房', normal: '普通房', danger: '危险房', elite: '精英房',
    weak_point: '易错点房', rest: '休息房', boss: 'Boss 房',
  } as any)[t] || t;
}
function roomColor(t: string) {
  return ({
    safe: 'green', normal: 'blue', danger: 'orange', elite: 'purple',
    weak_point: 'magenta', rest: 'cyan', boss: 'red',
  } as any)[t] || 'default';
}
