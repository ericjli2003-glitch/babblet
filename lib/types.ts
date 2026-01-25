// ============================================
// Core Types for Babblet
// ============================================

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

// Comprehensive question categories aligned with Bloom's taxonomy and pedagogical best practices
export type QuestionCategory = 
  | 'clarification'      // "Can you explain what you mean by...?" - Understanding
  | 'evidence'           // "What data/sources support...?" - Requesting proof
  | 'assumption'         // "You seem to assume X, but what if...?" - Challenging premises
  | 'counterargument'    // "How would you respond to someone who argues...?" - Defense
  | 'application'        // "How would this apply in...?" - Real-world transfer
  | 'synthesis'          // "How does this connect to...?" - Integration
  | 'evaluation'         // "How would you assess the validity of...?" - Judgment
  | 'methodology'        // "Why did you choose this approach...?" - Process reasoning
  | 'limitation'         // "What are the limitations or edge cases...?" - Boundaries
  | 'implication'        // "What are the consequences or next steps...?" - Future thinking
  // Legacy types for backwards compatibility
  | 'clarifying'         // Maps to 'clarification'
  | 'critical-thinking'  // Maps to 'assumption' or 'counterargument'
  | 'expansion';         // Maps to 'application' or 'synthesis'

export type PresentationStatus = 'idle' | 'recording' | 'processing' | 'analyzing' | 'completed' | 'error';

// Question category metadata for UI display
export const QUESTION_CATEGORY_INFO: Record<string, { label: string; description: string; color: string; icon: string }> = {
  clarification: {
    label: 'Clarification',
    description: 'Asks for clearer explanation of concepts or terms',
    color: 'blue',
    icon: '❓'
  },
  evidence: {
    label: 'Evidence Request',
    description: 'Requests data, sources, or proof to support claims',
    color: 'purple',
    icon: '📊'
  },
  assumption: {
    label: 'Assumption Challenge',
    description: 'Challenges underlying assumptions or premises',
    color: 'orange',
    icon: '🔍'
  },
  counterargument: {
    label: 'Counterargument',
    description: 'Presents opposing viewpoints to defend against',
    color: 'red',
    icon: '⚔️'
  },
  application: {
    label: 'Application',
    description: 'Asks how concepts apply to real-world scenarios',
    color: 'green',
    icon: '🌍'
  },
  synthesis: {
    label: 'Synthesis',
    description: 'Connects ideas to other concepts or domains',
    color: 'teal',
    icon: '🔗'
  },
  evaluation: {
    label: 'Evaluation',
    description: 'Asks to assess validity, importance, or quality',
    color: 'indigo',
    icon: '⚖️'
  },
  methodology: {
    label: 'Methodology',
    description: 'Questions the approach, methods, or process used',
    color: 'cyan',
    icon: '🔬'
  },
  limitation: {
    label: 'Limitation',
    description: 'Explores boundaries, edge cases, or constraints',
    color: 'amber',
    icon: '⚠️'
  },
  implication: {
    label: 'Implication',
    description: 'Explores consequences, next steps, or future directions',
    color: 'pink',
    icon: '🚀'
  },
  // Legacy mappings
  clarifying: {
    label: 'Clarifying',
    description: 'General clarification question',
    color: 'blue',
    icon: '❓'
  },
  'critical-thinking': {
    label: 'Critical Thinking',
    description: 'Challenges assumptions or logic',
    color: 'orange',
    icon: '🧠'
  },
  expansion: {
    label: 'Expansion',
    description: 'Broadens the discussion scope',
    color: 'green',
    icon: '🌱'
  }
};

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
  relevantSnippet?: string;
}

export interface LogicalGap {
  id: string;
  description: string;
  relatedClaim?: string;
  severity: 'minor' | 'moderate' | 'major';
  suggestion?: string;
  relevantSnippet?: string;
}

export interface MissingEvidence {
  id: string;
  description: string;
  relatedClaim: string;
  importance: 'low' | 'medium' | 'high';
  relevantSnippet?: string;
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
  /** Which rubric criterion (or goal) this question targets */
  rubricCriterion?: string;
  /** Short justification for how it matches the rubric/assignment */
  rubricJustification?: string;
  /** Bloom level / cognitive skill tag (optional) */
  bloomLevel?: string;
  /** If the question should request evidence, what kind? (e.g., "peer-reviewed study", "dataset", "primary source") */
  expectedEvidenceType?: string;
  /** Model-provided ranking score (0-100) for selecting the “best set” */
  score?: number;
  /** Optional tags to help diversify (e.g., "evidence", "counterargument", "assumption") */
  tags?: string[];
  relatedClaim?: string;
  relevantSnippet?: string; // Quote from transcript this question relates to
  /** References to course materials that this question relates to */
  materialReferences?: MaterialReference[];
  timestamp: number;
}

/** Reference to course material that supports a question */
export interface MaterialReference {
  id: string;
  name: string;
  type: string;
  excerpt?: string;
  documentId?: string;
}

// ============================================
// Verification Types
// ============================================

export type VerificationVerdict = 'likely-true' | 'uncertain' | 'likely-false';

export interface VerificationFinding {
  id: string;
  statement: string;
  verdict: VerificationVerdict;
  confidence: number; // 0-1
  explanation: string;
  suggestedCorrection?: string;
  whatToVerify?: string; // what to check / what evidence would confirm
  relevantSnippet?: string; // quote from transcript to anchor this finding
  timestamp?: number; // optional: where in transcript this came from (ms)
}

export interface QuestionBank {
  // New comprehensive categories
  clarification: GeneratedQuestion[];
  evidence: GeneratedQuestion[];
  assumption: GeneratedQuestion[];
  counterargument: GeneratedQuestion[];
  application: GeneratedQuestion[];
  synthesis: GeneratedQuestion[];
  evaluation: GeneratedQuestion[];
  methodology: GeneratedQuestion[];
  limitation: GeneratedQuestion[];
  implication: GeneratedQuestion[];
  // Legacy categories for backwards compatibility
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
  /** Grading scale metadata */
  gradingScaleUsed?: 'points' | 'percentage' | 'letter' | 'bands' | 'none';
  maxPossibleScore?: number;
  /** Optional letter grade (if letter scale used) */
  letterGrade?: string;
  /** Optional band label (if bands scale used) */
  bandLabel?: string;
  /** Optional custom-criteria breakdown when a rubric is provided */
  criteriaBreakdown?: Array<{
    criterionId?: string;
    criterion: string;
    score: number;
    maxScore?: number; // Maximum for this criterion (from rubric)
    feedback: string;
    /** Babblet rationale tying rubric, context, and accuracy checks */
    rationale?: string;
    strengths?: Array<{ text: string; quote?: string; criterionId?: string; criterionName?: string; transcriptRefs?: Array<{ segmentId: string; timestamp: number; snippet: string }> }>;
    improvements?: Array<{ text: string; quote?: string; criterionId?: string; criterionName?: string; transcriptRefs?: Array<{ segmentId: string; timestamp: number; snippet: string }> }>;
    missingEvidence?: string[];
    transcriptRefs?: Array<{ segmentId: string; timestamp: number; snippet: string }>;
  }>;
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
