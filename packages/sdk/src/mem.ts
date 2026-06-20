/**
 * MemClient — mem-as-a-service client for enke-sdk.
 *
 * Uses the enke JWT token (from enke login) for authentication.
 * The mem worker auto-creates a tenant on first use based on user_id.
 *
 * Usage:
 *   import { MemClient } from 'enke-sdk';
 *   const mem = new MemClient();
 *   await mem.remember({ content: "用户叫Derek" });
 */

import { getToken, loadConfig } from './auth.js';

/** Default mem-as-a-service API endpoint. Override with MEM_API_URL env var. */
const DEFAULT_MEM_URL = 'https://mem-api.en.ke';

// ── Types ──

export type MemoryType = 'semantic' | 'episodic' | 'procedural';
export type TtlLevel = 'buffer' | 'working' | 'permanent';

export interface Memory {
  id: string;
  content: string;
  memory_type: MemoryType;
  importance: number;
  access_count: number;
  last_accessed_at: string | null;
  ttl_level: TtlLevel;
  expires_at: string | null;
  superseded_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryInput {
  content: string;
  memory_type?: MemoryType;
  importance?: number;
  ttl_level?: TtlLevel;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface SearchResponse {
  results: Memory[];
  query: string;
  count: number;
}

export interface StatsResponse {
  total: number;
  active: number;
  archived: number;
  by_type: Record<string, number>;
  by_ttl: Record<string, number>;
}

export interface Session {
  id: string;
  agent_type: string | null;
  status: 'active' | 'closed';
  metadata: Record<string, unknown>;
  created_at: string;
  closed_at: string | null;
}

export interface AssembledContext {
  session_id: string;
  active_memories: Array<{ id: string; content: string; memory_type: string; created_at: string }>;
  recalled_memories: Memory[];
  token_estimate: number;
}

export interface DocInfo {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: 'processing' | 'ready' | 'error';
  chunk_count: number;
  created_at: string;
}

export interface DocSearchResult {
  document_id: string;
  filename: string;
  chunk_index: number;
  content: string;
  score: number;
}

export class MemApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'MemApiError';
    this.code = code;
    this.status = status;
  }
}

// ── Client ──

export class MemClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.MEM_API_URL ?? DEFAULT_MEM_URL;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    if (!token) {
      const cfg = loadConfig();
      if (cfg) {
        const expDate = new Date(cfg.expiresAt * 1000).toLocaleString();
        throw new MemApiError('TOKEN_EXPIRED', `Token expired (was valid until ${expDate}). Run: enke login`, 401);
      }
      throw new MemApiError('UNAUTHORIZED', 'Not logged in. Run: enke login', 401);
    }

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const code = typeof data.error === 'string' ? data.error : 'UNKNOWN';
      const message = typeof data.message === 'string' ? data.message : res.statusText;
      throw new MemApiError(code, message, res.status);
    }

    return data as T;
  }

  // ── Memories ──

  /** Store a memory. */
  async remember(input: CreateMemoryInput): Promise<Memory> {
    const body: Record<string, unknown> = {
      content: input.content,
      memory_type: input.memory_type ?? 'semantic',
      importance: input.importance ?? 0.5,
      ttl_level: input.ttl_level ?? 'working',
    };
    if (input.tags) body.metadata = { tags: input.tags };
    if (input.metadata) body.metadata = { ...(body.metadata as Record<string, unknown> ?? {}), ...input.metadata };

    return this.request<Memory>('POST', '/api/v1/memories', body);
  }

  /** Search memories. */
  async recall(
    query: string,
    options?: { memory_type?: MemoryType; limit?: number; threshold?: number },
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options?.memory_type) params.set('type', options.memory_type);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.threshold) params.set('threshold', String(options.threshold));
    return this.request<SearchResponse>('GET', `/api/v1/memories/search?${params}`);
  }

  /** Soft-delete a memory. */
  async forget(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request('DELETE', `/api/v1/memories/${id}`);
  }

  /** List memories. */
  async list(options?: { memory_type?: string; limit?: number }): Promise<{ results: Memory[]; count: number }> {
    const params = new URLSearchParams();
    if (options?.memory_type) params.set('type', options.memory_type);
    if (options?.limit) params.set('limit', String(options.limit ?? 50));
    const qs = params.toString();
    return this.request('GET', `/api/v1/memories${qs ? `?${qs}` : ''}`);
  }

  /** Get memory statistics. */
  async stats(): Promise<StatsResponse> {
    return this.request<StatsResponse>('GET', '/api/v1/memories/stats');
  }

  // ── Sessions ──

  /** Create a session. */
  async createSession(agentType?: string): Promise<Session> {
    return this.request<Session>('POST', '/api/v1/sessions', { agent_type: agentType });
  }

  /** Assemble context for a session. */
  async assembleContext(sessionId: string, limit?: number): Promise<AssembledContext> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.request<AssembledContext>('GET', `/api/v1/sessions/${sessionId}/context${qs}`);
  }

  // ── Documents ──

  /** Upload a document to the knowledge base. Pass encoding='base64' for binary files. */
  async uploadDoc(
    filename: string,
    content: string,
    opts?: { encoding?: 'utf-8' | 'base64'; mime_type?: string },
  ): Promise<DocInfo> {
    const body: Record<string, unknown> = {
      filename,
      content,
      mime_type: opts?.mime_type ?? 'text/plain',
    };
    if (opts?.encoding === 'base64') body.encoding = 'base64';
    return this.request<DocInfo>('POST', '/api/v1/documents', body);
  }

  /** Search uploaded documents. */
  async searchDocs(
    query: string,
    options?: { limit?: number },
  ): Promise<{ results: DocSearchResult[]; query: string; count: number }> {
    const params = new URLSearchParams({ q: query });
    if (options?.limit) params.set('limit', String(options.limit));
    return this.request('GET', `/api/v1/documents/search?${params}`);
  }

  /** List documents. */
  async listDocs(): Promise<{ documents: DocInfo[]; count: number }> {
    return this.request('GET', '/api/v1/documents');
  }

  /** Delete a document and all its chunks + vectors. */
  async deleteDoc(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request('DELETE', `/api/v1/documents/${id}`);
  }
}
