import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Initialize Claude client lazily
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Extract text from PDF using pdf-parse
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid build issues
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('[PDF] Extraction error:', error);
    throw new Error('Failed to extract PDF text');
  }
}

// Analyze extracted text with Claude to get structured data
async function analyzeTextWithClaude(
  client: Anthropic,
  text: string,
  filename: string
): Promise<{
  extractedText: string;
  keyPoints: string[];
  topics: string[];
  data?: string[];
}> {
  const response = await client.messages.create({
    model: config.models.claude,
    max_tokens: config.api.analysisMaxTokens,
    messages: [
      {
        role: 'user',
        content: `Analyze this presentation/document content extracted from "${filename}". 

CONTENT:
${text.slice(0, 8000)}

Extract and return as JSON:
{
  "keyPoints": ["Main point 1", "Main point 2", ...],
  "topics": ["Topic 1", "Topic 2", ...],
  "data": ["Any statistics, numbers, or data points mentioned"]
}

Focus on the most important points that would help generate good questions about this presentation.
Respond ONLY with valid JSON.`,
      },
    ],
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      extractedText: text.slice(0, 2000), // Keep first 2000 chars as summary
      keyPoints: parsed.keyPoints || [],
      topics: parsed.topics || [],
      data: parsed.data || [],
    };
  }

  return {
    extractedText: text.slice(0, 2000),
    keyPoints: [],
    topics: [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const slidesFile = formData.get('slides') as File | null;

    if (!slidesFile) {
      return NextResponse.json(
        { error: 'No slides file provided' },
        { status: 400 }
      );
    }

    console.log('[Analyze Slides] Received file:', slidesFile.name, 'size:', slidesFile.size);

    const client = getAnthropicClient();
    
    if (!client) {
      // Return mock data if Claude not configured
      console.log('[Analyze Slides] Claude not configured, returning mock data');
      return NextResponse.json({
        success: true,
        analysis: {
          slideCount: 1,
          extractedText: `[Slide content from ${slidesFile.name}]`,
          keyPoints: ['Add ANTHROPIC_API_KEY for real slide analysis'],
          topics: ['Configuration needed'],
        },
      });
    }

    // For PDFs - extract text and analyze
    if (slidesFile.type === 'application/pdf' || slidesFile.name.endsWith('.pdf')) {
      console.log('[Analyze Slides] Processing PDF file');
      
      try {
        const arrayBuffer = await slidesFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const pdfText = await extractPdfText(buffer);
        
        console.log('[Analyze Slides] Extracted', pdfText.length, 'characters from PDF');
        
        if (pdfText.length < 50) {
          return NextResponse.json({
            success: true,
            analysis: {
              slideCount: 1,
              extractedText: 'PDF appears to be image-based or empty',
              keyPoints: ['Consider exporting slides as images for visual analysis'],
              topics: [],
              note: 'This PDF may contain images instead of text. For best results with image-heavy PDFs, export individual slides as PNG/JPG.',
            },
          });
        }
        
        // Analyze the extracted text with Claude
        const analysis = await analyzeTextWithClaude(client, pdfText, slidesFile.name);
        
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount: Math.ceil(pdfText.length / 500), // Rough estimate
            ...analysis,
          },
        });
      } catch (pdfError) {
        console.error('[Analyze Slides] PDF processing error:', pdfError);
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount: 1,
            extractedText: `Could not extract text from ${slidesFile.name}`,
            keyPoints: ['PDF text extraction failed - try exporting as images'],
            topics: [],
            error: 'PDF processing error',
          },
        });
      }
    }

    // For images, we can send directly to Claude's vision
    if (slidesFile.type.startsWith('image/')) {
      const arrayBuffer = await slidesFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mediaType = slidesFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      const response = await client.messages.create({
        model: config.models.claude,
        max_tokens: config.api.analysisMaxTokens,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Analyze this presentation slide. Extract:
1. All text content
2. Key points being made
3. Main topics covered
4. Any data or statistics shown
5. Visual elements (charts, diagrams, images) and what they represent

Format your response as JSON:
{
  "extractedText": "Full text from the slide",
  "keyPoints": ["Point 1", "Point 2"],
  "topics": ["Topic 1", "Topic 2"],
  "data": ["Any statistics or data points"],
  "visualElements": ["Description of charts/diagrams"]
}`,
              },
            ],
          },
        ],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      // Parse JSON from response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount: 1,
            ...analysis,
          },
        });
      }

      return NextResponse.json({
        success: true,
        analysis: {
          slideCount: 1,
          extractedText: textContent.text,
          keyPoints: [],
          topics: [],
        },
      });
    }

    // For PPT/PPTX files - provide guidance
    if (slidesFile.name.endsWith('.ppt') || slidesFile.name.endsWith('.pptx')) {
      return NextResponse.json({
        success: true,
        analysis: {
          slideCount: 1,
          extractedText: `PowerPoint file: ${slidesFile.name}`,
          keyPoints: [
            'For best results with PowerPoint files:',
            '1. Export as PDF (File → Save As → PDF)',
            '2. Or export slides as images (File → Export → Change File Type → PNG)',
          ],
          topics: [],
          note: 'Direct PPT/PPTX parsing is not yet supported. Please export to PDF or images.',
        },
      });
    }

    // Unknown file type
    return NextResponse.json({
      success: true,
      analysis: {
        slideCount: 1,
        extractedText: `Unsupported file type: ${slidesFile.type}`,
        keyPoints: ['Please upload PDF, PNG, JPG, or export PowerPoint to PDF'],
        topics: [],
      },
    });

  } catch (error) {
    console.error('[Analyze Slides] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze slides', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

