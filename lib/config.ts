/**
 * Centralized configuration for Babblet
 * All magic numbers and thresholds are defined here for easy adjustment
 */

export const config = {
    // ==========================================
    // TIMING & INTERVALS
    // ==========================================
    timing: {
        /** Cooldown between question generation calls (ms) */
        questionCooldownMs: 45000,
        /** Interval for periodic analysis checks (ms) */
        analysisCheckIntervalMs: 5000,
        /** Minimum time between analysis calls (ms) */
        analysisMinIntervalMs: 15000,
        /** Auto-clear marker selection after this time (ms) */
        markerSelectionClearMs: 3000,
        /** Audio chunk interval for batch transcription (ms) */
        audioChunkIntervalMs: 4000,
        /** Video recorder chunk interval (ms) */
        videoRecorderChunkMs: 1000,
    },

    // ==========================================
    // LIMITS & THRESHOLDS
    // ==========================================
    limits: {
        /** Default max questions to generate */
        defaultMaxQuestions: 10,
        /** Words between question generation triggers */
        wordsBetweenAnalysis: 8,
        /** Max transcript segments before consolidation */
        maxTranscriptSegments: 100,
        /** Segments to keep after consolidation */
        recentSegmentsToKeep: 50,
        /** Max key claims to show as insight markers */
        maxClaimMarkers: 2,
        /** Max verification findings to return */
        maxVerificationFindings: 8,
        /** Max claims to send to verification */
        maxClaimsForVerification: 8,
        /** Min audio blob size to transcribe (bytes) */
        minAudioBlobSize: 5000,
        /** Min audio blob size for final chunk (bytes) */
        minFinalAudioBlobSize: 1000,
        /** Max words in a highlight snippet before truncation */
        maxSnippetWords: 15,
        /** Words to keep when truncating long snippets */
        truncatedSnippetWords: 12,
        /** Min snippet length to be valid */
        minSnippetLength: 5,
    },

    // ==========================================
    // TEXT TRUNCATION (display lengths)
    // ==========================================
    truncation: {
        /** Marker title max length */
        markerTitleLength: 50,
        /** Question title max length */
        questionTitleLength: 60,
        /** Anchor snippet max length for matching */
        anchorSnippetLength: 80,
        /** Tooltip preview max length */
        tooltipPreviewLength: 150,
        /** Session ID display length */
        sessionIdDisplayLength: 8,
        /** Log preview length */
        logPreviewLength: 100,
        /** Slide key points to show */
        slideKeyPointsToShow: 3,
    },

    // ==========================================
    // API SETTINGS
    // ==========================================
    api: {
        /** Max tokens for question generation */
        questionMaxTokens: 1024,
        /** Max tokens for analysis */
        analysisMaxTokens: 2048,
        /** Max tokens for verification */
        verificationMaxTokens: 1200,
        /** Max tokens for evaluation/rubric */
        evaluationMaxTokens: 1000,
        /** Max tokens for summary */
        summaryMaxTokens: 500,
        /** Max transcript length to send to LLM */
        maxTranscriptForLLM: 6000,
        /** Max transcript for question context */
        maxTranscriptForQuestions: 4000,
    },

    // ==========================================
    // MODELS
    // ==========================================
    models: {
        /** Claude model for questions and analysis */
        claude: 'claude-sonnet-4-20250514',
        /** OpenAI model for fallback */
        openai: 'gpt-4o-mini',
        /** Whisper model for transcription */
        whisper: 'whisper-1',
    },

    // ==========================================
    // UI SETTINGS
    // ==========================================
    ui: {
        /** Rubric strengths/improvements to show per category */
        rubricItemsPerCategory: 2,
        /** Existing questions to include in context (avoid repeats) */
        existingQuestionsContext: 15,
    },
} as const;

// Type for the config object
export type AppConfig = typeof config;

// Helper to get nested config values
export function getConfig<K extends keyof typeof config>(section: K): typeof config[K] {
    return config[section];
}

