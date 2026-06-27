import type { AIProvider } from './types';
import { MiniMaxProvider } from './MiniMax';
import { QwenProvider } from './qwen';
import { KimiProvider } from './kimi';
import { DeepSeekProvider } from './deepseek';

export const ALL_PROVIDERS: AIProvider[] = [
  new MiniMaxProvider(),
  new QwenProvider(),
  new KimiProvider(),
  new DeepSeekProvider(),
];

export function getProvider(type: string): AIProvider | undefined {
  return ALL_PROVIDERS.find((p) => p.id === type);
}