import { hash, verify } from '@node-rs/argon2'

export interface PasswordHasher {
  hash(password: string): Promise<string>
  /** Never throws: a malformed hash simply fails verification. */
  verify(passwordHash: string, password: string): Promise<boolean>
  /**
   * Spends the same time as a real verification and always returns false. Used when the account
   * does not exist so response timing cannot reveal which emails are registered.
   */
  verifyAgainstDummy(password: string): Promise<false>
}

interface HasherOptions {
  memoryKib: number
  timeCost: number
}

/** argon2id (the @node-rs/argon2 default). OWASP minimum is m=19456 KiB, t=2, p=1. */
export const createPasswordHasher = ({ memoryKib, timeCost }: HasherOptions): PasswordHasher => {
  const options = { memoryCost: memoryKib, timeCost, parallelism: 1 }
  // Computed up front so the very first unknown-email login isn't slower than the rest
  const dummyHash = hash('dummy-password-that-matches-nobody', options).catch(() => '')

  return {
    hash: password => hash(password, options),

    verify: async (passwordHash, password) => {
      try {
        return await verify(passwordHash, password)
      } catch {
        return false
      }
    },

    verifyAgainstDummy: async password => {
      await verify(await dummyHash, password).catch(() => false)

      return false
    }
  }
}
