// ============================================
// Parse Rubric API - AI-powered rubric extraction
// Supports: paste text or PDF upload
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { extractText } from '@/lib/text-extraction';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ============================================
// Types
// ============================================

interface ParsedCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  levels?: Array<{
    score: number;
    label: string;
    description: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
  originalText?: string; // The source text this was extracted from
}

interface ParseResult {
  success: boolean;
  criteria: ParsedCriterion[];
  overallConfidence: 'high' | 'medium' | 'low';
  warnings: string[];
  rawText: string;
  totalPoints?: number;
}

// ============================================
// Claude prompt for rubric parsing
// ============================================

const RUBRIC_PARSE_PROMPT = `You are an expert at parsing academic rubrics into structured data.

Given the rubric text below, extract each evaluation criterion with the following information:
- name: The criterion name/title
- description: What this criterion evaluates
- weight: Point value or percentage weight (if not specified, estimate relative importance 1-5)
- levels: Score bands/levels if present (e.g., Excellent/Good/Fair/Poor with point values)
- confidence: How confident you are in this extraction (high/medium/low)
- originalText: The exact text fragment this criterion was extracted from

Rules:
1. Extract ALL criteria, even if formatting is inconsistent
2. If point values are specified (e.g., "30 pts"), use those as weights
3. If percentages are used (e.g., "25%"), convert to points out of 100
4. If no weights are specified, estimate relative importance (1-5 scale)
5. Mark confidence as "low" if:
   - The criterion boundaries are unclear
   - Multiple interpretations are possible
   - The text seems incomplete or corrupted
6. Mark confidence as "medium" if:
   - Weight/points are ambiguous
   - Description could be clearer
7. Mark confidence as "high" if:
   - Clear criterion name and description
   - Explicit point value or weight
   - Well-formatted original text

Return your response as a JSON object with this exact structure:
{
  "criteria": [
    {
      "id": "criterion-1",
      "name": "Criterion Name",
      "description": "Description of what this evaluates",
      "weight": 25,
      "levels": [
        { "score": 25, "label": "Excellent", "description": "..." },
        { "score": 20, "label": "Good", "description": "..." }
      ],
      "confidence": "high",
      "originalText": "The exact text fragment..."
    }
  ],
  "totalPoints": 100,
  "overallConfidence": "high",
  "warnings": ["Any issues or ambiguities found"]
}

If levels/score bands are not present in the rubric, omit the "levels" field entirely.
If you cannot parse anything meaningful, return an empty criteria array with warnings explaining why.

RUBRIC TEXT:
`;

// ============================================
// POST - Parse rubric from text or PDF
// ============================================

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let rawText: string;
    let sourceType: 'text' | 'pdf';
    
    if (contentType.includes('multipart/form-data')) {
      // PDF file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      
      if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
      }
      
      // Extract text from PDF
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const extractionResult = await extractText(buffer, file.name, file.type);
      
      if (!extractionResult.success) {
        return NextResponse.json({ 
          success: false, 
          error: `Failed to extract text from PDF: ${extractionResult.error}` 
        }, { status: 400 });
      }
      
      rawText = extractionResult.text;
      sourceType = 'pdf';
      
      if (rawText.length < 20) {
        return NextResponse.json({ 
          success: false, 
          error: 'PDF appears to be empty or unreadable. Please try pasting the rubric text instead.' 
        }, { status: 400 });
      }
    } else {
      // JSON body with text
      const body = await request.json();
      rawText = body.text;
      sourceType = 'text';
      
      if (!rawText || rawText.trim().length < 20) {
        return NextResponse.json({ 
          success: false, 
          error: 'Please provide at least 20 characters of rubric text' 
        }, { status: 400 });
      }
    }
    
    // Truncate very long rubrics
    const maxLength = 15000;
    const truncatedText = rawText.length > maxLength 
      ? rawText.slice(0, maxLength) + '\n\n[Text truncated due to length]'
      : rawText;
    
    // Call Claude to parse the rubric
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: RUBRIC_PARSE_PROMPT + truncatedText,
        },
      ],
    });
    
    // Extract the response text
    const responseText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
    
    // Parse the JSON response
    let parseResult: {
      criteria: ParsedCriterion[];
      totalPoints?: number;
      overallConfidence: 'high' | 'medium' | 'low';
      warnings: string[];
    };
    
    try {
      // Find JSON in the response (Claude might wrap it in markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      parseResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse rubric. The format may be too unusual. Please try reformatting.',
        rawResponse: responseText.slice(0, 500),
      }, { status: 422 });
    }
    
    // Validate the result
    if (!parseResult.criteria || !Array.isArray(parseResult.criteria)) {
      return NextResponse.json({
        success: false,
        error: 'No criteria could be extracted from the rubric',
        warnings: parseResult.warnings || [],
      }, { status: 422 });
    }
    
    // Ensure all criteria have IDs
    parseResult.criteria = parseResult.criteria.map((c, idx) => ({
      ...c,
      id: c.id || `criterion-${idx + 1}`,
    }));
    
    // Calculate overall confidence based on individual criteria
    const confidenceCounts = {
      high: parseResult.criteria.filter(c => c.confidence === 'high').length,
      medium: parseResult.criteria.filter(c => c.confidence === 'medium').length,
      low: parseResult.criteria.filter(c => c.confidence === 'low').length,
    };
    
    let overallConfidence: 'high' | 'medium' | 'low' = parseResult.overallConfidence;
    if (confidenceCounts.low > 0 || parseResult.criteria.length === 0) {
      overallConfidence = 'low';
    } else if (confidenceCounts.medium > confidenceCounts.high) {
      overallConfidence = 'medium';
    }
    
    const result: ParseResult = {
      success: true,
      criteria: parseResult.criteria,
      overallConfidence,
      warnings: parseResult.warnings || [],
      rawText,
      totalPoints: parseResult.totalPoints,
    };
    
    // Add warnings based on analysis
    if (sourceType === 'pdf') {
      result.warnings.push('Extracted from PDF - please verify text was captured correctly');
    }
    
    if (parseResult.criteria.length === 0) {
      result.warnings.push('No criteria could be extracted. Please check the rubric format.');
    } else if (parseResult.criteria.length === 1) {
      result.warnings.push('Only one criterion found. Is this the complete rubric?');
    }
    
    if (rawText.length > maxLength) {
      result.warnings.push('Rubric text was truncated due to length');
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Parse rubric error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to parse rubric' },
      { status: 500 }
    );
  }
}

