export const notificationEvents = {
    following: 'following',
    releases: 'releases',
    releaseNotificationSettings: 'releaseNotificationSettings',
    taskCompleted: 'taskCompleted',
} as const;

export type NotificationEventName = (typeof notificationEvents)[keyof typeof notificationEvents];
