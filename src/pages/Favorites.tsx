import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, List, Modal, Select, Space, Tabs, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EyeOutlined, FolderAddOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { MarkedText } from '../components/MarkedText';

const TYPE_LABEL: Record<string, string> = {
  choice: '选择题',
  blank: '挖空题',
  context_blank: '文脉挖空',
  context_recitation: '文脉默写',
  pure_recitation: '纯默写',
  ordering: '排序题',
};

export default function Favorites() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [dungeons, setDungeons] = useState<any[]>([]);
  const [texts, setTexts] = useState<any[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const nav = useNavigate();

  const load = async () => {
    try {
      const listPayload = folderFilter === 'all'
        ? {}
        : folderFilter === 'unfiled'
          ? { unfiled: true }
          : { folder_id: folderFilter };
      const [f, folderRows, d, t] = await Promise.all([
        invoke<any[]>('favorite:list-questions', listPayload),
        invoke<any[]>('favorite:list-folders', {}),
        invoke<any[]>('rogue:list', { favorite: true }),
        invoke<any[]>('article:list', {}),
      ]);
      setFavorites(f);
      setFolders(folderRows);
      setDungeons(d);
      setTexts(t);
      setSelectedQuestionIds((ids) => ids.filter((id) => f.some((item) => item.question_id === id)));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  useEffect(() => { load(); }, [folderFilter]);

  const textTitleById = useMemo(() => new Map(texts.map((t) => [t.id, t.title])), [texts]);

  const onUnfav = async (qid: string) => {
    await invoke('favorite:question-remove', { question_id: qid });
    await load();
  };

  const onUnfavDungeon = async (id: string) => {
    await invoke('rogue:favorite', { id, favorite: false });
    await load();
  };

  const onCreateFolder = async () => {
    const values = await createForm.validateFields();
    await invoke('favorite:create-folder', { name: values.name });
    message.success('题目夹已创建');
    setCreateFolderOpen(false);
    createForm.resetFields();
    await load();
  };

  const onAddSelectedToFolder = async () => {
    const values = await folderForm.validateFields();
    await invoke('favorite:add-to-folder', {
      question_ids: selectedQuestionIds,
      folder_id: values.folder_id,
      folder_name: values.folder_name,
    });
    message.success(`已加入 ${selectedQuestionIds.length} 道题目`);
    setFolderModalOpen(false);
    folderForm.resetFields();
    await load();
  };

  const toggleSelected = (qid: string, checked: boolean) => {
    setSelectedQuestionIds((ids) => checked ? Array.from(new Set([...ids, qid])) : ids.filter((id) => id !== qid));
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>收藏夹</Typography.Title>

      <Card className="textbook-card">
        <Tabs
          items={[
            {
              key: 'q',
              label: `收藏题目 (${favorites.length})`,
              children: (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap>
                    <Select
                      value={folderFilter}
                      style={{ width: 220 }}
                      onChange={setFolderFilter}
                      options={[
                        { value: 'all', label: '全部收藏' },
                        { value: 'unfiled', label: '未放入题目夹' },
                        ...folders.map((f) => ({ value: f.id, label: `${f.name} (${f.question_count || 0})` })),
                      ]}
                    />
                    <Button icon={<PlusOutlined />} onClick={() => setCreateFolderOpen(true)}>新建题目夹</Button>
                    <Button
                      icon={<FolderAddOutlined />}
                      disabled={!selectedQuestionIds.length}
                      onClick={() => setFolderModalOpen(true)}
                    >
                      加入题目夹
                    </Button>
                    <Typography.Text type="secondary">已选 {selectedQuestionIds.length} 道</Typography.Text>
                  </Space>

                  {favorites.length === 0 ? <Empty /> : favorites.map((f) => (
                    <div key={f.id} className="textbook-section">
                      <Space wrap>
                        <input
                          type="checkbox"
                          checked={selectedQuestionIds.includes(f.question_id)}
                          onChange={(e) => toggleSelected(f.question_id, e.target.checked)}
                        />
                        <Tag color="purple">{TYPE_LABEL[f.type] || f.type}</Tag>
                        <Tag color="orange">{'★'.repeat(f.star || 1)}</Tag>
                        <Typography.Text type="secondary">{textTitleById.get(f.text_id)}</Typography.Text>
                        {f.folder_names ? <Tag color="cyan">{f.folder_names}</Tag> : null}
                        <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onUnfav(f.question_id)}>取消收藏</Button>
                      </Space>
                      <div className="question-prompt" style={{ marginTop: 6 }}><MarkedText text={f.prompt} /></div>
                      <div className="question-answer" style={{ marginTop: 6 }}>{f.answer}</div>
                    </div>
                  ))}
                </Space>
              ),
            },
            {
              key: 'd',
              label: `收藏副本 (${dungeons.length})`,
              children: dungeons.length === 0 ? <Empty /> : (
                <List
                  dataSource={dungeons}
                  renderItem={(d) => (
                    <List.Item
                      actions={[
                        <Button size="small" icon={<EyeOutlined />} onClick={() => nav(`/rogue/${d.id}`)}>查看题目</Button>,
                        <Button size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => nav(`/rogue/play/${d.id}`)}>挑战</Button>,
                        <Button danger size="small" onClick={() => onUnfavDungeon(d.id)}>取消收藏</Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={<Space><Tag color="purple">{d.star} 星</Tag>{d.name}</Space>}
                        description={`生成于 ${new Date(d.created_at).toLocaleString()}`}
                      />
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal title="新建题目夹" open={createFolderOpen} onCancel={() => setCreateFolderOpen(false)} onOk={onCreateFolder}>
        <Form form={createForm} layout="vertical">
          <Form.Item label="题目夹名称" name="name" rules={[{ required: true, message: '请输入题目夹名称' }]}>
            <Input placeholder="例如：易错默写题" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="加入题目夹" open={folderModalOpen} onCancel={() => setFolderModalOpen(false)} onOk={onAddSelectedToFolder}>
        <Form form={folderForm} layout="vertical">
          <Form.Item label="选择已有题目夹" name="folder_id">
            <Select
              allowClear
              placeholder="选择题目夹"
              options={folders.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(value) => { if (value) folderForm.setFieldValue('folder_name', undefined); }}
            />
          </Form.Item>
          <Form.Item label="或即时创建题目夹" name="folder_name">
            <Input placeholder="输入新题目夹名称" onChange={() => folderForm.setFieldValue('folder_id', undefined)} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
