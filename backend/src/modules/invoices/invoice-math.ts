import { Errors } from '../../lib/errors.js'
import { D, round2, sum, ZERO } from '../../lib/money.js'
import type { Decimal } from '../../lib/money.js'
import { Prisma } from '../../generated/prisma/client.js'

/**
 * The only place invoice money is computed (docs/ARCHITECTURE.md 2.4 and 7.1).
 *
 *   amount    = round2(qty * unitRate)                    per line, half up to the cent
 *   taxAmount = round2(amount * ratePercent / 100)        per line, from the ROUNDED amount
 *   subtotal  = sum(amount), tax = sum(taxAmount), total = subtotal + tax   (sums of the rounded lines, never re-rounded)
 */

export const lineAmount = (qty: Decimal, unitRate: Decimal): Decimal => round2(qty.mul(unitRate))

export const lineTax = (amount: Decimal, ratePercent: Decimal | null): Decimal =>
  ratePercent === null ? ZERO : round2(amount.mul(ratePercent).div(100))

/** Worked minutes as hours with 4 decimals ("7.6667"): the precision the line stores, so the amount can be re-derived. */
export const hoursFromMinutes = (minutes: number): Decimal => D(minutes).div(60).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)

export interface PricedLine {
  amount: Decimal
  taxAmount: Decimal
}

export interface Totals {
  subtotal: Decimal
  tax: Decimal
  total: Decimal
}

export const totalsOf = (lines: PricedLine[]): Totals => {
  const subtotal = sum(lines.map(line => line.amount))
  const tax = sum(lines.map(line => line.taxAmount))

  return { subtotal, tax, total: subtotal.plus(tax) }
}

/** Prices one line: the amount from qty and rate, the tax from the (already looked-up) percentage for its tax code. */
export const priceLine = (qty: Decimal, unitRate: Decimal, ratePercent: Decimal | null): PricedLine => {
  const amount = lineAmount(qty, unitRate)

  return { amount, taxAmount: lineTax(amount, ratePercent) }
}

/** Decimal(12,2) columns hold up to just under 10^10. Refuse (never overflow into a 500) anything bigger. */
const COLUMN_LIMIT = D('10000000000')

export const fitsColumn = (value: Decimal): boolean => value.abs().lt(COLUMN_LIMIT)

export const assertTotalsFit = (totals: Totals): void => {
  if (![totals.subtotal, totals.tax, totals.total].every(fitsColumn)) throw Errors.unprocessable('The invoice total is too large.')
}
