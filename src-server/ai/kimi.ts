import { OpenAICompatibleProvider } from './base';

export class KimiProvider extends OpenAICompatibleProvider {
  readonly id = 'kimi';
  readonly name = 'Kimi (Moonshot)';
  protected readonly options = {
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.6',
  };
}