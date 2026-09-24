import type { Site, UserAvailability, UserDocument } from '../../generated/prisma/client.js'
import { fromDateOnlyOrNull } from '../../lib/time.js'
import type { ComplianceStatus } from './compliance.js'

export const serializeWindow = (window: UserAvailability) => ({
  id: window.id,
  weekday: window.weekday,
  startTime: window.startTime,
  endTime: window.endTime
})

export const serializeSiteRef = (site: Pick<Site, 'id' | 'name' | 'clientId' | 'active'>) => ({
  id: site.id,
  name: site.name,
  clientId: site.clientId,
  active: site.active
})

export const serializeDocument = (document: UserDocument) => ({
  id: document.id,
  userId: document.userId,
  type: document.type,
  fileId: document.fileId,
  expiresAt: fromDateOnlyOrNull(document.expiresAt),
  notes: document.notes,
  createdAt: document.createdAt
})

export const serializeDocumentWithStatus = (document: UserDocument, status: ComplianceStatus, daysUntilExpiry: number | null) => ({
  ...serializeDocument(document),
  status,
  daysUntilExpiry
})
