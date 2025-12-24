// ============================================
// Embeddings & Chunking for Document Retrieval
// Uses OpenAI text-embedding-3-small
// ============================================

import OpenAI from 'openai';
import { kv } from '@vercel/kv';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Types
// ============================================

export interface DocumentChunk {
  id: string;
  documentId: string;
  courseId: string;
  assignmentId?: string;
  // Content
  content: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
  // Metadata
  documentName: string;
  documentType: string;
  // Embedding (stored separately for size)
  embeddingId: string;
  // Timestamps
  createdAt: number;
}

export interface ChunkEmbedding {
  id: string;
  chunkId: string;
  vector: number[];
}

export interface RetrievedChunk {
  chunk: DocumentChunk;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

// ============================================
// Configuration
// ============================================

const CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200; // overlap between chunks
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// KV Keys
const CHUNK_PREFIX = 'chunk:';
const EMBEDDING_PREFIX = 'embedding:';
const DOC_CHUNKS_PREFIX = 'doc_chunks:';
const COURSE_CHUNKS_PREFIX = 'course_chunks:';

// ============================================
// OpenAI Client
// ============================================

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export function isEmbeddingsConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// ============================================
// Text Chunking
// ============================================

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Array<{
  content: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
}> {
  const chunks: Array<{
    content: string;
    startIndex: number;
    endIndex: number;
    chunkIndex: number;
  }> = [];

  if (!text || text.length === 0) return chunks;

  // Clean text
  const cleanedText = text.replace(/\s+/g, ' ').trim();

  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < cleanedText.length) {
    // Find end of chunk
    let endIndex = Math.min(startIndex + chunkSize, cleanedText.length);

    // Try to break at sentence boundary if not at end
    if (endIndex < cleanedText.length) {
      const lastPeriod = cleanedText.lastIndexOf('.', endIndex);
      const lastNewline = cleanedText.lastIndexOf('\n', endIndex);
      const lastBreak = Math.max(lastPeriod, lastNewline);

      if (lastBreak > startIndex + chunkSize / 2) {
        endIndex = lastBreak + 1;
      }
    }

    const content = cleanedText.slice(startIndex, endIndex).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        startIndex,
        endIndex,
        chunkIndex,
      });
      chunkIndex++;
    }

    // Move start, accounting for overlap
    startIndex = endIndex - overlap;
    if (startIndex >= cleanedText.length - overlap) break;
  }

  return chunks;
}

// ============================================
// Embedding Generation
// ============================================

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000), // Limit input size
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();

  // Batch in groups of 100
  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000));

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    embeddings.push(...response.data.map(d => d.embedding));
  }

  return embeddings;
}

// ============================================
// Chunk Storage
// ============================================

export async function storeDocumentChunks(
  documentId: string,
  documentName: string,
  documentType: string,
  courseId: string,
  assignmentId: string | undefined,
  rawText: string
): Promise<DocumentChunk[]> {
  // Chunk the text
  const textChunks = chunkText(rawText);

  if (textChunks.length === 0) {
    console.log(`[Embeddings] No chunks generated for document ${documentId}`);
    return [];
  }

  console.log(`[Embeddings] Generated ${textChunks.length} chunks for ${documentName}`);

  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(textChunks.map(c => c.content));

  console.log(`[Embeddings] Generated ${embeddings.length} embeddings`);

  // Store chunks and embeddings
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < textChunks.length; i++) {
    const tc = textChunks[i];
    const embedding = embeddings[i];

    const chunkId = uuidv4();
    const embeddingId = uuidv4();

    // Create chunk
    const chunk: DocumentChunk = {
      id: chunkId,
      documentId,
      courseId,
      assignmentId,
      content: tc.content,
      startIndex: tc.startIndex,
      endIndex: tc.endIndex,
      chunkIndex: tc.chunkIndex,
      documentName,
      documentType,
      embeddingId,
      createdAt: Date.now(),
    };

    // Create embedding record
    const embeddingRecord: ChunkEmbedding = {
      id: embeddingId,
      chunkId,
      vector: embedding,
    };

    // Store both
    await kv.set(`${CHUNK_PREFIX}${chunkId}`, chunk);
    await kv.set(`${EMBEDDING_PREFIX}${embeddingId}`, embeddingRecord);

    // Add to indices
    await kv.sadd(`${DOC_CHUNKS_PREFIX}${documentId}`, chunkId);
    await kv.sadd(`${COURSE_CHUNKS_PREFIX}${courseId}`, chunkId);

    chunks.push(chunk);
  }

  console.log(`[Embeddings] Stored ${chunks.length} chunks for document ${documentId}`);

  return chunks;
}

