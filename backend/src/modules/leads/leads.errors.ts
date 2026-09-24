import type { Lead } from '../../generated/prisma/client.js'
import { AppError } from '../../lib/errors.js'

/** 409 LEAD_ALREADY_CONVERTED carrying the ids the UI needs to link to the existing client and contract. */
export const alreadyConverted = (lead: Pick<Lead, 'convertedClientId' | 'convertedContractId'>): AppError =>
  new AppError(409, 'LEAD_ALREADY_CONVERTED', 'This lead has already been converted to a contract.', {
    details: { entity: 'lead', context: { clientId: lead.convertedClientId, contractId: lead.convertedContractId } }
  })
