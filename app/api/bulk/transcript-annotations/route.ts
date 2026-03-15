import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';
import { getCourseDocuments } from '@/lib/context-store';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { segments, strengths, improvements, courseId, rubricCriteria } = await req.json();

    if (!segments?.length) return NextResponse.json({ annotations: [] });

    // Pull course materials to ground feedback in real course content
    let courseMaterialContext = '';
    if (courseId) {
      try {
        const docs = await getCourseDocuments(courseId);
        const excerpts = docs.slice(0, 3).map(d =>
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

${rubricCriteria ? `RUBRIC CRITERIA (most important — ground your feedback here first):\n${rubricCriteria}\n` : ''}
${courseMaterialContext ? `\n${courseMaterialContext}\n` : ''}
IDENTIFIED STRENGTHS:
${strengthsList || '(none)'}

IDENTIFIED AREAS FOR IMPROVEMENT:
${improvementsList || '(none)'}

TRANSCRIPT (segment index in brackets, no timestamps):
${numberedTranscript.slice(0, 8000)}

TASK: Identify 4–8 specific transcript segments that are the most meaningful evidence of the feedback above. Prioritize segments that directly relate to the rubric criteria and course material — only fall back to general academic standards if the rubric/course materials don't apply.

For each selected segment write:
- segmentIndex: the bracket number
- type: "positive" or "negative"
- feedback: 1–2 sentences, specific to WHAT was said, referencing the relevant rubric criterion or course concept by name where applicable. Be concrete — quote or paraphrase the student's actual words.

Respond ONLY with valid compact JSON, no markdown:
{"annotations":[{"segmentIndex":2,"type":"positive","feedback":"..."},{"segmentIndex":5,"type":"negative","feedback":"..."}]}`;

    const message = await anthropic.messages.create({
      model: config.models.claudeSecondary,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { annotations: Array<{ segmentIndex: number; type: string; feedback: string }> };

    let posNum = 1, negNum = 1;
    const annotations = (parsed.annotations || [])
      .filter((a: { segmentIndex: number }) => a.segmentIndex >= 0 && a.segmentIndex < segments.length)
      .map((a: { segmentIndex: number; type: string; feedback: string }) => ({
        segmentIndex: a.segmentIndex,
        type: a.type as 'positive' | 'negative',
        number: a.type === 'positive' ? posNum++ : negNum++,
        feedback: a.feedback,
      }));

    return NextResponse.json({ annotations });
  } catch (err) {
    console.error('[transcript-annotations]', err);
    return NextResponse.json({ annotations: [] });
  }
}