export async function getChunk(chunkId: string): Promise<DocumentChunk | null> {
  return kv.get<DocumentChunk>(`${CHUNK_PREFIX}${chunkId}`);
}

export async function getChunkEmbedding(embeddingId: string): Promise<ChunkEmbedding | null> {
  return kv.get<ChunkEmbedding>(`${EMBEDDING_PREFIX}${embeddingId}`);
}

export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  const chunkIds = await kv.smembers(`${DOC_CHUNKS_PREFIX}${documentId}`);
  if (!chunkIds || chunkIds.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  for (const id of chunkIds) {
    const chunk = await getChunk(id as string);
    if (chunk) chunks.push(chunk);
  }

  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function getCourseChunks(courseId: string): Promise<DocumentChunk[]> {
  const chunkIds = await kv.smembers(`${COURSE_CHUNKS_PREFIX}${courseId}`);
  if (!chunkIds || chunkIds.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  for (const id of chunkIds) {
    const chunk = await getChunk(id as string);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

// ============================================
// Vector Similarity Search
// ============================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function semanticSearch(
  query: string,
  courseId: string,
  assignmentId?: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);

  // Get all chunks for course
  const chunks = await getCourseChunks(courseId);

  // Filter by assignment if specified
  const relevantChunks = assignmentId
    ? chunks.filter(c => !c.assignmentId || c.assignmentId === assignmentId)
    : chunks;

  if (relevantChunks.length === 0) {
    return [];
  }

  // Compute similarities
  const scored: Array<{ chunk: DocumentChunk; score: number }> = [];

  for (const chunk of relevantChunks) {
    const embedding = await getChunkEmbedding(chunk.embeddingId);
    if (!embedding) continue;

    const score = cosineSimilarity(queryEmbedding, embedding.vector);
    scored.push({ chunk, score });
  }

  // Sort by score and take top K
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(s => ({
    chunk: s.chunk,
    score: s.score,
    matchType: 'semantic' as const,
  }));
}

// ============================================
// Keyword Search
// ============================================

export async function keywordSearch(
  query: string,
  courseId: string,
  assignmentId?: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  const chunks = await getCourseChunks(courseId);

  // Filter by assignment if specified
  const relevantChunks = assignmentId
    ? chunks.filter(c => !c.assignmentId || c.assignmentId === assignmentId)
    : chunks;

  // Extract keywords from query
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  // Score chunks by keyword matches
  const scored: Array<{ chunk: DocumentChunk; score: number }> = [];

  for (const chunk of relevantChunks) {
    const content = chunk.content.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        matchCount++;
      }
    }

    if (matchCount > 0) {
      scored.push({
        chunk,
        score: matchCount / keywords.length,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(s => ({
    chunk: s.chunk,
    score: s.score,
    matchType: 'keyword' as const,
  }));
}

// ============================================
// Hybrid Search (Keyword + Semantic)
// ============================================

export async function hybridSearch(
  query: string,
  courseId: string,
  assignmentId?: string,
  topK: number = 5
): Promise<RetrievedChunk[]> {
  // Run both searches in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch(query, courseId, assignmentId, topK),
    keywordSearch(query, courseId, assignmentId, topK),
  ]);

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: RetrievedChunk[] = [];

  // Weight: semantic 0.7, keyword 0.3
  const SEMANTIC_WEIGHT = 0.7;
  const KEYWORD_WEIGHT = 0.3;

  // Add semantic results with weighted score
  for (const r of semanticResults) {
    if (!seen.has(r.chunk.id)) {
      seen.add(r.chunk.id);
      merged.push({
        ...r,
        score: r.score * SEMANTIC_WEIGHT,
        matchType: 'hybrid',
      });
    }
  }

  // Add keyword results or boost existing
  for (const r of keywordResults) {
    const existing = merged.find(m => m.chunk.id === r.chunk.id);
    if (existing) {
      existing.score += r.score * KEYWORD_WEIGHT;
    } else {
      merged.push({
        ...r,
        score: r.score * KEYWORD_WEIGHT,
        matchType: 'hybrid',
      });
    }
  }

  // Sort by combined score
  merged.sort((a, b) => b.score - a.score);

  return merged.slice(0, topK);
}

// ============================================
// Context Retrieval Configuration
// ============================================

export const RETRIEVAL_CONFIG = {
  // Maximum characters of retrieved context to include in prompt
  maxContextChars: 8000,
  // Minimum relevance score to include a chunk (0-1)
  minRelevanceScore: 0.25,
  // High confidence threshold
  highConfidenceScore: 0.5,
  // Maximum chunks per criterion
  maxChunksPerCriterion: 2,
  // General context chunks (in addition to per-criterion)
  generalContextChunks: 3,
};

// ============================================
// Context Retrieval for Grading
// ============================================

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  formattedContext: string;
  citations: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
    relevanceScore?: number;
  }>;
  // Quality metrics
  averageRelevance: number;
  highConfidenceCount: number;
  usedFallback: boolean;
}

