'use client'

// React Imports
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// MUI Imports
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

// Type Imports
import { toast } from 'react-toastify'

import type { ThemeColor } from '@core/types'

// Third-party Imports

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { errorMessage } from '@/libs/api/bff'
import { useUploadFile } from '@/libs/api/files'
import type { UploadedFile } from '@/libs/api/files'

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
const nowLocal = () => {
  const now = new Date()

  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

type ConfirmProps = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  color?: ThemeColor
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  color = 'primary',
  busy,
  onConfirm,
  onClose
}: ConfirmProps) => (
  <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>
      <Typography component='div' color='text.secondary'>
        {children}
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button variant='tonal' color='secondary' onClick={onClose}>
        Cancel
      </Button>
      <Button variant='contained' color={color} onClick={onConfirm} disabled={busy}>
        {busy ? 'Working…' : confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
)

type SignProps = {
  open: boolean
  busy: boolean
  supersedes: boolean
  onSign: (input: { signedBy: string; signedAt: string; documentFileId: string | null }) => void
  onClose: () => void
}

/** Records the client's signature: PENDING_SIGNATURE -> ACTIVE. */
export const SignDialog = ({ open, busy, supersedes, onSign, onClose }: SignProps) => {
  const [signedBy, setSignedBy] = useState('')
  const [signedAt, setSignedAt] = useState(nowLocal())
  const [signedFile, setSignedFile] = useState<UploadedFile | null>(null)
  const upload = useUploadFile()

  useEffect(() => {
    if (open) {
      setSignedBy('')
      setSignedAt(nowLocal())
      setSignedFile(null)
    }
  }, [open])

  const attach = async (file: File | undefined) => {
    if (!file) return

    if (file.type !== 'application/pdf') {
      toast.error('Attach the signed contract as a PDF.')

      return
    }

    try {
      setSignedFile(await upload.mutateAsync({ file, purpose: 'contract' }))
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const future = !!signedAt && new Date(signedAt).getTime() > Date.now() + 5 * 60_000

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Record signature</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          The contract becomes <b>active</b> and can generate schedules.
          {supersedes && ' The version it replaces expires at the same time.'}
        </Typography>
        <CustomTextField
          autoFocus
          fullWidth
          required
          label='Signed by'
          placeholder='Client signatory name'
          value={signedBy}
          onChange={e => setSignedBy(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <CustomTextField
          fullWidth
          type='datetime-local'
          label='Signed at'
          value={signedAt}
          onChange={e => setSignedAt(e.target.value)}
          error={future}
          helperText={future ? 'The signature date cannot be in the future.' : undefined}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        {signedFile ? (
          <div className='flex items-center justify-between gap-2 rounded border border-[var(--mui-palette-divider)] p-3'>
            <div className='flex items-center gap-2 min-is-0'>
              <i className='bx-file-pdf text-2xl text-error' />
              <Typography className='truncate'>{signedFile.originalName}</Typography>
            </div>
            <Button size='small' color='secondary' onClick={() => setSignedFile(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <Button
            component='label'
            variant='outlined'
            startIcon={<i className='bx-upload' />}
            disabled={upload.isPending}
          >
            {upload.isPending ? 'Uploading…' : 'Attach signed PDF (optional)'}
            <input
              hidden
              type='file'
              accept='application/pdf'
              onChange={e => {
                void attach(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='contained'
          color='success'
          disabled={busy || upload.isPending || !signedBy.trim() || !signedAt || future}
          onClick={() =>
            onSign({
              signedBy: signedBy.trim(),
              signedAt: new Date(signedAt).toISOString(),
              documentFileId: signedFile?.id ?? null
            })
          }
        >
          {busy ? 'Saving…' : 'Mark as signed'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

type CancelProps = {
  open: boolean
  busy: boolean
  contractNumber: string
  onCancelContract: (reason: string) => void
  onClose: () => void
}

/** Cancelling is final: the reason is required and kept in the audit log. */
export const CancelDialog = ({ open, busy, contractNumber, onCancelContract, onClose }: CancelProps) => {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>Cancel {contractNumber}</DialogTitle>
      <DialogContent className='flex flex-col gap-4'>
        <Typography color='text.secondary'>
          This cannot be undone. No further visits or invoices will come from this contract.
        </Typography>
        <CustomTextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          required
          label='Reason'
          placeholder='e.g. Client terminated, replaced by a new agreement…'
          value={reason}
          onChange={e => setReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant='tonal' color='secondary' onClick={onClose}>
          Keep contract
        </Button>
        <Button
          variant='contained'
          color='error'
          disabled={busy || !reason.trim()}
          onClick={() => onCancelContract(reason.trim())}
        >
          {busy ? 'Cancelling…' : 'Cancel contract'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
