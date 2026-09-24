export interface DetectedFileType {
  contentType: string
  isImage: boolean
}

const startsWith = (bytes: Buffer, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value)

const ascii = (bytes: Buffer, start: number, end: number): string => bytes.subarray(start, end).toString('latin1')

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
const HEIF_BRANDS = new Set(['mif1', 'msf1'])

/**
 * Identifies the file from its first bytes. The client's content-type header and the file name are never
 * consulted: they are attacker-controlled. Returns null for anything that is not jpeg, png, webp, heic/heif or pdf.
 */
export const detectFileType = (bytes: Buffer): DetectedFileType | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', isImage: true }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: 'image/png', isImage: true }

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { contentType: 'image/webp', isImage: true }

  if (ascii(bytes, 0, 5) === '%PDF-') return { contentType: 'application/pdf', isImage: false }

  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)

    if (HEIC_BRANDS.has(brand)) return { contentType: 'image/heic', isImage: true }
    if (HEIF_BRANDS.has(brand)) return { contentType: 'image/heif', isImage: true }
  }

  return null
}
