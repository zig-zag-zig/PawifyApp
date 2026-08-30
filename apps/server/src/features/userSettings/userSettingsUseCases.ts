import { userSettingsDependencies } from './infrastructure/userSettingsDependencies.js';
import { createGetReleaseNotificationSettingsUseCase } from './usecases/getReleaseNotificationSettings.js';
import { createUpdateReleaseNotificationSettingsUseCase } from './usecases/updateReleaseNotificationSettings.js';

export const userSettingsUseCases = {
    getReleaseNotificationSettings:
        createGetReleaseNotificationSettingsUseCase(userSettingsDependencies),
    updateReleaseNotificationSettings:
        createUpdateReleaseNotificationSettingsUseCase(userSettingsDependencies),
};
