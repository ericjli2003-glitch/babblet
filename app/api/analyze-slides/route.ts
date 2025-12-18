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

// Extract text from PPTX using JSZip (PPTX is a ZIP of XML files)
async function extractPptxText(buffer: Buffer): Promise<{ text: string; slideCount: number }> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    
    const slideTexts: string[] = [];
    const slideFiles: string[] = [];
    
    // Find all slide XML files
    zip.forEach((relativePath) => {
      if (relativePath.match(/ppt\/slides\/slide\d+\.xml$/)) {
        slideFiles.push(relativePath);
      }
    });
    
    // Sort slides by number
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
      return numA - numB;
    });
    
    // Extract text from each slide
    for (const slidePath of slideFiles) {
      const slideFile = zip.file(slidePath);
      if (slideFile) {
        const xmlContent = await slideFile.async('text');
        // Extract text from XML tags (simplified parsing)
        // PPTX uses <a:t> tags for text content
        const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const slideText = textMatches
          .map(match => match.replace(/<\/?a:t>/g, ''))
          .filter(text => text.trim().length > 0)
          .join(' ');
        
        if (slideText.trim()) {
          slideTexts.push(`[Slide ${slideTexts.length + 1}] ${slideText}`);
        }
      }
    }
    
    // Also try to extract from notes if available
    const notesFiles: string[] = [];
    zip.forEach((relativePath) => {
      if (relativePath.match(/ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
        notesFiles.push(relativePath);
      }
    });
    
    for (const notesPath of notesFiles) {
      const notesFile = zip.file(notesPath);
      if (notesFile) {
        const xmlContent = await notesFile.async('text');
        const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const notesText = textMatches
          .map(match => match.replace(/<\/?a:t>/g, ''))
          .filter(text => text.trim().length > 0)
          .join(' ');
        
        if (notesText.trim() && notesText.length > 20) {
          slideTexts.push(`[Speaker Notes] ${notesText}`);
        }
      }
    }
    
    return {
      text: slideTexts.join('\n\n'),
      slideCount: slideFiles.length,
    };
  } catch (error) {
    console.error('[PPTX] Extraction error:', error);
    throw new Error('Failed to extract PPTX text');
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

    // For PPTX files - extract text directly
    if (slidesFile.name.endsWith('.pptx') || 
        slidesFile.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      console.log('[Analyze Slides] Processing PPTX file');
      
      try {
        const arrayBuffer = await slidesFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const { text: pptxText, slideCount } = await extractPptxText(buffer);
        
        console.log('[Analyze Slides] Extracted', pptxText.length, 'characters from', slideCount, 'slides');
        
        if (pptxText.length < 50) {
          return NextResponse.json({
            success: true,
            analysis: {
              slideCount,
              extractedText: 'PowerPoint appears to contain mostly images or shapes without text',
              keyPoints: ['Consider adding text descriptions or exporting as images for visual analysis'],
              topics: [],
              note: 'Extracted limited text. For image-heavy presentations, export slides as PNG/JPG for visual analysis.',
            },
          });
        }
        
        // Analyze the extracted text with Claude
        const analysis = await analyzeTextWithClaude(client, pptxText, slidesFile.name);
        
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount,
            ...analysis,
          },
        });
      } catch (pptxError) {
        console.error('[Analyze Slides] PPTX processing error:', pptxError);
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount: 1,
            extractedText: `Could not extract text from ${slidesFile.name}`,
            keyPoints: ['PPTX extraction failed - try exporting as PDF or images'],
            topics: [],
            error: 'PPTX processing error',
          },
        });
      }
    }

    // For old PPT files (not PPTX) - provide guidance
    if (slidesFile.name.endsWith('.ppt') || 
        slidesFile.type === 'application/vnd.ms-powerpoint') {
      return NextResponse.json({
        success: true,
        analysis: {
          slideCount: 1,
          extractedText: `Legacy PowerPoint file: ${slidesFile.name}`,
          keyPoints: [
            'This is an older .ppt format. For best results:',
            '1. Open in PowerPoint and save as .pptx',
            '2. Or export as PDF (File → Save As → PDF)',
            '3. Or export slides as images',
          ],
          topics: [],
          note: 'Legacy .ppt format is not supported. Please save as .pptx or export to PDF.',
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

