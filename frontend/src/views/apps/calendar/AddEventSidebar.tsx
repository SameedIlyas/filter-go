// React Imports
import { useState, useEffect, forwardRef, useCallback } from 'react'

// MUI Imports
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Switch from '@mui/material/Switch'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import type { SelectChangeEvent } from '@mui/material/Select'

// Third-party Imports
import { useForm, Controller } from 'react-hook-form'

// Type Imports
import type { AddEventSidebarType, AddEventType } from '@/types/apps/calendarTypes'

// Component Imports
import CustomTextField from '@core/components/mui/TextField'

// Styled Component Imports
import AppReactDatepicker from '@/libs/styles/AppReactDatepicker'

// Slice Imports
import { addEvent, deleteEvent, updateEvent, selectedEvent, filterEvents } from '@/redux-store/slices/calendar'

interface PickerProps {
  label?: string
  error?: boolean
  className?: string
  id?: string
  registername?: string
}

interface DefaultStateType {
  url: string
  title: string
  allDay: boolean
  calendar: string
  description: string
  endDate: Date
  startDate: Date
  guests: string[] | undefined
}

// Vars
const capitalize = (string: string) => string && string[0].toUpperCase() + string.slice(1)

// Vars
const defaultState: DefaultStateType = {
  url: '',
  title: '',
  guests: [],
  allDay: true,
  description: '',
  endDate: new Date(),
  calendar: 'Business',
  startDate: new Date()
}

