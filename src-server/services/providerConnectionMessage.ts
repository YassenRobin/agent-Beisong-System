export type ProviderConnectionContext = {
  providerType: string;
  baseUrl: string;
};

const AUTH_ERROR_PATTERN =
  /invalid authentication|authentication (?:fails?|failed)|unauthori[sz]ed|invalid api[- ]?key|incorrect api[- ]?key|http\s*401|\b401\b/i;

export function formatProviderConnectionFailure(
  rawMessage: string,
  context: ProviderConnectionContext,
): string {
  const message = rawMessage?.trim() || '连接失败';

  if (AUTH_ERROR_PATTERN.test(message)) {
    if (context.providerType === 'MiniMax') {
      if (/api\.minimaxi\.com/i.test(context.baseUrl)) {
        return '鉴权失败：当前使用 MiniMax 中国站地址。请确认密钥是在 MiniMax 中国站创建的；如果密钥来自国际站，请把接口地址改为 https://api.minimax.io/v1，并重新填写密钥。';
      }
      if (/api\.minimax\.io/i.test(context.baseUrl)) {
        return '鉴权失败：当前使用 MiniMax 国际站地址。请确认密钥是在 MiniMax 国际站创建的；如果密钥来自中国站，请把接口地址改为 https://api.minimaxi.com/v1，并重新填写密钥。';
      }
    }
    return '鉴权失败：请重新填写该服务平台创建的访问密钥，并确认接口地址与密钥属于同一个平台。';
  }

  if (/http\s*404|\b404\b|model.*not found|not found.*model/i.test(message)) {
    return '连接失败：接口地址或模型名称不正确，请检查后重试。';
  }
  if (/http\s*402|\b402\b|insufficient.*balance|balance.*insufficient|quota/i.test(message)) {
    return '连接失败：账号余额或调用额度不足，请到服务平台检查余额。';
  }
  if (/abort|timeout|timed out/i.test(message)) {
    return '连接超时：请检查网络和接口地址后重试。';
  }

  return `连接失败：${message}`;
}
