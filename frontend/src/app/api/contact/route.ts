// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { email, literal, maxLength, nonEmpty, object, optional, parse, pipe, string, ValiError } from 'valibot'

/*
 * Receives the public appointment request.
 *
 * The payload is validated again here rather than trusting the client — the
 * browser schema is a convenience for the person filling the form, not a
 * security boundary.
 *
 * There is no transactional email or CRM provider wired up yet, so a valid
 * submission is logged and acknowledged. Swap the marked block for your
 * provider (HubSpot, Resend, SendGrid) without touching the client.
 */

const optionalText = (max: number) => optional(pipe(string(), maxLength(max)), '')

const appointmentSchema = object({
  firstName: pipe(string(), nonEmpty('Please tell us your first name'), maxLength(80)),
  lastName: optionalText(80),
  email: pipe(string(), nonEmpty('Please add an email'), email('That email does not look right'), maxLength(200)),
  company: optionalText(160),
  region: optionalText(120),
  phone: optionalText(40),

  serviceAddress: optionalText(240),
  preferredDate: optionalText(10),
  preferredTime: pipe(string(), nonEmpty('Please pick a time')),

  businessType: pipe(string(), nonEmpty('Please pick a type of business')),
  notes: optionalText(4000),

  // Consent is a gate, not a preference — anything but `true` is a failed submission
  privacy: literal(true, 'Please confirm you have read the privacy policy')
})

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Expected a JSON body' }, { status: 400 })
  }

  try {
    const submission = parse(appointmentSchema, body)

    // --- Replace with your CRM / email provider -----------------------------
    console.info('[appointment] new request', {
      name: `${submission.firstName} ${submission.lastName}`.trim(),
      email: submission.email,
      company: submission.company,
      businessType: submission.businessType,
      preferredDate: submission.preferredDate,
      preferredTime: submission.preferredTime,
      receivedAt: new Date().toISOString()
    })

    // ------------------------------------------------------------------------

    return NextResponse.json(
      { message: 'Thanks — we’ll call to confirm your free assessment shortly.' },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof ValiError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? 'That submission was not valid' },
        { status: 422 }
      )
    }

    return NextResponse.json({ message: 'Something went wrong on our end' }, { status: 500 })
  }
}
