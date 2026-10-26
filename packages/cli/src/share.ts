import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseChatExport, createZip } from '@enke/core';
import { shorten, uploadDoc } from 'enke-sdk';

/**
 * enke Share publishing. Everything goes through the existing en.ke API:
 *
 * - URL only          → POST /api/v1/links        → https://en.ke/{slug}
 * - single direct file→ POST /api/v1/docs         → https://en.ke/{slug}
 * - text / chat       → Markdown → POST /api/v1/docs
 * - multiple files or mixed content → store-only zip → POST /api/v1/docs
 *
 * There is no separate Share Worker and no alternate API base.
 */

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
  expiresIn?: number;
  onProgress?: (percent: number) => void;
}

function expiryDays(seconds?: number): number {
  if (!seconds) return 7;
  return Math.max(1, Math.min(365, Math.ceil(seconds / 86400)));
}

const DIRECT_EXT = /\.(pdf|png|jpe?g|gif|webp|svg|bmp|tiff?|txt|csv|md|xml|html?|css|js|mjs|json|ts|tsx|jsx|docx?|xlsx?|pptx?|zip|gz|tar|7z|mp4|webm|mp3|wav|ogg)$/i;

function directFile(name: string): boolean {
  return DIRECT_EXT.test(name);
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'enke-share';
}

function chatToMarkdown(chat: ReturnType<typeof parseChatExport>): string {
  const lines = [`# ${chat.chat.conversation.name || 'Chat export'}`, '', `Provider: ${chat.chat.provider}`, ''];
  for (const message of chat.chat.messages) {
    const when = message.sentAt ? new Date(message.sentAt).toISOString() : '';
    lines.push(`${when} ${message.sender}: ${message.text ?? `[${message.type}]`}`.trim());
  }
  return lines.join('\n');
}

async function uploadTemporary(
  content: Uint8Array | string,
  filename: string,
  options: SendShareOptions,
  kind: string,
): Promise<ShareResult> {
  const dir = await mkdtemp(join(tmpdir(), 'enke-share-'));
  const path = join(dir, filename);
  try {
    await writeFile(path, content);
    const doc = await uploadDoc(path, filename, {
      exp_days: expiryDays(options.expiresIn),
      ...(options.title ? { comment: options.title.slice(0, 500) } : {}),
    });
    return {
      id: doc.slug,
      shortUrl: `https://en.ke/${doc.slug}`,
      kind,
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

  const files = options.files ?? [];

  // Pure URL → existing short link API.
  if (options.url && files.length === 0 && !options.text && !chat) {
    const link = await shorten(options.url, { keep_days: expiryDays(options.expiresIn) });
    return { id: link.slug, shortUrl: `https://en.ke/${link.slug}`, kind: 'link' };
  }

  // Single file that the docs API accepts directly.
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

  // Multiple files / arbitrary binaries / mixed content → store-only zip.
  if (files.length > 0) {
    const entries: Array<{ name: string; data: Uint8Array | string }> = [];
    const note = [options.url, options.text].filter(Boolean).join('\n\n');
    if (note) entries.push({ name: 'note.md', data: note });
    if (chat) entries.push({ name: 'chat.md', data: chatToMarkdown(chat) });
    for (const file of files) {
      const path = resolve(file);
      entries.push({ name: basename(path), data: new Uint8Array(await readFile(path)) });
    }
    const zip = createZip(entries);
    const filename = `${safeName(options.title || chat?.chat.conversation.name || 'enke-share')}.zip`;
    return uploadTemporary(zip, filename, options, chat ? 'chat' : 'file');
  }

  // Text / chat only → Markdown document.
  const sections: string[] = [];
  if (options.title) sections.push(`# ${options.title}`, '');
  if (options.url) sections.push(options.url, '');
  if (options.text) sections.push(options.text, '');
  if (chat) sections.push(chatToMarkdown(chat));
  const content = sections.join('\n').trim();
  if (!content) throw new Error('Nothing to share.');

  const filename = `${safeName(options.title || chat?.chat.conversation.name || 'enke-share')}.md`;
  return uploadTemporary(content, filename, options, chat ? 'chat' : 'text');
}

export function sharePageUrl(share: ShareResult): string {
  return share.shortUrl;
}
