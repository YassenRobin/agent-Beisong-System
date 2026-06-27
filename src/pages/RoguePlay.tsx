import { useEffect, useState } from 'react';
import { Card, Typography, Space, Button, Tag, Input, Radio, message, Alert, Divider, Result, Progress, Modal } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';
import { calculateRogueDamage } from '../../src-server/services/rogueDamage';

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
  rooms_json: string;
  initial_hearts?: number;
  damage_rules_json?: string;
  item_rules_json?: string;
  clear_condition_json?: string;
  question_ids_json: string;
  favorite?: number;
};

export default function RoguePlay() {
  const { dungeonId } = useParams();
  const nav = useNavigate();

  const [dungeon, setDungeon] = useState<Dungeon | null>(null);
  const [questions, setQuestions] = useState<Record<string, Question>>({});
  const [runId, setRunId] = useState<string>('');
  const [hearts, setHearts] = useState<number>(5);
  const [maxHearts, setMaxHearts] = useState<number>(5);
  const [roomIdx, setRoomIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [input, setInput] = useState('');
  const [choice, setChoice] = useState('');
  const [result, setResult] = useState<any | null>(null);
  const [lastDamage, setLastDamage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ result: 'win' | 'lose'; score: number; stars: number } | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteQuestionIds, setFavoriteQuestionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dungeonId) return;
    (async () => {
      const d = await invoke<Dungeon>('rogue:get', { id: dungeonId });
      setDungeon(d);
      setFavorite(!!d.favorite);
      const rooms = parsePlayableRooms(d.rooms_json);
      const allIds = rooms.flatMap((r) => r.question_ids);
      const qs = await invoke<Question[]>('question:list', { ids: allIds });
      const favoriteQuestions = await invoke<any[]>('favorite:list-questions', {});
      setFavoriteQuestionIds(new Set(favoriteQuestions.map((f) => f.question_id)));
      const map: Record<string, Question> = {};
      qs.forEach((q) => (map[q.id] = q));
      setQuestions(map);

      // 初始血量
      const initHearts = (JSON.parse(d.clear_condition_json || '{}').hearts) || 5;
      const finalInit = d.star >= 3 ? (d.star >= 4 ? 3 : 4) : 5;
      setMaxHearts(finalInit);
      setHearts(finalInit);

      // 启动局
      const rid = await invoke<string>('rogue:run-start', {
        dungeon_id: d.id,
        difficulty: `${d.star} 星`,
        max_hearts: finalInit,
        current_hearts: finalInit,
        route_json: JSON.stringify(rooms),
        items_json: '[]',
      });
      setRunId(rid);
    })();
  }, [dungeonId]);

  if (!dungeon) return <Typography.Text type="secondary">加载副本…</Typography.Text>;

  if (finished) {
    const onFavoriteDungeon = async () => {
      if (!dungeon) return;
      try {
        await invoke('rogue:favorite', { id: dungeon.id, favorite: true });
        setFavorite(true);
        message.success('已收藏副本');
      } catch (e: any) {
        message.error(e.message);
      }
    };

    return (
      <Card className="textbook-card">
        <Result
          status={finished.result === 'win' ? 'success' : 'error'}
          title={finished.result === 'win' ? '通关成功' : '失败'}
          subTitle={`通关星级: ${finished.stars}★ · 得分 ${finished.score.toFixed(0)}`}
          extra={[
            <Button key="again" type="primary" onClick={() => window.location.reload()}>再玩一次</Button>,
            <Button key="favorite" icon={favorite ? <StarFilled /> : <StarOutlined />} disabled={favorite} onClick={onFavoriteDungeon}>
              {favorite ? '已收藏副本' : '收藏副本'}
            </Button>,
            <Button key="detail" onClick={() => nav(`/rogue/${dungeon.id}`)}>查看副本题目</Button>,
            <Button key="back" onClick={() => nav('/rogue')}>返回副本</Button>,
          ]}
        />
      </Card>
    );
  }

  const rooms: Room[] = parsePlayableRooms(dungeon.rooms_json);
  if (!rooms.length) {
    return (
      <Card className="textbook-card">
        <Result
          status="warning"
          title="副本暂无可挑战题目"
          subTitle="这个副本保存时没有有效题目，请重新生成副本。"
          extra={<Button onClick={() => nav('/rogue')}>返回副本</Button>}
        />
      </Card>
    );
  }
  const room = rooms[roomIdx];
  const qid = room.question_ids[qIdx];
  const cur = questions[qid];

  if (!cur) {
    return (
      <Card className="textbook-card">
        <Result status="info" title="此房间暂无题目" extra={<Button onClick={() => nextRoom(true)}>继续</Button>} />
      </Card>
    );
  }

  const onSubmit = async () => {
    let userAnswer = cur.type === 'choice' ? choice : input;
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

      // 扣血
      const dmgRules = JSON.parse(dungeon.damage_rules_json || '{}');
      const damage = calculateRogueDamage({
        isCorrect: res.is_correct,
        star: cur.star,
        errorType: res.error_type,
        rules: dmgRules,
      });
      setLastDamage(damage);
      const newHearts = Math.max(0, +(hearts - damage).toFixed(2));
      setHearts(newHearts);

      // 记录伤害日志
      if (damage > 0 && runId) {
        await invoke('rogue:run-log-damage', {
          run_id: runId,
          question_id: cur.id,
          expected: cur.answer,
          actual: userAnswer,
          error_type: res.error_type,
          damage,
          hearts_after: newHearts,
        });
      }

      if (newHearts <= 0) {
        finishRun('lose', newHearts);
      }
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleQuestionFavorite = async (q: Question) => {
    try {
      if (favoriteQuestionIds.has(q.id)) {
        await invoke('favorite:question-remove', { question_id: q.id });
        setFavoriteQuestionIds((prev) => {
          const next = new Set(prev);
          next.delete(q.id);
          return next;
        });
        message.success('已取消收藏');
      } else {
        await invoke('favorite:question', { question_id: q.id, text_id: q.text_id });
        setFavoriteQuestionIds((prev) => new Set(prev).add(q.id));
        message.success('已收藏题目');
      }
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const nextQuestion = () => {
    setInput(''); setChoice(''); setResult(null); setLastDamage(0);
    if (qIdx + 1 < room.question_ids.length) {
      setQIdx(qIdx + 1);
    } else {
      nextRoom(false);
    }
  };

  const nextRoom = (skipCurrent: boolean) => {
    if (hearts <= 0) return finishRun('lose');
    if (roomIdx + 1 >= rooms.length) {
      // 全部房间完成 → 结算
      const clear = JSON.parse(dungeon.clear_condition_json || '{}');
      const accuracy = 1; // 简单按通关判定;真实应该累计
      if (accuracy >= (clear.requiredAccuracy || 0.7)) {
        finishRun('win');
      } else {
        finishRun('lose');
      }
      return;
    }
    setRoomIdx(roomIdx + 1);
    setQIdx(0);
    setInput(''); setChoice(''); setResult(null); setLastDamage(0);
  };

  const finishRun = async (result: 'win' | 'lose', finalHearts = hearts) => {
    const stars = result === 'win'
      ? (finalHearts / maxHearts > 0.7 ? 3 : finalHearts / maxHearts > 0.3 ? 2 : 1)
      : 0;
    const score = (finalHearts / maxHearts) * 100;
    if (runId) {
      await invoke('rogue:run-finish', {
        id: runId, result, current_hearts: finalHearts, score, stars,
      });
    }
    setFinished({ result, score, stars });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Typography.Title level={3} style={{ margin: 0 }}>
            <Tag color="purple">{dungeon.star} 星</Tag> {dungeon.name}
          </Typography.Title>
        </Space>
        <HeartBar hearts={hearts} max={maxHearts} />
      </Space>

      <Progress
        percent={Math.round(((roomIdx * 100) / rooms.length))}
        format={() => `房间 ${roomIdx + 1} / ${rooms.length}`}
        showInfo
      />

      <Card className="textbook-card" title={
        <Space>
          <Tag color={roomColor(room.type)}>{room.name}</Tag>
          <Typography.Text type="secondary">{roomTypeLabel(room.type)}</Typography.Text>
        </Space>
      }>
        <Space wrap style={{ marginBottom: 8 }}>
          <Tag color="orange">{'★'.repeat(cur.star)}</Tag>
          <Typography.Text type="secondary">{qIdx + 1} / {room.question_ids.length}</Typography.Text>
          <Button
            size="small"
            icon={favoriteQuestionIds.has(cur.id) ? <StarFilled /> : <StarOutlined />}
            onClick={() => toggleQuestionFavorite(cur)}
          >
            {favoriteQuestionIds.has(cur.id) ? '已收藏' : '收藏'}
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
          <Input.TextArea rows={4} value={input} onChange={(e) => setInput(e.target.value)} disabled={!!result} placeholder="在此填写答案…" />
        )}

        {result && (
          <Alert
            style={{ marginTop: 16 }}
            type={result.is_correct ? 'success' : 'error'}
            message={result.is_correct ? '正确' : `错误 (扣 ${lastDamage.toFixed(1)} 心) · ${result.error_type}`}
            description={
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <div><b>你的答案:</b> <span className="serif">{choice || input}</span></div>
                <div><b>参考答案:</b> <span className="serif">{cur.answer}</span></div>
                {result.feedback && <div><b>反馈:</b> {result.feedback}</div>}
              </Space>
            }
            showIcon
          />
        )}

        <Space style={{ marginTop: 16 }}>
          {!result ? (
            <Button type="primary" loading={busy} onClick={onSubmit}>提交</Button>
          ) : (
            <Button type="primary" onClick={nextQuestion}>继续</Button>
          )}
          <Button danger onClick={() => Modal.confirm({
            title: '确认放弃本局?',
            onOk: () => finishRun('lose'),
          })}>放弃</Button>
        </Space>
      </Card>
    </Space>
  );
}

function HeartBar({ hearts, max }: { hearts: number; max: number }) {
  const cells: any[] = [];
  for (let i = 0; i < max; i++) {
    const v = hearts - i;
    if (v >= 1) cells.push(<span key={i} className="heart" style={{ background: '#ff5c8a' }} />);
    else if (v === 0.5) cells.push(<span key={i} className="heart half" />);
    else cells.push(<span key={i} className="heart empty" />);
  }
  return (
    <Space size={6} className="heart-bar">
      {cells}
      <span style={{ marginLeft: 8 }}>{hearts.toFixed(1)} / {max}</span>
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

function optionKey(index: number) {
  return String.fromCharCode(65 + index);
}

function stripOptionPrefix(option: string, index: number) {
  const key = optionKey(index);
  return String(option || '').replace(new RegExp(`^\\s*${key}[\\\\.。．、:：)）]?\\s*`, 'i'), '');
}

function parsePlayableRooms(roomsJson: string): Room[] {
  const rooms = JSON.parse(roomsJson || '[]') as Room[];
  return rooms.filter((room) => Array.isArray(room.question_ids) && room.question_ids.length > 0);
}
