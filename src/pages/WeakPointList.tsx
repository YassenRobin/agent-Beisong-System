import { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Typography, Tag, message, Switch, Popconfirm, Modal, InputNumber, Form, Select, Input } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined, BarChartOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { invoke } from '../api/ipc';

type WeakPoint = {
  id: string;
  title: string;
  text_id: string;
  text_title?: string;
  weak_type?: string;
  enabled: number;
  question_count?: number;
  attempt_count?: number;
  correct_count?: number;
  accuracy?: number;
};

export default function WeakPointList() {
  const [items, setItems] = useState<WeakPoint[]>([]);
  const [texts, setTexts] = useState<any[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genModal, setGenModal] = useState<WeakPoint | null>(null);
  const [genForm] = Form.useForm();
  const nav = useNavigate();

  const load = async () => {
    try {
      const list = await invoke<WeakPoint[]>('weak-point:list', {});
      const t = await invoke<any[]>('article:list', {});
      setTexts(t);
      const map = new Map(t.map((x) => [x.id, x]));
      setItems(list.map((w) => ({ ...w, text_title: map.get(w.text_id)?.title })));
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => { load(); }, []);

  const onToggle = async (id: string, enabled: boolean) => {
    try {
      await invoke('weak-point:toggle', { id, enabled });
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await invoke('weak-point:delete', { id });
      message.success('已删除');
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openGenModal = (wp: WeakPoint) => {
    setGenModal(wp);
    genForm.setFieldsValue({
      types: ['choice', 'blank', 'context_recitation', 'pure_recitation'],
      count: 6,
      stars: [1, 2, 3, 4],
    });
  };

  const onGen = async () => {
    const v = await genForm.validateFields();
    if (!genModal) return;
    setGeneratingId(genModal.id);
    try {
      const records = await invoke<any[]>('weak-point:ai-generate', {
        weak_point_id: genModal.id,
        types: v.types,
        count: v.count,
        stars: v.stars,
        description: v.description,
      });
      message.success(`生成 ${records.length} 道题`);
      setGenModal(null);
      load();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>老师易错点</Typography.Title>
        <Link to="/weak-points/new"><Button type="primary" icon={<PlusOutlined />}>新增易错点</Button></Link>
      </Space>

      <Card className="textbook-card">
        <Table
          rowKey="id"
          dataSource={items}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '标题', dataIndex: 'title', render: (v, r) => <Link to={`/weak-points/${r.id}`}>{v}</Link> },
            { title: '文章', dataIndex: 'text_title', width: 140 },
            { title: '类型', dataIndex: 'weak_type', width: 120, render: (v) => v ? <Tag>{v}</Tag> : null },
            {
              title: '启用', dataIndex: 'enabled', width: 80, render: (v, r: any) => (
                <Switch size="small" checked={!!v} onChange={(c) => onToggle(r.id, c)} />
              ),
            },
            { title: '题目数', dataIndex: 'question_count', width: 90 },
            { title: '作答数', dataIndex: 'attempt_count', width: 90 },
            {
              title: '正确率', dataIndex: 'accuracy', width: 100, render: (v) =>
                v == null ? '-' : <Tag color={v >= 0.85 ? 'green' : v >= 0.7 ? 'orange' : 'red'}>
                  {(v * 100).toFixed(0)}%
                </Tag>,
            },
            {
              title: '操作', width: 280, render: (_, r: any) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => nav(`/weak-points/${r.id}`)}>编辑</Button>
                  <Button size="small" icon={<RobotOutlined />} onClick={() => nav(`/ai-generate?weakPointId=${r.id}`)} loading={generatingId === r.id}>AI 生题</Button>
                  <Button size="small" icon={<BarChartOutlined />} onClick={() => nav(`/rankings?focus=weak-point&id=${r.id}`)}>统计</Button>
                  <Popconfirm title="删除?" onConfirm={() => onDelete(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={genModal ? `为「${genModal.title}」生成专项题` : ''}
        open={!!genModal}
        onCancel={() => setGenModal(null)}
        onOk={onGen}
        okText="生成"
        confirmLoading={!!generatingId}
      >
        <Form form={genForm} layout="vertical">
          <Form.Item label="题型" name="types" rules={[{ required: true }]}>
            <Select mode="multiple" options={[
              { value: 'choice', label: '选择' },
              { value: 'blank', label: '挖空' },
              { value: 'context_recitation', label: '文脉默写' },
              { value: 'pure_recitation', label: '纯默写' },
            ]} />
          </Form.Item>
          <Form.Item label="星级" name="stars" rules={[{ required: true }]}>
            <Select mode="multiple" options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: v + ' 星' }))} />
          </Form.Item>
          <Form.Item label="题目数量" name="count">
            <InputNumber min={1} max={20} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="易错点描述补充" name="description">
            <Input.TextArea rows={2} placeholder="(可选) 补充教学要求" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
