/** The backend's money and quantity formats (lib/money.ts): up to 10 digits and 2 decimals, 8 digits and 4 decimals. */
export const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/
export const QTY_RE = /^\d{1,8}(\.\d{1,4})?$/

/** Integer arithmetic on scaled values, so 0.1 * 3 is 0.30 and not 0.30000000000000004. */
const scaled = (value: string, places: number): bigint => {
  const [whole, fraction = ''] = value.split('.')

  return BigInt(whole + fraction.padEnd(places, '0').slice(0, places))
}

/** qty x rate rounded half-up to cents, as the server prices a manual line. Null when either input is not valid. */
export const lineAmount = (qty: string, rate: string): string | null => {
  const q = qty.trim()
  const r = rate.trim()

  if (!QTY_RE.test(q) || !MONEY_RE.test(r)) return null

  // qty has 4 places and rate 2: the product has 6; round to 2
  const product = scaled(q, 4) * scaled(r, 2)
  const cents = (product + 5000n) / 10000n
  const text = cents.toString().padStart(3, '0')

  return `${text.slice(0, -2)}.${text.slice(-2)}`
}

/** Sum of money strings, exact to the cent. */
export const sumMoney = (values: string[]): string => {
  const cents = values.reduce((total, value) => total + scaled(value, 2), 0n)
  const negative = cents < 0n
  const text = (negative ? -cents : cents).toString().padStart(3, '0')

  return `${negative ? '-' : ''}${text.slice(0, -2)}.${text.slice(-2)}`
}

export type LineDraft = { description: string; qty: string; unitRate: string }

/** Field errors for a manual line, keyed like the form; empty when it can be sent. */
export const lineErrors = (line: LineDraft): Partial<Record<keyof LineDraft, string>> => {
  const errors: Partial<Record<keyof LineDraft, string>> = {}

  if (!line.description.trim()) errors.description = 'Describe the charge.'
  else if (line.description.trim().length > 500) errors.description = 'Keep it under 500 characters.'

  if (!QTY_RE.test(line.qty.trim())) errors.qty = 'A number with up to 4 decimals.'
  else if (Number(line.qty) <= 0) errors.qty = 'Must be more than zero.'

  if (!MONEY_RE.test(line.unitRate.trim())) errors.unitRate = 'An amount with up to 2 decimals.'
  else if (Number(line.unitRate) <= 0) errors.unitRate = 'Must be more than zero.'

  return errors
}

/** A payment amount: valid money, above zero, at most the outstanding balance. */
export const paymentAmountError = (amount: string, balance: string): string | null => {
  const value = amount.trim()

  if (!MONEY_RE.test(value)) return 'An amount with up to 2 decimals.'
  if (Number(value) <= 0) return 'Must be more than zero.'
  if (scaled(value, 2) > scaled(balance, 2)) return `More than the ${balance} still owed.`

  return null
}
