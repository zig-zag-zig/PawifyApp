import { NativeModules, Platform } from 'react-native';

const { ApkInstallerModule } = NativeModules;

const hasMethod = (method: string): boolean => (
  Platform.OS === 'android' && typeof ApkInstallerModule?.[method] === 'function'
);

export const androidApkInstaller = {
  isAvailable: (): boolean => hasMethod('installApk'),

  canRequestPackageInstalls: async (): Promise<boolean> => {
    if (!hasMethod('canRequestPackageInstalls')) return true;
    return Boolean(await ApkInstallerModule.canRequestPackageInstalls());
  },

  openInstallPermissionSettings: async (): Promise<void> => {
    if (!hasMethod('openInstallPermissionSettings')) return;
    await ApkInstallerModule.openInstallPermissionSettings();
  },

  installApk: async (contentUri: string): Promise<void> => {
    if (!hasMethod('installApk')) {
      throw new Error('APK installer is not available in this build');
    }

    await ApkInstallerModule.installApk(contentUri);
  },
};
