import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Space, Typography, message, Tabs, Tag, Row, Col } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '../api/ipc';
import { ThunderboltOutlined, SaveOutlined, RobotOutlined } from '@ant-design/icons';

const { TextArea } = Input;

const TYPE_OPTIONS = [
  { value: '古诗', label: '古诗' },
  { value: '词', label: '词' },
  { value: '文言文', label: '文言文' },
  { value: '古代散文', label: '古代散文' },
  { value: '赋', label: '赋' },
  { value: '骈文', label: '骈文' },
  { value: '议论文', label: '议论文' },
];

export default function ArticleEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const [form] = Form.useForm();
  const [paragraphs, setParagraphs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [structuring, setStructuring] = useState(false);

  const loadArticle = async (articleId: string) => {
    const a = await invoke<any>('article:get', { id: articleId });
    form.setFieldsValue(a);
    const ps = await invoke<any[]>('article:paragraphs', { id: articleId });
    setParagraphs(ps);
  };

  useEffect(() => {
    if (id) {
      loadArticle(id).catch(() => {});
    }
  }, [id]);

  const onSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (isNew) {
        await invoke<any>('article:create', values);
      } else {
        await invoke('article:update', { id, ...values });
      }
      message.success('已保存');
      nav('/articles');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onAiStructure = async () => {
    const values = await form.validateFields();
    if (!values.full_text) return message.warning('请先填写全文');
    setStructuring(true);
    try {
      // 先确保文章已保存
      let savedId = id;
      if (isNew) {
        const created = await invoke<any>('article:create', values);
        savedId = created.id;
        nav(`/articles/${savedId}`);
      } else {
        await invoke('article:update', { id, ...values });
      }
      const result = await invoke('article:ai-structure', { id: savedId, ...values });
      setParagraphs(result as any[]);
      if (savedId) await loadArticle(savedId);
      message.success('AI 已完成结构化');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setStructuring(false);
    }
  };

  const onNaiveSplit = async () => {
    const values = await form.validateFields();
    if (!values.full_text) return message.warning('请先填写全文');
    const result = await invoke<any[]>('article:naive-split', { full_text: values.full_text });
    setParagraphs(result);
  };

  const onSaveStructure = async () => {
    if (!id) return message.warning('请先保存文章');
    try {
      await invoke('article:replace-structure', { id, paragraphs });
      message.success('段落结构已保存');
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {isNew ? '新增文章' : '编辑文章'}
        </Typography.Title>
        <Space>
          <Button icon={<SaveOutlined />} type="primary" loading={saving} onClick={onSave}>保存</Button>
        </Space>
      </Space>

      <Tabs
        items={[
          {
            key: 'basic',
            label: '基本信息',
            children: (
              <Card className="textbook-card">
                <Form form={form} layout="vertical">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
                        <Input placeholder="如:赤壁赋" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="作者" name="author">
                        <Input placeholder="如:苏轼" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="朝代" name="dynasty">
                        <Input placeholder="如:宋" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item label="类型" name="type">
                        <Select options={TYPE_OPTIONS} allowClear placeholder="选择类型" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="长度" name="length_type">
                        <Select
                          allowClear
                          options={[
                            { value: 'short', label: '短文' },
                            { value: 'long', label: '长文' },
                          ]}
                          placeholder="自动判断"
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="难度" name="difficulty">
                        <Select
                          allowClear
                          options={[
                            { value: 'easy', label: '简单' },
                            { value: 'medium', label: '中等' },
                            { value: 'hard', label: '困难' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="启用" name="enabled" initialValue={1}>
                        <Select
                          options={[
                            { value: 1, label: '启用' },
                            { value: 0, label: '停用' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="全文" name="full_text" rules={[{ required: true, message: '请输入全文' }]}>
                    <TextArea rows={14} placeholder="粘贴或输入全文,注意保留原文标点" />
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'structure',
            label: '段落结构',
            children: (
              <Card
                className="textbook-card"
                title={`共 ${paragraphs.length} 段`}
                extra={
                  <Space>
                    <Button icon={<ThunderboltOutlined />} onClick={onNaiveSplit}>按空行分</Button>
                    <Button icon={<RobotOutlined />} loading={structuring} onClick={onAiStructure}>AI 结构化</Button>
                    <Button type="primary" onClick={onSaveStructure}>保存段落</Button>
                  </Space>
                }
              >
                {paragraphs.length === 0 ? (
                  <Typography.Text type="secondary">暂无段落,请先填写全文,再使用「按空行分」或「AI 结构化」生成段落。</Typography.Text>
                ) : (
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {paragraphs.map((p, idx) => (
                      <div key={idx} className="textbook-section">
                        <Space style={{ marginBottom: 6 }}>
                          <Tag color="purple">第 {idx + 1} 段</Tag>
                          {p.logic_role ? <Tag color="cyan">{p.logic_role}</Tag> : null}
                          {p.summary ? <Typography.Text type="secondary">{p.summary}</Typography.Text> : null}
                          <Typography.Text type="secondary">{p.sentences?.length || 0} 句</Typography.Text>
                        </Space>
                        <div className="serif" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>
                          {p.content}
                        </div>
                      </div>
                    ))}
                  </Space>
                )}
              </Card>
            ),
          },
        ]}
      />
    </Space>
  );
}
