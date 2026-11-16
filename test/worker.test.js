import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { weakEtag } from '../src/index.js';
import { jokes, randomN, jokeById } from '../src/jokes.js';

const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';

const allowAll = { limit: async () => ({ success: true }) };

const get = (path, { method = 'GET', headers = {}, limiter = allowAll } = {}) =>
  worker.fetch(new Request(`https://jokes.test${path}`, { method, headers }), { RATE_LIMITER: limiter });

const isJoke = (value) => ['id', 'type', 'setup', 'punchline'].every((key) => key in value);
const listOf = (n, check = isJoke) => (body) => Array.isArray(body) && body.length === n && body.every(check);
const text = (expected) => (body) => body === expected;

// Expected values recorded from the Express app this Worker replaces.
const contract = [
  ['/', 200, HTML, text('Try /random_joke, /random_ten, /jokes/random, or /jokes/ten , /jokes/random/<any-number>')],
  ['/ping', 200, HTML, text('pong')],
  ['/PING', 200, HTML, text('pong')],
  ['/ping/', 200, HTML, text('pong')],
  ['/ping?x=1', 200, HTML, text('pong')],
  ['/random_joke', 200, JSON_TYPE, isJoke],
  ['/jokes/random', 200, JSON_TYPE, isJoke],
  ['/random_ten', 200, JSON_TYPE, listOf(10)],
  ['/jokes/ten', 200, JSON_TYPE, listOf(10)],
  ['/types', 200, JSON_TYPE, (body) => body.join() === 'general,knock-knock,programming,dad'],
  ['/jokes/random/5', 200, JSON_TYPE, listOf(5)],
  ['/jokes/random/5/', 200, JSON_TYPE, listOf(5)],
  ['/jokes/random/5abc', 200, JSON_TYPE, listOf(5)],
  ['/jokes/random/451', 200, JSON_TYPE, (body) => new Set(body.map((joke) => joke.id)).size === 451],
  ['/jokes/random/-3', 200, JSON_TYPE, listOf(0)],
  ['/jokes/random/0', 200, HTML, text('The passed path is not a number.')],
  ['/jokes/random/abc', 200, HTML, text('The passed path is not a number.')],
  ['/jokes/random/random', 200, HTML, text('The passed path is not a number.')],
  ['/jokes/random/452', 200, HTML, text('The passed path exceeds the number of jokes (451).')],
  ['/jokes/programming/random', 200, JSON_TYPE, listOf(1, (joke) => joke.type === 'programming')],
  ['/jokes/programming/ten', 200, JSON_TYPE, listOf(10, (joke) => joke.type === 'programming')],
  ['/jokes/knock%2Dknock/random', 200, JSON_TYPE, listOf(1, (joke) => joke.type === 'knock-knock')],
  ['/jokes/Programming/random', 200, JSON_TYPE, listOf(0)],
  ['/jokes/ten/random', 200, JSON_TYPE, listOf(0)],
  ['/jokes/1', 200, JSON_TYPE, (body) => body.id === 1 && body.punchline === 'Dam.'],
  ['/Jokes/1', 200, JSON_TYPE, (body) => body.id === 1],
  ['/jokes/1.0', 200, JSON_TYPE, (body) => body.id === 1],
  ['/jokes/0x1', 200, JSON_TYPE, (body) => body.id === 1],
  ['/jokes/%31', 200, JSON_TYPE, (body) => body.id === 1],
  ['/jokes/451', 200, JSON_TYPE, (body) => body.id === 451],
  ['/jokes/0', 404, JSON_TYPE, (body) => body.message === 'joke not found'],
  ['/jokes/452', 404, JSON_TYPE, (body) => body.message === 'joke not found'],
  ['/jokes/abc', 404, JSON_TYPE, (body) => body.message === 'joke not found'],
  ['/jokes/%E0', 400, JSON_TYPE, (body) => body.message === "Failed to decode param '%E0'"],
  ['/nope', 404, HTML, (body) => body.includes('<pre>Cannot GET /nope</pre>')],
  ['/jokes', 404, HTML, (body) => body.includes('<pre>Cannot GET /jokes</pre>')],
  ['//ping', 404, HTML, (body) => body.includes('<pre>Cannot GET //ping</pre>')],
];

