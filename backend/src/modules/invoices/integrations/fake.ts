import { AppError } from '../../../lib/errors.js'
import type {
  AccountingProvider,
  ClientRecord,
  InvoiceLineRecord,
  InvoiceRecord,
  PaymentProvider,
  PaymentRecord
} from './types.js'

/**
 * Deterministic in-memory providers. Ids are derived from the platform's ids (same input, same output) and every
 * write is idempotent on them, exactly like a real adapter using idempotency keys must be.
 *
 * Tests inject failures with `failNext(count, method?)`: the next `count` calls (of any method, or of one method)
 * throw an INTEGRATION_ERROR, then calls succeed again.
 */

interface FailureRule {
  method: string | null
  remaining: number
}

export interface RecordedCall {
  method: string
  key: string
}

abstract class FaultyProvider {
  readonly calls: RecordedCall[] = []
  private rules: FailureRule[] = []

  /** Forget recorded calls and pending injected failures. */
  reset(): void {
    this.calls.length = 0
    this.rules = []
  }

  /** Make the next `count` calls fail. With `method`, only calls to that method are counted and failed. */
  failNext(count: number, method?: string): void {
    this.rules = [...this.rules, { method: method ?? null, remaining: count }]
  }

  callCount(method: string): number {
    return this.calls.filter(call => call.method === method).length
  }

  protected enter(method: string, key: string): void {
    this.calls.push({ method, key })

    const index = this.rules.findIndex(rule => rule.remaining > 0 && (rule.method === null || rule.method === method))
    const rule = this.rules[index]

    if (rule) {
      this.rules = this.rules.map((current, position) => (position === index ? { ...current, remaining: current.remaining - 1 } : current))

      throw new AppError(502, 'INTEGRATION_ERROR', `Fake provider is unavailable (injected failure in ${method}).`)
    }
  }
}

const short = (id: string, length = 8): string => id.replace(/-/g, '').slice(0, length)

export class FakeAccountingProvider extends FaultyProvider implements AccountingProvider {
  /** What the "accounting system" holds, keyed by platform id. */
  readonly customers = new Map<string, string>()
  readonly invoices = new Map<string, { accountingRef: string; voided: boolean; total: string }>()
  readonly payments = new Map<string, { externalRef: string; accountingRef: string; amount: string }>()

  override reset(): void {
    super.reset()
    this.customers.clear()
    this.invoices.clear()
    this.payments.clear()
  }

  async upsertCustomer(client: ClientRecord): Promise<{ accountingRef: string }> {
    this.enter('upsertCustomer', client.id)

    const accountingRef = this.customers.get(client.id) ?? `QB-CUST-${short(client.id)}`

    this.customers.set(client.id, accountingRef)

    return { accountingRef }
  }

  async createInvoice(invoice: InvoiceRecord, _lines: InvoiceLineRecord[], _client: ClientRecord): Promise<{ accountingRef: string }> {
    this.enter('createInvoice', invoice.id)

    const existing = this.invoices.get(invoice.id)

    if (existing) return { accountingRef: existing.accountingRef }

    const accountingRef = `QB-INV-${short(invoice.id)}`

    this.invoices.set(invoice.id, { accountingRef, voided: false, total: invoice.total })

    return { accountingRef }
  }

  async voidInvoice(accountingRef: string): Promise<void> {
    this.enter('voidInvoice', accountingRef)

    for (const [id, invoice] of this.invoices) {
      if (invoice.accountingRef === accountingRef) this.invoices.set(id, { ...invoice, voided: true })
    }
  }

  async recordPayment(accountingRef: string, payment: PaymentRecord): Promise<{ externalRef: string }> {
    this.enter('recordPayment', payment.id)

    const existing = this.payments.get(payment.id)

    if (existing) return { externalRef: existing.externalRef }

    const externalRef = `QB-PAY-${short(payment.id)}`

    this.payments.set(payment.id, { externalRef, accountingRef, amount: payment.amount })

    return { externalRef }
  }
}

export class FakePaymentProvider extends FaultyProvider implements PaymentProvider {
  readonly customers = new Map<string, string>()
  readonly hostedInvoices = new Map<string, { stripeInvoiceId: string; paymentUrl: string; voided: boolean }>()

  override reset(): void {
    super.reset()
    this.customers.clear()
    this.hostedInvoices.clear()
  }

  async upsertCustomer(client: ClientRecord): Promise<{ stripeCustomerId: string }> {
    this.enter('upsertCustomer', client.id)

    const stripeCustomerId = this.customers.get(client.id) ?? `cus_fake_${short(client.id)}`

    this.customers.set(client.id, stripeCustomerId)

    return { stripeCustomerId }
  }

  async createHostedInvoice(invoice: InvoiceRecord, _lines: InvoiceLineRecord[], _client: ClientRecord): Promise<{ stripeInvoiceId: string; paymentUrl: string }> {
    this.enter('createHostedInvoice', invoice.id)

    const existing = this.hostedInvoices.get(invoice.id)

    if (existing) return { stripeInvoiceId: existing.stripeInvoiceId, paymentUrl: existing.paymentUrl }

    const stripeInvoiceId = `in_fake_${short(invoice.id, 16)}`
    const paymentUrl = `https://pay.fake-stripe.test/i/${stripeInvoiceId}`

    this.hostedInvoices.set(invoice.id, { stripeInvoiceId, paymentUrl, voided: false })

    return { stripeInvoiceId, paymentUrl }
  }

  async voidHostedInvoice(stripeInvoiceId: string): Promise<void> {
    this.enter('voidHostedInvoice', stripeInvoiceId)

    for (const [id, hosted] of this.hostedInvoices) {
      if (hosted.stripeInvoiceId === stripeInvoiceId) this.hostedInvoices.set(id, { ...hosted, voided: true })
    }
  }
}
