import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EnkeShareClient,
  parseChatExport,
  createZip,
  type ShareInput as CoreShareInput,
} from '@enke/core';
import type { ShareRecordV1 } from '@enke/protocol';
import { getToken, shorten, uploadDoc } from 'enke-sdk';

export interface ShareResult {
  id: string;
  shortUrl: string;
  kind: string;
  title?: string;
}

export interface SendShareOptions {
  text?: string;
  url?: string;
  title?: string;
  files?: string[];
  chatFile?: string;
  visibility?: 'link' | 'private';
  expiresIn?: number;
  onProgress?: (percent: number) => void;
}

function expiryDays(seconds?: number): number {
  if (!seconds) return 7;
  return Math.max(1, Math.min(365, Math.round(seconds / 86400)));
}

const DIRECT_EXT = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|tiff?|txt|csv|md|xml|html?|css|js|mjs|json|ts|tsx|jsx|docx?|xlsx?|pptx?|zip|gz|tar|7z|mp4|webm|mp3|wav|ogg)$/i;

function directFile(name: string): boolean {
  return DIRECT_EXT.test(name);
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'enke-share';
}

function workerBase(): string | null {
  const base = process.env.ENKE_SHARE_API_URL?.trim();
  return base ? base.replace(/\/+$/, '') : null;
}

/**
 * 只有显式配置 ENKE_SHARE_API_URL 时才走 enke-share worker。
 * 默认使用 en.ke 现有线上 API（api.en.ke），不假设未部署的占位域名。
 */
export function createShareClient(): EnkeShareClient {
  const base = workerBase();
  if (!base) {
    throw new Error('enke-share worker 未配置。设置 ENKE_SHARE_API_URL=https://<your-worker>/v1 后再使用设备/实时功能。');
  }
  return new EnkeShareClient({
    apiBase: base,
    sharePageBase: process.env.ENKE_SHARE_PAGE_URL ?? 'https://en.ke',
    platform: 'cli',
    appName: 'enke-cli',
    appVersion: process.env.npm_package_version ?? '1.8.0',
    tokenProvider: getToken,
    refreshTokenProvider: async () => {
      const token = await getToken();
      return token ? { accessToken: token } : null;
    },
  });
}

function toResult(record: ShareRecordV1): ShareResult {
  return {
    id: record.id,
    shortUrl: record.shortUrl ?? `https://en.ke/${record.id}`,
    kind: record.kind,
    ...(record.title ? { title: record.title } : {}),
  };
}

