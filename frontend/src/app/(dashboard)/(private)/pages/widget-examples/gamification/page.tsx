// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import Award from '@views/pages/widget-examples/gamification/Award'
import Congratulations from '@views/pages/widget-examples/gamification/Congratulations'
import UpgradeAccount from '@views/pages/widget-examples/gamification/UpgradeAccount'
import WelcomeBack from '@views/pages/widget-examples/gamification/WelcomeBack'

const Gamification = () => {
  return (
    <Grid container spacing={6}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Award />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <Congratulations />
      </Grid>
      <Grid size={{ xs: 12, md: 8 }}>
        <WelcomeBack />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <UpgradeAccount />
      </Grid>
    </Grid>
  )
}

export default Gamification
