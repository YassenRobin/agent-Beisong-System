import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Empty,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Statistic,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import { CheckCircleOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { invoke } from '../api/ipc';

type Genre = 'all' | '古文' | '诗词曲';

type Scope = {
  id: string;
  name: string;
};

type Candidate = {
  id: string;
  text_id: string;
  title: string;
  author?: string;
  dynasty?: string;
  article_type?: string;
  catalog_id?: string;
  catalog_name?: string;
  sentence: string;
  matched_terms: string[];
  matched_term_sources: Record<string, Array<'target' | 'builtin' | 'teacher' | 'ai'>>;
  label: 'literal' | 'associated' | 'atmosphere' | 'metaphorical' | 'false_positive' | 'uncertain';
  review_status: 'accepted' | 'pending' | 'rejected';
  confidence: number;
  imagery_role: string;
  reason: string;
  evidence: string;
};

type SearchTermDetail = {
  term: string;
  sources: Array<'target' | 'builtin' | 'teacher' | 'ai'>;
};

type ScanResult = {
  theme: string;
  search_terms: string[];
  search_term_details: SearchTermDetail[];
  scope_article_count: number;
  literal_match_count: number;
  rule_filtered_count: number;
  reviewed_count: number;
  accepted_count: number;
  pending_count: number;
  rejected_count: number;
  truncated_count: number;
  cache_hit: boolean;
  candidates: Candidate[];
};

type Recommendation = {
  theme: string;
  reason: string;
  article_count: number;
};

const GENRE_OPTIONS = [
  { label: '不限体裁', value: 'all' },
  { label: '古代散文', value: '古文' },
  { label: '古代诗歌', value: '诗词曲' },
];

const TERM_SOURCE_LABELS = {
  target: '目标',
  builtin: '内置',
  teacher: '教师',
  ai: 'AI',
};

const REVIEW_LABELS = {
  literal: { text: '直接呈现', color: 'green' },
  associated: { text: '传统关联', color: 'cyan' },
  atmosphere: { text: '氛围营造', color: 'blue' },
  metaphorical: { text: '比喻象征', color: 'gold' },
  uncertain: { text: 'AI 不确定', color: 'orange' },
  false_positive: { text: '误命中', color: 'default' },
} as const;

export default function ImageryTraining() {
  const [theme, setTheme] = useState('');
  const [genre, setGenre] = useState<Genre>('古文');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [relatedTerms, setRelatedTerms] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [trainingIndex, setTrainingIndex] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'accepted' | 'pending' | 'rejected' | 'all'>('accepted');

  const confirmed = useMemo(() => {
    const selected = new Set(confirmedIds);
    return result?.candidates.filter((candidate) => selected.has(candidate.id)) || [];
  }, [confirmedIds, result]);
  const displayedCandidates = useMemo(() => (
    result?.candidates.filter((candidate) => reviewFilter === 'all' || candidate.review_status === reviewFilter) || []
  ), [result, reviewFilter]);
  const current = trainingIndex === null ? null : confirmed[trainingIndex];

  const loadScopes = async () => {
    if (scopes.length > 0) return;
    try {
      setScopes(await invoke<Scope[]>('imagery:scopes'));
    } catch (error: any) {
      message.error(error?.message || '分类范围加载失败');
    }
  };

  const scan = async () => {
    if (!theme.trim()) {
      message.warning('请先填写一个意象');
      return;
    }
    setLoading(true);
    setTrainingIndex(null);
    try {
      const data = await invoke<ScanResult>('imagery:scan', {
        theme: theme.trim(),
        genre,
        catalog_ids: scopeIds,
        related_terms: relatedTerms.split(/[、,，\s]+/).filter(Boolean),
      });
      setResult(data);
      setConfirmedIds(data.candidates
        .filter((candidate) => candidate.review_status === 'accepted')
        .map((candidate) => candidate.id));
      setReviewFilter(data.accepted_count > 0 ? 'accepted' : data.pending_count > 0 ? 'pending' : 'all');
      if (data.literal_match_count === 0) message.info('当前检索词没有在篇目中找到原句');
      else if (data.accepted_count === 0) message.info('已有字面命中，但没有自动通过项；请查看待教师判断和误命中');
    } catch (error: any) {
      message.error(error?.message || '意象检索失败');
    } finally {
      setLoading(false);
    }
  };

  const recommend = async () => {
    setRecommendationLoading(true);
    try {
      const data = await invoke<Recommendation[]>('imagery:recommend', {
        genre,
        catalog_ids: scopeIds,
      });
      setRecommendations(data);
    } catch (error: any) {
      message.error(error?.message || '推荐意象生成失败');
    } finally {
      setRecommendationLoading(false);
    }
  };

  const toggleCandidate = (id: string, checked: boolean) => {
    setConfirmedIds((ids) => checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id));
  };

  const beginTraining = () => {
    if (confirmed.length === 0) {
      message.warning('请至少确认一条训练材料');
      return;
    }
    setTrainingIndex(0);
    setAnswer('');
    setShowAnswer(false);
  };

  const next = () => {
    if (trainingIndex === null) return;
    if (trainingIndex + 1 >= confirmed.length) {
      setTrainingIndex(null);
      message.success('本轮意象联想训练完成');
      return;
    }
    setTrainingIndex(trainingIndex + 1);
    setAnswer('');
    setShowAnswer(false);
  };

  const exact = current && normalizeText(answer) === normalizeText(current.sentence);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2} style={{ marginBottom: 4 }}>意象联想训练</Typography.Title>
        <Typography.Text type="secondary">
          系统先在本地篇目中查找，再由 AI 分类并给出原句证据；教师最终决定哪些句子进入训练。
        </Typography.Text>
      </div>

      <Card title="1. 设置检索范围">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap size="middle">
            <Input
              addonBefore="目标意象"
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              placeholder="例如：风、月、雨、雁"
              style={{ width: 260 }}
            />
            <Radio.Group
              options={GENRE_OPTIONS}
              optionType="button"
              buttonStyle="solid"
              value={genre}
              onChange={(event) => {
                setGenre(event.target.value);
                setRecommendations([]);
              }}
            />
          </Space>
          <div>
            <Space wrap style={{ marginBottom: recommendations.length ? 8 : 0 }}>
              <Typography.Text strong>推荐训练意象</Typography.Text>
              <Button size="small" loading={recommendationLoading} onClick={recommend}>
                AI 生成推荐
              </Button>
              <Typography.Text type="secondary">点击推荐词可填入上方，仍可自行修改</Typography.Text>
            </Space>
            {recommendations.length > 0 ? (
              <Space wrap>
                {recommendations.map((item) => (
                  <Button
                    key={item.theme}
                    size="small"
                    type={theme === item.theme ? 'primary' : 'default'}
                    title={item.reason}
                    onClick={() => setTheme(item.theme)}
                  >
                    {item.theme} · {item.article_count} 篇
                  </Button>
                ))}
              </Space>
            ) : null}
          </div>
          <Select
            mode="multiple"
            allowClear
            value={scopeIds}
            options={scopes.map((scope) => ({ label: scope.name, value: scope.id }))}
            onDropdownVisibleChange={(open) => open && loadScopes()}
            onFocus={loadScopes}
            onChange={(ids) => {
              setScopeIds(ids);
              setRecommendations([]);
            }}
            placeholder="篇目大分类（不选表示全部 72 篇）"
            style={{ width: '100%' }}
          />
          <Input
            value={relatedTerms}
            onChange={(event) => setRelatedTerms(event.target.value)}
            addonBefore="补充检索词"
            placeholder="可选，例如：东风、西风、朔风；AI 还会自动扩展可核验的词"
          />
          <Alert
            type="info"
            showIcon
            message="AI 语义审核"
            description="结果分为直接呈现、传统关联、氛围营造、比喻象征、不确定和误命中。前三类默认进入训练，其余由教师复核。"
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={scan}>
            AI 查找并审核原句
          </Button>
        </Space>
      </Card>

      {loading ? <Card><Spin tip="正在核对 72 篇原文并进行语义审核……" /></Card> : null}

      {result && !loading ? (
        <>
          <Card title="2. 复核训练材料">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Space wrap size="large">
                <Statistic title="检索篇目" value={result.scope_article_count} suffix="篇" />
                <Statistic title="字面命中" value={result.literal_match_count} suffix="句" />
                <Statistic title="规则排除" value={result.rule_filtered_count} suffix="句" />
                <Statistic title="完成审核" value={result.reviewed_count} suffix="句" />
                <Statistic title="自动通过" value={result.accepted_count} suffix="句" valueStyle={{ color: '#3f8600' }} />
                <Statistic title="待教师判断" value={result.pending_count} suffix="句" valueStyle={{ color: '#d48806' }} />
                <Statistic title="误命中" value={result.rejected_count} suffix="句" />
              </Space>
              {result.cache_hit ? <Alert type="success" showIcon message="已使用本地审核缓存，本次未重复调用 AI" /> : null}
              {result.truncated_count > 0 ? (
                <Alert type="warning" showIcon message={`命中较多，另有 ${result.truncated_count} 句未进入本轮 AI 审核`} />
              ) : null}
              <div>
                <Typography.Text type="secondary">实际检索词：</Typography.Text>{' '}
                {result.search_term_details.map((item) => (
                  <Tag key={item.term} title={`来源：${item.sources.map((source) => TERM_SOURCE_LABELS[source]).join('、')}`}>
                    {item.term} · {item.sources.map((source) => TERM_SOURCE_LABELS[source]).join('/')}
                  </Tag>
                ))}
              </div>
              <Divider style={{ margin: '4px 0' }} />
              <Radio.Group
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value)}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: `自动通过 ${result.accepted_count}`, value: 'accepted' },
                  { label: `待教师判断 ${result.pending_count}`, value: 'pending' },
                  { label: `误命中 ${result.rejected_count}`, value: 'rejected' },
                  { label: `全部 ${result.candidates.length}`, value: 'all' },
                ]}
              />
              {displayedCandidates.length === 0 ? <Empty description="当前分类没有原句" /> : displayedCandidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  checked={confirmedIds.includes(candidate.id)}
                  onChange={(checked) => toggleCandidate(candidate.id, checked)}
                />
              ))}
              <Button type="primary" icon={<ThunderboltOutlined />} disabled={confirmed.length === 0} onClick={beginTraining}>
                用已确认的 {confirmed.length} 句开始训练
              </Button>
            </Space>
          </Card>

          {current && trainingIndex !== null ? (
            <Card title="3. 联想默写">
              <Steps
                size="small"
                current={trainingIndex}
                items={confirmed.map((item) => ({ title: item.title }))}
                style={{ marginBottom: 24 }}
              />
              <Typography.Paragraph strong style={{ fontSize: 17 }}>
                请写出《{current.title}》中呈现“{result.theme}”意象的原文。
              </Typography.Paragraph>
              <Typography.Text type="secondary">
                提示：{current.dynasty || '朝代未标注'} · {current.author || '作者未标注'} · {current.imagery_role}
              </Typography.Text>
              <Input.TextArea
                rows={4}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="在这里默写原句"
                style={{ marginTop: 12 }}
              />
              <Space style={{ marginTop: 12 }} wrap>
                <Button onClick={() => setShowAnswer(true)}>核对原文</Button>
                {showAnswer ? <Button type="primary" onClick={next}>{trainingIndex + 1 >= confirmed.length ? '完成本轮' : '下一句'}</Button> : null}
              </Space>
              {showAnswer ? (
                <Alert
                  style={{ marginTop: 16 }}
                  type={exact ? 'success' : 'warning'}
                  showIcon
                  icon={exact ? <CheckCircleOutlined /> : undefined}
                  message={exact ? '逐字匹配' : '请对照原文自查'}
                  description={<Typography.Text className="serif">{current.sentence}</Typography.Text>}
                />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Space>
  );
}

function CandidateCard({
  candidate,
  checked,
  onChange,
}: {
  candidate: Candidate;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const label = REVIEW_LABELS[candidate.label];
  return (
    <Card size="small" style={{ borderColor: candidate.review_status === 'accepted' ? '#b7eb8f' : candidate.review_status === 'pending' ? '#ffe58f' : '#d9d9d9' }}>
      <Space align="start">
        <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <div>
          <Space wrap>
            <Typography.Text strong>《{candidate.title}》</Typography.Text>
            {candidate.catalog_name ? <Tag>{candidate.catalog_name}</Tag> : null}
            <Tag color={label.color}>{label.text}</Tag>
            <Tag color="blue">{candidate.imagery_role}</Tag>
            <Typography.Text type="secondary">置信度 {Math.round(candidate.confidence * 100)}%</Typography.Text>
          </Space>
          <Typography.Paragraph className="serif" style={{ margin: '8px 0 4px', fontSize: 16 }}>
            {candidate.sentence}
          </Typography.Paragraph>
          <Space direction="vertical" size={2}>
            <Typography.Text type="secondary">证据：<Typography.Text mark>{candidate.evidence}</Typography.Text></Typography.Text>
            <Typography.Text type="secondary">{candidate.reason}</Typography.Text>
            <Typography.Text type="secondary">
              命中词：{candidate.matched_terms.map((term) => `${term}（${(candidate.matched_term_sources[term] || []).map((source) => TERM_SOURCE_LABELS[source]).join('/')}）`).join('、')}
            </Typography.Text>
          </Space>
        </div>
      </Space>
    </Card>
  );
}

function normalizeText(value: string): string {
  return String(value || '').replace(/[\s，。！？；：、“”‘’（）()《》〈〉]/g, '');
}
