import { z } from 'zod'

import { TOKEN_PATTERN } from './crypto.js'
import { Errors } from './errors.js'
import { PASSWORD_MAX_LENGTH } from './password-policy.js'
import type { FieldIssue } from './errors.js'

const toIssues = (error: z.ZodError): FieldIssue[] =>
  error.issues.flatMap((issue): FieldIssue[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map(key => ({
        field: [...issue.path, key].join('.'),
        code: 'unrecognized_key',
        message: `Unknown field "${key}".`
      }))
    }

    const missing = issue.code === 'invalid_type' && /received undefined/.test(issue.message)

    return [
      {
        field: issue.path.join('.'),
        code: missing ? 'required' : issue.code,
        message: missing ? 'This field is required.' : issue.message
      }
    ]
  })

/** Parse untrusted input, throwing a VALIDATION_ERROR listing every problem. */
export const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => {
  const result = schema.safeParse(data ?? {})

  if (!result.success) {
    throw Errors.validation(toIssues(result.error))
  }

  return result.data
}

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

export const emailField = z
  .string()
  .trim()
  .max(254, 'Email is too long.')
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'))

export const nameField = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(100, 'Name must be at most 100 characters.')
  .refine(value => !/\p{C}/u.test(value), 'Name contains invalid characters.')

/** Passwords are never trimmed or altered. Policy is enforced separately when one is being *set*. */
export const passwordField = z
  .string()
  .min(1, 'Password is required.')
  .max(PASSWORD_MAX_LENGTH, 'Password is too long.')

export const tokenField = z.string().regex(TOKEN_PATTERN, 'Token is malformed.')

export const imageField = z
  .string()
  .trim()
  .max(2048)
  .refine(value => {
    try {
      const url = new URL(value)

      return url.protocol === 'https:'
    } catch {
      return false
    }
  }, 'Image must be a valid https:// URL.')

export const uuidParams = z.strictObject({ id: z.uuid('Invalid id.') })
