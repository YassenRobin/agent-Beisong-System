import { useEffect, useState } from 'react';
import {
  Card, Typography, Space, Tag, Button, message, Empty, Modal, Form, Input, Select,
  Switch, Popconfirm, Alert, Divider,
} from 'antd';
import {
  ApiOutlined, CheckCircleOutlined, EditOutlined, DeleteOutlined,
  ThunderboltOutlined, PlusOutlined, KeyOutlined,
} from '@ant-design/icons';
import { invoke } from '../api/ipc';

type Provider = {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  api_key_masked: string;
  default_model?: string;
  question_model?: string;
  judge_model?: string;
  explain_model?: string;
  dungeon_model?: string;
  weak_point_model?: string;
  temperature?: number;
  max_tokens?: number;
  enabled: number;
  is_active: number;
};

type ProviderTypeInfo = { id: string; name: string };

function notifyProviderChanged() {
  window.dispatchEvent(new Event('beisong:provider-changed'));
}

// 4 家可选厂商的预设值,选中后自动填入
// 模型名称基于 2026 年 4—6 月各厂商官方最新发布:
const PRESETS: Record<string, { base_url: string; default_model: string; label: string; }> = {
  MiniMax: {
    base_url: 'https://api.minimaxi.com/v1',
    default_model: 'MiniMax-M2.7',
    label: 'MiniMax',
  },
  qwen: {
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen3.7-max-preview',
    label: '通义千问 (Qwen)',
  },
  kimi: {
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'kimi-k2.6',
    label: 'Kimi (月之暗面)',
  },
  deepseek: {
    base_url: 'https://api.deepseek.com/v1',
    default_model: 'deepseek-v4-pro',
    label: 'DeepSeek',
  },
};

const TYPE_OPTIONS = Object.entries(PRESETS).map(([value, v]) => ({
  value,
  label: v.label,
}));