async function sendViaWorker(options: SendShareOptions, chat: ReturnType<typeof parseChatExport> | undefined): Promise<ShareResult> {
  const client = createShareClient();
  const items: NonNullable<CoreShareInput['items']> = [];
  for (const file of options.files ?? []) {
    const path = resolve(file);
    const data = await readFile(path);
    items.push({ name: basename(path), data: new Uint8Array(data) });
  }
  const input: CoreShareInput = {
    ...(options.title ? { title: options.title } : {}),
    ...(options.text ? { text: options.text } : {}),
    ...(options.url ? { url: options.url } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(chat ? { chat: chat.chat } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
    ...(options.expiresIn ? { expiresIn: options.expiresIn } : {}),
  };
  const { share } = await client.send(input, {
    onProgress: (progress) => {
      if (progress.total > 0) options.onProgress?.(Math.round((progress.loaded / progress.total) * 100));
    },
  });
  return toResult(share);
}

async function sendViaApi(options: SendShareOptions, chat: ReturnType<typeof parseChatExport> | undefined): Promise<ShareResult> {
  const files = options.files ?? [];
  if (options.visibility === 'private') {
    throw new Error('api.en.ke 文档分享没有“仅自己可见”模式；私有分享需要部署 enke-share worker，或改用本地文件。');
  }
  // 纯 URL → 现有短链 API
  if (options.url && files.length === 0 && !options.text && !chat) {
    const link = await shorten(options.url, { keep_days: expiryDays(options.expiresIn) });
    return { id: link.slug, shortUrl: link.shortUrl, kind: 'link' };
  }

  // 单文件且服务端支持该类型 → 直接上传
  const direct = files.length === 1 && !options.text && !options.url && !chat
    && directFile(files[0]!);
  if (direct) {
    const path = resolve(files[0]!);
    const doc = await uploadDoc(path, basename(path), {
      exp_days: expiryDays(options.expiresIn),
      ...(options.title ? { comment: options.title.slice(0, 500) } : {}),
    });
    return {
      id: doc.slug,
      shortUrl: `https://en.ke/${doc.slug}`,
      kind: /\.(png|jpe?g|gif|webp)$/i.test(doc.filename) ? 'image' : 'file',
      ...(options.title ? { title: options.title } : {}),
    };
  }

  // 多文件 / 任意二进制 / 文件+文字混合 → 打成一个 zip
  if (files.length > 0) {
    const entries: Array<{ name: string; data: Uint8Array | string }> = [];
    const note = [options.url, options.text].filter(Boolean).join('\n\n');
    if (note) entries.push({ name: 'note.md', data: note });
    if (chat) {
      const chatLines = [`# ${chat.chat.conversation.name || 'Chat export'}`, '', `Provider: ${chat.chat.provider}`, ''];
      for (const message of chat.chat.messages) {
        const when = message.sentAt ? new Date(message.sentAt).toISOString() : '';
        chatLines.push(`${when} ${message.sender}: ${message.text ?? `[${message.type}]`}`.trim());
      }
      entries.push({ name: 'chat.md', data: chatLines.join('\n') });
    }
    for (const file of files) {
      const path = resolve(file);
      entries.push({ name: basename(path), data: new Uint8Array(await readFile(path)) });
    }
    const zip = createZip(entries);
    const filename = `${safeName(options.title || chat?.chat.conversation.name || 'enke-share')}.zip`;
    const dir = await mkdtemp(join(tmpdir(), 'enke-share-'));
    const path = join(dir, filename);
    try {
      await writeFile(path, zip);
      const doc = await uploadDoc(path, filename, {
        exp_days: expiryDays(options.expiresIn),
        ...(options.title ? { comment: options.title.slice(0, 500) } : {}),
      });
      return {
        id: doc.slug,
        shortUrl: `https://en.ke/${doc.slug}`,
        kind: chat ? 'chat' : 'file',
        ...(options.title ? { title: options.title } : {}),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // 文本 / 聊天 → 生成 Markdown，再走文档分享 API
  const lines: string[] = [];
  if (options.title) lines.push(`# ${options.title}`, '');
  if (options.url) lines.push(options.url, '');
  if (options.text) lines.push(options.text, '');
  if (chat) {
    lines.push(`# ${chat.chat.conversation.name || 'Chat export'}`, '');
    lines.push(`Provider: ${chat.chat.provider}`, '');
    for (const message of chat.chat.messages) {
      const when = message.sentAt ? new Date(message.sentAt).toISOString() : '';
      lines.push(`${when} ${message.sender}: ${message.text ?? `[${message.type}]`}`.trim());
    }
  }
  const content = lines.join('\n').trim();
  if (!content) throw new Error('Nothing to share.');

  const filename = `${safeName(options.title || chat?.chat.conversation.name || 'enke-share')}.md`;
  const dir = await mkdtemp(join(tmpdir(), 'enke-share-'));
  const path = join(dir, filename);
  try {
    await writeFile(path, content, 'utf8');
    const doc = await uploadDoc(path, filename, {
      exp_days: expiryDays(options.expiresIn),
      ...(options.title ? { comment: options.title.slice(0, 500) } : {}),
    });
    return {
      id: doc.slug,
      shortUrl: `https://en.ke/${doc.slug}`,
      kind: chat ? 'chat' : 'text',
      ...(options.title ? { title: options.title } : {}),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function sendShare(options: SendShareOptions): Promise<ShareResult> {
  let chat: ReturnType<typeof parseChatExport> | undefined;
  if (options.chatFile) {
    const path = resolve(options.chatFile);
    const content = await readFile(path, 'utf8');
    chat = parseChatExport({ filename: basename(path), content });
  }
  if (workerBase()) return sendViaWorker(options, chat);
  return sendViaApi(options, chat);
}

export function sharePageUrl(share: ShareResult): string {
  return share.shortUrl;
}
