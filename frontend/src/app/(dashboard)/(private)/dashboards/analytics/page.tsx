// MUI Imports
import Grid from '@mui/material/Grid'

// Components Imports
import Vertical from '@components/card-statistics/Vertical'
import ActivityTimeline from '@views/dashboards/analytics/ActivityTimeline'
import BarRevenueChart from '@views/dashboards/analytics/BarRevenueChart'
import Congratulations from '@views/dashboards/analytics/Congratulations'
import FinancialStatsTabs from '@views/dashboards/analytics/FinancialStatsTabs'
import LineAreaOrderChart from '@views/dashboards/analytics/LineAreaOrderChart'
import LineProfitReportChart from '@views/dashboards/analytics/LineProfitReportChart'
import OrderStatistics from '@views/dashboards/analytics/OrderStatistics'
import TableWithTabs from '@views/dashboards/analytics/TableWithTabs'
import TotalRevenueReport from '@views/dashboards/analytics/TotalRevenueReport'
import Transactions from '@views/dashboards/analytics/Transactions'

const DashboardAnalytics = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12 }}>
        <Grid container spacing={6}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Congratulations />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <LineAreaOrderChart />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 2 }}>
            <Vertical
              title='Sales'
              imageSrc='/images/cards/wallet-info-bg.png'
              stats='$4,679'
              trendNumber={28.14}
              trend='positive'
            />
          </Grid>
          <Grid size={{ xs: 12, lg: 8 }} order={{ xs: 2, lg: 1 }}>
            <TotalRevenueReport />
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }} order={{ xs: 1, lg: 2 }}>
            <Grid container spacing={6}>
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 6 }}>
                <Vertical
                  title='Payments'
                  imageSrc='/images/cards/paypal-error-bg.png'
                  stats='$2,468'
                  trendNumber={14.82}
                  trend='negative'
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 6 }}>
                <BarRevenueChart />
              </Grid>
              <Grid size={{ xs: 12, md: 4, lg: 12 }}>
                <LineProfitReportChart />
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <OrderStatistics />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <FinancialStatsTabs />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Transactions />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <ActivityTimeline />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <TableWithTabs />
      </Grid>
    </Grid>
  )
}

export default DashboardAnalytics
