'use client'

// React Imports
import { useEffect, useState } from 'react'

// MUI Imports
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Skeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

// Third-party Imports
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

// Type Imports
import type { ComplianceDocument } from '@/types/userTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Lib Imports
import { BffError, errorMessage } from '@/libs/api/bff'
import { useDeleteDocument, useSaveDocument, useUserCompliance } from '@/libs/api/queries/users'

import { ConfirmDialog } from '../../contracts/detail/ActionDialogs'
import { COMPLIANCE_META, formatDay } from '../shared'

// Style Imports
import tableStyles from '@core/styles/table.module.css'

type FormValues = { type: string; expiresAt: string; notes: string }

const EMPTY: FormValues = { type: '', expiresAt: '', notes: '' }

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

const expiryCaption = (doc: ComplianceDocument) => {
  if (doc.daysUntilExpiry === null) return 'No expiry'
  if (doc.daysUntilExpiry < 0) return `${-doc.daysUntilExpiry} days ago`
  if (doc.daysUntilExpiry === 0) return 'Today'

  return `in ${doc.daysUntilExpiry} days`
}

type DialogProps = { userId: string; open: boolean; document?: ComplianceDocument; onClose: () => void }

const DocumentDialog = ({ userId, open, document, onClose }: DialogProps) => {
  const save = useSaveDocument(userId)

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormValues>({ defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return

    reset(
      document ? { type: document.type, expiresAt: document.expiresAt ?? '', notes: document.notes ?? '' } : EMPTY
    )
  }, [open, document, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      await save.mutateAsync({
        documentId: document?.id,
        input: { type: values.type.trim(), expiresAt: values.expiresAt || null, notes: values.notes.trim() || null }
      })
      toast.success(document ? 'Document updated' : 'Document added')
      onClose()
    } catch (error) {
      if (error instanceof BffError) {
        error.details?.issues?.forEach(issue => setError(issue.field as keyof FormValues, { message: issue.message }))
      }

      toast.error(errorMessage(error))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>{document ? 'Edit document' : 'Add document'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
          <Controller
            name='type'
            control={control}
            rules={{ validate: v => !!v.trim() || 'Type is required.' }}
            render={({ field }) => (
              <CustomTextField
                {...field}
                autoFocus
                fullWidth
                label='Document type'
                placeholder='e.g. Driver licence, First aid'
                error={!!errors.type}
                helperText={errors.type?.message}
                slotProps={{ htmlInput: { maxLength: 60 } }}
              />
            )}
          />
          <Controller
            name='expiresAt'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                type='date'
                label='Expires on (optional)'
                error={!!errors.expiresAt}
                helperText={errors.expiresAt?.message ?? 'Leave empty if it never expires'}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />
          <Controller
            name='notes'
            control={control}
            render={({ field }) => (
              <CustomTextField
                {...field}
                fullWidth
                multiline
                minRows={3}
                label='Notes (optional)'
                className='sm:col-span-2'
                error={!!errors.notes}
                helperText={errors.notes?.message}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button variant='tonal' color='secondary' onClick={onClose}>
            Cancel
          </Button>
          <Button variant='contained' type='submit' disabled={save.isPending}>
            {save.isPending ? 'Saving…' : document ? 'Save' : 'Add document'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

type Props = {
  userId: string

  /** May add documents (the person themselves, or staff who can see them). */
  canAdd: boolean

  /** May edit and delete documents (ADMIN / SUPERVISOR only). */
  canManage: boolean
}

const DocumentsTab = ({ userId, canAdd, canManage }: Props) => {
  const compliance = useUserCompliance(userId)
  const remove = useDeleteDocument(userId)
  const [dialog, setDialog] = useState<{ open: boolean; document?: ComplianceDocument }>({ open: false })
  const [deleting, setDeleting] = useState<ComplianceDocument | null>(null)

  if (compliance.isPending) return <Skeleton variant='rounded' height={300} />

  if (compliance.isError) {
    return (
      <Alert
        severity='error'
        action={
          <Button color='inherit' size='small' onClick={() => compliance.refetch()}>
            Retry
          </Button>
        }
      >
        {errorMessage(compliance.error)}
      </Alert>
    )
  }

  const { documents, overall } = compliance.data

  const onDelete = async () => {
    if (!deleting) return

    try {
      await remove.mutateAsync(deleting.id)
      toast.success('Document deleted')
      setDeleting(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <div className='flex items-center gap-3'>
            Documents &amp; compliance
            <Chip
              size='small'
              variant='tonal'
              color={COMPLIANCE_META[overall].color}
              label={overall === 'VALID' ? 'Compliant' : COMPLIANCE_META[overall].label}
            />
          </div>
        }
        subheader='Licences, certificates and checks. Anything expiring within 30 days is flagged.'
        action={
          canAdd ? (
            <Button variant='tonal' startIcon={<i className='bx-plus' />} onClick={() => setDialog({ open: true })}>
              Add document
            </Button>
          ) : null
        }
      />
      <div className='overflow-x-auto'>
        <table className={tableStyles.table}>
          <thead>
            <tr>
              <th>Document</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Notes</th>
              {canManage && <th className='text-end'>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className='text-center plb-12'>
                  <div className='flex flex-col items-center gap-2'>
                    <i className='bx-file text-5xl text-textDisabled' />
                    <Typography variant='h6'>No documents on file</Typography>
                    <Typography color='text.secondary'>Add licences and certificates to track their expiry.</Typography>
                  </div>
                </td>
              </tr>
            )}
            {documents.map(doc => (
              <tr key={doc.id}>
                <td className='font-medium'>{capitalize(doc.type)}</td>
                <td>
                  <div className='flex flex-col'>
                    <span>{formatDay(doc.expiresAt)}</span>
                    <Typography variant='body2' color='text.disabled'>
                      {expiryCaption(doc)}
                    </Typography>
                  </div>
                </td>
                <td>
                  <Chip
                    size='small'
                    variant='tonal'
                    color={COMPLIANCE_META[doc.status].color}
                    label={COMPLIANCE_META[doc.status].label}
                  />
                </td>
                <td className='max-is-[280px] truncate'>{doc.notes ?? '—'}</td>
                {canManage && (
                  <td className='text-end whitespace-nowrap'>
                    <IconButton size='small' onClick={() => setDialog({ open: true, document: doc })} aria-label='Edit'>
                      <i className='bx-edit text-textSecondary' />
                    </IconButton>
                    <IconButton size='small' onClick={() => setDeleting(doc)} aria-label='Delete'>
                      <i className='bx-trash text-textSecondary' />
                    </IconButton>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocumentDialog
        userId={userId}
        open={dialog.open}
        document={dialog.document}
        onClose={() => setDialog({ open: false })}
      />
      <ConfirmDialog
        open={!!deleting}
        title='Delete document?'
        confirmLabel='Delete'
        color='error'
        busy={remove.isPending}
        onConfirm={onDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `“${capitalize(deleting.type)}” will be removed from this person’s record.` : null}
      </ConfirmDialog>
    </Card>
  )
}

export default DocumentsTab
