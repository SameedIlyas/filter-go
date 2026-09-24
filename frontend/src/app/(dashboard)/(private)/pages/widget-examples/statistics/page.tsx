// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import HorizontalStatisticsCard from '@views/pages/widget-examples/statistics/HorizontalStatisticsCard'
import CustomerStatisticsCard from '@views/pages/widget-examples/statistics/CustomerStatisticsCard'
import LogisticsStatisticsCard from '@views/apps/logistics/dashboard/LogisticsStatisticsCard'
import UserListCards from '@views/pages/widget-examples/statistics/UserListCards'
import VerticalStatisticsCardWithHeader from '@views/pages/widget-examples/statistics/VerticalStatisticsCardWithHeader'
import VerticalStatisticsCard from '@views/pages/widget-examples/statistics/VerticalStatisticsCard'
import LineAreaOrderChart from '@views/pages/widget-examples/statistics/LineAreaOrderChart'
import BarRevenueChart from '@views/pages/widget-examples/statistics/BarRevenueChart'
import BarProfitChart from '@views/pages/widget-examples/statistics/BarProfitChart'
import LineAreaSessionsChart from '@views/pages/widget-examples/statistics/LineAreaSessionsChart'
import RadialExpensesChart from '@views/pages/widget-examples/statistics/RadialExpensesChart'
import SalesInfoCard from '@views/pages/widget-examples/statistics/SalesInfoCard'
import DonutChartGeneratedLeads from '@views/pages/widget-examples/statistics/DonutChartGeneratedLeads'
import BarExpensesChart from '@views/pages/widget-examples/statistics/BarExpensesChart'
import LineProfitReportChart from '@views/pages/widget-examples/statistics/LineProfitReportChart'
import NewVisitorsAndActivityCharts from '@views/pages/widget-examples/statistics/NewVisitorsAndActivityCharts'

// Data Imports
import { getStatisticsData } from '@/app/server/actions'

/**
 * ! If you need data using an API call, uncomment the below API code, update the `process.env.API_URL` variable in the
 * ! `.env` file found at root of your project and also update the API endpoints like `/pages/widget-examples` in below example.
 * ! Also, remove the above server action import and the action itself from the `src/app/server/actions.ts` file to clean up unused code
 * ! because we've used the server action for getting our static data.
 */

/* const getStatisticsData = async () => {
  // Vars
  const res = await fetch(`${process.env.API_URL}/pages/widget-examples`)

  if (!res.ok) {
    throw new Error('Failed to fetch statistics data')
  }

  return res.json()
} */

const Statistics = async () => {
  // Vars
  const statsData = await getStatisticsData()

  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <UserListCards />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <LogisticsStatisticsCard data={statsData?.statsHorizontalWithBorder} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <HorizontalStatisticsCard data={statsData?.statsHorizontalWithAvatar} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <CustomerStatisticsCard customerStatData={statsData?.customerStats} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <VerticalStatisticsCardWithHeader data={statsData.statsVerticalWithHeader} />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <VerticalStatisticsCard data={statsData.statsVertical} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <LineAreaOrderChart />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <BarRevenueChart />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <BarProfitChart />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <LineAreaSessionsChart />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <RadialExpensesChart />
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 3, xl: 2 }}>
        <SalesInfoCard />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <DonutChartGeneratedLeads />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <BarExpensesChart />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <LineProfitReportChart />
      </Grid>
      <Grid size={{ xs: 12, xl: 8 }}>
        <NewVisitorsAndActivityCharts />
      </Grid>
    </Grid>
  )
}

export default Statistics
