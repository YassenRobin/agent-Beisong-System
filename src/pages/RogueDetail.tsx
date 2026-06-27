import { useEffect, useState } from 'react';
import { Card, Typography, Space, Tag, Button, Collapse, Empty, message } from 'antd';
import { PlayCircleOutlined, StarFilled } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';

type Question = {
  id: string;
  type: string;
  star: number;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  explanation?: string;
};

type Room = {
  id: string;
  type: string;
  name: string;
  question_ids: string[];
};

type Dungeon = {
  id: string;
  name: string;
  star: number;
  favorite?: number;
  rooms_json: string;
  question_ids_json: string;
};

export default function RogueDetail() {
  const { dungeonId } = useParams();
  const nav = useNavigate();
  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [questions, setQuestions] = useState<Record<string, Question>>({});

  useEffect(() => {
    if (!dungeonId) return;
    (async () => {
      try {
        const d = await invoke<Dungeon>('rogue:get', { id: dungeonId });
        const parsedRooms = JSON.parse(d.rooms_json || '[]') as Room[];
        const ids = parsedRooms.flatMap((room) => room.question_ids);
        const list = ids.length ? await invoke<Question[]>('question:list', { ids }) : [];
        const map: Record<string, Question> = {};
        list.forEach((q) => (map[q.id] = q));
        setDungeon(d);
        setRooms(parsedRooms);
        setQuestions(map);
      } catch (e: any) {
        message.error(e.message);
      }
    })();
  }, [dungeonId]);

  if (!dungeon) return <Typography.Text type="secondary">加载副本...</Typography.Text>;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Typography.Title level={3} style={{ margin: 0 }}>{dungeon.name}</Typography.Title>
          <Tag color="purple">{dungeon.star} 星</Tag>
          {dungeon.favorite ? <Tag color="magenta" icon={<StarFilled />}>已收藏</Tag> : null}
        </Space>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => nav(`/rogue/play/${dungeon.id}`)}>挑战</Button>
      </Space>

      <Card className="textbook-card">
        {rooms.length === 0 ? (
          <Empty description="此副本暂无房间" />
        ) : (
          <Collapse
            defaultActiveKey={rooms.map((room) => room.id)}
            items={rooms.map((room, index) => ({
              key: room.id,
              label: (
                <Space>
                  <Tag color={roomColor(room.type)}>{index + 1}. {room.name}</Tag>
                  <Typography.Text type="secondary">{roomTypeLabel(room.type)}</Typography.Text>
                  <Typography.Text type="secondary">{room.question_ids.length} 题</Typography.Text>
                </Space>
              ),
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {room.question_ids.map((qid, qIndex) => {
                    const q = questions[qid];
                    if (!q) return <Typography.Text key={qid} type="secondary">题目 {qid} 已不存在</Typography.Text>;
                    return (
                      <div key={qid} className="textbook-section">
                        <Space wrap style={{ marginBottom: 8 }}>
                          <Tag>{qIndex + 1}</Tag>
                          <Tag color="purple">{typeLabel(q.type)}</Tag>
                          <Tag color="orange">{'★'.repeat(q.star)}</Tag>
                        </Space>
                        <Typography.Paragraph className="serif" style={{ whiteSpace: 'pre-wrap' }}><MarkedText text={q.prompt} /></Typography.Paragraph>
                        {q.options?.length ? (
                          <Space direction="vertical" size={4}>
                            {q.options.map((o, i) => <Typography.Text key={i} className="serif">{String.fromCharCode(65 + i)}. {o}</Typography.Text>)}
                          </Space>
                        ) : null}
                        <Typography.Paragraph style={{ marginTop: 8 }}>
                          <Typography.Text type="secondary">答案: </Typography.Text>
                          <span className="serif">{q.answer}</span>
                        </Typography.Paragraph>
                        {q.explanation ? <Typography.Paragraph type="secondary">{q.explanation}</Typography.Paragraph> : null}
                      </div>
                    );
                  })}
                </Space>
              ),
            }))}
          />
        )}
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
