import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface TranscriptAnnotation {
  segmentIndex: number;
  type: 'positive' | 'negative';
  number: number;
  feedback: string;
}

export async function POST(req: NextRequest) {
  try {
    const { segments, strengths, improvements } = await req.json();

    if (!segments?.length) {
      return NextResponse.json({ annotations: [] });
    }

    const numberedTranscript = segments
      .map((s: { timestamp: string; text: string }, i: number) => `[${i}] ${s.timestamp}: ${s.text}`)
      .join('\n');

    const strengthsList = (strengths || []).map((s: { text: string }) => s.text).join('\n- ');
    const improvementsList = (improvements || []).map((s: { text: string }) => s.text).join('\n- ');

    const prompt = `You are analyzing a student presentation transcript to identify the most meaningful moments that illustrate specific feedback points.

TRANSCRIPT (segment index shown in brackets):
${numberedTranscript.slice(0, 8000)}

KNOWN STRENGTHS:
- ${strengthsList || 'None identified'}

KNOWN AREAS FOR IMPROVEMENT:
- ${improvementsList || 'None identified'}

Your task: identify 4-8 specific transcript segments that best illustrate the feedback above. Pick only the most meaningful moments - do not annotate generic or filler segments.

For each segment, return:
- segmentIndex: the number in brackets
- type: "positive" (illustrates a strength) or "negative" (illustrates an area for improvement)
- feedback: a concise, nuanced 1-2 sentence explanation specific to WHAT the student said in that exact moment and WHY it matters. Be direct and specific - reference actual words or phrases from the transcript.

Return ONLY valid JSON in this exact format, no other text:
{"annotations":[{"segmentIndex":3,"type":"positive","feedback":"..."},{"segmentIndex":7,"type":"negative","feedback":"..."}]}`;

    const message = await anthropic.messages.create({
      model: config.models.claudeSecondary,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    let posNum = 1, negNum = 1;
    const annotations = (parsed.annotations || [])
      .filter((a: { segmentIndex: number; type: string; feedback: string }) => a.segmentIndex >= 0 && a.segmentIndex < segments.length)
      .map((a: { segmentIndex: number; type: string; feedback: string }) => ({
        segmentIndex: a.segmentIndex,
        type: a.type,
        number: a.type === 'positive' ? posNum++ : negNum++,
        feedback: a.feedback,
      }));

    return NextResponse.json({ annotations });
  } catch (err) {
    console.error('[transcript-annotations]', err);
    return NextResponse.json({ annotations: [] });
  }
}
