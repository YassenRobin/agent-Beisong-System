import { OpenAICompatibleProvider } from './base';

export class QwenProvider extends OpenAICompatibleProvider {
  readonly id = 'qwen';
  readonly name = '通义千问 (Qwen)';
  protected readonly options = {
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.7-max-preview',
  };
}