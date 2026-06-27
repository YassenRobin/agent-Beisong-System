/**
 * AI Service 公共类型
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export type ChatResponse = {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
};

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  chat(req: ChatRequest, apiKey: string, baseUrl: string): Promise<ChatResponse>;
  testConnection(apiKey: string, baseUrl: string, model: string): Promise<{ ok: boolean; message: string }>;
}

// 出题相关
export type QuestionType = 'choice' | 'blank' | 'context_blank' | 'context_recitation' | 'pure_recitation' | 'ordering';

export type GeneratedQuestion = {
  type: QuestionType;
  star: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  options?: string[];
  answer: string;
  source_text?: string;
  hint?: string;
  explanation?: string;
  logic_role?: string;
};

// 判题相关
export type JudgeResult = {
  is_correct: boolean;
  score: number; // 0~1
  error_type?: string;
  feedback?: string;
};

// 错因解释
export type ExplainResult = {
  feedback: string;
};

// 易错点生题
export type WeakPoint = {
  title: string;
  source_text: string;
  article_full_text?: string;
  target_answer: string;
  wrong_examples?: string[];
  weak_type?: string;
  description?: string;
};

export type DungeonBlueprint = {
  name: string;
  star: 1 | 2 | 3 | 4 | 5;
  description?: string;
  rooms: Array<{
    id: string;
    type: 'safe' | 'normal' | 'danger' | 'elite' | 'weak_point' | 'rest' | 'boss';
    name: string;
    question_specs: Array<{
      type: QuestionType;
      star: 1 | 2 | 3 | 4 | 5;
      topic?: string;
      hint?: string;
    }>;
  }>;
  boss_spec?: {
    type: QuestionType;
    star: 5;
    topic: string;
  };
  initial_hearts: number;
  initial_items?: string[];
};

export type ErrorType =
  | 'punctuation'   // 标点错误
  | 'format'        // 格式问题
  | 'homophone'     // 同音误写
  | 'similar_shape' // 形近字误写
  | 'keyword'       // 关键词错误
  | 'missing_kw'    // 漏关键词
  | 'missing_line'  // 漏句
  | 'line_swap'     // 上下句混淆
  | 'order'         // 整段顺序错乱
  | 'near_synonym'  // 近义替换
  | 'other';
