import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { updateSlideAnalysis } from '@/lib/session-store';
import { analyzeAllSlides } from '@/lib/openai';
import type { SlideAnalysis, SlideContent } from '@/lib/types';

// Helper to convert file to base64 data URL
async function fileToDataUrl(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || 'image/png';
  return `data:${mimeType};base64,${base64}`;
}

// POST - Analyze uploaded slides
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const slidesFile = formData.get('slides') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    if (!slidesFile) {
      return NextResponse.json(
        { error: 'Slides file required' },
        { status: 400 }
      );
    }

    // Check file type
    const isPdf = slidesFile.type === 'application/pdf' || slidesFile.name.endsWith('.pdf');
    const isPpt = slidesFile.type.includes('presentation') || 
                  slidesFile.name.endsWith('.ppt') || 
                  slidesFile.name.endsWith('.pptx');
    const isImage = slidesFile.type.startsWith('image/');

    let slideImages: string[] = [];
    let analysis: SlideAnalysis;

    if (isImage) {
      // Single image - convert directly
      const dataUrl = await fileToDataUrl(slidesFile);
      slideImages = [dataUrl];
    } else if (isPdf) {
      // PDF handling would require pdf.js or similar
      // For MVP, we'll create mock data
      console.log('PDF processing would happen here with pdfjs-dist');
      slideImages = []; // Would be populated with page images
    } else if (isPpt) {
      // PPT handling would require conversion service
      console.log('PPT processing would require external conversion service');
      slideImages = [];
    }

    if (slideImages.length > 0) {
      try {
        // Call OpenAI Vision API
        analysis = await analyzeAllSlides(slideImages);
      } catch (openaiError) {
        console.warn('OpenAI vision analysis failed, using mock data:', openaiError);
        analysis = createMockSlideAnalysis(slideImages.length || 5);
      }
    } else {
      // Create mock analysis for non-image files
      analysis = createMockSlideAnalysis(5);
    }

    // Store analysis if session provided
    if (sessionId) {
      updateSlideAnalysis(sessionId, analysis);
    }

    return NextResponse.json({
      success: true,
      analysis,
      slideCount: analysis.slides.length,
    });
  } catch (error) {
    console.error('Slide analysis error:', error);
    return NextResponse.json(
      { error: 'Slide analysis failed' },
      { status: 500 }
    );
  }
}

// Create mock slide analysis for development
function createMockSlideAnalysis(slideCount: number): SlideAnalysis {
  const mockSlides: SlideContent[] = [];

  for (let i = 1; i <= slideCount; i++) {
    mockSlides.push({
      pageNumber: i,
      extractedText: `Slide ${i} content - Main points about the topic`,
      mainPoints: [
        `Key point ${i}.1 from the slide`,
        `Key point ${i}.2 with supporting detail`,
        `Key point ${i}.3 conclusion`,
      ],
      graphs: i % 2 === 0 ? ['Bar chart showing comparison data'] : [],
      definitions: i === 1 ? ['Term A: Definition of the core concept'] : [],
      keywords: ['topic', 'analysis', 'research', `concept${i}`],
    });
  }

  return {
    slides: mockSlides,
    overallTheme: 'A comprehensive analysis of the research topic with supporting evidence and conclusions',
    keyTopics: [
      'Main Research Topic',
      'Methodology',
      'Key Findings',
      'Implications',
      'Future Directions',
    ],
    suggestedQuestions: [
      'How does the data support the main thesis?',
      'What are the limitations of the methodology used?',
      'How do these findings compare to previous research?',
      'What are the practical applications of this work?',
      'What questions remain unanswered?',
    ],
  };
}

