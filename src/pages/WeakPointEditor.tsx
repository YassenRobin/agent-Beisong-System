import { useEffect, useState } from 'react';
import { Card, Form, Input, Select, Button, Space, Typography, message, InputNumber } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '../api/ipc';

const WEAK_TYPES = [
  { value: 'near_synonym_replacement', label: '近义替换' },
  { value: 'homophone', label: '同音误写' },
  { value: 'similar_shape', label: '形近字误写' },
  { value: 'keyword', label: '关键词错误' },
  { value: 'missing_line', label: '漏句' },
  { value: 'line_swap', label: '上下句混淆' },
  { value: 'order', label: '顺序错乱' },
  { value: 'other', label: '其他' },
];

export default function WeakPointEditor() {
  const { id } = useParams();
  const isNew = !id;
  const [form] = Form.useForm();
  const [texts, setTexts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();

  const loadWeakPoint = async (weakPointId: string) => {
    const w = await invoke<any>('weak-point:get', { id: weakPointId });
    form.setFieldsValue({
      ...w,
      wrong_examples: (w.wrong_examples || []).join('\n'),
    });
  };

  useEffect(() => {
    invoke<any[]>('article:list', {}).then(setTexts);
    if (id) loadWeakPoint(id);
  }, [id]);

  const onSave = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...v,
        wrong_examples: (v.wrong_examples || '').split(/\n+/).map((s: string) => s.trim()).filter(Boolean),
        enabled: v.enabled ?? 1,
      };
      if (isNew) {
        await invoke<any>('weak-point:create', payload);
      } else {
        await invoke('weak-point:update', { id, ...payload });
      }
      message.success('已保存');
      nav('/weak-points');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {isNew ? '新增易错点' : '编辑易错点'}
        </Typography.Title>
        <Button type="primary" loading={saving} onClick={onSave}>保存</Button>
      </Space>

      <Card className="textbook-card">
        <Form form={form} layout="vertical" initialValues={{ enabled: 1 }}>
          <Form.Item label="标题" name="title" rules={[{ required: true }]}>
            <Input placeholder="如水波不兴易误写为水波不惊" />
          </Form.Item>
          <Space size="middle" style={{ display: 'flex' }} wrap>
            <Form.Item label="所属文章" name="text_id" rules={[{ required: true }]} style={{ width: 280 }}>
              <Select
                showSearch
                placeholder="选择文章"
                optionFilterProp="label"
                options={texts.map((t) => ({ value: t.id, label: t.title }))}
              />
            </Form.Item>
            <Form.Item label="段落 ID (可选)" name="paragraph_id" style={{ width: 200 }}>
              <Input placeholder="段落 id" />
            </Form.Item>
            <Form.Item label="易错类型" name="weak_type" style={{ width: 200 }}>
              <Select allowClear options={WEAK_TYPES} />
            </Form.Item>
          </Space>
          <Form.Item label="原文片段" name="source_text" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="原文句子,生成题目以此为依据" />
          </Form.Item>
          <Form.Item label="标准答案" name="target_answer" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="如:水波不兴" />
          </Form.Item>
          <Form.Item label="常见错误写法 (每行一个)" name="wrong_examples">
            <Input.TextArea rows={3} placeholder="如水波不惊" />
          </Form.Item>
          <Form.Item label="说明" name="description">
            <Input.TextArea rows={3} placeholder="为什么要这样记、为什么容易错…" />
          </Form.Item>
          <Form.Item label="启用" name="enabled">
            <Select
              options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]}
              style={{ width: 120 }}
            />
          </Form.Item>
        </Form>
      </Card>
    </Space>
  );
}
