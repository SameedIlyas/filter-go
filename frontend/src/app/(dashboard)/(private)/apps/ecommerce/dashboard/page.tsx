// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import Vertical from '@components/card-statistics/Vertical'
import Performance from '@views/apps/ecommerce/dashboard//Performance'
import Award from '@views/apps/ecommerce/dashboard/Award'
import BarExpensesChart from '@views/apps/ecommerce/dashboard/BarExpensesChart'
import BarProfitChart from '@views/apps/ecommerce/dashboard/BarProfitChart'
import ConversionRate from '@views/apps/ecommerce/dashboard/ConversionRate'
import CustomersTable from '@views/apps/ecommerce/dashboard/CustomersTable'
import NewVisitorsAndActivityCharts from '@views/apps/ecommerce/dashboard/NewVisitorsAndActivityCharts'
import RadialExpensesChart from '@views/apps/ecommerce/dashboard/RadialExpensesChart'
import SalesInfoCard from '@views/apps/ecommerce/dashboard/SalesInfoCard'
import TotalBalance from '@views/apps/ecommerce/dashboard/TotalBalance'
import TotalIncome from '@views/apps/ecommerce/dashboard/TotalIncome'

const EcommerceDashboard = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Award />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <NewVisitorsAndActivityCharts />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <Vertical
              title='Sales'
              imageSrc='/images/cards/wallet-info-bg.png'
              stats='$4,679'
              trendNumber={28.14}
              trend='positive'
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <BarProfitChart />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <RadialExpensesChart />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <Vertical
              title='Transactions'
              imageSrc='/images/cards/credit-card-primary-bg.png'
              stats='$14,854'
              trendNumber={62}
              trend='positive'
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <TotalIncome />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <Performance />
      </Grid>
      <Grid size={{ xs: 12, md: 6, lg: 4 }}>
        <ConversionRate />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <Vertical
              title='Revenue'
              imageSrc='/images/cards/mac-warning-bg.png'
              stats='$42,389'
              trendNumber={52.18}
              trend='positive'
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3, lg: 6 }}>
            <SalesInfoCard />
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 12 }}>
            <BarExpensesChart />
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, lg: 8 }}>
        <CustomersTable />
      </Grid>
      <Grid size={{ xs: 12, lg: 4 }}>
        <TotalBalance />
      </Grid>
    </Grid>
  )
}

export default EcommerceDashboard
