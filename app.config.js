const fs = require('fs');
const path = require('path');
const baseConfig = require('./app.json');

const DEVELOPMENT_ONLY_PLUGINS = new Set([
    'expo-dev-client',
]);
const SENTRY_PLUGIN = '@sentry/react-native/expo';

function resolveAppEnv() {
    return process.env.APP_ENV || process.env.NODE_ENV || 'development';
}

function isStandaloneBuild() {
    const appEnv = resolveAppEnv();
    return ['production', 'e2e-test'].includes(appEnv);
}

function getAppName() {
    return isStandaloneBuild() ? baseConfig.expo.name : `${baseConfig.expo.name} Dev`;
}

function getAndroidGoogleServicesFile() {
    const explicitFile = process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim();
    if (explicitFile) {
        return explicitFile;
    }

    const appEnv = resolveAppEnv();
    if (appEnv === 'e2e-test') {
        return './google-services.development.json';
    }

    const envFile = `./google-services.${appEnv}.json`;
    if (fs.existsSync(path.join(__dirname, envFile))) {
        return envFile;
    }

    return baseConfig.expo.android?.googleServicesFile;
}

function getAndroidPackage() {
    return baseConfig.expo.android?.package;
}

function getAndroidConfig() {
    const googleServicesFile = getAndroidGoogleServicesFile();
    const packageName = getAndroidPackage();
    return {
        ...(baseConfig.expo.android ?? {}),
        ...(packageName ? { package: packageName } : {}),
        ...(googleServicesFile ? { googleServicesFile } : {}),
        ...(resolveAppEnv() === 'e2e-test' ? { usesCleartextTraffic: true } : {}),
    };
}

function getPluginName(plugin) {
    return Array.isArray(plugin) ? plugin[0] : plugin;
}

function hasSentryConfig() {
    if (resolveAppEnv() === 'e2e-test') {
        return false;
    }

    return Boolean(
        process.env.EXPO_PUBLIC_SENTRY_DSN
        || process.env.SENTRY_ORG
        || process.env.SENTRY_PROJECT
        || process.env.SENTRY_AUTH_TOKEN,
    );
}

function getPlugins(plugins) {
    const filteredPlugins = isStandaloneBuild()
        ? plugins.filter(plugin => !DEVELOPMENT_ONLY_PLUGINS.has(getPluginName(plugin)))
        : plugins;

    if (!hasSentryConfig() || filteredPlugins.some(plugin => getPluginName(plugin) === SENTRY_PLUGIN)) {
        return filteredPlugins;
    }

    const sentryOptions = {};
    if (process.env.SENTRY_ORG) {
        sentryOptions.organization = process.env.SENTRY_ORG;
    }
    if (process.env.SENTRY_PROJECT) {
        sentryOptions.project = process.env.SENTRY_PROJECT;
    }
    if (process.env.SENTRY_URL) {
        sentryOptions.url = process.env.SENTRY_URL;
    }

    return [
        ...filteredPlugins,
        Object.keys(sentryOptions).length > 0 ? [SENTRY_PLUGIN, sentryOptions] : SENTRY_PLUGIN,
    ];
}

module.exports = ({ config }) => ({
    ...config,
    ...baseConfig.expo,
    name: getAppName(),
    android: getAndroidConfig(),
    extra: {
        ...(baseConfig.expo.extra ?? {}),
        appEnv: resolveAppEnv(),
    },
    plugins: getPlugins(baseConfig.expo.plugins ?? []),
});
