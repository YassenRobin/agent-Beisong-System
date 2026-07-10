/**
 * AI Provider 抽象基类 + 通用 HTTP 调用
 *
 * 四家厂商都使用 OpenAI 兼容的 Chat Completions 接口,
 * 抽象为一个 BaseProvider,通过 baseUrl/model 切换即可。
 *
 * 注意: MiniMax 的实际接口可能略有差异,
 * 由 MiniMaxProvider 自行覆盖 chat() 方法。
 */
import type { AIProvider, ChatRequest, ChatResponse } from './types';
import { requestJson } from '../services/http';

export type ProviderOptions = {
  defaultBaseUrl?: string;
  defaultModel?: string;
};

export abstract class OpenAICompatibleProvider implements AIProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  protected abstract readonly options: ProviderOptions;

  protected buildUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    return `${trimmed}/chat/completions`;
  }

  async chat(req: ChatRequest, apiKey: string, baseUrl: string): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model || this.options.defaultModel,
      messages: req.messages,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 4096,
    };
    if (req.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await requestJson({
      url: this.buildUrl(baseUrl),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: req.signal,
      timeoutMs: 90_000,
    });

    const choice = (res as any).choices?.[0];
    const content = choice?.message?.content ?? '';
    return {
      content,
      model: (res as any).model || req.model,
      usage: (res as any).usage,
      raw: res,
    };
  }

  async testConnection(apiKey: string, baseUrl: string, model: string) {
    try {
      const res = await this.chat(
        {
          model,
          messages: [
            { role: 'system', content: '你是连接测试助手,只回复 OK。' },
            { role: 'user', content: 'ping' },
          ],
          // 思考模型会先消耗推理 token；16 很容易在生成正文前就耗尽。
          maxTokens: 512,
          temperature: 0,
        },
        apiKey,
        baseUrl,
      );
      // 能走到这里说明接口已返回 2xx，鉴权、地址和模型均已通过。
      // 思考模型可能只返回 reasoning_content，连接测试不应因此误判失败。
      if (!res.content) return { ok: true, message: '连接成功，模型已响应（未返回可见文本）' };
      return { ok: true, message: `连接成功,示例回复: ${res.content.slice(0, 30)}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || '连接失败' };
    }
  }
}
