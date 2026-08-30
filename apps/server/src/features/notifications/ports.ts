interface NewReleaseNotificationGateway {
    notifyNewReleases(): Promise<void>;
}

export type NotificationUseCaseDependencies = {
    newReleaseNotificationGateway: NewReleaseNotificationGateway;
};
