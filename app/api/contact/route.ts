import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

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
    const { firstName, lastName, email, role, institution } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !role || !institution) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    // Send email via Resend
    const { data, error } = await resend.emails.send({
      from: 'Babblet <hello@babblet.io>',
      to: ['eric@babblet.io'],
      replyTo: email,
      subject: `Sales Inquiry from ${firstName} ${lastName}`,
      html: `
        <h2>New Sales Inquiry</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Role:</strong> ${role}</p>
        <p><strong>Institution:</strong> ${institution}</p>
        <hr>
        <p style="color: #666; font-size: 12px;">This inquiry was submitted via the Babblet contact form.</p>
      `,
      text: `
New Sales Inquiry

Name: ${firstName} ${lastName}
Email: ${email}
Role: ${role}
Institution: ${institution}

---
This inquiry was submitted via the Babblet contact form.
      `,
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
    console.error('Contact form error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
