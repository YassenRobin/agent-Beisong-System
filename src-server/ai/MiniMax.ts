/**
 * MiniMax (MiniMax) Provider
 *
 * 兼容 OpenAI Chat Completions 协议。
 * 注:部分 MiniMax 网关要求 messages 中至少有一条 user 消息,
 * 同时 json_object 模式需要 model 支持(默认 model 列表里的均可)。
 */
import { OpenAICompatibleProvider } from './base';

export class MiniMaxProvider extends OpenAICompatibleProvider {
  readonly id = 'MiniMax';
  readonly name = 'MiniMax';
  protected readonly options = {
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M2.7',
  };
}