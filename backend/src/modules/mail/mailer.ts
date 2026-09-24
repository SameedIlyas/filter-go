import nodemailer from 'nodemailer'

import type { Config } from '../../config/env.js'
import type { Logger } from '../../context.js'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

/** Prints the message to the log. Development only: the links inside are live credentials. */
const createConsoleMailer = (log: Logger): Mailer => ({
  send: async message => {
    log.info(`\n----- EMAIL to ${message.to} -----\nSubject: ${message.subject}\n\n${message.text}\n-----------------------------`)
  }
})

/** Keeps messages in memory. Used by the test suite. */
export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[]
  clear(): void
}

export const createMemoryMailer = (): MemoryMailer => {
  const sent: MailMessage[] = []

  return {
    sent,
    clear: () => {
      sent.length = 0
    },
    send: async message => {
      sent.push(message)
    }
  }
}

const createSmtpMailer = (config: Config): Mailer => {
  const smtp = config.mail.smtp

  if (!smtp) {
    throw new Error('SMTP is not configured')
  }

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    // A hung mail server must not hang the request that triggered the email
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined
  })

  return {
    send: async message => {
      await transport.sendMail({ from: config.mail.from, ...message })
    }
  }
}

export const createMailer = (config: Config, log: Logger): Mailer => {
  switch (config.mail.driver) {
    case 'smtp':
      return createSmtpMailer(config)
    case 'memory':
      return createMemoryMailer()
    default:
      return createConsoleMailer(log)
  }
}
