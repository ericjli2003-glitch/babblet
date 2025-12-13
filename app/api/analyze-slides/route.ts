import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

    // For images, we can send directly to Claude's vision
    if (slidesFile.type.startsWith('image/')) {
      const arrayBuffer = await slidesFile.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const mediaType = slidesFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
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

    // For PDFs and PPT files, we'd need additional processing
    // For now, return a message about supported formats
    return NextResponse.json({
      success: true,
      analysis: {
        slideCount: 1,
        extractedText: `File: ${slidesFile.name} (${slidesFile.type})`,
        keyPoints: ['For best results, upload slide images (PNG, JPG)'],
        topics: ['PDF and PPT support coming soon'],
        note: 'Currently, image files provide the best analysis. Consider exporting slides as images.',
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

