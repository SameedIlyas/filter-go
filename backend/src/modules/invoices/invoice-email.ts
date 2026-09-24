import type { MailMessage } from '../mail/mailer.js'

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export interface InvoiceEmailInput {
  to: string
  orgName: string
  clientName: string
  invoiceNumber: string
  total: string
  dueDate: string
  paymentUrl: string
}

/**
 * The "here is your invoice" email. Every value that came from a person or a provider is HTML-escaped, and the pay
 * link only becomes a link when it is https (a `javascript:` URL from a misbehaving provider must never be clickable).
 */
export const invoiceEmail = (input: InvoiceEmailInput): MailMessage => {
  const link = /^https:\/\//i.test(input.paymentUrl)
  const summary = `Invoice ${input.invoiceNumber} for ${input.total}, due ${input.dueDate}.`

  return {
    to: input.to,
    subject: `Invoice ${input.invoiceNumber} from ${input.orgName}`,
    text: [
      `Hello ${input.clientName},`,
      '',
      `${input.orgName} has sent you an invoice.`,
      summary,
      '',
      link ? `Pay online: ${input.paymentUrl}` : 'Contact us to arrange payment.'
    ].join('\n'),
    html: `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5">
<p>Hello ${escapeHtml(input.clientName)},</p>
<p>${escapeHtml(input.orgName)} has sent you an invoice.</p>
<p><strong>${escapeHtml(summary)}</strong></p>
${link ? `<p><a href="${escapeHtml(input.paymentUrl)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Pay online</a></p>` : '<p>Contact us to arrange payment.</p>'}
</body></html>`
  }
}
