/**
 * API Key 加解密
 *
 * 不引入重型 crypto 库,使用 Node 内置 crypto (AES-256-GCM)。
 * 主密钥由设备指纹(用户目录 + 机器名)派生,密钥本身不落盘。
 * 这是「轻度保护」:对本地磁盘被拷贝有阻碍,但对运行中进程被调试不设防。
 * 这对个人学习软件来说已经足够。
 */
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const SALT = 'beisong.v1.salt';

function getDeviceKey(): Buffer {
  const seed = [
    os.homedir(),
    os.hostname(),
    os.platform(),
    os.userInfo().username,
    path.sep,
  ].join('|');
  return crypto.scryptSync(seed, SALT, 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = getDeviceKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  if (!payload) return '';
  try {
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const key = getDeviceKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
  } catch {
    return '';
  }
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}