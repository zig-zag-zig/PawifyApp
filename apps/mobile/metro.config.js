const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

if (process.env.APP_ENV === 'e2e-test') {
  const { createE2EResolveRequest } = require('./tests/e2e/metroResolveRequest.cjs');
  config.resolver.resolveRequest = createE2EResolveRequest(__dirname);
}

module.exports = config;
