const { withAndroidManifest } = require('@expo/config-plugins');

function resolveAppEnv(config) {
  return process.env.APP_ENV
    || config.extra?.appEnv
    || process.env.NODE_ENV
    || 'development';
}

module.exports = function withAndroidE2eCleartext(config) {
  return withAndroidManifest(config, config => {
    if (resolveAppEnv(config.modResults.manifest) !== 'e2e-test') {
      return config;
    }

    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      return config;
    }

    application.$ = application.$ || {};
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
