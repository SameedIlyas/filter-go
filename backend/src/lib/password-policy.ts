import type { FieldIssue } from './errors.js'

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

// Passwords that meet the length rule but are still among the most guessed.
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  '12345678910',
  '123456789012',
  '1111111111',
  '0000000000',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwertyuiop1',
  'asdfghjkl1',
  'asdfghjklqwerty',
  'abcdefghij',
  'abcd123456',
  'abc1234567',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'passw0rd123',
  'p@ssw0rd123',
  'admin12345',
  'admin123456',
  'administrator',
  'welcome123',
  'welcome1234',
  'letmein123',
  'letmein1234',
  'iloveyou123',
  'changeme123',
  'changemenow',
  'trustno1234',
  'superman123',
  'football123',
  'baseball123',
  'sunshine123',
  'princess123',
  'whatever123',
  'filtergo123',
  'filter-go123',
  'filtergo1234'
])

// Words that stay guessable after stripping digits / symbols and changing case (Password!2024 -> password)
const COMMON_BASES = new Set([
  'password',
  'passwords',
  'passw',
  'qwerty',
  'qwertyuiop',
  'letmein',
  'welcome',
  'admin',
  'administrator',
  'iloveyou',
  'changeme',
  'filtergo',
  'filter',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'master',
  'login',
  'princess',
  'sunshine',
  'superman',
  'trustno',
  'whatever',
  'freedom',
  'shadow',
  'abcdefgh',
  'abcdefghij',
  'asdfghjkl',
  'zxcvbnm'
])

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' }

const undoLeet = (value: string) => value.replace(/[013457@$]/g, char => LEET[char] ?? char)

/**
 * True when, after dropping digits/symbols (or decoding leetspeak), the password is a common word
 * plus at most a few extra characters: "Password!2024", "W3lcome-x", "adminxyz".
 */
const isCommonBase = (lower: string): boolean => {
  const candidates = [lower.replace(/[^a-z]/g, ''), undoLeet(lower).replace(/[^a-z]/g, '')]

  return candidates.some(candidate =>
    [...COMMON_BASES].some(
      base => candidate === base || (candidate.length - base.length <= 3 && (candidate.startsWith(base) || candidate.endsWith(base)))
    )
  )
}

export interface PasswordContext {
  email?: string
  name?: string
}

/**
 * NIST-style policy: length over composition rules. Returns every problem found so the UI can
 * show them all at once. An empty array means the password is acceptable.
 */
export const checkPasswordPolicy = (password: string, context: PasswordContext = {}): FieldIssue[] => {
  const issues: FieldIssue[] = []
  const add = (code: string, message: string) => issues.push({ field: 'password', code, message })

  if (password.length < PASSWORD_MIN_LENGTH) {
    add('too_short', `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    add('too_long', `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`)
  }

  // Everything below is only meaningful once the length rules are met
  if (issues.length > 0) return issues

  const lower = password.toLowerCase()

  if (COMMON_PASSWORDS.has(lower) || isCommonBase(lower)) {
    add('too_common', 'This password is too common. Choose something less guessable.')
  }

  if (new Set(password).size < 5 || /^(.{1,4}?)\1+$/.test(lower)) {
    add('too_simple', 'This password is too repetitive. Use a longer, more varied passphrase.')
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase()

  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    add('contains_email', 'Password must not contain your email address.')
  }

  const nameParts = (context.name ?? '').toLowerCase().split(/[^\p{L}]+/u).filter(part => part.length >= 4)

  if (nameParts.some(part => lower.includes(part))) {
    add('contains_name', 'Password must not contain your name.')
  }

  return issues
}