const AddEventSidebar = (props: AddEventSidebarType) => {
  // Props
  const { calendarStore, dispatch, addEventSidebarOpen, handleAddEventSidebarToggle } = props

  // States
  const [values, setValues] = useState<DefaultStateType>(defaultState)

  // Refs
  const PickersComponent = forwardRef(({ ...props }: PickerProps, ref) => {
    return (
      <CustomTextField
        inputRef={ref}
        fullWidth
        {...props}
        label={props.label || ''}
        className={props.className}
        id={props.id}
        error={props.error}
      />
    )
  })

  // Hooks
  const {
    control,
    setValue,
    clearErrors,
    handleSubmit,
    formState: { errors }
  } = useForm({ defaultValues: { title: '' } })

  const resetToStoredValues = useCallback(() => {
    if (calendarStore.selectedEvent !== null) {
      const event = calendarStore.selectedEvent

      setValue('title', event.title || '')
      setValues({
        url: event.url || '',
        title: event.title || '',
        allDay: event.allDay,
        guests: event.extendedProps.guests || [],
        description: event.extendedProps.description || '',
        calendar: event.extendedProps.calendar || 'Business',
        endDate: event.end !== null ? event.end : event.start,
        startDate: event.start !== null ? event.start : new Date()
      })
    }
  }, [setValue, calendarStore.selectedEvent])

  const resetToEmptyValues = useCallback(() => {
    setValue('title', '')
    setValues(defaultState)
  }, [setValue])

  const handleSidebarClose = () => {
    setValues(defaultState)
    clearErrors()
    dispatch(selectedEvent(null))
    handleAddEventSidebarToggle()
  }

  const onSubmit = (data: { title: string }) => {
    const modifiedEvent: AddEventType = {
      url: values.url,
      display: 'block',
      title: data.title,
      end: values.endDate,
      allDay: values.allDay,
      start: values.startDate,
      extendedProps: {
        calendar: capitalize(values.calendar),
        guests: values.guests && values.guests.length ? values.guests : undefined,
        description: values.description.length ? values.description : undefined
      }
    }

    if (
      calendarStore.selectedEvent === null ||
      (calendarStore.selectedEvent !== null && !calendarStore.selectedEvent.title.length)
    ) {
      dispatch(addEvent(modifiedEvent))
    } else {
      dispatch(updateEvent({ ...modifiedEvent, id: calendarStore.selectedEvent.id }))
    }

    dispatch(filterEvents())

    handleSidebarClose()
  }

  const handleDeleteButtonClick = () => {
    if (calendarStore.selectedEvent) {
      dispatch(deleteEvent(calendarStore.selectedEvent.id))
      dispatch(filterEvents())
    }

    // calendarApi.getEventById(calendarStore.selectedEvent.id).remove()
    handleSidebarClose()
  }

  const handleStartDate = (date: Date | null) => {
    if (date && date > values.endDate) {
      setValues({ ...values, startDate: new Date(date), endDate: new Date(date) })
    }
  }

  const RenderSidebarFooter = () => {
    if (
      calendarStore.selectedEvent === null ||
      (calendarStore.selectedEvent && !calendarStore.selectedEvent.title.length)
    ) {
      return (
        <div className='flex gap-4'>
          <Button type='submit' variant='contained'>
            Add
          </Button>
          <Button variant='tonal' color='secondary' onClick={resetToEmptyValues}>
            Reset
          </Button>
        </div>
      )
    } else {
      return (
        <div className='flex gap-4'>
          <Button type='submit' variant='contained'>
            Update
          </Button>
          <Button variant='tonal' color='secondary' onClick={resetToStoredValues}>
            Reset
          </Button>
        </div>
      )
    }
  }

  useEffect(() => {
    if (calendarStore.selectedEvent !== null) {
      resetToStoredValues()
    } else {
      resetToEmptyValues()
    }
  }, [addEventSidebarOpen, resetToStoredValues, resetToEmptyValues, calendarStore.selectedEvent])

  return (
    <Drawer
      anchor='right'
      open={addEventSidebarOpen}
      onClose={handleSidebarClose}
      ModalProps={{ keepMounted: true }}
      sx={{ '& .MuiDrawer-paper': { width: ['100%', 400] } }}
    >
      <Box className='flex items-center justify-between sidebar-header plb-5 pli-6 border-be'>
        <Typography variant='h5'>
          {calendarStore.selectedEvent && calendarStore.selectedEvent.title.length ? 'Update Event' : 'Add Event'}
        </Typography>
        {calendarStore.selectedEvent && calendarStore.selectedEvent.title.length ? (
          <Box className='flex items-center' sx={{ gap: calendarStore.selectedEvent !== null ? 1 : 0 }}>
            <IconButton size='small' onClick={handleDeleteButtonClick}>
              <i className='bx-trash-alt text-2xl' />
            </IconButton>
            <IconButton size='small' onClick={handleSidebarClose}>
              <i className='bx-x text-2xl' />
            </IconButton>
          </Box>
        ) : (
          <IconButton size='small' onClick={handleSidebarClose}>
            <i className='bx-x text-2xl' />
          </IconButton>
        )}
      </Box>
      <Box className='sidebar-body p-6'>
        <form onSubmit={handleSubmit(onSubmit)} autoComplete='off'>
          <Controller
            name='title'
            control={control}
            rules={{ required: true }}
            render={({ field: { value, onChange } }) => (
              <CustomTextField
                label='Title'
                value={value}
                onChange={onChange}
                fullWidth
                className='mbe-6'
                id='event-title'
                {...(errors.title && { error: true, helperText: 'This field is required' })}
              />
            )}
          />
          <CustomTextField
            select
            fullWidth
            className='mbe-6'
            label='Calendar'
            value={values.calendar}
            id='event-calendar'
            onChange={e => setValues({ ...values, calendar: e.target.value })}
          >
            <MenuItem value='Personal'>Personal</MenuItem>
            <MenuItem value='Business'>Business</MenuItem>
            <MenuItem value='Family'>Family</MenuItem>
            <MenuItem value='Holiday'>Holiday</MenuItem>
            <MenuItem value='ETC'>ETC</MenuItem>
          </CustomTextField>
          <AppReactDatepicker
            selectsStart
            id='event-start-date'
            endDate={values.endDate}
            selected={values.startDate}
            startDate={values.startDate}
            showTimeSelect={!values.allDay}
            dateFormat={!values.allDay ? 'yyyy-MM-dd hh:mm' : 'yyyy-MM-dd'}
            customInput={
              <PickersComponent label='Start Date' registername='startDate' className='mbe-6' id='event-start-date' />
            }
            onChange={(date: Date | null) => date !== null && setValues({ ...values, startDate: new Date(date) })}
            onSelect={handleStartDate}
          />
          <AppReactDatepicker
            selectsEnd
            id='event-end-date'
            endDate={values.endDate}
            selected={values.endDate}
            minDate={values.startDate}
            startDate={values.startDate}
            showTimeSelect={!values.allDay}
            dateFormat={!values.allDay ? 'yyyy-MM-dd hh:mm' : 'yyyy-MM-dd'}
            customInput={
              <PickersComponent label='End Date' registername='endDate' className='mbe-6' id='event-end-date' />
            }
            onChange={(date: Date | null) => date !== null && setValues({ ...values, endDate: new Date(date) })}
          />
          <FormControl className='mbe-6'>
            <FormControlLabel
              label='All Day'
              control={
                <Switch checked={values.allDay} onChange={e => setValues({ ...values, allDay: e.target.checked })} />
              }
            />
          </FormControl>
          <CustomTextField
            fullWidth
            type='url'
            id='event-url'
            className='mbe-6'
            label='Event URL'
            value={values.url}
            onChange={e => setValues({ ...values, url: e.target.value })}
          />
          <CustomTextField
            select
            fullWidth
            className='mbe-6'
            label='Guests'
            value={values.guests}
            id='event-guests'
            // eslint-disable-next-line lines-around-comment
            // @ts-ignore
            onChange={(e: SelectChangeEvent<(typeof values)['guests']>) =>
              setValues({
                ...values,
                guests: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
              })
            }
            slotProps={{
              select: { multiple: true }
            }}
          >
            <MenuItem value='bruce'>Bruce</MenuItem>
            <MenuItem value='clark'>Clark</MenuItem>
            <MenuItem value='diana'>Diana</MenuItem>
            <MenuItem value='john'>John</MenuItem>
            <MenuItem value='barry'>Barry</MenuItem>
          </CustomTextField>
          <CustomTextField
            rows={4}
            multiline
            fullWidth
            className='mbe-6'
            label='Description'
            id='event-description'
            value={values.description}
            onChange={e => setValues({ ...values, description: e.target.value })}
          />
          <div className='flex items-center'>
            <RenderSidebarFooter />
          </div>
        </form>
      </Box>
    </Drawer>
  )
}

export default AddEventSidebar
