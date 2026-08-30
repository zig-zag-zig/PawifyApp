const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Monorepo root so Metro can resolve @pawify/shared (workspace packages live outside apps/mobile)
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.resolver.unstable_enablePackageExports = false;

// Expo monorepo pattern: watch shared packages, but keep node_modules single-rooted
// (only apps/mobile/node_modules) so Metro resolves one copy of each dependency.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
];

if (process.env.APP_ENV === 'e2e-test') {
  const { createE2EResolveRequest } = require('./tests/e2e/metroResolveRequest.cjs');
  config.resolver.resolveRequest = createE2EResolveRequest(projectRoot);
}

module.exports = config;
