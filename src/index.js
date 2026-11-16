import { types, randomJoke, randomTen, randomSelect, jokeByType, jokeById, count } from './jokes.js';

const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';

// Same wording as the old limiting-middleware message (typo included), with the binding's window.
const RATE_LIMIT_MESSAGE =
  'Your ip has exceeded the 100 request limit per 1 minute(s). Try again in in 1 minute(s).';

const html = (body, status = 200) => ({ status, type: HTML, body });
const json = (value, status = 200) => ({ status, type: JSON_TYPE, body: JSON.stringify(value) });
const error = (status, message) => json({ type: 'error', message }, status);

const randomNumberOfJokes = ({ num }) => {
  const n = parseInt(num);
  if (!n) return html('The passed path is not a number.');
  if (n > count) return html(`The passed path exceeds the number of jokes (${count}).`);
  return json(randomSelect(n));
};

const jokeWithId = ({ id }) => {
  const joke = jokeById(+id);
  return joke ? json(joke) : error(404, 'joke not found');
};

// Order matters: the first match wins, as in the Express app this replaces.
const routes = [
  ['/', () => html('Try /random_joke, /random_ten, /jokes/random, or /jokes/ten , /jokes/random/<any-number>')],
  ['/ping', () => html('pong')],
  ['/random_joke', () => json(randomJoke())],
  ['/random_ten', () => json(randomTen())],
  ['/jokes/random', () => json(randomJoke())],
  ['/jokes/random/:num', randomNumberOfJokes],
  ['/jokes/ten', () => json(randomTen())],
  ['/jokes/:type/random', ({ type }) => json(jokeByType(type, 1))],
  ['/jokes/:type/ten', ({ type }) => json(jokeByType(type, 10))],
  ['/jokes/:id', jokeWithId],
  ['/types', () => json(types)],
].map(([path, handle]) => ({ pattern: toExpressRegExp(path), handle }));

// Express 4 matching: case-insensitive, optional trailing slash, one segment per param.
function toExpressRegExp(path) {
  const source = path.replace(/\/$/, '').replace(/:(\w+)/g, '(?<$1>[^/]+?)');
  return new RegExp(`^${source}/?$`, 'i');
}

function findRoute(pathname) {
  for (const route of routes) {
    const match = route.pattern.exec(pathname);
    if (match) return { handle: route.handle, rawParams: match.groups ?? {} };
  }
  return undefined;
}

function decodeParams(rawParams) {
  const params = {};
  for (const [name, raw] of Object.entries(rawParams)) {
    try {
      params[name] = decodeURIComponent(raw);
    } catch {
      return { failed: raw };
    }
  }
  return { params };
}

function notFound(method, url) {
  const resource = escapeHtml(url.pathname + url.search);
  const body =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n' +
    `<pre>Cannot ${method} ${resource}</pre>\n</body>\n</html>\n`;
  return new Response(method === 'HEAD' ? null : body, {
    status: 404,
    headers: {
      'Content-Type': HTML,
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

/** Express's default weak ETag: W/"<byte length in hex>-<base64 SHA-1, unpadded>". */
export async function weakEtag(body) {
  const bytes = new TextEncoder().encode(body);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  return `W/"${bytes.length.toString(16)}-${btoa(String.fromCharCode(...hash)).slice(0, 27)}"`;
}

function isFresh(request, status, etag) {
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (!ifNoneMatch || !['GET', 'HEAD'].includes(request.method)) return false;
  if (status < 200 || status >= 300) return false;
  if (/(?:^|,)\s*no-cache\s*(?:,|$)/.test(request.headers.get('Cache-Control') ?? '')) return false;
  if (ifNoneMatch.trim() === '*') return true;
  const strip = (tag) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((tag) => strip(tag) === strip(etag));
}

async function send(request, { status, type, body }, extraHeaders = {}) {
  const etag = await weakEtag(body);
  if (isFresh(request, status, etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: { 'Content-Type': type, ETag: etag, ...extraHeaders },
  });
}

async function respond(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.RATE_LIMITER.limit({ key: ip });
  if (!success) return send(request, error(429, RATE_LIMIT_MESSAGE));

  const url = new URL(request.url);
  const route = findRoute(url.pathname);
  if (!route) return notFound(request.method, url);

  if (request.method === 'OPTIONS') return send(request, html('GET,HEAD'), { Allow: 'GET,HEAD' });
  if (!['GET', 'HEAD'].includes(request.method)) return notFound(request.method, url);

  const { params, failed } = decodeParams(route.rawParams);
  if (failed) return send(request, error(400, `Failed to decode param '${failed}'`));

  return send(request, route.handle(params));
}

export default {
  async fetch(request, env) {
    const response = await respond(request, env);
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  },
};
