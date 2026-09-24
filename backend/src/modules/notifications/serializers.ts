import type { Notification } from '../../generated/prisma/client.js'

export const serializeNotification = (notification: Notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  data: notification.data,
  readAt: notification.readAt,
  createdAt: notification.createdAt
})
