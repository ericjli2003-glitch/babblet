import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { getCourseDocuments, getAssignmentDocuments } from '@/lib/context-store';
import { getSubmission, getBatch } from '@/lib/batch-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lazy-load AI client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

interface ChatContext {
  highlightedText?: string;
  fullContext?: string; // Full question/rubric text when partial selection, OR full transcript for insights
  sourceType?: 'question' | 'transcript' | 'rubric' | 'summary' | 'other';
  sourceId?: string;
  timestamp?: string;
  criterionId?: string;
  rubricCriterion?: string;
  assignmentId?: string;
  submissionId?: string;
  learningObjective?: string;
  courseId?: string;
  analysisData?: string; // JSON stringified analysis data
  rubricText?: string; // Uploaded rubric text for criterion-specific analysis
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Build the system prompt with context
function buildSystemPrompt(context: ChatContext, courseMaterials?: Array<{ name: string; type: string; excerpt: string }>): string {
  const isRubricInsight = context.sourceType === 'rubric';
  const isFollowUp = context.fullContext && context.fullContext.includes('specifically about:');
  
  const parts: string[] = [
    `You are a thoughtful, experienced TA having a conversation with an instructor about a student's presentation.`,
    ``,
    `YOUR PERSONALITY:`,
    `- Warm but direct - you care about student success`,
    `- Speak naturally, like you're in office hours, not writing a formal report`,
    `- Share your genuine observations and insights`,
    `- Use "I noticed...", "What stands out to me...", "The student could try..."`,
    `- Be specific and helpful, not generic`,
    ``,
    ...(isFollowUp 
      ? [
        `FOLLOW-UP CONVERSATION:`,
        `- The instructor is asking a specific question - answer it directly`,
        `- Be conversational and natural, like you're thinking through this together`,
        `- Give your honest take, then explain your reasoning`,
        `- Feel free to speculate or offer multiple perspectives`,
        `- Keep it focused but don't be robotic`,
        ``,
        ]
      : isRubricInsight 
        ? [
          `RUBRIC ANALYSIS:`,
          `- Ground every observation in what you actually see in the transcript`,
          `- Quote the student's words when relevant`,
          `- Connect to rubric expectations and course content`,
          `- End each bullet with [1], [2] references`,
          `- Suggest concrete examples of what stronger work looks like`,
          ``,
          ]
        : [
          `GENERAL GUIDANCE:`,
          `- Be helpful and concise`,
          `- Answer the question directly`,
          ``,
          ]
    ),
    `CITATIONS: When referencing course materials or transcript, use [1], [2] format.`,
  ];
  
  // Add course materials context
  if (courseMaterials && courseMaterials.length > 0) {
    parts.push(``);
    parts.push(`COURSE MATERIALS (use these to ground your responses):`);
    courseMaterials.forEach((m, i) => {
      parts.push(`[${i + 1}] ${m.name} (${m.type}): ${m.excerpt}`);
    });
    parts.push(``);
    parts.push(`IMPORTANT: Reference these materials in your response using [1], [2], etc. when relevant.`);
  }
  
  // Add context about what was highlighted
  if (context.highlightedText) {
    parts.push(``);
    parts.push(`HIGHLIGHTED TEXT:`);
    parts.push(`"${context.highlightedText}"`);
    
    parts.push(``);
    parts.push(`SOURCE TYPE: ${context.sourceType || 'content'}`);
  }
  
  if (context.rubricCriterion) {
    parts.push(``);
    parts.push(`CRITICAL: RUBRIC CRITERION BEING ANALYZED: "${context.rubricCriterion}"`);
    parts.push(``);
    parts.push(`ANALYSIS PRIORITY: Analyze ONLY against the rubric section for "${context.rubricCriterion}". Do NOT give generic feedback. Each criterion has different expectations - use the rubric text below.`);
  }
  
  if (context.rubricText) {
    parts.push(``);
    parts.push(`RUBRIC FOR "${context.rubricCriterion}" ONLY (analyze exclusively against this):`);
    parts.push(context.rubricText);
    parts.push(``);
    parts.push(`Use A for video moments, B for rubric/course. Every bullet must reference the rubric section above.`);
  }
  
  // Include full transcript context for rubric insights (generous limit for rich insights)
  if (context.fullContext && context.sourceType === 'rubric') {
    parts.push(``);
    parts.push(`STUDENT'S PRESENTATION TRANSCRIPT (use specific quotes and timestamps in your insights):`);
    parts.push(`"${context.fullContext.slice(0, 14000)}${context.fullContext.length > 14000 ? '...' : ''}"`);
    parts.push(``);
    parts.push(`CRITICAL: Quote the transcript directly, cite specific moments, and ground every insight in evidence from above.`);
  } else if (context.fullContext && context.fullContext !== context.highlightedText) {
    // Include full context when user only highlighted a portion
    parts.push(``);
    parts.push(`FULL ${context.sourceType?.toUpperCase() || 'CONTENT'} CONTEXT (for reference):`);
    parts.push(`"${context.fullContext}"`);
    parts.push(``);
    parts.push(`NOTE: The user highlighted only a portion of the above. Answer about the highlighted portion but use the full context for understanding.`);
  }
  
  // Include analysis data if provided - use full structure for rich context
  if (context.analysisData) {
    try {
      const a = JSON.parse(context.analysisData);
      parts.push(``);
      parts.push(`ANALYSIS DATA (use this for detailed, evidence-based insights):`);
      if (a.keyClaims?.length) {
        parts.push(`Key Claims: ${a.keyClaims.map((c: { claim?: string }) => c.claim).join('; ')}`);
      }
      if (a.logicalGaps?.length) {
        parts.push(`Logical Gaps: ${a.logicalGaps.map((g: { description?: string }) => g.description).join('; ')}`);
      }
      if (a.missingEvidence?.length) {
        parts.push(`Missing Evidence: ${a.missingEvidence.map((e: { description?: string }) => e.description).join('; ')}`);
      }
      if (a.courseAlignment) {
        parts.push(`Course Alignment: topic ${a.courseAlignment.topicCoverage}%, terminology ${a.courseAlignment.terminologyAccuracy}%, depth ${a.courseAlignment.contentDepth}%, references ${a.courseAlignment.referenceIntegration}%`);
      }
      if (a.speechMetrics) {
        parts.push(`Speech: ${a.speechMetrics.fillerWordCount} filler words, ${a.speechMetrics.speakingRateWpm} wpm, ${a.speechMetrics.pauseFrequency} pauses/min`);
      }
      if (a.summary) parts.push(`Summary: ${a.summary}`);
      if (a.strengthAreas?.length) parts.push(`Strengths: ${a.strengthAreas.join(', ')}`);
      if (a.improvementAreas?.length) parts.push(`Improvements: ${a.improvementAreas.join(', ')}`);
      if (a.rubricEvaluation?.criteriaBreakdown?.length) {
        parts.push(`Rubric Scores: ${a.rubricEvaluation.criteriaBreakdown.map((c: { criterion?: string; score?: number; maxScore?: number; feedback?: string }) => 
          `${c.criterion} ${c.score}/${c.maxScore || 10} - ${(c.feedback || '').slice(0, 80)}`
        ).join(' | ')}`);
      }
      if (a.slideSummary) parts.push(`Slide/Presentation Summary: ${a.slideSummary}`);
    } catch {
      // Ignore parse errors
    }
  }
  
  if (context.timestamp) {
    parts.push(`TRANSCRIPT TIMESTAMP: ${context.timestamp}`);
  }
  
  if (context.learningObjective) {
    parts.push(`LEARNING OBJECTIVE: ${context.learningObjective}`);
  }
  
  return parts.join('\n');
}

// Parse response to extract recommendations and material references
function parseResponse(text: string): { content: string; recommendations: string[]; materialRefs: Array<{ index: number; context: string }> } {
  // Extract material references like [1], [2] from the text
  const materialRefs: Array<{ index: number; context: string }> = [];
  const refRegex = /\[(\d+)\]/g;
  let match;
  while ((match = refRegex.exec(text)) !== null) {
    const index = parseInt(match[1]);
    // Get surrounding context (50 chars before and after)
    const start = Math.max(0, match.index - 50);
    const end = Math.min(text.length, match.index + match[0].length + 50);
    const context = text.substring(start, end);
    if (!materialRefs.find(r => r.index === index)) {
      materialRefs.push({ index, context });
    }
  }
  
  const recommendationsMatch = text.match(/RECOMMENDATIONS:\s*([\s\S]*?)(?:$|\n\n(?=[A-Z]))/i);
  
  if (recommendationsMatch) {
    const recommendationsText = recommendationsMatch[1];
    const recommendations = recommendationsText
      .split(/\n/)
      .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
      .filter(line => line.length > 0);
    
    // Remove recommendations section from content
    const content = text
      .replace(/RECOMMENDATIONS:\s*[\s\S]*?(?:$|\n\n(?=[A-Z]))/i, '')
      .trim();
    
    return { content, recommendations, materialRefs };
  }
  
  return { content: text, recommendations: [], materialRefs };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context, conversationHistory } = body as {
      message: string;
      context: ChatContext;
      conversationHistory?: ConversationMessage[];
    };
    
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    
    const client = getAnthropicClient();
    