export async function retrieveContextForGrading(
  transcript: string,
  courseId: string,
  assignmentId?: string,
  topK: number = 5,
  courseSummary?: string // Fallback if retrieval quality is low
): Promise<RetrievalResult> {
  // Use hybrid search with the transcript as query
  // Take first 2000 chars as query (summary of content)
  const query = transcript.slice(0, 2000);

  const allChunks = await hybridSearch(query, courseId, assignmentId, topK * 2);

  // Filter by minimum relevance score
  const relevantChunks = allChunks.filter(c => c.score >= RETRIEVAL_CONFIG.minRelevanceScore);

  // Calculate quality metrics
  const averageRelevance = relevantChunks.length > 0
    ? relevantChunks.reduce((sum, c) => sum + c.score, 0) / relevantChunks.length
    : 0;
  const highConfidenceCount = relevantChunks.filter(c => c.score >= RETRIEVAL_CONFIG.highConfidenceScore).length;

  // Check if we should use fallback
  const shouldUseFallback = relevantChunks.length === 0 ||
    (averageRelevance < RETRIEVAL_CONFIG.minRelevanceScore && courseSummary);

  if (shouldUseFallback && courseSummary) {
    console.log(`[Retrieval] Low confidence (avg=${averageRelevance.toFixed(2)}), using course summary fallback`);
    return {
      chunks: [],
      formattedContext: `[Course Overview]\n${courseSummary}`,
      citations: [],
      averageRelevance: 0,
      highConfidenceCount: 0,
      usedFallback: true,
    };
  }

  if (relevantChunks.length === 0) {
    return {
      chunks: [],
      formattedContext: '',
      citations: [],
      averageRelevance: 0,
      highConfidenceCount: 0,
      usedFallback: false,
    };
  }

  // Apply context budget - take chunks until we hit the limit
  const budgetedChunks: RetrievedChunk[] = [];
  let totalChars = 0;

  for (const chunk of relevantChunks.slice(0, topK)) {
    const chunkChars = chunk.chunk.content.length + chunk.chunk.documentName.length + 20; // overhead
    if (totalChars + chunkChars <= RETRIEVAL_CONFIG.maxContextChars) {
      budgetedChunks.push(chunk);
      totalChars += chunkChars;
    } else {
      break;
    }
  }

  // Format context for AI
  const formattedContext = budgetedChunks
    .map((r) => `[Document: ${r.chunk.documentName}]\n${r.chunk.content}`)
    .join('\n\n---\n\n');

  // Build citations with relevance scores
  const citations = budgetedChunks.map(r => ({
    chunkId: r.chunk.id,
    documentName: r.chunk.documentName,
    snippet: r.chunk.content.slice(0, 200) + '...',
    relevanceScore: r.score,
  }));

  return {
    chunks: budgetedChunks,
    formattedContext,
    citations,
    averageRelevance,
    highConfidenceCount,
    usedFallback: false,
  };
}

// ============================================
// Criterion-Level Context Retrieval
// ============================================

