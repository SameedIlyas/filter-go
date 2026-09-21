import type { MailMessage } from './mailer.js'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const humanDuration = (seconds: number) => {
  if (seconds % 86400 === 0) return `${seconds / 86400} day(s)`
  if (seconds % 3600 === 0) return `${seconds / 3600} hour(s)`

  return `${Math.max(1, Math.round(seconds / 60))} minute(s)`
}

const layout = (heading: string, paragraphs: string[], button: { label: string; url: string }) => `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5">
<h2>${escapeHtml(heading)}</h2>
${paragraphs.map(p => `<p>${p}</p>`).join('\n')}
<p><a href="${escapeHtml(button.url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(button.label)}</a></p>
<p style="color:#666;font-size:13px">If the button does not work, paste this link into your browser:<br>${escapeHtml(button.url)}</p>
</body></html>`

export const inviteEmail = (input: { to: string; name: string; url: string; ttlSeconds: number }): MailMessage => {
  const expiry = humanDuration(input.ttlSeconds)

  return {
    to: input.to,
    subject: 'You have been invited to the FilterGO portal',
    text: [
      `Hi ${input.name},`,
      '',
      'You have been invited to the FilterGO portal. Use the link below to choose your password.',
      '',
      input.url,
      '',
      `This link works once and expires in ${expiry}.`,
      'If you were not expecting this, you can ignore this email.'
    ].join('\n'),
    html: layout(
      'Welcome to FilterGO',
      [
        `Hi ${escapeHtml(input.name)},`,
        'You have been invited to the FilterGO portal. Choose your password to get started.',
        `This link works once and expires in ${expiry}. If you were not expecting this, ignore this email.`
      ],
      { label: 'Set your password', url: input.url }
    )
  }
}

export const passwordResetEmail = (input: { to: string; name: string; url: string; ttlSeconds: number }): MailMessage => {
  const expiry = humanDuration(input.ttlSeconds)

  return {
    to: input.to,
    subject: 'Reset your FilterGO portal password',
    text: [
      `Hi ${input.name},`,
      '',
      'We received a request to reset your password. Use the link below to choose a new one.',
      '',
      input.url,
      '',
      `This link works once and expires in ${expiry}.`,
      'If you did not ask for this, ignore this email: your password has not changed.'
    ].join('\n'),
    html: layout(
      'Reset your password',
      [
        `Hi ${escapeHtml(input.name)},`,
        'We received a request to reset your password.',
        `This link works once and expires in ${expiry}. If you did not ask for this, ignore this email: your password has not changed.`
      ],
      { label: 'Choose a new password', url: input.url }
    )
  }
}
