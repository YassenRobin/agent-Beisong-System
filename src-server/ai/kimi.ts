import { OpenAICompatibleProvider } from './base';
import type { ChatRequest, ChatResponse } from './types';

export class KimiProvider extends OpenAICompatibleProvider {
  readonly id = 'kimi';
  readonly name = 'Kimi (Moonshot)';
  protected readonly options = {
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
  };

  async chat(req: ChatRequest, apiKey: string, baseUrl: string): Promise<ChatResponse> {
    const isKimiCode = /^https:\/\/api\.kimi\.com\/coding(?:\/v1)?\/?$/i.test(
      baseUrl.replace(/\/+$/, ''),
    );
    if (!isKimiCode) return super.chat(req, apiKey, baseUrl);

    // Kimi Code 使用固定模型 ID，且当前仅接受 temperature=1。
    return super.chat(
      {
        ...req,
        model: 'kimi-for-coding',
        temperature: 1,
      },
      apiKey.trim(),
      baseUrl,
    );
  }
}