    // Fetch course materials if we have a submissionId or courseId
    let courseMaterials: Array<{ name: string; type: string; excerpt: string }> = [];
    let courseId = context.courseId;
    
    // If we have a submissionId but no courseId, try to get courseId from the batch
    if (!courseId && context.submissionId) {
      try {
        const submission = await getSubmission(context.submissionId);
        if (submission?.batchId) {
          const batch = await getBatch(submission.batchId);
          courseId = batch?.courseId;
        }
      } catch (e) {
        console.log('[ContextualChat] Could not fetch submission/batch:', e);
      }
    }
    
    // Fetch course documents (primary context for rubric insights)
    if (courseId) {
      try {
        const docs = await getCourseDocuments(courseId);
        courseMaterials = docs.slice(0, 10).map((d: { name: string; type: string; rawText: string }) => ({
          name: d.name,
          type: d.type,
          excerpt: d.rawText.substring(0, 1800) + (d.rawText.length > 1800 ? '...' : ''),
        }));
        console.log('[ContextualChat] Loaded', courseMaterials.length, 'course materials for context');
      } catch (e) {
        console.log('[ContextualChat] Could not fetch course materials:', e);
      }
    }
    
    // Also fetch assignment documents (rubric, assignment-specific materials) for richer context
    const assignmentId = context.assignmentId;
    if (assignmentId && courseMaterials.length < 10) {
      try {
        const assignDocs = await getAssignmentDocuments(assignmentId);
        const assignMaterials = assignDocs.slice(0, 5).map((d: { name: string; type: string; rawText: string }) => ({
          name: `[Assignment] ${d.name}`,
          type: d.type,
          excerpt: d.rawText.substring(0, 1800) + (d.rawText.length > 1800 ? '...' : ''),
        }));
        courseMaterials = [...courseMaterials, ...assignMaterials].slice(0, 12);
        console.log('[ContextualChat] Added', assignMaterials.length, 'assignment documents');
      } catch (e) {
        console.log('[ContextualChat] Could not fetch assignment documents:', e);
      }
    }
    
    // Build messages array
    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    
    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
    
    // Add current message
    messages.push({
      role: 'user',
      content: message,
    });
    
    const systemPrompt = buildSystemPrompt(context, courseMaterials);
    const isRubricInsight = context.sourceType === 'rubric';
    
    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: isRubricInsight ? 2048 : 1024,
      system: systemPrompt,
      messages,
    });
    
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    // Parse response to separate content and recommendations
    const { content, recommendations, materialRefs } = parseResponse(responseText);
    
    // Map material refs to actual material names
    const materialReferences = materialRefs.map(ref => ({
      index: ref.index,
      name: courseMaterials[ref.index - 1]?.name || `Reference ${ref.index}`,
      type: courseMaterials[ref.index - 1]?.type || 'material',
    }));
    
    return NextResponse.json({
      success: true,
      response: content,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      materialReferences: materialReferences.length > 0 ? materialReferences : undefined,
    });
  } catch (error) {
    console.error('[ContextualChat] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message', success: false },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/contextual-chat',
    method: 'POST required',
  });
}
