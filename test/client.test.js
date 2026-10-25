// -----------------------------------------------------------------------------
// The client against the answers recorded from a real Tube Archivist v0.5.12
// (test/fixtures/tubearchivist/): one reading, the error kinds (the real DRF
// bodies), the result of a refused link, and the links accepted.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  TubeArchivistClient,
  parseNotification,
  parseYoutubeLink,
} from '../src/tubearchivist/client.js';
import { fixture } from './helpers/fakeTubeArchivist.js';

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/** A Tube Archivist answering the recorded fixtures. */
function recorded(overrides = {}) {
  const routes = {
    '/api/ping/': fixture('ping'),
    '/api/stats/video/': fixture('stats-video'),
    '/api/stats/channel/': fixture('stats-channel'),
    '/api/stats/download/': fixture('stats-download'),
    '/api/stats/downloadhist/': fixture('stats-downloadhist'),
    '/api/video/?sort=downloaded&order=desc': fixture('video-list'),
    '/api/download/?filter=pending&error=true': fixture('download-list'),
    '/api/notification/': fixture('notification-download'),
    ...overrides,
  };
  return async (url) => {
    const { pathname, search } = new URL(url);
    const answer = routes[`${pathname}${search}`];
    return typeof answer === 'function' ? answer() : json(200, answer);
  };
}

const client = (request) =>
  new TubeArchivistClient({ url: 'http://192.0.2.20:8000', token: 'x', request });

test('one reading of the recorded answers', async () => {
  const reading = await client(recorded()).read();
  assert.equal(reading.version, 'v0.5.12');
  assert.equal(reading.videos, 2);
  assert.equal(reading.size, 723191438);
  assert.equal(reading.channels, 2);
  assert.equal(reading.subscribed, 1);
  assert.equal(reading.pending, 50);
  assert.deepEqual(reading.history, [{ date: '2026-10-25', count: 2 }]);
  assert.deepEqual(reading.latest[0], {
    id: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film',
    channel: 'Blender',
    published: '2014-11-10T14:05:55+00:00',
    downloaded: 1792890290,
    size: 722715449,
    duration: '10m 34s',
  });
  assert.equal(reading.failed.length, 3, 'the trimmed first page');
  assert.equal(reading.failedTotal, 19);
  assert.match(reading.failed[0].error, /Requested format is not available/);
  assert.equal(reading.failed[0].channel, 'Blender');
  assert.equal(reading.tasks[0].group, 'download:run');
  assert.match(reading.tasks[0].messages[0], /^Processing Video: /);
});

test('an empty instance answers null everywhere: zeros', async () => {
  const reading = await client(
    recorded({
      '/api/stats/video/': fixture('stats-video-empty'),
      '/api/stats/channel/': fixture('stats-channel-empty'),
      '/api/stats/download/': fixture('stats-download-empty'),
      '/api/stats/downloadhist/': [],
      '/api/notification/': [],
    }),
  ).read();
  assert.equal(reading.videos, 0);
  assert.equal(reading.subscribed, 0);
  assert.equal(reading.pending, 0);
  assert.deepEqual(reading.tasks, []);
});

test('the error kinds, from the real answers', async () => {
  const kind = async (answer) => {
    try {
      await client(recorded({ '/api/ping/': () => answer })).read();
      return 'none';
    } catch (err) {
      return err.kind;
    }
  };
  assert.equal(await kind(json(403, { detail: 'Invalid token.' })), ERROR_KINDS.AUTH);
  assert.equal(
    await kind(json(403, { detail: 'Invalid token header. No credentials provided.' })),
    ERROR_KINDS.AUTH,
  );
  assert.equal(
    await kind(json(403, { detail: 'You do not have permission to perform this action.' })),
    ERROR_KINDS.NOT_ADMIN,
  );
  const html404 = {
    status: 404,
    headers: { 'content-type': 'text/html' },
    body: '<h1>Not Found</h1>',
  };
  assert.equal(await kind(html404), ERROR_KINDS.NOT_TUBEARCHIVIST);
  const page = { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
  assert.equal(await kind(page), ERROR_KINDS.NOT_TUBEARCHIVIST);
  assert.equal(await kind({ status: 302, headers: {}, body: '' }), ERROR_KINDS.REDIRECT);
  assert.equal(await kind(json(500, { error: 'boom' })), ERROR_KINDS.HTTP);
  const refused = async () => {
    const error = new Error('connect ECONNREFUSED');
    error.code = 'ECONNREFUSED';
    throw error;
  };
  assert.equal(await kind(refused()), ERROR_KINDS.UNREACHABLE);
});

test('a refused link: the message of Tube Archivist, from the repr of the task result', async () => {
  const request = async () =>
    json(200, {
      status: 'FAILURE',
      // Recorded from GET /api/task/by-id/<id>/ after adding "not a url".
      result:
        "{'exc_type': 'ValueError', 'exc_message': ['not a valid id_str: not'], 'exc_module': 'builtins'}",
    });
  assert.deepEqual(await client(request).task('d23093c0'), {
    status: 'FAILURE',
    error: 'not a valid id_str: not',
  });
});

test('the links Tube Archivist takes: one YouTube video, playlist or channel', () => {
  assert.equal(parseYoutubeLink('jNQXAC9IVRw'), 'jNQXAC9IVRw');
  assert.equal(parseYoutubeLink('UCSMOQeBJ2RAnuFungnQOxLg'), 'UCSMOQeBJ2RAnuFungnQOxLg');
  assert.equal(
    parseYoutubeLink('PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6'),
    'PLa1F2ddGya_-UvuAqHAksYnB0qL9yWDO6',
  );
  assert.equal(parseYoutubeLink(' youtu.be/jNQXAC9IVRw '), 'https://youtu.be/jNQXAC9IVRw');
  assert.equal(
    parseYoutubeLink('https://m.youtube.com/watch?v=jNQXAC9IVRw'),
    'https://m.youtube.com/watch?v=jNQXAC9IVRw',
  );
  assert.equal(
    parseYoutubeLink('https://www.youtube.com/@BlenderOfficial'),
    'https://www.youtube.com/@BlenderOfficial',
  );
  for (const bad of [
    '',
    'two words',
    'https://vimeo.com/1',
    'https://youtube.com.evil.org/x',
    42,
  ]) {
    assert.equal(parseYoutubeLink(bad), null, String(bad));
  }
});

test('a notification without its optional fields', () => {
  assert.deepEqual(parseNotification({ id: 'a', title: 'Index Backup' }), {
    id: 'a',
    title: 'Index Backup',
    group: '',
    level: '',
    messages: [],
    progress: null,
  });
});
