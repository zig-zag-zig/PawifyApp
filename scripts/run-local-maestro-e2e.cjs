#!/usr/bin/env node

const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { generateKeyPairSync } = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { startDaprFixtureServer } = require('../tests/e2e/daprFixtureServer.cjs');

const appRoot = path.resolve(__dirname, '..');
const backendRoot = path.resolve(appRoot, '..', 'Pawify');
const backendPort = Number(process.env.PAWIFY_E2E_BACKEND_PORT || 10000);
const firebaseProject = process.env.PAWIFY_E2E_FIREBASE_PROJECT || 'demo-pawify-e2e';
const firebaseAuthHost = process.env.PAWIFY_E2E_FIREBASE_AUTH_HOST || '127.0.0.1:9199';
const firestoreHost = process.env.PAWIFY_E2E_FIRESTORE_HOST || '127.0.0.1:8180';
const firebaseDatabaseHost = process.env.PAWIFY_E2E_FIREBASE_DATABASE_HOST || '127.0.0.1:9100';
const firebaseHubHost = process.env.PAWIFY_E2E_FIREBASE_HUB_HOST || '127.0.0.1:4402';
const insideEmulators = process.argv.includes('--inside-emulators');

class CommandError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function getMaestroTarget() {
  const explicitFlow = getArgValue('--flow');
  if (explicitFlow) {
    return explicitFlow;
  }

  return process.argv.includes('--smoke') ? '.maestro/smoke.yaml' : '.maestro';
}

const maestroTarget = getMaestroTarget();

function parseEmulatorHost(value, label) {
  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new CommandError(`[e2e] ${label} must be host:port`);
  }

  if (parsed.protocol !== 'http:' || !parsed.hostname || !parsed.port || parsed.pathname !== '/') {
    throw new CommandError(`[e2e] ${label} must be host:port`);
  }

  return {
    host: parsed.hostname,
    port: Number(parsed.port),
  };
}

function createFirebaseEmulatorConfig() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-e2e-firebase-'));
  const configPath = path.join(configDir, 'firebase.json');
  const config = {
    emulators: {
      auth: parseEmulatorHost(firebaseAuthHost, 'PAWIFY_E2E_FIREBASE_AUTH_HOST'),
      firestore: parseEmulatorHost(firestoreHost, 'PAWIFY_E2E_FIRESTORE_HOST'),
      database: parseEmulatorHost(firebaseDatabaseHost, 'PAWIFY_E2E_FIREBASE_DATABASE_HOST'),
      hub: parseEmulatorHost(firebaseHubHost, 'PAWIFY_E2E_FIREBASE_HUB_HOST'),
    },
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { configDir, configPath };
}

function createE2EFirebaseServiceAccountJson() {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  return JSON.stringify({
    project_id: firebaseProject,
    client_email: `firebase-adminsdk-e2e@${firebaseProject}.iam.gserviceaccount.com`,
    private_key: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
  });
}

const backendEnv = {
  ...process.env,
  E2E_EMAIL: process.env.E2E_EMAIL || `pawify-e2e-${Date.now().toString(36)}@example.test`,
  E2E_MUSIC_EMAIL: process.env.E2E_MUSIC_EMAIL || `pawify-e2e-music-${Date.now().toString(36)}@example.test`,
  APP_ENV: 'e2e-test',
  NODE_ENV: 'development',
  DEBUG: '',
  PORT: String(backendPort),
  LOG_LEVEL: process.env.E2E_BACKEND_LOG_LEVEL || 'error',
  SENTRY_ENABLED: 'false',
  FIREBASE_USE_EMULATOR: 'true',
  FIREBASE_PROJECT_ID: firebaseProject,
  GCLOUD_PROJECT: firebaseProject,
  FIREBASE_DATABASE_URL: `https://${firebaseProject}-default-rtdb.firebaseio.com`,
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || createE2EFirebaseServiceAccountJson(),
  FIREBASE_AUTH_EMULATOR_HOST: firebaseAuthHost,
  FIRESTORE_EMULATOR_HOST: firestoreHost,
  FIREBASE_DATABASE_EMULATOR_HOST: firebaseDatabaseHost,
};

function readBackendScripts() {
  try {
    return require(path.join(backendRoot, 'package.json')).scripts ?? {};
  } catch {
    return {};
  }
}