for (const [path, status, type, check] of contract) {
  test(`GET ${path}`, async () => {
    const response = await get(path);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Content-Type'), type);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    const raw = await response.text();
    assert.ok(check(type === JSON_TYPE ? JSON.parse(raw) : raw), raw.slice(0, 200));
  });
}

test('joke keys keep the original order with id last', async () => {
  const body = await (await get('/jokes/1')).text();
  assert.equal(body, '{"type":"general","setup":"What did the fish say when it hit the wall?","punchline":"Dam.","id":1}');
});

test('404 page matches the Express default byte for byte', async () => {
  const response = await get('/ping', { method: 'POST' });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'");
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(new TextEncoder().encode(await response.text()).length, 144);
});

test('OPTIONS on a known route lists the allowed methods', async () => {
  const response = await get('/ping', { method: 'OPTIONS' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Allow'), 'GET,HEAD');
  assert.equal(await response.text(), 'GET,HEAD');
});

test('HEAD returns headers without a body', async () => {
  const response = await get('/types', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('ETag'), 'W/"2d-DU3doZO6lTOjSFpODwouizhmBVA"');
  assert.equal(await response.text(), '');
});

test('ETag uses the Express format', async () => {
  assert.equal(await weakEtag('pong'), 'W/"4-DlFKBmK8tp3IY5U9HOJuPUDoGoc"');
  assert.equal(await weakEtag('{"type":"error","message":"joke not found"}'), 'W/"2b-gJDD+ntxnQO1K69+LJPTF2V6PLE"');
});

test('If-None-Match', async (t) => {
  const etag = 'W/"2d-DU3doZO6lTOjSFpODwouizhmBVA"';
  const cases = [
    ['matching tag gives 304', '/types', { 'If-None-Match': etag }, 304],
    ['tag in a list gives 304', '/types', { 'If-None-Match': `"other", ${etag}` }, 304],
    ['other tag gives 200', '/types', { 'If-None-Match': '"other"' }, 200],
    ['no-cache forces 200', '/types', { 'If-None-Match': etag, 'Cache-Control': 'no-cache' }, 200],
    ['errors are never 304', '/jokes/0', { 'If-None-Match': 'W/"2b-gJDD+ntxnQO1K69+LJPTF2V6PLE"' }, 404],
  ];
  for (const [name, path, headers, status] of cases) {
    await t.test(name, async () => {
      const response = await get(path, { headers });
      assert.equal(response.status, status);
      if (status === 304) {
        assert.equal(await response.text(), '');
        assert.equal(response.headers.get('ETag'), etag);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
      }
    });
  }
});

test('rate limit is keyed on the client IP and blocks with a 429', async () => {
  const keys = [];
  const limiter = { limit: async ({ key }) => (keys.push(key), { success: false }) };
  const response = await get('/ping', { headers: { 'CF-Connecting-IP': '203.0.113.7' }, limiter });
  assert.deepEqual(keys, ['203.0.113.7']);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await response.json(), {
    type: 'error',
    message: 'Your ip has exceeded the 100 request limit per 1 minute(s). Try again in in 1 minute(s).',
  });
});

test('randomN returns distinct items capped at the array length', () => {
  const five = randomN(jokes, 5);
  assert.equal(new Set(five).size, 5);
  assert.deepEqual(randomN([1, 2, 3], 10).sort(), [1, 2, 3]);
  assert.deepEqual(randomN([], 10), []);
});

test('jokeById accepts only integer ids in range', () => {
  assert.equal(jokeById(1).punchline, 'Dam.');
  for (const id of ['1', 'one', undefined, 0, 452, 1.5, NaN, -1]) {
    assert.equal(jokeById(id), undefined, String(id));
  }
});
