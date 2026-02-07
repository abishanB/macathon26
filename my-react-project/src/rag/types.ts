/** Types for the UrbanSim RAG system */

export interface RagDocument {
  id: string;
  content: string;
  metadata: RagDocMetadata;
}

export interface RagDocMetadata {
  doc: string;
  priority?: number;
  source?: string;
  sourceUrl?: string;
  location?: string;
  category?: 'construction' | 'traffic' | 'noise' | 'transit' | 'zoning' | 'general';
  datePublished?: string;
  dateIngested?: string;
}

export interface ThreadConfig {
  id: string;
  name: string;
  description: string;
  location: string;
  bbox?: string;
}

export interface RagQueryResult {
  answer: string;
  sources: string[];
  confidence: number;
}

export interface UploadResult {
  success: boolean;
  documentId: string;
  threadId: string;
  error?: string;
}

export interface IngestReport {
  totalDocs: number;
  uploaded: number;
  failed: number;
  threadId: string;
  timestamp: string;
  results: UploadResult[];
}
