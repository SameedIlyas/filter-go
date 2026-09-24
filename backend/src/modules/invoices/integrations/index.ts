import type { AppContext } from '../../../context.js'
import { FakeAccountingProvider, FakePaymentProvider } from './fake.js'
import type { AccountingProvider, Integrations, PaymentProvider } from './types.js'

export type { AccountingProvider, Integrations, PaymentProvider } from './types.js'
export { FakeAccountingProvider, FakePaymentProvider } from './fake.js'

const accountingFor = (ctx: AppContext): AccountingProvider => {
  switch (ctx.config.integrations.accountingProvider) {
    case 'fake':
      return new FakeAccountingProvider()
  }
}

const paymentsFor = (ctx: AppContext): PaymentProvider => {
  switch (ctx.config.integrations.paymentProvider) {
    case 'fake':
      return new FakePaymentProvider()
  }
}

/** One set of providers per running app, so the in-memory fakes keep their state between calls. */
const cache = new WeakMap<AppContext, Integrations>()

/** The providers selected by ACCOUNTING_PROVIDER / PAYMENT_PROVIDER. Real adapters plug in in the two switches above. */
export const getIntegrations = (ctx: AppContext): Integrations => {
  const existing = cache.get(ctx)

  if (existing) return existing

  const created: Integrations = { accounting: accountingFor(ctx), payments: paymentsFor(ctx) }

  cache.set(ctx, created)

  return created
}

/** Test access to the fakes (fault injection, inspecting what the "external system" holds). */
export const getFakeIntegrations = (ctx: AppContext): { accounting: FakeAccountingProvider; payments: FakePaymentProvider } => {
  const { accounting, payments } = getIntegrations(ctx)

  if (!(accounting instanceof FakeAccountingProvider) || !(payments instanceof FakePaymentProvider)) {
    throw new Error('The fake providers are not the ones selected in this configuration')
  }

  return { accounting, payments }
}
