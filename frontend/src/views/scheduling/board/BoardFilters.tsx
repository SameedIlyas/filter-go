'use client'

// MUI Imports
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'

// Type Imports
import type { Site } from '@/types/contractTypes'
import type { ShiftStatus } from '@/types/scheduleTypes'
import type { User } from '@/types/userTypes'

// Component Imports
import CustomAutocomplete from '@core/components/mui/Autocomplete'
import CustomTextField from '@core/components/mui/TextField'

import { SHIFT_STATUSES } from '../logic/boardWindow'
import type { BoardState } from '../logic/boardWindow'
import { SHIFT_STATUS_META } from '../shared'

type Props = {
  state: BoardState
  update: (patch: Partial<BoardState>) => void
  sites: Site[]
  staff: User[]

  /** Embedded in one schedule: the site is fixed and drafts are part of the schedule, so those filters go. */
  embedded: boolean
}

type Option = { id: string; label: string }

/** A compact multi-select: shows the first pick and "+N". */
const MultiFilter = ({ label, options, value, onChange }: { label: string; options: Option[]; value: string[]; onChange: (ids: string[]) => void }) => (
  <CustomAutocomplete
    multiple
    size='small'
    limitTags={1}
    className='min-is-[180px] max-is-[260px] flex-1'
    options={options}
    value={options.filter(option => value.includes(option.id))}
    onChange={(_event, picked) => onChange(picked.map(option => option.id))}
    isOptionEqualToValue={(option, selected) => option.id === selected.id}
    getOptionLabel={option => option.label}
    renderInput={params => <CustomTextField {...params} placeholder={value.length ? undefined : label} label={label} />}
  />
)

const BoardFilters = ({ state, update, sites, staff, embedded }: Props) => (
  <div className='flex flex-wrap items-end gap-3'>
    {!embedded && (
      <MultiFilter
        label='Sites'
        options={sites.map(site => ({ id: site.id, label: site.name }))}
        value={state.siteIds}
        onChange={siteIds => update({ siteIds })}
      />
    )}
    <MultiFilter
      label='Staff'
      options={staff.map(user => ({ id: user.id, label: user.name }))}
      value={state.userIds}
      onChange={userIds => update({ userIds })}
    />
    <MultiFilter
      label='Status'
      options={SHIFT_STATUSES.map(status => ({ id: status, label: SHIFT_STATUS_META[status].label }))}
      value={state.statuses}
      onChange={statuses => update({ statuses: statuses as ShiftStatus[] })}
    />
    {!embedded && (
      <FormControlLabel
        control={<Switch checked={state.includeDraft} onChange={event => update({ includeDraft: event.target.checked })} />}
        label='Show drafts'
      />
    )}
  </div>
)

export default BoardFilters
