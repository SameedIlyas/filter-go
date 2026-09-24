// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import Vertical from '@components/card-statistics/Vertical'
import CustomerRatings from '@views/dashboards/crm/CustomerRatings'
import CustomersTable from '@views/dashboards/crm/CustomersTable'
import DonutChartGeneratedLeads from '@views/dashboards/crm/DonutChartGeneratedLeads'
import EarningReports from '@views/dashboards/crm/EarningReports'
import LineAreaSessionsChart from '@views/dashboards/crm/LineAreaSessionsChart'
import OverviewSalesActivity from '@views/dashboards/crm/OverviewSalesActivity'
import SalesAnalytics from '@views/dashboards/crm/SalesAnalytics'
import SalesByCountries from '@views/dashboards/crm/SalesByCountries'
import SalesStats from '@views/dashboards/crm/SalesStats'
import TeamMembers from '@views/dashboards/crm/TeamMembers'
import TopProducts from '@views/dashboards/crm/TopProducts'

const DashboardCRM = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <CustomerRatings />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <OverviewSalesActivity />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <LineAreaSessionsChart />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <Vertical
              title='order'
              imageSrc='/images/cards/cube-secondary-bg.png'
              stats='$1,286'
              trendNumber={13.24}
              trend='negative'
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 12 }}>
            <DonutChartGeneratedLeads />
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <TopProducts />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <EarningReports />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <SalesAnalytics />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <SalesByCountries />
      </Grid>
      <Grid size={{ xs: 12, md: 6, xl: 4 }}>
        <SalesStats />
      </Grid>
      <Grid size={{ xs: 12, xl: 5 }}>
        <TeamMembers />
      </Grid>
      <Grid size={{ xs: 12, xl: 7 }}>
        <CustomersTable />
      </Grid>
    </Grid>
  )
}

export default DashboardCRM
