const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

const {
  formatProviderConnectionFailure,
} = require('../src-server/services/providerConnectionMessage.ts');
const { MiniMaxProvider } = require('../src-server/ai/MiniMax.ts');

assert.equal(
  formatProviderConnectionFailure('Invalid Authentication', {
    providerType: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
  }),
  '鉴权失败：当前使用 MiniMax 中国站地址。请确认密钥是在 MiniMax 中国站创建的；如果密钥来自国际站，请把接口地址改为 https://api.minimax.io/v1，并重新填写密钥。',
);

assert.equal(
  formatProviderConnectionFailure('HTTP 401', {
    providerType: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
  }),
  '鉴权失败：请重新填写该服务平台创建的访问密钥，并确认接口地址与密钥属于同一个平台。',
);

let capturedRequest;
global.fetch = async (url, options) => {
  capturedRequest = { url, options };
  return {
    ok: true,
    text: async () => JSON.stringify({
      model: 'MiniMax-M2.7',
      choices: [{ message: { content: 'OK' } }],
    }),
  };
};

(async () => {
  const provider = new MiniMaxProvider();
  const result = await provider.testConnection(
    'test-key',
    'https://api.minimaxi.com/v1',
    'MiniMax-M2.7',
  );
  assert.equal(result.ok, true);
  assert.equal(capturedRequest.url, 'https://api.minimaxi.com/v1/chat/completions');
  const body = JSON.parse(capturedRequest.options.body);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.max_completion_tokens, 512);
  assert.equal(body.temperature, 0.01);
  console.log('provider connection tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
