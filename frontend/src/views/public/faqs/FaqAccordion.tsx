'use client'

// React Imports
import { useMemo, useState } from 'react'

// MUI Imports
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import InputAdornment from '@mui/material/InputAdornment'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

// Theme Imports
import { radius } from '@components/layout/public/theme'

// Data Imports
import { faqs } from '@/data/public/site'

// Component Imports
import Reveal from '../shared/Reveal'

const ALL = 'all'

/**
 * Searchable, category-filtered FAQs.
 *
 * Filtering happens on every keystroke over a list of a dozen items, so it runs
 * inline rather than behind a debounce — there is no request and no measurable
 * cost, and instant feedback is the better experience.
 */
const FaqAccordion = () => {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(ALL)
  const [expanded, setExpanded] = useState<string | false>('general-0')

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return faqs.categories
      .filter(group => category === ALL || group.id === category)
      .map(group => ({
        ...group,
        items: needle
          ? group.items.filter(
              item => item.question.toLowerCase().includes(needle) || item.answer.toLowerCase().includes(needle)
            )
          : group.items
      }))
      .filter(group => group.items.length > 0)
  }, [query, category])

  const total = results.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <Box component='section' sx={{ paddingBlock: { xs: 8, md: 14 } }}>
      <Container sx={{ maxInlineSize: 900 }}>
        <Reveal>
          <TextField
            fullWidth
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search the FAQs…'
            aria-label='Search frequently asked questions'
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position='start'>
                    <i className='bx-search' />
                  </InputAdornment>
                ),
                sx: { borderRadius: radius.sm, backgroundColor: 'background.paper' }
              }
            }}
          />
        </Reveal>

        <Reveal delay={0.06}>
          <Stack direction='row' sx={{ gap: 1, flexWrap: 'wrap', marginBlock: 3 }}>
            <Chip
              label='All'
              onClick={() => setCategory(ALL)}
              color={category === ALL ? 'primary' : 'default'}
              variant={category === ALL ? 'filled' : 'outlined'}
              sx={{ borderRadius: radius.pill, fontWeight: 600 }}
            />
            {faqs.categories.map(group => (
              <Chip
                key={group.id}
                label={group.label}
                icon={<i className={group.icon} />}
                onClick={() => setCategory(group.id)}
                color={category === group.id ? 'primary' : 'default'}
                variant={category === group.id ? 'filled' : 'outlined'}
                sx={{ borderRadius: radius.pill, fontWeight: 600 }}
              />
            ))}
          </Stack>
        </Reveal>

        <Box aria-live='polite' sx={{ marginBlockEnd: 2 }}>
          <Typography variant='body2' sx={{ color: 'text.secondary' }}>
            {total === 0
              ? 'No answers matched that search.'
              : `${total} ${total === 1 ? 'answer' : 'answers'}${query ? ` matching “${query}”` : ''}`}
          </Typography>
        </Box>

        {results.map(group => (
          <Box key={group.id} sx={{ marginBlockEnd: 5 }}>
            <Typography variant='h5' component='h2' sx={{ marginBlockEnd: 2 }}>
              {group.label}
            </Typography>

            <Stack sx={{ gap: 1.5 }}>
              {group.items.map((item, index) => {
                const panelId = `${group.id}-${index}`

                return (
                  <Reveal key={item.question} delay={index * 0.04}>
                    <Accordion
                      disableGutters
                      elevation={0}
                      expanded={expanded === panelId}
                      onChange={(_, isExpanded) => setExpanded(isExpanded ? panelId : false)}
                      sx={{
                        border: '1px solid',
                        borderColor: expanded === panelId ? 'primary.main' : 'divider',
                        backgroundColor: 'background.paper',
                        transition: 'border-color .3s ease'
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<i className='bx-plus' />}
                        aria-controls={`${panelId}-content`}
                        id={`${panelId}-header`}
                        sx={{
                          paddingBlock: 1,
                          paddingInline: 3,
                          '& .MuiAccordionSummary-expandIconWrapper': {
                            color: 'primary.main',
                            transition: 'transform .35s cubic-bezier(.22,1,.36,1)'
                          },
                          '& .MuiAccordionSummary-expandIconWrapper.Mui-expanded': { transform: 'rotate(135deg)' }
                        }}
                      >
                        <Typography variant='subtitle2' sx={{ fontWeight: 600 }}>
                          {item.question}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ paddingInline: 3, paddingBlockEnd: 3 }}>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                          {item.answer}
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                  </Reveal>
                )
              })}
            </Stack>
          </Box>
        ))}
      </Container>
    </Box>
  )
}

export default FaqAccordion
