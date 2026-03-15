import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { getCourseDocuments } from '@/lib/context-store';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { segments, strengths, improvements, courseId, rubricCriteria } = await req.json();

    if (!segments?.length) return NextResponse.json({ annotations: [], topStrengths: [], topWeaknesses: [] });

    let courseMaterialContext = '';
    if (courseId) {
      try {
        const docs = await getCourseDocuments(courseId);
        const excerpts = docs.slice(0, 3).map((d: { name: string; rawText?: string }) =>
          `[${d.name}]: ${(d.rawText || '').slice(0, 600)}`
        ).join('\n\n');
        if (excerpts) courseMaterialContext = `COURSE MATERIALS:\n${excerpts}`;
      } catch { /* non-fatal */ }
    }

    const numberedTranscript = (segments as Array<{ timestamp: string; text: string }>)
      .map((s, i) => `[${i}] ${s.text}`)
      .join('\n');

    const strengthsList = (strengths || []).map((s: { text: string }) => `- ${s.text}`).join('\n');
    const improvementsList = (improvements || []).map((s: { text: string }) => `- ${s.text}`).join('\n');

    const prompt = `You are an expert academic instructor reviewing a student presentation transcript.

${rubricCriteria ? `RUBRIC CRITERIA (ground feedback here first):\n${rubricCriteria}\n` : ''}${courseMaterialContext ? `\n${courseMaterialContext}\n` : ''}
IDENTIFIED STRENGTHS:
${strengthsList || '(none)'}

IDENTIFIED AREAS FOR IMPROVEMENT:
${improvementsList || '(none)'}

TRANSCRIPT (segment index in brackets):
${numberedTranscript.slice(0, 8000)}

YOUR TASK - return a JSON object with three keys:

1. "annotations": Select ONLY the most meaningful, instructive transcript segments worth annotating. Quality over quantity - skip filler, transitions, or generic statements. For each:
   - segmentIndex: bracket number
   - type: "positive" or "negative"
   - feedback: 1-2 specific sentences referencing the rubric criterion or course concept by name. Quote or paraphrase the student's actual words.

2. "topStrengths": Array of 2-4 strings. The most noteworthy things this student did well relative to the rubric and course expectations. Be specific and concrete.

3. "topWeaknesses": Array of 2-4 strings. The most important areas for improvement - things that most significantly held back this student. Be direct and actionable.

Respond ONLY with valid compact JSON, no markdown fences:
{"annotations":[{"segmentIndex":2,"type":"positive","feedback":"..."}],"topStrengths":["..."],"topWeaknesses":["..."]}`;

    const message = await anthropic.messages.create({
      model: config.models.claudeSecondary,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as {
      annotations: Array<{ segmentIndex: number; type: string; feedback: string }>;
      topStrengths: string[];
      topWeaknesses: string[];
    };

    let posNum = 1, negNum = 1;
    const annotations = (parsed.annotations || [])
      .filter((a: { segmentIndex: number }) => a.segmentIndex >= 0 && a.segmentIndex < segments.length)
      .map((a: { segmentIndex: number; type: string; feedback: string }) => ({
        segmentIndex: a.segmentIndex,
        type: a.type as 'positive' | 'negative',
        number: a.type === 'positive' ? posNum++ : negNum++,
        feedback: a.feedback,
      }));

    return NextResponse.json({
      annotations,
      topStrengths: parsed.topStrengths || [],
      topWeaknesses: parsed.topWeaknesses || [],
    });
  } catch (err) {
    console.error('[transcript-annotations]', err);
    return NextResponse.json({ annotations: [], topStrengths: [], topWeaknesses: [] });
  }
}
