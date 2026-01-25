import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { getCourseDocuments } from '@/lib/context-store';
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
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Build the system prompt with context
function buildSystemPrompt(context: ChatContext, courseMaterials?: Array<{ name: string; type: string; excerpt: string }>): string {
  const parts: string[] = [
    `You are Babblet, an AI teaching assistant helping instructors analyze and improve student presentations.`,
    ``,
    `RESPONSE GUIDELINES:`,
    `- Keep responses concise: 2-5 sentences for explanations`,
    `- Be instructional, supportive, and neutral in tone`,
    `- Always ground your explanations in the highlighted text AND course materials when available`,
    `- Never re-grade or modify scores unless explicitly asked`,
    `- Answer ANY question the user asks - there are no restrictions on topics`,
    `- When referencing course materials, cite them using [1], [2] format`,
    ``,
    `COURSE MATERIAL GROUNDING:`,
    `- Prioritize responses that connect to the uploaded course content`,
    `- Reference specific concepts, terminology, or frameworks from the course materials`,
    `- When making recommendations, tie them back to course learning objectives`,
    ``,
    `RECOMMENDATIONS:`,
    `When appropriate (but not always), you MAY include a "RECOMMENDATIONS:" section with 1-3 bullet points.`,
    `Include recommendations when they would genuinely help the instructor, such as:`,
    `- Pedagogical follow-up questions`,
    `- Ways to strengthen or improve content`,
    `- Common student pitfalls to watch for`,
    `- Alternative question variants (harder, clearer, more applied)`,
    `- Alignment suggestions with learning objectives`,
    ``,
    `Only include recommendations if they're relevant. Don't force them.`,
    `Format recommendations as: "RECOMMENDATIONS:\\n• Point 1\\n• Point 2"`,
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
    parts.push(`RUBRIC CRITERION BEING ANALYZED: ${context.rubricCriterion}`);
  }
  
  // Include full transcript context for rubric insights
  if (context.fullContext && context.sourceType === 'rubric') {
    parts.push(``);
    parts.push(`STUDENT'S PRESENTATION TRANSCRIPT:`);
    parts.push(`"${context.fullContext.slice(0, 8000)}${context.fullContext.length > 8000 ? '...' : ''}"`);
    parts.push(``);
    parts.push(`IMPORTANT: Use this transcript to provide specific, evidence-based feedback about the student's performance on the criterion above.`);
  } else if (context.fullContext && context.fullContext !== context.highlightedText) {
    // Include full context when user only highlighted a portion
    parts.push(``);
    parts.push(`FULL ${context.sourceType?.toUpperCase() || 'CONTENT'} CONTEXT (for reference):`);
    parts.push(`"${context.fullContext}"`);
    parts.push(``);
    parts.push(`NOTE: The user highlighted only a portion of the above. Answer about the highlighted portion but use the full context for understanding.`);
  }
  
  // Include analysis data if provided
  if (context.analysisData) {
    try {
      const analysis = JSON.parse(context.analysisData);
      parts.push(``);
      parts.push(`ANALYSIS DATA:`);
      if (analysis.summary) parts.push(`Summary: ${analysis.summary}`);
      if (analysis.strengthAreas) parts.push(`Strengths: ${analysis.strengthAreas.join(', ')}`);
      if (analysis.improvementAreas) parts.push(`Areas for Improvement: ${analysis.improvementAreas.join(', ')}`);
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
    
    // Fetch course documents
    if (courseId) {
      try {
        const docs = await getCourseDocuments(courseId);
        courseMaterials = docs.slice(0, 5).map((d: { name: string; type: string; rawText: string }) => ({
          name: d.name,
          type: d.type,
          excerpt: d.rawText.substring(0, 500) + (d.rawText.length > 500 ? '...' : ''),
        }));
        console.log('[ContextualChat] Loaded', courseMaterials.length, 'course materials for context');
      } catch (e) {
        console.log('[ContextualChat] Could not fetch course materials:', e);
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
    
    const response = await client.messages.create({
      model: config.models.claude,
      max_tokens: 1024,
      system: buildSystemPrompt(context, courseMaterials),
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
