import { useEffect, useState } from 'react';
import { Card, Table, Button, Input, Space, Typography, Popconfirm, Tag, message, Modal } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, ImportOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { invoke } from '../api/ipc';

type Article = {
  id: string;
  title: string;
  author?: string;
  dynasty?: string;
  type?: string;
  difficulty?: string;
  length_type?: string;
  full_text: string;
  enabled: number;
  updated_at: string;
};

export default function ArticleList() {
  const [items, setItems] = useState<Article[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const rows = await invoke<Article[]>('article:list', { keyword });
      setItems(rows);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id: string) => {
    try {
      await invoke('article:delete', { id });
      message.success('已删除');
      await load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const onImportJson = async () => {
    if (!importJson.trim()) {
      message.warning('请先粘贴文章 JSON');
      return;
    }
    setImporting(true);
    try {
      const result = await invoke<{ created: Article[]; skipped: Array<{ title: string; reason: string; message?: string }> }>(
        'article:import-json',
        { json: importJson },
      );
      setImportOpen(false);
      setImportJson('');
      await load();
      const skippedTitles = result.skipped.map((item) => item.title).join('、');
      if (result.skipped.length) {
        Modal.info({
          title: '导入完成',
          content: `已导入 ${result.created.length} 篇。以下标题已存在或无效, 已跳过: ${skippedTitles}`,
        });
      } else {
        message.success(`已导入 ${result.created.length} 篇文章`);
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>文章管理</Typography.Title>
        <Space>
          <Input
            placeholder="搜索标题 / 作者 / 正文"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={load}
            allowClear
            style={{ width: 280 }}
          />
          <Button onClick={load}>搜索</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>JSON 批量导入</Button>
          <Link to="/articles/new">
            <Button type="primary" icon={<PlusOutlined />}>新增文章</Button>
          </Link>
        </Space>
      </Space>

      <Card className="textbook-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '标题', dataIndex: 'title', render: (v, r) => <Link to={`/articles/${r.id}`}>{v}</Link> },
            { title: '作者', dataIndex: 'author', width: 120 },
            { title: '朝代', dataIndex: 'dynasty', width: 80 },
            { title: '类型', dataIndex: 'type', width: 120, render: (v) => v ? <Tag>{v}</Tag> : null },
            { title: '长度', dataIndex: 'length_type', width: 100, render: (v) => v === 'short' ? '短文' : v === 'long' ? '长文' : '-' },
            { title: '状态', dataIndex: 'enabled', width: 80, render: (v) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
            {
              title: '操作', width: 260, render: (_, r) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => nav(`/articles/${r.id}`)}>编辑</Button>
                  <Button size="small" icon={<ThunderboltOutlined />} onClick={() => nav(`/ai-generate?textId=${r.id}`)}>AI 出题</Button>
                  <Popconfirm title="确认删除?" onConfirm={() => onDelete(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="JSON 批量导入文章"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={onImportJson}
        okText="导入"
        confirmLoading={importing}
        width={720}
      >
        <Typography.Paragraph type="secondary">
          支持 JSON 数组, 或包含 articles/texts 数组的对象。系统会按标题比对已有文章并跳过重复项。
        </Typography.Paragraph>
        <Input.TextArea
          rows={12}
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          placeholder='[{"title":"赤壁赋","author":"苏轼","dynasty":"宋","type":"古文","full_text":"壬戌之秋..."}]'
        />
      </Modal>
    </Space>
  );
}
