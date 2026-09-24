// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import ActivityTimeline from '@views/pages/widget-examples/advanced/ActivityTimeline'
import AssignmentProgress from '@views/pages/widget-examples/advanced/AssignmentProgress'
import BusinessSharks from '@views/pages/widget-examples/advanced/BusinessSharks'
import ConversionRate from '@views/pages/widget-examples/advanced/ConversionRate'
import DeliveryPerformance from '@views/pages/widget-examples/advanced/DeliveryPerformance'
import EarningReports from '@views/pages/widget-examples/advanced/EarningReports'
import EmployeeList from '@views/pages/widget-examples/advanced/EmployeeList'
import FinanceSummary from '@views/pages/widget-examples/advanced/FinanceSummary'
import OrdersByCountries from '@views/pages/widget-examples/advanced/OrdersByCountries'
import OrderStatistics from '@views/pages/widget-examples/advanced/OrderStatistics'
import PaymentData from '@views/pages/widget-examples/advanced/PaymentData'
import PopularInstructors from '@views/pages/widget-examples/advanced/PopularInstructors'
import SalesByCountries from '@views/pages/widget-examples/advanced/SalesByCountries'
import SharedEvent from '@views/pages/widget-examples/advanced/SharedEvent'
import TableWithTabs from '@views/pages/widget-examples/advanced/TableWithTabs'
import TeamMembers from '@views/pages/widget-examples/advanced/TeamMembers'
import TopCourses from '@views/pages/widget-examples/advanced/TopCourses'
import TopProducts from '@views/pages/widget-examples/advanced/TopProducts'
import Transactions from '@views/pages/widget-examples/advanced/Transactions'
import UpcomingWebinar from '@views/pages/widget-examples/advanced/UpcomingWebinar'
import UpgradePlan from '@views/pages/widget-examples/advanced/UpgradePlan'

const Advanced = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <EmployeeList />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <Transactions />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <SharedEvent />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <PaymentData />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <BusinessSharks />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <UpgradePlan />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <SalesByCountries />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <OrderStatistics />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <EarningReports />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <TopCourses />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <UpcomingWebinar />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <AssignmentProgress />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <DeliveryPerformance />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <OrdersByCountries />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <PopularInstructors />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <ConversionRate />
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <TopProducts />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TeamMembers />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TableWithTabs />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ActivityTimeline />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <FinanceSummary />
      </Grid>
    </Grid>
  )
}

export default Advanced
