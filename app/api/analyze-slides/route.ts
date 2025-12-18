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

// Image info extracted from PPTX
interface ExtractedImage {
  name: string;
  data: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

// Extract text AND images from PPTX using JSZip
async function extractPptxContent(buffer: Buffer): Promise<{
  text: string;
  slideCount: number;
  images: ExtractedImage[];
}> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideTexts: string[] = [];
    const slideFiles: string[] = [];
    const images: ExtractedImage[] = [];

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

    // Extract images from ppt/media folder (process ALL images)
    const mediaFiles: string[] = [];
    zip.forEach((relativePath) => {
      if (relativePath.match(/ppt\/media\/(image|picture)\d+\.(png|jpg|jpeg|gif|webp)$/i)) {
        mediaFiles.push(relativePath);
      }
    });

    // Sort images by name for consistent ordering
    mediaFiles.sort();

    for (const mediaPath of mediaFiles) {
      const mediaFile = zip.file(mediaPath);
      if (mediaFile) {
        const imageData = await mediaFile.async('nodebuffer');
        const ext = mediaPath.split('.').pop()?.toLowerCase() || 'png';
        let mediaType: ExtractedImage['mediaType'] = 'image/png';

        if (ext === 'jpg' || ext === 'jpeg') mediaType = 'image/jpeg';
        else if (ext === 'gif') mediaType = 'image/gif';
        else if (ext === 'webp') mediaType = 'image/webp';

        images.push({
          name: mediaPath.split('/').pop() || 'image',
          data: imageData,
          mediaType,
        });
      }
    }

    console.log(`[PPTX] Extracted ${slideFiles.length} slides, ${images.length} images`);

    return {
      text: slideTexts.join('\n\n'),
      slideCount: slideFiles.length,
      images,
    };
  } catch (error) {
    console.error('[PPTX] Extraction error:', error);
    throw new Error('Failed to extract PPTX content');
  }
}

// Analyze images with Claude Vision (batch up to 5 at a time)
async function analyzeImagesWithClaude(
  client: Anthropic,
  images: ExtractedImage[]
): Promise<string[]> {
  if (images.length === 0) return [];

  const descriptions: string[] = [];

  // Process images in batches of 3 to stay within limits
  const batchSize = 3;
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    try {
      const imageContents: Anthropic.Messages.ImageBlockParam[] = batch.map(img => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: img.mediaType,
          data: img.data.toString('base64'),
        },
      }));

      const response = await client.messages.create({
        model: config.models.claude,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              {
                type: 'text',
                text: `Analyze these ${batch.length} image(s) from a presentation. For each image, describe:
1. What type of visual it is (chart, diagram, photo, graph, table, etc.)
2. What data or information it shows
3. Key insights or takeaways

Be concise but informative. Format as:
[Image 1: brief type] Description...
[Image 2: brief type] Description...`,
              },
            ],
          },
        ],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        descriptions.push(textContent.text);
      }
    } catch (error) {
      console.error('[PPTX] Image analysis error for batch:', error);
      descriptions.push(`[Image analysis failed for ${batch.length} image(s)]`);
    }
  }

  return descriptions;
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

    // For PPTX files - extract text AND images
    if (slidesFile.name.endsWith('.pptx') ||
      slidesFile.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
      console.log('[Analyze Slides] Processing PPTX file with image analysis');

      try {
        const arrayBuffer = await slidesFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const { text: pptxText, slideCount, images } = await extractPptxContent(buffer);

        console.log('[Analyze Slides] Extracted', pptxText.length, 'chars from', slideCount, 'slides,', images.length, 'images');

        // Analyze images with Claude Vision
        let imageDescriptions: string[] = [];
        let visualElements: string[] = [];

        if (images.length > 0) {
          console.log('[Analyze Slides] Analyzing', images.length, 'images with Claude Vision...');
          imageDescriptions = await analyzeImagesWithClaude(client, images);
          visualElements = imageDescriptions.flatMap(desc => {
            // Extract key visual descriptions
            const lines = desc.split('\n').filter(line => line.trim().length > 0);
            return lines.slice(0, 5); // Keep first 5 lines per batch
          });
        }

        // Combine text and image descriptions
        const combinedContent = [
          pptxText,
          images.length > 0 ? '\n\n[VISUAL CONTENT ANALYSIS]\n' + imageDescriptions.join('\n\n') : '',
        ].filter(Boolean).join('\n');

        if (combinedContent.length < 50 && images.length === 0) {
          return NextResponse.json({
            success: true,
            analysis: {
              slideCount,
              extractedText: 'PowerPoint appears to be empty or contains unsupported content',
              keyPoints: ['No text or images could be extracted'],
              topics: [],
              visualElements: [],
            },
          });
        }

        // Analyze the combined content with Claude
        const analysis = await analyzeTextWithClaude(client, combinedContent, slidesFile.name);

        // Build response with optional warning for large image counts
        const response: {
          success: boolean;
          analysis: {
            slideCount: number;
            extractedText: string;
            keyPoints: string[];
            topics: string[];
            data?: string[];
            visualElements?: string[];
            imageCount: number;
            warning?: string;
          };
        } = {
          success: true,
          analysis: {
            slideCount,
            ...analysis,
            visualElements: visualElements.length > 0 ? visualElements : undefined,
            imageCount: images.length,
          },
        };

        // Add warning for presentations with many images
        if (images.length >= 20) {
          response.analysis.warning = `This presentation contains ${images.length} images. Analysis may take longer and use more API credits.`;
          console.log(`[Analyze Slides] Warning: Large presentation with ${images.length} images`);
        }

        return NextResponse.json(response);
      } catch (pptxError) {
        console.error('[Analyze Slides] PPTX processing error:', pptxError);
        return NextResponse.json({
          success: true,
          analysis: {
            slideCount: 1,
            extractedText: `Could not extract content from ${slidesFile.name}`,
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

