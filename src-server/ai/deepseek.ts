import { OpenAICompatibleProvider } from './base';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id = 'deepseek';
  readonly name = 'DeepSeek';
  protected readonly options = {
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-pro',
  };
}