function getBackendBuildScript() {
  const scripts = readBackendScripts();
  if (scripts['build:unchecked']) {
    return 'build:unchecked';
  }
  if (scripts.build) {
    return 'build';
  }

  throw new CommandError('[e2e] Pawify backend is missing an npm build script');
}

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? appRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  });

  if (result.error) {
    throw new CommandError(`[e2e] Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new CommandError(`[e2e] ${command} exited with status ${result.status}`, result.status ?? 1);
  }
  return result;
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? appRoot,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    child.on('error', (error) => {
      reject(new CommandError(`[e2e] Failed to run ${command}: ${error.message}`));
    });
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new CommandError(`[e2e] ${command} exited with signal ${signal}`, 1));
        return;
      }
      if (code !== 0) {
        reject(new CommandError(`[e2e] ${command} exited with status ${code}`, code ?? 1));
        return;
      }
      resolve();
    });
  });
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        retry();
      });

      request.on('error', retry);
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 500);
    };

    attempt();
  });
}

function checkPortInUse(host, port) {
  return new Promise((resolve) => {
    const client = net.createConnection({ host, port }, () => {
      client.destroy();
      resolve(true);
    });
    client.on('error', () => resolve(false));
  });
}

function waitForUrlOrChildExit(url, child, childLabel, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      reject(new CommandError(
        `[e2e] ${childLabel} exited with code ${child.exitCode} before health check started`
      ));
      return;
    }
    if (child.signalCode !== null) {
      reject(new CommandError(
        `[e2e] ${childLabel} was killed (signal ${child.signalCode}) before health check started`
      ));
      return;
    }

    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          resolve();
          return;
        }
        retry();
      });

      request.on('error', retry);
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (child.exitCode !== null) {
        reject(new CommandError(
          `[e2e] ${childLabel} exited with code ${child.exitCode} before health check succeeded`
        ));
        return;
      }
      if (child.signalCode !== null) {
        reject(new CommandError(
          `[e2e] ${childLabel} was killed (signal ${child.signalCode}) before health check succeeded`
        ));
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 500);
    };

    attempt();
  });
}

function stopChild(child, label) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(killTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        console.warn(`[e2e] ${label} did not stop after SIGTERM; sending SIGKILL`);
        child.kill('SIGKILL');
      }
    }, 5000);

    child.once('exit', finish);
    console.log(`[e2e] stopping ${label}`);
    child.kill('SIGTERM');
  });
}

async function runInsideEmulators() {
  const daprFixtureServer = process.env.PAWIFY_E2E_USE_DAPR_FIXTURES === 'false'
    ? null
    : await startDaprFixtureServer();
  const e2eBackendEnv = {
    ...backendEnv,
    ...(daprFixtureServer ? { DAPR_HTTP_ENDPOINT: daprFixtureServer.url } : {}),
  };

  if (daprFixtureServer) {
    console.log(`[e2e] Dapr fixtures=${daprFixtureServer.url}`);
  }

  const portInUse = await checkPortInUse('127.0.0.1', backendPort);
  if (portInUse) {
    throw new CommandError(
      `[e2e] Port ${backendPort} is already in use. Please stop any existing process on :${backendPort} (e.g., docker pawify-api) before running e2e tests.\n` +
      `  Try: docker ps --filter publish=${backendPort}  or  lsof -i :${backendPort}`
    );
  }

  runSync('npm', ['run', getBackendBuildScript()], { cwd: backendRoot, env: e2eBackendEnv });

  const backend = spawn(process.execPath, ['--enable-source-maps', 'lib/index.js'], {
    cwd: backendRoot,
    env: e2eBackendEnv,
    stdio: 'inherit',
  });

  const stopBackend = () => stopChild(backend, 'Pawify backend');
  const stopAndExit = (exitCode) => {
    stopBackend().finally(() => process.exit(exitCode));
  };
  const onSigint = () => stopAndExit(130);
  const onSigterm = () => stopAndExit(143);

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    await waitForUrlOrChildExit(`http://127.0.0.1:${backendPort}/v1/health`, backend, 'Pawify backend');
    await runAsync('node', ['scripts/run-maestro.cjs', maestroTarget], { cwd: appRoot, env: e2eBackendEnv });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await stopBackend();
    if (daprFixtureServer) {
      console.log('[e2e] stopping Dapr fixtures');
      await daprFixtureServer.close();
    }
  }
}

function reportAndExit(error) {
  console.error(`[e2e] ${error.message}`);
  process.exit(error.exitCode ?? 1);
}

if (!insideEmulators) {
  const emulatorConfig = createFirebaseEmulatorConfig();
  const commandArgs = [process.execPath, __filename, '--inside-emulators'];
  if (process.argv.includes('--smoke')) {
    commandArgs.push('--smoke');
  }
  const explicitFlow = getArgValue('--flow');
  if (explicitFlow) {
    commandArgs.push('--flow', explicitFlow);
  }
  const command = commandArgs.map(arg => JSON.stringify(arg)).join(' ');

  try {
    runSync('npx', [
      'firebase',
      '--config',
      emulatorConfig.configPath,
      'emulators:exec',
      '--project',
      firebaseProject,
      '--only',
      'auth,firestore,database',
      command,
    ], {
      env: backendEnv,
    });
  } catch (error) {
    reportAndExit(error);
  } finally {
    fs.rmSync(emulatorConfig.configDir, { recursive: true, force: true });
  }
} else {
  runInsideEmulators().catch(reportAndExit);
}
