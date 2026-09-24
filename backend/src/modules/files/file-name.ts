const MAX_LENGTH = 120
const MAX_EXTENSION_LENGTH = 10
const FALLBACK = 'file'

/**
 * A file name that is safe to store and to put in a Content-Disposition header: no path parts, control or
 * bidi-override characters, no characters that are special on common file systems, no leading dots.
 */
export const sanitizeFileName = (raw: string): string => {
  const base = raw.normalize('NFC').split(/[\\/]/).pop() ?? ''

  const cleaned = base
    .replace(/\p{C}/gu, '')
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')

  if (cleaned === '') return FALLBACK

  return truncate(cleaned)
}

const truncate = (name: string): string => {
  const characters = [...name]

  if (characters.length <= MAX_LENGTH) return name

  const dot = name.lastIndexOf('.')
  const extension = dot > 0 && name.length - dot <= MAX_EXTENSION_LENGTH ? name.slice(dot) : ''
  const stem = [...name.slice(0, extension ? dot : name.length)].slice(0, MAX_LENGTH - extension.length).join('')

  return `${stem}${extension}`
}

/** `attachment; filename="ascii-fallback"; filename*=UTF-8''percent-encoded` (RFC 6266 / 5987). */
export const contentDisposition = (disposition: 'inline' | 'attachment', fileName: string): string => {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