export default function ApiConfig() {
  const [items, setItems] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [form] = Form.useForm();
  const [busy, setBusy] = useState<string>(''); // 标记正在操作的 provider id

  const load = async () => {
    try {
      const list = await invoke<Provider[]>('provider:list');
      // 按预设顺序排序: MiniMax / qwen / kimi / deepseek
      const order = ['MiniMax', 'qwen', 'kimi', 'deepseek'];
      const sorted = [...list].sort((a, b) => order.indexOf(a.provider_type) - order.indexOf(b.provider_type));
      setItems(sorted);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const onActivate = async (id: string) => {
    setBusy(id);
    try {
      await invoke('provider:activate', { id });
      message.success('已切换为当前 Provider');
      await load();
      notifyProviderChanged();
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const onTest = async (id: string) => {
    setBusy(id);
    try {
      const r: any = await invoke('provider:test', { id });
      if (r.ok) message.success(r.message);
      else message.error(r.message);
    } catch (e: any) { message.error(e.message); }
    finally { setBusy(''); }
  };

  const onDelete = async (id: string) => {
    try {
      await invoke('provider:delete', { id });
      message.success('已删除');
      await load();
      notifyProviderChanged();
    } catch (e: any) { message.error(e.message); }
  };

  const openEdit = (p: Provider) => {
    setEditing(p);
    form.resetFields();
    form.setFieldsValue({
      name: p.name,
      provider_type: p.provider_type,
      base_url: p.base_url,
      default_model: p.default_model,
      question_model: p.question_model,
      judge_model: p.judge_model,
      explain_model: p.explain_model,
      dungeon_model: p.dungeon_model,
      weak_point_model: p.weak_point_model,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
      enabled: !!p.enabled,
      api_key: '',
    });
  };

  const openCreate = () => {
    setEditing({} as any);
    form.resetFields();
    // 默认选第一个未配置过的厂商
    const unused = TYPE_OPTIONS.find((opt) => !items.some((p) => p.provider_type === opt.value));
    const firstType = unused?.value || TYPE_OPTIONS[0].value;
    form.setFieldsValue({
      provider_type: firstType,
      base_url: PRESETS[firstType].base_url,
      default_model: PRESETS[firstType].default_model,
      question_model: PRESETS[firstType].default_model,
      judge_model: PRESETS[firstType].default_model,
      explain_model: PRESETS[firstType].default_model,
      dungeon_model: PRESETS[firstType].default_model,
      weak_point_model: PRESETS[firstType].default_model,
      temperature: 0.3,
      max_tokens: 4096,
      enabled: true,
    });
  };

  // 监听厂商类型变化,自动填入 Base URL / 默认模型
  const onProviderTypeChange = (val: string) => {
    const preset = PRESETS[val];
    if (!preset) return;
    form.setFieldsValue({
      base_url: preset.base_url,
      default_model: preset.default_model,
      question_model: preset.default_model,
      judge_model: preset.default_model,
      explain_model: preset.default_model,
      dungeon_model: preset.default_model,
      weak_point_model: preset.default_model,
    });
  };

  const onSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing?.id) {
        const payload: any = { id: editing.id, ...values, enabled: values.enabled ? 1 : 0 };
        if (!values.api_key) delete payload.api_key;
        await invoke('provider:update', payload);
      } else {
        await invoke('provider:create', { ...values, enabled: values.enabled ? 1 : 0 });
      }
      message.success('已保存');
      setEditing(null);
      await load();
      notifyProviderChanged();
    } catch (e: any) { message.error(e.message); }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>API 配置</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增 Provider</Button>
      </Space>

      <Alert
        message="支持 MiniMax / Qwen / Kimi / DeepSeek 四家厂商,均已预填 Base URL 与默认模型"
        description="选中「激活」即可让所有 AI 调用走这个通道。只需填 API Key 就能用,不需要再手动查文档找接口地址。"
        type="info"
        showIcon
      />

      {items.length === 0 ? (
        <Empty description="尚未配置任何 Provider" />
      ) : (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {items.map((p) => {
            const preset = PRESETS[p.provider_type];
            const hasKey = !!p.api_key_masked;
            return (
              <Card
                key={p.id}
                className="textbook-card"
                title={
                  <Space>
                    <ApiOutlined />
                    <span>{preset?.label || p.name}</span>
                    {p.is_active ? <Tag color="purple" icon={<CheckCircleOutlined />}>当前激活</Tag> : null}
                    {hasKey ? <Tag color="green" icon={<KeyOutlined />}>已配置 Key</Tag> : <Tag color="default">未配置 Key</Tag>}
                    {!p.enabled ? <Tag>已停用</Tag> : null}
                  </Space>
                }
                extra={
                  <Space wrap>
                    {!p.is_active && hasKey && (
                      <Button type="primary" icon={<CheckCircleOutlined />} loading={busy === p.id} onClick={() => onActivate(p.id)}>
                        激活
                      </Button>
                    )}
                    {hasKey && (
                      <Button icon={<ThunderboltOutlined />} loading={busy === p.id} onClick={() => onTest(p.id)}>
                        测试连接
                      </Button>
                    )}
                    <Button icon={<EditOutlined />} onClick={() => openEdit(p)}>编辑</Button>
                    <Popconfirm title="确认删除?" onConfirm={() => onDelete(p.id)}>
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                }
              >
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {!hasKey && (
                    <Alert
                      message="该厂商尚未配置 API Key"
                      description={
                        <Space>
                          点击「编辑」填入 Key 即可启用。
                          <Button size="small" type="link" icon={<KeyOutlined />} onClick={() => openEdit(p)}>填 Key</Button>
                        </Space>
                      }
                      type="warning"
                      showIcon
                    />
                  )}
                  <Space wrap size={[8, 4]}>
                    <Typography.Text type="secondary">Base URL:</Typography.Text>
                    <Typography.Text code copyable={{ tooltips: ['复制', '已复制'] }}>{p.base_url || '(未设置)'}</Typography.Text>
                  </Space>
                  <Space wrap size={[8, 4]}>
                    <Typography.Text type="secondary">默认模型:</Typography.Text>
                    <Typography.Text code>{p.default_model || '(未设置)'}</Typography.Text>
                  </Space>
                  <Space wrap size={[8, 4]}>
                    <Typography.Text type="secondary">API Key:</Typography.Text>
                    <Typography.Text code>{p.api_key_masked || '(尚未填写)'}</Typography.Text>
                  </Space>
                  {(p.question_model || p.judge_model || p.explain_model) && (
                    <Space wrap size={4}>
                      {p.question_model ? <Tag color="cyan">生题: {p.question_model}</Tag> : null}
                      {p.judge_model ? <Tag color="green">判题: {p.judge_model}</Tag> : null}
                      {p.explain_model ? <Tag color="orange">解释: {p.explain_model}</Tag> : null}
                      {p.dungeon_model ? <Tag color="purple">副本: {p.dungeon_model}</Tag> : null}
                      {p.weak_point_model ? <Tag color="magenta">易错: {p.weak_point_model}</Tag> : null}
                    </Space>
                  )}
                </Space>
              </Card>
            );
          })}
        </Space>
      )}

      <Modal
        title={editing?.id ? `编辑 · ${PRESETS[form.getFieldValue('provider_type')]?.label || ''}` : '新增 Provider'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={onSave}
        width={680}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如:Qwen 默认配置" />
          </Form.Item>
          <Form.Item label="厂商类型" name="provider_type" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} placeholder="选择厂商" onChange={onProviderTypeChange} />
          </Form.Item>

          <Divider style={{ margin: '8px 0' }}>接入信息(已预填,可改)</Divider>

          <Form.Item label="Base URL" name="base_url" rules={[{ required: true }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item
            label="API Key"
            name="api_key"
            extra={editing?.id ? '留空表示不修改当前 Key' : '填入后将加密保存到本地数据库'}
            rules={editing?.id ? [] : [{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Form.Item label="默认模型" name="default_model" rules={[{ required: true }]}>
            <Input placeholder="如 qwen-plus / MiniMax-M2" />
          </Form.Item>

          <Divider style={{ margin: '8px 0' }}>分场景模型(默认全部用主模型,无需改动)</Divider>

          <Space size="middle" style={{ display: 'flex' }} wrap>
            <Form.Item label="生题" name="question_model"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="判题" name="judge_model"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="解释" name="explain_model"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="副本" name="dungeon_model"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="易错生题" name="weak_point_model"><Input style={{ width: 200 }} /></Form.Item>
          </Space>

          <Divider style={{ margin: '8px 0' }}>高级</Divider>
          <Space size="middle" wrap>
            <Form.Item label="temperature" name="temperature"><Input type="number" step={0.1} min={0} max={2} style={{ width: 120 }} /></Form.Item>
            <Form.Item label="max_tokens" name="max_tokens"><Input type="number" min={64} style={{ width: 140 }} /></Form.Item>
            <Form.Item label="启用" name="enabled" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
