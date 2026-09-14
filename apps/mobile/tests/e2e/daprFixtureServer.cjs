const fs = require('fs');
const http = require('http');
const https = require('https');
const {
  artist,
  artistId,
  artistSearchResponse,
  release,
  releaseGroup,
  releaseGroupId,
  releaseId,
  releaseSearchResponse,
  relatedArtist,
  relatedArtistId,
} = require('./musicFixtures.cjs');

const stateStores = new Map();

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });

  if (response.req?.method === 'HEAD') {
    response.end();
    return;
  }

  response.end(`${JSON.stringify(payload)}\n`);
}

function writeEmpty(response, statusCode) {
  response.writeHead(statusCode);
  response.end();
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on('error', reject);
    request.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

async function readJsonBody(request) {
  const body = await readRequestBody(request);
  if (!body.trim()) {
    return undefined;
  }

  return JSON.parse(body);
}

function decodeDaprInvocation(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const match = url.pathname.match(/^\/v1\.0\/invoke\/([^/]+)\/method(\/.*)?$/);

  if (!match) {
    return null;
  }

  return {
    endpoint: decodeURIComponent(match[1]),
    methodPath: decodeURIComponent(match[2] || '/'),
    searchParams: url.searchParams,
  };
}

function decodeDaprStateRequest(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const match = url.pathname.match(/^\/v1\.0\/state\/([^/]+)(?:\/(.*))?$/);

  if (!match) {
    return null;
  }

  return {
    storeName: decodeURIComponent(match[1]),
    key: match[2] ? decodeURIComponent(match[2]) : null,
  };
}

function decodeDaprSecretRequest(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const match = url.pathname.match(/^\/v1\.0\/secrets\/([^/]+)\/(.+)$/);

  if (!match) {
    return null;
  }

  return {
    storeName: decodeURIComponent(match[1]),
    key: decodeURIComponent(match[2]),
  };
}

function getStateKey(storeName, key) {
  return `${storeName}:${key}`;
}

async function handleDaprState(request, response, stateRequest) {
  const { storeName, key } = stateRequest;

  if (request.method === 'GET' && key) {
    const storedValue = stateStores.get(getStateKey(storeName, key));
    if (storedValue === undefined) {
      writeEmpty(response, 204);
      return;
    }

    writeJson(response, 200, storedValue);
    return;
  }

  if (request.method === 'POST' && !key) {
    const items = await readJsonBody(request);
    if (!Array.isArray(items)) {
      writeJson(response, 400, { error: 'Dapr state save body must be an array' });
      return;
    }

    for (const item of items) {
      if (!item || typeof item.key !== 'string') {
        continue;
      }
      stateStores.set(getStateKey(storeName, item.key), item.value);
    }

    writeEmpty(response, 204);
    return;
  }

  if (request.method === 'DELETE' && key) {
    stateStores.delete(getStateKey(storeName, key));
    writeEmpty(response, 204);
    return;
  }

  writeJson(response, 405, { error: 'Unsupported Dapr state fixture request' });
}

function searchMatchesFixture(query) {
  const normalizedQuery = query.trim().toLowerCase();
  return normalizedQuery.includes('aurora')
    || normalizedQuery.includes('ensemble')
    || normalizedQuery.includes('midnight');
}

// Real-upstream pass-through: when enabled, the musicbrainz, coverartarchive
// and discogs Dapr endpoints are proxied to the live services instead of being
// served from fixtures. State, expo and genius stay local. Discogs needs a
// token (pass secretsFile) and artist images come from Discogs alone.
const REAL_UPSTREAMS = {
  musicbrainz: 'https://musicbrainz.org',
  coverartarchive: 'https://coverartarchive.org',
  discogs: 'https://api.discogs.com',
};

function proxyToRealUpstream(request, response, invocation, baseUrl) {
  const target = `${baseUrl}${invocation.methodPath}${
    invocation.searchParams.size ? `?${invocation.searchParams.toString()}` : ''
  }`;

  // Forward the caller's headers so provider credentials survive the hop
  // (Discogs authenticates with an Authorization header). host/connection are
  // hop-by-hop and must not be relayed.
  const headers = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (name === 'host' || name === 'connection' || name === 'content-length') {
      continue;
    }
    if (value !== undefined) {
      headers[name] = value;
    }
  }
  headers.accept = headers.accept || 'application/json';
  // MusicBrainz requires a descriptive User-Agent; mirror the server's.
  headers['user-agent'] = 'PawifyE2E/1.0 (pawify-e2e@example.test)';

  const transport = target.startsWith('https:') ? https : http;
  const proxy = transport.request(
    target,
    { method: request.method, headers },
    (upstream) => {
      // Pass every upstream header through: Cover Art Archive answers with a
      // 307 redirect to archive.org, so dropping Location would break covers.
      const responseHeaders = { ...upstream.headers };
      delete responseHeaders['transfer-encoding'];
      delete responseHeaders.connection;

      response.writeHead(upstream.statusCode || 502, responseHeaders);
      upstream.pipe(response);
    },
  );

  proxy.on('error', (error) => {
    writeJson(response, 502, { error: `upstream proxy failed: ${error.message}` });
  });

  if (request.method === 'POST' || request.method === 'PUT') {
    request.pipe(proxy);
  } else {
    proxy.end();
  }
}