export interface CriterionCitation {
  criterionId: string;
  criterionName: string;
  citations: Array<{
    chunkId: string;
    documentName: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

export interface CriterionRetrievalResult {
  criterionCitations: CriterionCitation[];
  allCitations: RetrievalResult['citations'];
  formattedContext: string;
  // Quality metrics
  totalChunksRetrieved: number;
  averageRelevance: number;
  highConfidenceCount: number;
  contextCharsUsed: number;
}

export async function retrieveContextByCriterion(
  transcript: string,
  rubricCriteria: Array<{ id: string; name: string; description: string }>,
  courseId: string,
  assignmentId?: string,
  chunksPerCriterion: number = RETRIEVAL_CONFIG.maxChunksPerCriterion,
  courseSummary?: string // Fallback if retrieval quality is low
): Promise<CriterionRetrievalResult> {
  const criterionCitations: CriterionCitation[] = [];
  const allChunkIds = new Set<string>();
  const allCitations: RetrievalResult['citations'] = [];
  const allScores: number[] = [];
  let totalChars = 0;

  // For each criterion, retrieve relevant chunks (with budget awareness)
  for (const criterion of rubricCriteria) {
    // Check if we've exceeded budget
    if (totalChars >= RETRIEVAL_CONFIG.maxContextChars) {
      console.log(`[Retrieval] Budget exceeded at criterion ${criterion.name}, skipping remaining`);
      criterionCitations.push({
        criterionId: criterion.id,
        criterionName: criterion.name,
        citations: [],
      });
      continue;
    }

    // Build a query that combines transcript context with criterion
    const query = `${criterion.name}: ${criterion.description}\n\nStudent said: ${transcript.slice(0, 1000)}`;

    try {
      const results = await hybridSearch(query, courseId, assignmentId, chunksPerCriterion * 2);

      // Filter by minimum relevance
      const relevantResults = results.filter(r => r.score >= RETRIEVAL_CONFIG.minRelevanceScore);

      const citations: CriterionCitation['citations'] = [];

      for (const r of relevantResults.slice(0, chunksPerCriterion)) {
        // Check budget before adding
        const chunkChars = r.chunk.content.length;
        if (totalChars + chunkChars > RETRIEVAL_CONFIG.maxContextChars) {
          break;
        }

        citations.push({
          chunkId: r.chunk.id,
          documentName: r.chunk.documentName,
          snippet: r.chunk.content.slice(0, 200),
          relevanceScore: r.score,
        });

        allScores.push(r.score);
        totalChars += chunkChars;

        // Add to all citations (deduplicated)
        if (!allChunkIds.has(r.chunk.id)) {
          allChunkIds.add(r.chunk.id);
          allCitations.push({
            chunkId: r.chunk.id,
            documentName: r.chunk.documentName,
            snippet: r.chunk.content.slice(0, 200),
            relevanceScore: r.score,
          });
        }
      }

      criterionCitations.push({
        criterionId: criterion.id,
        criterionName: criterion.name,
        citations,
      });
    } catch (error) {
      console.error(`[Embeddings] Failed to retrieve for criterion ${criterion.name}:`, error);
      criterionCitations.push({
        criterionId: criterion.id,
        criterionName: criterion.name,
        citations: [],
      });
    }
  }

  // Calculate quality metrics
  const averageRelevance = allScores.length > 0
    ? allScores.reduce((sum, s) => sum + s, 0) / allScores.length
    : 0;
  const highConfidenceCount = allScores.filter(s => s >= RETRIEVAL_CONFIG.highConfidenceScore).length;

  // Check if we should use fallback
  const shouldUseFallback = allCitations.length === 0 ||
    (averageRelevance < RETRIEVAL_CONFIG.minRelevanceScore && courseSummary);

  let formattedContext: string;

  if (shouldUseFallback && courseSummary) {
    console.log(`[Retrieval] Low criterion relevance (avg=${averageRelevance.toFixed(2)}), adding course summary`);
    formattedContext = `[Course Overview]\n${courseSummary}\n\n---\n\n` +
      allCitations.map(c => `[${c.documentName}]: ${c.snippet}`).join('\n\n');
  } else {
    formattedContext = allCitations
      .map(c => `[${c.documentName}]: ${c.snippet}`)
      .join('\n\n');
  }

  return {
    criterionCitations,
    allCitations,
    formattedContext,
    totalChunksRetrieved: allCitations.length,
    averageRelevance,
    highConfidenceCount,
    contextCharsUsed: totalChars,
  };
}

// ============================================
// Delete Chunks for Document
// ============================================

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const chunkIds = await kv.smembers(`${DOC_CHUNKS_PREFIX}${documentId}`);

  for (const chunkId of chunkIds || []) {
    const chunk = await getChunk(chunkId as string);
    if (chunk) {
      // Delete embedding
      await kv.del(`${EMBEDDING_PREFIX}${chunk.embeddingId}`);
      // Remove from course index
      await kv.srem(`${COURSE_CHUNKS_PREFIX}${chunk.courseId}`, chunkId);
    }
    // Delete chunk
    await kv.del(`${CHUNK_PREFIX}${chunkId}`);
  }

  // Delete document index
  await kv.del(`${DOC_CHUNKS_PREFIX}${documentId}`);
}

