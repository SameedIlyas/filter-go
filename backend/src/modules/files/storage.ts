import { createReadStream } from 'node:fs'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'

import type { Config } from '../../config/env.js'

export interface StoredObject {
  stream: Readable
  size: number
}

/** Where file bytes live. The local-disk driver below is the only implementation today; an S3 driver plugs in here. */
export interface StorageDriver {
  /** Stores new bytes under a server-generated key. Never overwrites. */
  put(key: string, data: Buffer): Promise<void>
  /** Null when there are no bytes under that key. */
  open(key: string): Promise<StoredObject | null>
  /** Removing a missing key is not an error. */
  delete(key: string): Promise<void>
}

// Keys are `<orgId>/<yyyy>/<uuid>`: letters, digits, `_` and `-` between slashes. No dots, so no `..` and no extensions.
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64}){0,4}$/

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT'

export const createLocalStorage = (directory: string): StorageDriver => {
  const root = resolve(directory)

  // Two independent checks: the key must be well formed, and the resolved path must stay inside the storage directory
  const pathFor = (key: string): string => {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key.')

    const full = resolve(root, key)

    if (!full.startsWith(root + sep)) throw new Error('Storage key escapes the storage directory.')

    return full
  }

  return {
    put: async (key, data) => {
      const full = pathFor(key)

      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, data, { flag: 'wx', mode: 0o600 })
    },

    open: async key => {
      const full = pathFor(key)

      try {
        const info = await stat(full)

        return info.isFile() ? { stream: createReadStream(full), size: info.size } : null
      } catch (error) {
        if (isMissing(error)) return null

        throw error
      }
    },

    delete: async key => {
      await rm(pathFor(key), { force: true })
    }
  }
}

export const createStorageDriver = (config: Pick<Config, 'storage'>): StorageDriver => createLocalStorage(config.storage.dir)
