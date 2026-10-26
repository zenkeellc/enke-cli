import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { EnkeShareClient, parseChatExport, type ShareInput, type UploadProgress } from '@enke/core';
import type { ShareRecordV1 } from '@enke/protocol';
import { getToken } from 'enke-sdk';

export interface SendShareOptions {
  version: string;
  text?: string;
  url?: string;
  title?: string;
  files?: string[];
  chatFile?: string;
  visibility?: 'link' | 'private';
  expiresIn?: number;
  onProgress?: (progress: UploadProgress) => void;
}

export function createShareClient(version: string): EnkeShareClient {
  return new EnkeShareClient({
    apiBase: process.env.ENKE_SHARE_API_URL ?? 'https://share.en.ke/v1',
    sharePageBase: process.env.ENKE_SHARE_PAGE_URL ?? 'https://share.en.ke',
    platform: 'cli',
    appName: 'enke-cli',
    appVersion: version,
    tokenProvider: getToken,
    refreshTokenProvider: async () => {
      const token = await getToken();
      return token ? { accessToken: token } : null;
    },
  });
}

export async function sendShare(options: SendShareOptions): Promise<ShareRecordV1> {
  const files = options.files ?? [];
  const items: NonNullable<ShareInput['items']> = [];
  for (const file of files) {
    const path = resolve(file);
    const data = await readFile(path);
    items.push({ name: basename(path), data: new Uint8Array(data) });
  }

  let chat: ReturnType<typeof parseChatExport> | undefined;
  if (options.chatFile) {
    const path = resolve(options.chatFile);
    const content = await readFile(path, 'utf8');
    chat = parseChatExport({ filename: basename(path), content });
  }

  const input: ShareInput = {
    ...(options.title ? { title: options.title } : {}),
    ...(options.text ? { text: options.text } : {}),
    ...(options.url ? { url: options.url } : {}),
    ...(items.length > 0 ? { items } : {}),
    ...(chat ? { chat: chat.chat } : {}),
    ...(options.visibility ? { visibility: options.visibility } : {}),
    ...(options.expiresIn ? { expiresIn: options.expiresIn } : {}),
  };

  const client = createShareClient(options.version);
  const { share } = await client.send(input, {
    onProgress: options.onProgress,
  });
  return share;
}

export function sharePageUrl(share: ShareRecordV1): string {
  return share.shortUrl ?? `https://share.en.ke/${share.id}`;
}
