import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

/** Trial space gate — notifies eric@babblet.io when a user submits for extra credits. */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not configured');
      return NextResponse.json(
        { success: false, error: 'Email service not configured' },
        { status: 503 }
      );
    }

    const resend = new Resend(apiKey);
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const institution = typeof body.institution === 'string' ? body.institution.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

    if (!name || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Name and valid email are required' },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: 'Babblet <hello@babblet.io>',
      to: ['eric@babblet.io'],
      replyTo: email,
      subject: `Trial space lead: ${name}`,
      html: `
        <h2>New trial space submission</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        ${institution ? `<p><strong>Institution:</strong> ${escapeHtml(institution)}</p>` : ''}
        ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
        <hr>
        <p style="color: #666; font-size: 12px;">Submitted from the Babblet trial space (extra credits form).</p>
      `,
      text: [
        'New trial space submission',
        '',
        `Name: ${name}`,
        `Email: ${email}`,
        institution ? `Institution: ${institution}` : '',
        phone ? `Phone: ${phone}` : '',
        '',
        '---',
        'Submitted from the Babblet trial space (extra credits form).',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, messageId: data?.id });
  } catch (err) {
    console.error('Trial lead error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
