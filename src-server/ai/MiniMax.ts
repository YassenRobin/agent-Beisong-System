/**
 * MiniMax (MiniMax) Provider
 *
 * 兼容 OpenAI Chat Completions 协议。
 * 注:部分 MiniMax 网关要求 messages 中至少有一条 user 消息,
 * 同时 json_object 模式需要 model 支持(默认 model 列表里的均可)。
 */
import { OpenAICompatibleProvider } from './base';
import type { ChatRequest } from './types';

export class MiniMaxProvider extends OpenAICompatibleProvider {
  readonly id = 'MiniMax';
  readonly name = 'MiniMax';
  protected readonly options = {
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.7',
  };

  protected buildRequestBody(req: ChatRequest): Record<string, unknown> {
    const body = super.buildRequestBody(req);
    const maxTokens = body.max_tokens;
    delete body.max_tokens;
    body.max_completion_tokens = maxTokens;
    // MiniMax M2 系列要求 temperature 大于 0 且不超过 1。
    body.temperature = Math.min(1, Math.max(0.01, Number(body.temperature ?? 0.3)));
    return body;
  }
}
