import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

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
  sourceType?: 'question' | 'transcript' | 'rubric' | 'summary' | 'other';
  sourceId?: string;
  timestamp?: string;
  criterionId?: string;
  rubricCriterion?: string;
  assignmentId?: string;
  submissionId?: string;
  learningObjective?: string;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Build the system prompt with context
function buildSystemPrompt(context: ChatContext): string {
  const parts: string[] = [
    `You are Babblet, an AI teaching assistant helping instructors analyze and improve student presentations.`,
    ``,
    `RESPONSE GUIDELINES:`,
    `- Keep responses concise: 2-5 sentences for explanations`,
    `- Be instructional, supportive, and neutral in tone`,
    `- Always ground your explanations in the highlighted text provided`,
    `- Never re-grade or modify scores unless explicitly asked`,
    `- Answer ANY question the user asks - there are no restrictions on topics`,
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
  
  // Add context about what was highlighted
  if (context.highlightedText) {
    parts.push(``);
    parts.push(`HIGHLIGHTED TEXT:`);
    parts.push(`"${context.highlightedText}"`);
    parts.push(``);
    parts.push(`SOURCE TYPE: ${context.sourceType || 'content'}`);
  }
  
  if (context.rubricCriterion) {
    parts.push(`RUBRIC CRITERION: ${context.rubricCriterion}`);
  }
  
  if (context.timestamp) {
    parts.push(`TRANSCRIPT TIMESTAMP: ${context.timestamp}`);
  }
  
  if (context.learningObjective) {
    parts.push(`LEARNING OBJECTIVE: ${context.learningObjective}`);
  }
  
  return parts.join('\n');
}

// Parse response to extract recommendations
function parseResponse(text: string): { content: string; recommendations: string[] } {
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
    
    return { content, recommendations };
  }
  
  return { content: text, recommendations: [] };
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
      system: buildSystemPrompt(context),
      messages,
    });
    
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';
    
    // Parse response to separate content and recommendations
    const { content, recommendations } = parseResponse(responseText);
    
    return NextResponse.json({
      success: true,
      response: content,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
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
