import { useEffect, useState } from 'react';
import { Card, Typography, Space, Tag, Empty, Button, message, Table } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { invoke } from '../api/ipc';

export default function WrongBook() {
  const [items, setItems] = useState<any[]>([]);
  const [texts, setTexts] = useState<any[]>([]);

  const load = async () => {
    try {
      const [w, t] = await Promise.all([
        invoke<any[]>('wrong:list', { status: 'active' }),
        invoke<any[]>('article:list', {}),
      ]);
      setItems(w);
      setTexts(t);
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => { load(); }, []);

  const onResolve = async (id: string) => {
    await invoke('wrong:resolve', { id });
    load();
  };

  const onReAdd = async (id: string) => {
    await invoke('wrong:re-add', { id });
    load();
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>错题本</Typography.Title>

      <Card className="textbook-card">
        {items.length === 0 ? (
          <Empty description="暂无错题" />
        ) : (
          <Table
            rowKey="id"
            dataSource={items}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: '文章', dataIndex: 'text_id', width: 140, render: (v) => texts.find((t) => t.id === v)?.title || v },
              { title: '错误类型', dataIndex: 'error_type', width: 140, render: (v) => <Tag color="orange">{v || 'other'}</Tag> },
              { title: '标准答案', dataIndex: 'expected', render: (v) => <span className="serif">{v}</span> },
              { title: '你的答案', dataIndex: 'actual', render: (v) => <span className="serif">{v}</span> },
              { title: '错次', dataIndex: 'count', width: 80 },
              { title: '最近错误', dataIndex: 'last_wrong_at', width: 160, render: (v) => new Date(v).toLocaleString() },
              {
                title: '操作', width: 220, render: (_, r) => (
                  <Space>
                    <Button size="small" icon={<CheckOutlined />} onClick={() => onResolve(r.id)}>标记掌握</Button>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => onReAdd(r.id)}>加回训练</Button>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>
    </Space>
  );
}