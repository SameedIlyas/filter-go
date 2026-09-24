import type { Client, Service, Site, TaxRate } from '../../generated/prisma/client.js'
import type { Actor } from '../../lib/access.js'

/** Explicit whitelists for the catalog entities. Contract serializers live in contract.serializers.ts. */

export const serializeService = (service: Service) => ({
  id: service.id,
  name: service.name,
  description: service.description,
  active: service.active,
  createdAt: service.createdAt
})

export const serializeTaxRate = (rate: TaxRate) => ({
  code: rate.code,
  ratePercent: rate.ratePercent.toFixed(3)
})

/** `accountingRef` and `stripeCustomerId` are integration-owned identifiers: ADMIN only. */
export const serializeClient = (client: Client, viewer: Pick<Actor, 'role'>) => ({
  id: client.id,
  legalName: client.legalName,
  billingEmail: client.billingEmail,
  billingAddress: client.billingAddress,
  paymentTerms: client.paymentTerms,
  active: client.active,
  ...(viewer.role === 'ADMIN' ? { accountingRef: client.accountingRef, stripeCustomerId: client.stripeCustomerId } : {}),
  createdAt: client.createdAt,
  updatedAt: client.updatedAt
})

export const serializeSite = (site: Site) => ({
  id: site.id,
  clientId: site.clientId,
  name: site.name,
  address: site.address,
  lat: site.lat,
  lng: site.lng,
  timezone: site.timezone,
  accessNotes: site.accessNotes,
  contactName: site.contactName,
  contactPhone: site.contactPhone,
  active: site.active,
  createdAt: site.createdAt,
  updatedAt: site.updatedAt
})
