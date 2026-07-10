import assert from 'node:assert/strict';
import { KimiProvider } from '../src-server/ai/kimi';

const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; body: any; authorization: string }> = [];

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const requestIndex = requests.length;
  requests.push({
    url: String(input),
    body: JSON.parse(String(init?.body || '{}')),
    authorization: String((init?.headers as Record<string, string>)?.Authorization || ''),
  });
  return new Response(JSON.stringify({
    model: 'kimi-for-coding',
    choices: [{
      message: requestIndex === 2
        ? { content: '', reasoning_content: 'The connection is valid.' }
        : { content: 'OK' },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

async function main() {
  try {
    const provider = new KimiProvider();
    const response = await provider.chat({
      model: 'moonshot-v1-32k',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 16,
    }, '  secret-key  ', 'https://api.kimi.com/coding/v1/');

    assert.equal(response.content, 'OK');
    assert.equal(requests[0].url, 'https://api.kimi.com/coding/v1/chat/completions');
    assert.equal(requests[0].body.model, 'kimi-for-coding');
    assert.equal(requests[0].body.temperature, 1);
    assert.equal(requests[0].authorization, 'Bearer secret-key');

    await provider.chat({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0.3,
    }, 'open-platform-key', 'https://api.moonshot.cn/v1');

    assert.equal(requests[1].body.model, 'kimi-k2.6');
    assert.equal(requests[1].body.temperature, 0.3);

    const testResult = await provider.testConnection(
      'code-key',
      'https://api.kimi.com/coding/v1',
      'kimi-for-coding',
    );
    assert.equal(testResult.ok, true);
    assert.match(testResult.message, /连接成功/);
    assert.equal(requests[2].body.max_tokens, 512);
    assert.equal(requests[2].body.temperature, 1);
    assert.equal(requests[2].body.model, 'kimi-for-coding');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
