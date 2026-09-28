// Third-party Imports
import { useMutation } from '@tanstack/react-query'

import { BffError } from './bff'

export type UploadedFile = { id: string; originalName: string; contentType: string; size: number; createdAt: string }

/** Where the browser can open or embed a stored file (via the session-authenticated proxy). */
export const fileUrl = (id: string) => `/api/files/${id}`

export const uploadFile = async (file: File, purpose?: string): Promise<UploadedFile> => {
  const form = new FormData()

  // Text fields must come before the file part: the API ignores fields sent after it
  if (purpose) form.append('purpose', purpose)
  form.append('file', file)

  const res = await fetch('/api/files', { method: 'POST', body: form, headers: { 'x-requested-with': 'fetch' } })
  const json = await res.json().catch(() => null)

  if (!res.ok || !json?.success) {
    throw new BffError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Upload failed.',
      json?.error?.details
    )
  }

  return json.data.file as UploadedFile
}

export const useUploadFile = () =>
  useMutation({ mutationFn: ({ file, purpose }: { file: File; purpose?: string }) => uploadFile(file, purpose) })
