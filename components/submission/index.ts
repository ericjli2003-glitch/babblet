// Submission Detail Components
// Production-ready components for Babblet EdTech SaaS

export { default as ScoreCard } from './ScoreCard';
export { default as InsightCard } from './InsightCard';
export { default as VerificationCard } from './VerificationCard';
export { default as TranscriptSegment } from './TranscriptSegment';
export { default as QuestionCard } from './QuestionCard';
export { default as RubricCriterion } from './RubricCriterion';
export { default as VideoPanel } from './VideoPanel';

// Example Mock Data
export const mockSubmissionData = {
  id: 'sub_12345',
  studentName: 'Sarah Jenkins',
  submissionTitle: 'Marketing 101 Final Project',
  submissionDate: 'Oct 24, 2023',
  status: 'ready',
  
  // Score data for ScoreCard
  score: {
    value: 88,
    maxValue: 100,
    performanceLabel: 'Strong Performance',
    percentileBadge: 'Top 15%',
    summary: `Sarah demonstrated a solid understanding of the core marketing concepts, 
      particularly in the "Competitor Analysis" segment. The presentation structure was 
      logical and easy to follow. While the pacing was excellent, there were minor 
      fluctuations in audio volume during the mid-section that slightly impacted clarity.`,
    badges: [
      { label: 'Positive Sentiment' },
      { label: '4m 32s Duration' },
    ],
  },
  
  // Insights for InsightCard
  insights: [
    { text: 'Excellent articulation of the "Volatility Index" concept with real-world examples.', status: 'positive' as const },
    { text: 'Strong visual correlation between spoken content and slide transitions.', status: 'positive' as const },
    { text: 'Conclusion could be stronger; call-to-action for Phase 2 budget was brief.', status: 'negative' as const },
  ],
  
  // Verification metrics
  verification: {
    transcriptAccuracy: { value: 98, status: 'high' as const },
    contentOriginality: { value: 100, status: 'high' as const },
  },
  
  // Transcript segments
  transcript: [
    {
      timestamp: '00:00',
      timestampMs: 0,
      label: 'Introduction',
      text: `Good morning everyone. Today I'm going to be presenting my final project 
        for Marketing 101. The focus of my research has been on the shifting landscape 
        of digital advertising in the post-pandemic era, specifically looking at 
        small-to-medium enterprises.`,
    },
    {
      timestamp: '00:45',
      timestampMs: 45000,
      text: `If we turn our attention to the first slide, you'll see a breakdown of 
        customer acquisition costs. Traditionally, these costs have been relatively 
        stable, but starting in early 2022, we see a significant volatility index 
        emerging across all major platforms.`,
    },
    {
      timestamp: '02:10',
      timestampMs: 130000,
      label: 'Current Segment',
      text: `So looking at the Q3 results, we can see a distinct uptick in user 
        acquisition cost. However, the LTV remains steady, which suggests that our 
        retention strategies are actually working quite well despite the market volatility.`,
      isHighlighted: true,
    },
  ],
  
  // Questions for QuestionCard
  questions: [
    {
      category: 'basic' as const,
      question: `You mentioned that customer acquisition costs have been volatile since 
        early 2022. Can you specify which specific platforms showed the highest 
        volatility index according to your research?`,
      context: {
        text: 'Referenced during the slide on customer acquisition costs at',
        timestamps: ['00:45'],
      },
    },
    {
      category: 'intermediate' as const,
      question: `How does the lack of a personalized onboarding flow in Company X's 
        product directly create an opportunity for your proposed solution, and what 
        risks are involved in focusing solely on this differentiator?`,
      context: {
        text: 'Based on the Competitor Analysis segment at',
        timestamps: ['02:45'],
      },
    },
    {
      category: 'advanced' as const,
      question: `Given the market volatility and steady LTV you discovered, how would 
        you justify the budget allocation for Phase 2 if acquisition costs were to 
        unexpectedly rise by another 15% next quarter?`,
      context: {
        text: 'Synthesized from Q3 results',
        timestamps: ['02:10', '03:30'],
      },
    },
  ],
  
  // Rubric criteria
  rubric: {
    totalGrade: 'B+',
    percentage: 88,
    gradingStatus: 'Draft Saved',
    criteria: [
      {
        name: 'Clarity of Speech',
        score: 9,
        maxScore: 10,
        scaleLabels: ['Poor', 'Average', 'Excellent'],
        rationale: `Excellent pacing, though volume dropped slightly at 2:00. 
          Clear enunciation throughout the technical sections.`,
      },
      {
        name: 'Content Depth',
        score: 42,
        maxScore: 50,
        scaleLabels: ['Superficial', 'Adequate', 'In-depth'],
        rationale: `Good coverage of market analysis, but the conclusion felt rushed. 
          You missed discussing the competitor landscape in slide 4.`,
      },
      {
        name: 'Delivery & Eye Contact',
        score: 8,
        maxScore: 10,
        scaleLabels: ['Distracted', 'Engaged', 'Professional'],
        rationale: '',
      },
    ],
  },
  
  // Video metadata
  video: {
    filename: 'Final_Presentation.mp4',
    uploadDate: 'Oct 24, 10:45 AM',
    fileSize: '45.2 MB',
    alerts: [
      { type: 'pacing' as const, label: 'Pacing Good' },
      { type: 'volume' as const, label: 'Low Volume', timeRange: '02:00-02:15' },
    ],
  },
};