function handleMusicBrainz(request, response, invocation) {
  const { methodPath, searchParams } = invocation;

  // Release-group search is exercised by the new e2e flows. Serve a fixture
  // entry that matches Aurora/Midnight queries so the Releases tab has a row.
  if (methodPath === '/ws/2/release-group') {
    const query = (searchParams.get('query') || '').trim().toLowerCase();
    const matches = query.includes('midnight') || query.includes('aurora') || query.includes('signal');
    writeJson(response, 200, {
      'release-groups': matches ? [releaseGroup] : [],
      count: matches ? 1 : 0,
    });
    return;
  }

  if (request.method === 'HEAD') {
    writeEmpty(response, methodPath === `/ws/2/release/${releaseId}` ? 200 : 404);
    return;
  }

  if (methodPath === '/ws/2/artist') {
    const query = searchParams.get('query') || '';
    writeJson(response, 200, searchMatchesFixture(query)
      ? artistSearchResponse
      : { artists: [], count: 0 });
    return;
  }

  if (methodPath === `/ws/2/artist/${artistId}`) {
    writeJson(response, 200, artist);
    return;
  }

  // A second artist used by the related-artists e2e flow. The fixture artist
  // lists it in `relations` (member-of), so the app can navigate to it.
  if (methodPath === `/ws/2/artist/${relatedArtistId}`) {
    writeJson(response, 200, relatedArtist);
    return;
  }

  if (methodPath === '/ws/2/release') {
    if (
      searchParams.get('artist') === artistId
      || searchParams.get('release-group') === releaseGroupId
    ) {
      writeJson(response, 200, releaseSearchResponse);
      return;
    }

    writeJson(response, 200, { releases: [], 'release-count': 0 });
    return;
  }

  if (methodPath === `/ws/2/release/${releaseId}`) {
    writeJson(response, 200, release);
    return;
  }

  writeJson(response, 404, { error: `No MusicBrainz fixture for ${methodPath}` });
}

function handleCoverArtArchive(request, response) {
  writeEmpty(response, request.method === 'HEAD' ? 404 : 404);
}

function handleExpo(response, invocation) {
  if (invocation.methodPath === '/--/api/v2/push/getReceipts') {
    writeJson(response, 200, { data: {} });
    return;
  }

  writeJson(response, 200, { data: [] });
}

/**
 * Optional secret store. When a secretsFile is provided, Dapr secret lookups
 * are answered from it (keys not present still 404) so flows/manual runs that
 * need provider credentials - e.g. artist images, which come from Discogs -
 * can resolve them. Without the option, every lookup 404s as before.
 */
function handleDaprSecret(response, secretRequest, secrets) {
  const value = secrets?.[secretRequest.key];

  if (typeof value !== 'string' || value.length === 0) {
    writeJson(response, 404, { error: `No secret fixture for ${secretRequest.key}` });
    return;
  }

  writeJson(response, 200, { [secretRequest.key]: value });
}

function loadSecretsFile(secretsFilePath) {
  if (!secretsFilePath) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(secretsFilePath, 'utf8'));
  } catch (error) {
    console.warn(`[fixture] could not read secrets file ${secretsFilePath}: ${error.message}`);
    return null;
  }
}

function handleOptionalJsonService(response) {
  writeJson(response, 404, { error: 'No fixture' });
}

function createDaprFixtureHandler(useRealUpstreams, secrets) {
  return async (request, response) => {
    const stateRequest = decodeDaprStateRequest(request.url || '/');
    if (stateRequest) {
      await handleDaprState(request, response, stateRequest);
      return;
    }

    const secretRequest = decodeDaprSecretRequest(request.url || '/');
    if (secretRequest) {
      handleDaprSecret(response, secretRequest, secrets);
      return;
    }

    const invocation = decodeDaprInvocation(request.url || '/');

    if (!invocation) {
      writeJson(response, 404, { error: 'Not a Dapr invoke URL' });
      return;
    }

    if (useRealUpstreams && REAL_UPSTREAMS[invocation.endpoint]) {
      proxyToRealUpstream(request, response, invocation, REAL_UPSTREAMS[invocation.endpoint]);
      return;
    }

    switch (invocation.endpoint) {
      case 'musicbrainz':
        handleMusicBrainz(request, response, invocation);
        return;
      case 'coverartarchive':
        handleCoverArtArchive(request, response);
        return;
      case 'expo':
        handleExpo(response, invocation);
        return;
      case 'discogs':
      case 'genius':
        handleOptionalJsonService(response);
        return;
      default:
        writeJson(response, 404, { error: `No Dapr fixture endpoint ${invocation.endpoint}` });
    }
  };
}

async function startDaprFixtureServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 0;
  const handler = createDaprFixtureHandler(
    options.useRealUpstreams === true,
    loadSecretsFile(options.secretsFile),
  );
  const server = http.createServer((request, response) => {
    handler(request, response).catch((error) => {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Dapr fixture server did not expose a TCP address');
  }

  return {
    url: `http://${host}:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    }),
  };
}

module.exports = {
  createDaprFixtureHandler,
  decodeDaprInvocation,
  decodeDaprStateRequest,
  startDaprFixtureServer,
};
