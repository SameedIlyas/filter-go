import { z } from 'zod'

import { Prisma } from '../generated/prisma/client.js'

/**
 * All money is Postgres numeric <-> Prisma.Decimal. Never use JS numbers for arithmetic on money.
 * On the wire money is a STRING with exactly two decimals ("145.00"), so JSON never loses precision.
 */
export type Decimal = Prisma.Decimal
export type DecimalValue = Prisma.Decimal | string | number

export const D = (value: DecimalValue): Decimal => new Prisma.Decimal(value)

export const ZERO = D(0)

/** Round half up to cents. Every stored amount goes through this. */
export const round2 = (value: DecimalValue): Decimal => D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

/** Serialise for the API: "145.00", or null. */
export const money = (value: Decimal | null | undefined): string | null => (value === null || value === undefined ? null : round2(value).toFixed(2))

/** Non-nullable variant. */
export const moneyRequired = (value: Decimal): string => round2(value).toFixed(2)

/** Quantities such as hours keep 4 decimals ("7.6667"). */
export const qty4 = (value: Decimal): string => D(value).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4)

/** Sum of Decimals. */
export const sum = (values: Decimal[]): Decimal => values.reduce((total, value) => total.plus(value), ZERO)

/**
 * Request field for an amount: a string ("145.00", "145.5") or a number, at most 2 decimals, 0 <= x < 10^10.
 * Parses to a Decimal (via string, never through floating-point arithmetic).
 */
export const moneyField = z
  .union([z.string().trim(), z.number()])
  .transform(value => String(value))
  .refine(value => /^\d{1,10}(\.\d{1,2})?$/.test(value), 'Enter an amount with at most 2 decimals, e.g. "145.00".')
  .transform(value => D(value))

/** Quantity field: string/number, up to 4 decimals, >= 0. */
export const quantityField = z
  .union([z.string().trim(), z.number()])
  .transform(value => String(value))
  .refine(value => /^\d{1,8}(\.\d{1,4})?$/.test(value), 'Enter a quantity with at most 4 decimals.')
  .transform(value => D(value))
