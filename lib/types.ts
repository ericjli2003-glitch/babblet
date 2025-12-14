// ============================================
// Core Types for Babblet
// ============================================

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';
export type QuestionCategory = 'clarifying' | 'critical-thinking' | 'expansion';
export type PresentationStatus = 'idle' | 'recording' | 'processing' | 'analyzing' | 'completed' | 'error';

// ============================================
// Transcript Types
// ============================================

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number; // milliseconds from start
  duration: number;
  confidence?: number;
  speaker?: string;
  isFinal?: boolean;
}

export interface TranscriptChunk {
  segments: TranscriptSegment[];
  startTime: number;
  endTime: number;
  fullText: string;
}

// ============================================
// Analysis Types
// ============================================

export interface KeyClaim {
  id: string;
  claim: string;
  evidence: string[];
  timestamp?: number;
  confidence: number; // 0-1
  category?: string;
}

export interface LogicalGap {
  id: string;
  description: string;
  relatedClaim?: string;
  severity: 'minor' | 'moderate' | 'major';
  suggestion?: string;
}

export interface MissingEvidence {
  id: string;
  description: string;
  relatedClaim: string;
  importance: 'low' | 'medium' | 'high';
}

export interface AnalysisSummary {
  keyClaims: KeyClaim[];
  logicalGaps: LogicalGap[];
  missingEvidence: MissingEvidence[];
  overallStrength: number; // 1-5
  suggestions: string[];
  timestamp: number;
}

// ============================================
// Question Types
// ============================================

export interface GeneratedQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  rationale?: string;
  relatedClaim?: string;
  relevantSnippet?: string; // Quote from transcript this question relates to
  timestamp: number;
}

export interface QuestionBank {
  clarifying: GeneratedQuestion[];
  criticalThinking: GeneratedQuestion[];
  expansion: GeneratedQuestion[];
}

// ============================================
// Rubric Types
// ============================================

export interface RubricScore {
  score: number; // 1-5
  feedback: string;
  strengths: string[];
  improvements: string[];
}

export interface RubricEvaluation {
  contentQuality: RubricScore;
  delivery: RubricScore;
  evidenceStrength: RubricScore;
  overallScore: number;
  overallFeedback: string;
  timestamp: number;
}

// ============================================
// Slide Analysis Types
// ============================================

export interface SlideContent {
  pageNumber: number;
  imageDataUrl?: string;
  extractedText: string;
  mainPoints: string[];
  graphs: string[];
  definitions: string[];
  keywords: string[];
}

export interface SlideAnalysis {
  slides: SlideContent[];
  overallTheme: string;
  keyTopics: string[];
  suggestedQuestions: string[];
}

// ============================================
// Semantic Event Types (New Gemini Integration)
// ============================================

export type SemanticEventType =
  | 'claim'
  | 'topic_shift'
  | 'definition'
  | 'example'
  | 'argument'
  | 'evidence'
  | 'conclusion'
  | 'question'
  | 'unclear';

export interface SemanticEvent {
  id: string;
  type: SemanticEventType;
  content: string;
  confidence: number;
  timestamp: number;
  context?: string;
}

// ============================================
// Streaming Event Types
// ============================================

export type StreamEventType =
  | 'init'
  | 'heartbeat'
  | 'transcript_update'
  | 'transcript'
  | 'analysis_update'
  | 'question_generated'
  | 'question'
  | 'semantic_event'
  | 'claim_detected'
  | 'gap_detected'
  | 'rubric_update'
  | 'summary'
  | 'status'
  | 'error'
  | 'session_start'
  | 'session_end';

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  data: T;
  timestamp: number;
  sessionId: string;
}

export interface TranscriptUpdateEvent {
  segment: TranscriptSegment;
  fullTranscript: string;
}

export interface AnalysisUpdateEvent {
  summary: AnalysisSummary;
  deltaChanges?: Partial<AnalysisSummary>;
}

export interface QuestionGeneratedEvent {
  questions: GeneratedQuestion[];
  trigger: 'periodic' | 'claim_detected' | 'manual';
}

// ============================================
// Session Types
// ============================================

export interface SessionState {
  id: string;
  status: PresentationStatus;
  startTime: number;
  endTime?: number;
  transcript: TranscriptSegment[];
  semanticEvents: SemanticEvent[];
  questions: GeneratedQuestion[];
  analysis?: AnalysisSummary;
  rubric?: RubricEvaluation;
  slideAnalysis?: SlideAnalysis;
  summary?: string;
  metadata?: SessionMetadata;
}

export interface SessionMetadata {
  title?: string;
  presenterName?: string;
  duration?: number;
  videoUrl?: string;
  slidesUrl?: string;
  tags?: string[];
}

// ============================================
// API Request/Response Types
// ============================================

export interface StartSessionRequest {
  type: 'live' | 'upload';
  title?: string;
  presenterName?: string;
}

export interface StartSessionResponse {
  sessionId: string;
  status: 'ready' | 'error';
  message?: string;
}

// ============================================
// UI State Types
// ============================================

export interface DashboardState {
  session: SessionState | null;
  isRecording: boolean;
  audioLevel: number;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
  activeTab: 'transcript' | 'analysis' | 'questions' | 'rubric';
  selectedQuestionCategory: QuestionCategory | 'all';
}

export interface UploadState {
  videoFile: File | null;
  slidesFile: File | null;
  uploadProgress: number;
  processingStatus: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}
