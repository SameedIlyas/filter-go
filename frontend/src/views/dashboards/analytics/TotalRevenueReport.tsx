'use client'

// React Imports
import type { MouseEvent } from 'react'
import { useState } from 'react'

// Next Imports
import dynamic from 'next/dynamic'

// MUI Imports
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Grid from '@mui/material/Grid'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import { useTheme } from '@mui/material/styles'

// Third Party Imports
import type { ApexOptions } from 'apexcharts'

// Components Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Styled Component Imports
const AppReactApexCharts = dynamic(() => import('@/libs/styles/AppReactApexCharts'))

// Vars
const yearOptions = [new Date().getFullYear() - 1, new Date().getFullYear() - 2, new Date().getFullYear() - 3]

const barSeries = [
  { name: '2022', data: [25, 20, 15, 17, 23, 29, 23, 25, 10] },
  { name: '2021', data: [-12, -15, -19, -16, -8, -5, -8, -13, -19] }
]

const radialSeries = [78]

const TotalRevenueReport = () => {
  // States
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  // Vars
  const disabledText = 'var(--mui-palette-text-disabled)'

  // Hooks
  const theme = useTheme()

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const barOptions: ApexOptions = {
    chart: {
      stacked: true,
      parentHeightOffset: 0,
      toolbar: { show: false }
    },
    tooltip: { enabled: false },
    dataLabels: { enabled: false },
    stroke: {
      width: 6,
      colors: ['var(--mui-palette-background-paper)']
    },
    colors: ['var(--mui-palette-primary-main)', 'var(--mui-palette-info-main)'],
    legend: {
      offsetY: -4,
      offsetX: -35,
      position: 'top',
      horizontalAlign: 'left',
      fontSize: '13px',
      fontFamily: theme.typography.fontFamily,
      labels: { colors: 'var(--mui-palette-text-secondary)' },
      itemMargin: {
        horizontal: 9
      },
      markers: {
        width: 12,
        height: 12,
        radius: 10,
        offsetY: 1,
        offsetX: theme.direction === 'rtl' ? 7 : -4
      }
    },
    states: {
      hover: {
        filter: { type: 'none' }
      },
      active: {
        filter: { type: 'none' }
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 7,
        columnWidth: '40%',
        borderRadiusApplication: 'around',
        borderRadiusWhenStacked: 'all'
      }
    },
    grid: {
      borderColor: 'var(--mui-palette-divider)',
      yaxis: {
        lines: { show: false }
      },
      padding: {
        left: -6,
        right: -11,
        bottom: -11
      }
    },
    xaxis: {
      axisTicks: { show: false },
      crosshairs: { opacity: 0 },
      axisBorder: { show: false },
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      labels: {
        style: {
          colors: disabledText,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.body2.fontSize as string
        }
      }
    },
    yaxis: {
      tickAmount: 5,
      max: 30,
      min: -20,

      labels: {
        offsetX: -14,
        style: {
          colors: disabledText,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.body2.fontSize as string
        }
      }
    },
    responsive: [
      {
        breakpoint: theme.breakpoints.values.xl,
        options: {
          plotOptions: {
            bar: { columnWidth: '48%' }
          }
        }
      },
      {
        breakpoint: 1380,
        options: {
          plotOptions: {
            bar: { columnWidth: '55%' }
          }
        }
      },
      {
        breakpoint: theme.breakpoints.values.lg,
        options: {
          plotOptions: {
            bar: { borderRadius: 7 }
          }
        }
      },
      {
        breakpoint: theme.breakpoints.values.md,
        options: {
          plotOptions: {
            bar: { columnWidth: '50%' }
          }
        }
      },
      {
        breakpoint: 680,
        options: {
          plotOptions: {
            bar: { columnWidth: '60%' }
          }
        }
      },
      {
        breakpoint: theme.breakpoints.values.sm,
        options: {
          plotOptions: {
            bar: { columnWidth: '55%' }
          }
        }
      },
      {
        breakpoint: 450,
        options: {
          plotOptions: {
            bar: { borderRadius: 6, columnWidth: '65%' }
          }
        }
      }
    ]
  }

  const radialOptions: ApexOptions = {
    chart: { sparkline: { enabled: true } },
    labels: ['Growth'],
    stroke: { dashArray: 5 },
    colors: ['var(--mui-palette-primary-main)'],
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } }
    },
    grid: {
      padding: {
        top: -20,
        bottom: -18,
        left: 15,
        right: 15
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'dark',
        opacityTo: 0.6,
        opacityFrom: 1,
        shadeIntensity: 0.5,
        stops: [30, 70, 100],
        inverseColors: false,
        gradientToColors: ['var(--mui-palette-primary-main)']
      }
    },
    plotOptions: {
      radialBar: {
        endAngle: 150,
        startAngle: -140,
        hollow: { size: '55%' },
        track: { background: 'transparent' },
        dataLabels: {
          name: {
            offsetY: 30,
            fontSize: '15px',
            fontWeight: 500,
            color: 'var(--mui-palette-text-secondary)',
            fontFamily: 'Public Sans'
          },
          value: {
            offsetY: -10,
            fontWeight: 500,
            fontSize: '24px',
            formatter: value => `${value}%`,
            color: 'var(--mui-palette-text-primary)',
            fontFamily: 'Public Sans'
          }
        }
      }
    },
    responsive: [
      {
        breakpoint: 1305,
        options: {
          plotOptions: {
            radialBar: {
              hollow: {
                size: '40%'
              }
            }
          }
        }
      },
      {
        breakpoint: 1200,
        options: {
          plotOptions: {
            radialBar: {
              hollow: {
                size: '55%'
              }
            }
          }
        }
      }
    ]
  }

  return (
    <Card>
      <Grid container>
        <Grid size={{ xs: 12, md: 8 }} className='md:border-ie border-be'>
          <CardHeader title='Total Revenue' />
          <CardContent>
            <AppReactApexCharts type='bar' height={342} width='100%' series={barSeries} options={barOptions} />
          </CardContent>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <CardContent className='flex flex-col items-center justify-center min-bs-full gap-y-6'>
            <Button variant='tonal' onClick={handleClick} endIcon={<i className='bx-chevron-down text-xl' />}>
              {new Date().getFullYear() - 1}
            </Button>
            <Menu
              keepMounted
              anchorEl={anchorEl}
              onClose={handleClose}
              open={Boolean(anchorEl)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {yearOptions.map((year: number) => (
                <MenuItem key={year} onClick={handleClose}>
                  {year}
                </MenuItem>
              ))}
            </Menu>

            <AppReactApexCharts
              type='radialBar'
              height={260}
              width='100%'
              series={radialSeries}
              options={radialOptions}
            />
            <Typography className='font-medium'>62% Company Growth</Typography>
            <div className='flex items-center justify-between lg:flex-col xl:flex-row gap-x-6 gap-y-4'>
              <div className='flex items-center gap-x-2'>
                <CustomAvatar variant='rounded' skin='light' color='primary'>
                  <i className='bx-dollar' />
                </CustomAvatar>
                <div>
                  <Typography variant='body2'>2022</Typography>
                  <Typography variant='h6'>$32.5k</Typography>
                </div>
              </div>
              <div className='flex items-center gap-x-2'>
                <CustomAvatar variant='rounded' color='info' skin='light'>
                  <i className='bx-wallet' />
                </CustomAvatar>
                <div>
                  <Typography variant='body2'>2023</Typography>
                  <Typography variant='h6'>$41.1k</Typography>
                </div>
              </div>
            </div>
          </CardContent>
        </Grid>
      </Grid>
    </Card>
  )
}

export default TotalRevenueReport
