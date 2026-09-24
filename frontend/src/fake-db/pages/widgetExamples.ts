import type { CardStatsType } from '@/types/pages/widgetTypes'

export const db: CardStatsType = {
  statsHorizontalWithAvatar: [
    {
      stats: '$24,983',
      title: 'Total Earning',
      avatarIcon: 'bx-dollar',
      avatarColor: 'primary',
      avatarSize: 40
    },
    {
      stats: '$8,647',
      title: 'Unpaid Earning',
      avatarIcon: 'bx-gift',
      avatarColor: 'success',
      avatarSize: 40
    },
    {
      stats: '2,367',
      title: 'Signups',
      avatarIcon: 'bx-group',
      avatarColor: 'error',
      avatarSize: 40
    },
    {
      stats: '4.5%',
      title: 'Conversion Rate',
      avatarIcon: 'bx-infinite',
      avatarColor: 'info',
      avatarSize: 40
    }
  ],
  statsHorizontalWithBorder: [
    {
      title: 'On route vehicles',
      stats: 42,
      trendNumber: 18.2,
      avatarIcon: 'bx-bxs-truck',
      color: 'primary'
    },
    {
      title: 'Vehicles with errors',
      stats: 8,
      trendNumber: -8.7,
      avatarIcon: 'bx-error',
      color: 'warning'
    },
    {
      title: 'Deviated from route',
      stats: 27,
      trendNumber: 4.3,
      avatarIcon: 'bx-git-repo-forked',
      color: 'error'
    },
    {
      title: 'Late vehicles',
      stats: 13,
      trendNumber: 2.5,
      avatarIcon: 'bx-time-five',
      color: 'info'
    }
  ],
  customerStats: [
    {
      color: 'primary',
      avatarIcon: 'bx-dollar',
      title: 'account balance',
      stats: '$7480',
      content: ' Credit Left',
      description: 'Account balance for next purchase'
    },
    {
      color: 'success',
      avatarIcon: 'bx-gift',
      title: 'loyalty program',
      chipLabel: 'Platinum member',
      description: '3000 points to next tier'
    },
    {
      color: 'warning',
      avatarIcon: 'bx-star',
      title: 'wishlist',
      stats: '15',
      content: 'Items in wishlist',
      description: 'Receive notifications on price drops'
    },
    {
      color: 'info',
      avatarIcon: 'bx-crown',
      title: 'coupons',
      stats: '21',
      content: 'Coupons you win',
      description: 'Use coupon on next purchase'
    }
  ],
  statsVerticalWithHeader: [
    {
      title: 'Total Sales',
      avatarColor: 'primary',
      avatarIcon: 'bx-trending-up',
      stats: '8,642',
      trendNumber: 29,
      subtitle: '12% of target',
      trend: 'positive',
      avatarSize: 46,
      avatarSkin: 'light'
    },
    {
      title: 'Referral Income',
      avatarColor: 'info',
      avatarIcon: 'bx-dollar',
      stats: '$1,271',
      trendNumber: 23,
      subtitle: '34% of target',
      trend: 'negative',
      avatarSize: 46,
      avatarSkin: 'light'
    },
    {
      title: 'Customers',
      avatarColor: 'success',
      avatarIcon: 'bx-user',
      stats: '24,680',
      trendNumber: 42,
      subtitle: '29% of target',
      trend: 'positive',
      avatarSize: 46,
      avatarSkin: 'light'
    },
    {
      title: 'Orders Received',
      avatarColor: 'warning',
      avatarIcon: 'bx-shopping-bag',
      stats: '1,862',
      trendNumber: 82,
      subtitle: '47% of target',
      trend: 'positive',
      avatarSize: 46,
      avatarSkin: 'light'
    }
  ],
  statsVertical: [
    {
      title: 'Transactions',
      imageSrc: '/images/cards/credit-card-primary-bg.png',
      stats: '$14,854',
      trendNumber: 62,
      trend: 'positive'
    },
    {
      title: 'Order',
      imageSrc: '/images/cards/cube-secondary-bg.png',
      stats: '$1,286',
      trendNumber: 13.24,
      trend: 'negative'
    },
    {
      title: 'Profit',
      imageSrc: '/images/cards/chart-success-bg.png',
      stats: '$12,638',
      trendNumber: 72.8,
      trend: 'positive'
    },
    {
      title: 'Payments',
      imageSrc: '/images/cards/paypal-error-bg.png',
      stats: '$2,468',
      trendNumber: 14.82,
      trend: 'negative'
    },
    {
      title: 'Revenue',
      imageSrc: '/images/cards/desktop-warning-bg.png',
      stats: '$42,389',
      trendNumber: 52.18,
      trend: 'positive'
    },
    {
      title: 'Sales',
      imageSrc: '/images/cards/wallet-info-bg.png',
      stats: '$4,679',
      trendNumber: 28.14,
      trend: 'positive'
    }
  ]
}
