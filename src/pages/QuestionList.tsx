import { useEffect, useState } from 'react';
import type { Key } from 'react';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';

type Question = {
  id: string;
  text_id: string;
  text_title?: string;
  type: string;
  star: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  hint?: string;
  explanation?: string;
  enabled: number;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  choice: '选择题',
  blank: '挖空题',
  context_blank: '文脉挖空',
  context_recitation: '文脉默写',
  pure_recitation: '纯默写',
  ordering: '排序题',
};

export default function QuestionList() {
  const [items, setItems] = useState<Question[]>([]);
  const [texts, setTexts] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [textId, setTextId] = useState<string | undefined>();
  const [type, setType] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<Question | null>(null);
  const [detail, setDetail] = useState<Question | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [favoriteModalOpen, setFavoriteModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [favoriteForm] = Form.useForm();

  const load = async () => {
    try {
      const [list, favorites, t, folderRows] = await Promise.all([
        invoke<Question[]>('question:list', { text_id: textId, type }),
        invoke<any[]>('favorite:list-questions', {}),
        invoke<any[]>('article:list', {}),
        invoke<any[]>('favorite:list-folders', {}),
      ]);
      setFavoriteIds(new Set(favorites.map((f) => f.question_id)));
      setTexts(t);
      setFolders(folderRows);
      const map = new Map(t.map((x) => [x.id, x]));
      const filtered = list.filter((q) => !keyword || q.prompt.includes(keyword) || q.answer.includes(keyword));
      setItems(filtered.map((q) => ({ ...q, text_title: map.get(q.text_id)?.title })));
      setSelectedRowKeys((keys) => keys.filter((id) => filtered.some((q) => q.id === id)));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  useEffect(() => { load(); }, [textId, type]);

  const onSave = async () => {
    const values = await form.validateFields();
    try {
      await invoke('question:update', { id: editing!.id, ...values });
      message.success('已保存');
      setEditing(null);
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await invoke('question:delete', { id });
      message.success('已删除');
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onBatchDelete = async () => {
    try {
      for (const id of selectedRowKeys) {
        await invoke('question:delete', { id });
      }
      message.success(`已删除 ${selectedRowKeys.length} 道题目`);
      setSelectedRowKeys([]);
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onBatchFavorite = async () => {
    const values = await favoriteForm.validateFields();
    try {
      const result = await invoke<any>('favorite:questions', {
        question_ids: selectedRowKeys,
        folder_id: values.folder_id,
        folder_name: values.folder_name,
      });
      message.success(`已导入收藏夹 ${result.count} 道题目`);
      setFavoriteModalOpen(false);
      favoriteForm.resetFields();
      setSelectedRowKeys([]);
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await invoke('question:set-enabled', { id, enabled });
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

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

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>题目管理</Typography.Title>

      <Card className="textbook-card">
        <Space wrap style={{ marginBottom: 12 }}>
          <Select
            placeholder="按文章筛选"
            allowClear
            style={{ width: 240 }}
            value={textId}
            onChange={setTextId}
            options={texts.map((t) => ({ value: t.id, label: t.title }))}
          />
          <Select
            placeholder="按题型筛选"
            allowClear
            style={{ width: 160 }}
            value={type}
            onChange={setType}
            options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
          />
          <Input.Search
            placeholder="题干/答案关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={load}
            style={{ width: 240 }}
            allowClear
          />
          <Button onClick={load}>刷新</Button>
          <Button disabled={!selectedRowKeys.length} icon={<StarOutlined />} onClick={() => setFavoriteModalOpen(true)}>导入收藏夹</Button>
          <Popconfirm title={`确认删除选中的 ${selectedRowKeys.length} 道题目？`} onConfirm={onBatchDelete}>
            <Button danger disabled={!selectedRowKeys.length} icon={<DeleteOutlined />}>批量删除</Button>
          </Popconfirm>
          <Typography.Text type="secondary">已选 {selectedRowKeys.length} 道</Typography.Text>
        </Space>
        <Table
          rowKey="id"
          dataSource={items}
          rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
          onRow={(record) => ({
            onClick: () => setDetail(record),
            style: { cursor: 'pointer' },
          })}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '文章', dataIndex: 'text_title', width: 140 },
            { title: '题型', dataIndex: 'type', width: 100, render: (v) => <Tag color="purple">{TYPE_LABEL[v] || v}</Tag> },
            { title: '星级', dataIndex: 'star', width: 70, render: (v) => <Tag color="orange">{'★'.repeat(v)}</Tag> },
            {
              title: '题干',
              dataIndex: 'prompt',
              ellipsis: true,
              render: (v) => <MarkedText className="serif" text={v} />,
            },
            {
              title: '答案',
              dataIndex: 'answer',
              width: 240,
              render: (v) => <span className="serif">{v}</span>,
            },
            {
              title: '状态', dataIndex: 'enabled', width: 80, render: (v, r: any) => (
                <Switch size="small" checked={!!v} onChange={(c) => onToggleEnabled(r.id, c)} />
              ),
            },
            {
              title: '操作', width: 260, render: (_, r: any) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(r)}>查看</Button>
                  <Button size="small" icon={favoriteIds.has(r.id) ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFavorite(r)}>
                    {favoriteIds.has(r.id) ? '已收藏' : '收藏'}
                  </Button>
                  <Button size="small" icon={<EditOutlined />} onClick={() => {
                    setEditing(r);
                    form.setFieldsValue(r);
                  }}>编辑</Button>
                  <Popconfirm title="确认删除？" onConfirm={() => onDelete(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="导入收藏夹"
        open={favoriteModalOpen}
        onCancel={() => setFavoriteModalOpen(false)}
        onOk={onBatchFavorite}
        okText="确认导入"
      >
        <Form form={favoriteForm} layout="vertical">
          <Typography.Paragraph type="secondary">不选择题目夹时，题目只会进入收藏夹。</Typography.Paragraph>
          <Form.Item label="导入到已有题目夹" name="folder_id">
            <Select
              allowClear
              placeholder="可选"
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(value) => { if (value) favoriteForm.setFieldValue('folder_name', undefined); }}
            />
          </Form.Item>
          <Form.Item label="或即时创建题目夹" name="folder_name">
            <Input placeholder="输入新题目夹名称" onChange={() => favoriteForm.setFieldValue('folder_id', undefined)} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑题目"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={onSave}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="题干" name="prompt" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Space>
            <Form.Item label="题型" name="type">
              <Select style={{ width: 160 }} options={Object.entries(TYPE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item label="星级" name="star">
              <Select style={{ width: 100 }} options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} 星` }))} />
            </Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Form.Item label="选项（仅选择题）" name="options">
            <Select mode="tags" placeholder="逐个输入选项" />
          </Form.Item>
          <Form.Item label="答案" name="answer" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="提示" name="hint"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="解析" name="explanation"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="原文片段" name="source_text"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="题目详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={760}
      >
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="purple">{TYPE_LABEL[detail.type] || detail.type}</Tag>
              <Tag color="orange">{'★'.repeat(detail.star)}</Tag>
              {detail.text_title ? <Tag>{detail.text_title}</Tag> : null}
              <Button size="small" icon={favoriteIds.has(detail.id) ? <StarFilled /> : <StarOutlined />} onClick={() => toggleFavorite(detail)}>
                {favoriteIds.has(detail.id) ? '已收藏' : '收藏'}
              </Button>
            </Space>
            <Typography.Title level={5}>题干</Typography.Title>
            <Typography.Paragraph className="serif" style={{ whiteSpace: 'pre-wrap' }}><MarkedText text={detail.prompt} /></Typography.Paragraph>
            {detail.options?.length ? (
              <>
                <Typography.Title level={5}>选项</Typography.Title>
                <Space direction="vertical">
                  {detail.options.map((o, i) => <Typography.Text key={i} className="serif">{String.fromCharCode(65 + i)}. {o}</Typography.Text>)}
                </Space>
              </>
            ) : null}
            <Typography.Title level={5}>答案</Typography.Title>
            <Typography.Paragraph className="serif" style={{ whiteSpace: 'pre-wrap' }}>{detail.answer}</Typography.Paragraph>
            {detail.source_text ? (
              <>
                <Typography.Title level={5}>原文片段</Typography.Title>
                <Typography.Paragraph className="serif" style={{ whiteSpace: 'pre-wrap' }}>{detail.source_text}</Typography.Paragraph>
              </>
            ) : null}
            {detail.explanation ? (
              <>
                <Typography.Title level={5}>解析</Typography.Title>
                <Typography.Paragraph>{detail.explanation}</Typography.Paragraph>
              </>
            ) : null}
          </Space>
        )}
      </Modal>
    </Space>
  );
}
