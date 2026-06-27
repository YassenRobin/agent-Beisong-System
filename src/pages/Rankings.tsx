import { useEffect, useState } from 'react';
import { Card, Typography, Space, Tabs, Table, Tag, message } from 'antd';
import { invoke } from '../api/ipc';

export default function Rankings() {
  const [textRanks, setTextRanks] = useState<any[]>([]);
  const [typeRanks, setTypeRanks] = useState<any[]>([]);
  const [wpRanks, setWpRanks] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      invoke<any[]>('favorite:rank-texts', { limit: 50 }),
      invoke<any[]>('favorite:rank-types', { limit: 50 }),
      invoke<any[]>('weak-point:ranking', { by: 'accuracy', limit: 50 }),
    ]).then(([t, ty, wp]) => {
      setTextRanks(t);
      setTypeRanks(ty);
      setWpRanks(wp);
    }).catch((e) => message.error(e.message));
  }, []);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>排行榜</Typography.Title>

      <Card className="textbook-card">
        <Tabs
          items={[
            {
              key: 'text',
              label: '文章收藏榜',
              children: (
                <Table
                  rowKey="text_id"
                  dataSource={textRanks}
                  pagination={false}
                  columns={[
                    { title: '排名', width: 80, render: (_v, _r, idx: number) => <Tag color={idx < 3 ? 'gold' : 'default'}>#{idx + 1}</Tag> },
                    { title: '文章', dataIndex: 'title' },
                    { title: '作者', dataIndex: 'author' },
                    { title: '收藏题', dataIndex: 'favorite_question_count', width: 100 },
                    { title: '收藏副本', dataIndex: 'favorite_dungeon_count', width: 100 },
                    { title: '总收藏', dataIndex: 'total_favorite_count', width: 100, render: (v) => <Tag color="purple">{v}</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'type',
              label: '题型收藏榜',
              children: (
                <Table
                  rowKey="type"
                  dataSource={typeRanks}
                  pagination={false}
                  columns={[
                    { title: '题型', dataIndex: 'type', render: (v) => <Tag>{v}</Tag> },
                    { title: '收藏次数', dataIndex: 'count', render: (v) => <Tag color="purple">{v}</Tag> },
                  ]}
                />
              ),
            },
            {
              key: 'wp',
              label: '易错点错误率榜',
              children: (
                <Table
                  rowKey="id"
                  dataSource={wpRanks}
                  pagination={false}
                  columns={[
                    { title: '易错点', dataIndex: 'title' },
                    { title: '正确率', dataIndex: 'accuracy', render: (v) => <Tag color={v >= 0.85 ? 'green' : v >= 0.7 ? 'orange' : 'red'}>{(v * 100).toFixed(0)}%</Tag> },
                    { title: '题目数', dataIndex: 'question_count' },
                    { title: '错次', dataIndex: 'wrong_count' },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </Space>
  );
}