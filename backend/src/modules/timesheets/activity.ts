import type { AuditEvent } from '../../generated/prisma/client.js'
import type { Db } from '../../lib/prisma.js'
import { loadUserNames } from './entries.js'

const MAX_ACTIVITY = 100

/** Only a free-text reason leaves the audit diff: approval diffs carry rate stamps, which a supervisor may not see. */
const reasonOf = (diff: AuditEvent['diff']): string | null => {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return null

  const reason = (diff as Record<string, unknown>).reason

  return typeof reason === 'string' && reason.trim() ? reason : null
}

/**
 * The trail behind one entry, oldest first: the shift's scheduling events (assigned, confirmed, ...) followed by the
 * timesheet's own (clocked in, adjusted, approved, ...). System events (the sweep) have a null actor.
 */
export const loadActivity = async (db: Db, orgId: string, entry: { id: string; shiftId: string }) => {
  const events = await db.auditEvent.findMany({
    where: {
      orgId,
      OR: [
        { entity: 'shift', entityId: entry.shiftId },
        { entity: 'timesheet', entityId: entry.id }
      ]
    },
    // Newest first so a long trail drops its oldest events, then back to oldest first for reading
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_ACTIVITY
  }).then(rows => rows.reverse())

  const names = await loadUserNames(db, orgId, events.flatMap(event => (event.actorId ? [event.actorId] : [])))

  return events.map(event => ({
    id: event.id,
    entity: event.entity,
    action: event.action,
    actor: event.actorId ? (names.get(event.actorId) ?? null) : null,
    reason: reasonOf(event.diff),
    at: event.createdAt
  }))
}

export type ActivityItem = Awaited<ReturnType<typeof loadActivity>>[number]
