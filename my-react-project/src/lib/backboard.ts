/**
 * Backboard.io RAG/Memory Client
 * 
 * Correct API details (discovered from OpenAPI spec):
 * - Base URL: https://app.backboard.io/api
 * - Auth: X-API-Key header
 * - Flow: Create Assistant → Create Thread under Assistant → Upload Docs → Chat
 * - Doc upload: multipart/form-data with 'file' field
 * - Messages: multipart/form-data with 'content' field
 */

import type { RagDocMetadata, ThreadConfig, UploadResult, RagQueryResult } from '../rag/types';

interface BackboardClientConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface BackboardAssistant {
  assistant_id: string;
  name: string;
  description: string;
  system_prompt: string;
}

export interface BackboardThread {
  thread_id: string;
  created_at: string;
  messages: unknown[];
}

class BackboardClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: BackboardClientConfig) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = config.baseUrl || 'https://app.backboard.io/api';
  }

  private async requestJSON(endpoint: string, method: string, body?: unknown) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Backboard ${method} ${endpoint} → ${res.status}: ${errText}`);
    }
    return res.json();
  }

  private async requestForm(endpoint: string, formData: FormData) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey },
      body: formData,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Backboard POST ${endpoint} → ${res.status}: ${errText}`);
    }
    return res.json();
  }

  // ── Assistants ──

  async listAssistants(): Promise<BackboardAssistant[]> {
    return this.requestJSON('/assistants', 'GET');
  }

  async createAssistant(opts: {
    name: string;
    description?: string;
    system_prompt?: string;
  }): Promise<BackboardAssistant> {
    return this.requestJSON('/assistants', 'POST', opts);
  }

  async getOrCreateAssistant(name: string, systemPrompt: string): Promise<BackboardAssistant> {
    const assistants = await this.listAssistants();
    const existing = assistants.find(a => a.name === name);
    if (existing) return existing;
    return this.createAssistant({ name, system_prompt: systemPrompt });
  }

  // ── Threads ──

  async listThreads(): Promise<any[]> {
    return this.requestJSON('/threads', 'GET');
  }

  async createThreadForAssistant(assistantId: string): Promise<BackboardThread> {
    return this.requestJSON(`/assistants/${assistantId}/threads`, 'POST', {});
  }

  async getThread(threadId: string) {
    return this.requestJSON(`/threads/${threadId}`, 'GET');
  }

  async listAssistantThreads(assistantId: string): Promise<BackboardThread[]> {
    return this.requestJSON(`/assistants/${assistantId}/threads`, 'GET');
  }

  // ── Documents ──

  async uploadDocumentToThread(
    threadId: string,
    doc: { content: string; metadata?: RagDocMetadata; filename?: string }
  ): Promise<UploadResult> {
    try {
      const filename = doc.filename || `${doc.metadata?.doc || 'document'}.txt`;
      const blob = new Blob([doc.content], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, filename);

      const result = await this.requestForm(`/threads/${threadId}/documents`, formData);
      return {
        success: true,
        documentId: result.document_id || result.id || 'unknown',
        threadId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Upload failed [${doc.metadata?.doc}]:`, errMsg);
      return { success: false, documentId: '', threadId, error: errMsg };
    }
  }

  async uploadPdfToThread(
    threadId: string,
    pdfPath: string,
    filename: string
  ): Promise<UploadResult> {
    try {
      const { readFileSync } = await import('fs');
      const pdfBuffer = readFileSync(pdfPath);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', blob, filename);

      const result = await this.requestForm(`/threads/${threadId}/documents`, formData);
      return {
        success: true,
        documentId: result.document_id || result.id || 'unknown',
        threadId,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`PDF upload failed [${filename}]:`, errMsg);
      return { success: false, documentId: '', threadId, error: errMsg };
    }
  }

  async listDocuments(threadId: string) {
    return this.requestJSON(`/threads/${threadId}/documents`, 'GET');
  }

  // ── Messages / Chat ──

  async addMessage(threadId: string, content: string, opts?: { llm_provider?: string; model_name?: string }) {
    const formData = new FormData();
    formData.append('content', content);
    if (opts?.llm_provider) formData.append('llm_provider', opts.llm_provider);
    if (opts?.model_name) formData.append('model_name', opts.model_name);
    return this.requestForm(`/threads/${threadId}/messages`, formData);
  }

  async chat(threadId: string, message: string): Promise<RagQueryResult> {
    const result = await this.addMessage(threadId, message);
    return {
      answer: result.answer || result.content || result.message || JSON.stringify(result),
      sources: result.sources || [],
      confidence: result.confidence || 0,
    };
  }
}

// ── Singleton ──
let _client: BackboardClient | null = null;

export function getBackboardClient(): BackboardClient {
  if (_client) return _client;

  const apiKey = typeof process !== 'undefined'
    ? process.env.BACKBOARD_API_KEY || process.env.BACKBOARD_KEY || ''
    : (import.meta as any).env?.VITE_BACKBOARD_API_KEY || '';

  if (!apiKey) {
    throw new Error('Backboard API key not found. Set BACKBOARD_API_KEY in .env');
  }

  _client = new BackboardClient({ apiKey });
  return _client;
}

/** Toronto assistant config */
export const TORONTO_ASSISTANT_CONFIG = {
  name: 'UrbanSim Toronto',
  systemPrompt: `You are an expert on Toronto municipal construction, traffic management, noise bylaws, and zoning regulations. Answer questions using uploaded documents about CMP 2023-2026, TIS Guidelines, Noise Bylaws, RoDARS, and TTC coordination. Be specific and cite document sources.`,
};

/** Pre-built Toronto thread config */
export const TORONTO_THREAD: ThreadConfig = {
  id: 'toronto_construction_2026',
  name: 'Toronto Construction & Traffic (2026)',
  description: 'Toronto municipal construction, traffic, noise, and zoning regulations.',
  location: 'Toronto, ON, Canada',
  bbox: '-79.64,43.58,-79.12,43.86',
};

export { BackboardClient };
export default getBackboardClient;
