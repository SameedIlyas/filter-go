/**
 * Ports for the two outside systems an invoice talks to (docs/ARCHITECTURE.md section 7.3).
 *
 * The platform creates the invoice and PUSHES it to accounting; the payment provider collects the money.
 * Both ports receive plain records (money as strings, dates as "YYYY-MM-DD"), never Prisma rows, so a real
 * QuickBooks / Stripe adapter can be written without knowing the database.
 *
 * Every method must be idempotent on the platform's own ids (`invoice.id`, `payment.id`, `client.id`): the outbox
 * delivers at least once, so a call can be repeated after a crash and must not create a second external object.
 */

export interface ClientRecord {
  id: string
  legalName: string
  billingEmail: string
  billingAddress: string | null
  /** Accounting customer id once known. */
  accountingRef: string | null
  /** Payment-provider customer id once known. */
  stripeCustomerId: string | null
}

export interface InvoiceRecord {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate: string
  subtotal: string
  tax: string
  total: string
}

export interface InvoiceLineRecord {
  description: string
  qty: string
  unitRate: string
  amount: string
  taxCode: string | null
  taxAmount: string
}

export interface PaymentRecord {
  id: string
  amount: string
  method: string
  receivedAt: Date
}

export interface AccountingProvider {
  upsertCustomer(client: ClientRecord): Promise<{ accountingRef: string }>
  createInvoice(invoice: InvoiceRecord, lines: InvoiceLineRecord[], client: ClientRecord): Promise<{ accountingRef: string }>
  voidInvoice(accountingRef: string): Promise<void>
  recordPayment(accountingRef: string, payment: PaymentRecord): Promise<{ externalRef: string }>
}

export interface PaymentProvider {
  upsertCustomer(client: ClientRecord): Promise<{ stripeCustomerId: string }>
  createHostedInvoice(invoice: InvoiceRecord, lines: InvoiceLineRecord[], client: ClientRecord): Promise<{ stripeInvoiceId: string; paymentUrl: string }>
  /** Stops a hosted invoice from being paid after the platform voided it. */
  voidHostedInvoice(stripeInvoiceId: string): Promise<void>
}

export interface Integrations {
  accounting: AccountingProvider
  payments: PaymentProvider
}
