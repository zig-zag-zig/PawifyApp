const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const requiredPublicEnvKeys = [
  'EXPO_PUBLIC_API_BASE_URL',
];

function resolveAppEnv() {
  const explicitEnv = process.env.APP_ENV || process.env.EXPO_ENV || process.env.EAS_BUILD_PROFILE;
  if (explicitEnv) {
    return explicitEnv;
  }

  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

function assertSafeAppEnv(appEnv) {
  if (!/^[a-z0-9_-]+$/i.test(appEnv)) {
    throw new Error(`Invalid APP_ENV "${appEnv}". Use letters, numbers, hyphens, or underscores.`);
  }
}

function loadAppEnv({
  projectRoot = path.resolve(__dirname, '..'),
  appEnv = resolveAppEnv(),
  override = true,
  silent = false,
} = {}) {
  assertSafeAppEnv(appEnv);
  process.env.APP_ENV = appEnv;
  const loadedFiles = [];
  const loadedKeys = new Set();
  const envFileNames = [
    '.env',
    '.env.local',
    `.env.${appEnv}`,
    `.env.${appEnv}.local`,
  ];

  for (const envFileName of envFileNames) {
    const envFile = path.join(projectRoot, envFileName);
    if (!fs.existsSync(envFile)) {
      continue;
    }

    const result = dotenv.config({
      path: envFile,
      override,
    });

    if (result.error) {
      throw result.error;
    }

    Object.keys(result.parsed ?? {}).forEach(key => loadedKeys.add(key));
    loadedFiles.push(envFile);
  }

  process.env.APP_ENV = appEnv;

  if (!silent) {
    const relativeFiles = loadedFiles.map(filePath => path.relative(projectRoot, filePath));
    console.log(`[env] APP_ENV=${appEnv}`);
    console.log(`[env] loaded=${relativeFiles.length > 0 ? relativeFiles.join(', ') : '(none)'}`);
  }

  return {
    appEnv,
    loadedFiles,
    loadedKeys: [...loadedKeys],
  };
}

function getMissingRequiredPublicEnvKeys() {
  return requiredPublicEnvKeys.filter((key) => {
    const value = process.env[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });
}

module.exports = {
  getMissingRequiredPublicEnvKeys,
  loadAppEnv,
};
