// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only (a video archived or failed goes to debug, like any reading). A
// normal reading writes nothing, a failure that repeats is logged once, and
// its end once. Never the token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createWorld, defaultArchivist } from './helpers/world.js';

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    // Videos waiting, a task running: nothing to tell.
    w.archivist.enqueue(`Waiting ${i}`, 'Blender');
    w.archivist.notifications = [
      { id: 'n', title: 'Downloading', group: 'download:run', level: 'info', messages: [`x ${i}`] },
    ];
    w.clock.advance(120_000);
    await w.hub.pollAll();
  }
  assert.deepEqual(logs.texts(), []);
});

test('a video archived or failed is one line at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  logs.clear();
  w.clock.advance(60_000);
  w.archivist.archive('Fresh one', 'Kurzgesagt');
  w.archivist.fail(w.archivist.enqueue('Blocked one', 'Kurzgesagt'));
  await w.hub.pollAll();
  const news = logs
    .texts()
    .filter((text) => /Tube Archivist: (archived|download failed)/.test(text));
  assert.equal(news.length, 2, logs.texts().join('\n'));
  assert.match(news[0], /\[DEBUG\].*archived "Fresh one" \(Kurzgesagt\)/);
  assert.match(news[1], /\[DEBUG\].*download failed for "Blocked one"/);
});

test('a server that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.archivist.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  logs.clear();
  w.archivist.online = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /connection restored/);
});

test('a refused token is logged once, never the token', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { config: { ...CONFIG, token: 'wrong-token-42' } });
  for (let i = 0; i < 5; i += 1) {
    await w.hub.pollAll();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /refused/);
  assert.ok(!logs.texts().join('\n').includes('wrong-token-42'), 'never the token');
});

test('the user commands are one line at info, without the link', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('add_video', {
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw&t=secret',
  });
  await w.fake.sceneAction('rescan_subscriptions', {});
  assert.equal(logs.lines.length, 2, logs.texts().join('\n'));
  assert.ok(!logs.texts().join('\n').includes('jNQXAC9IVRw'));
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.archivist.enqueue(`Waiting ${i}`, 'Blender');
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});

test('LOG_LEVEL=debug shows each reading problem; never the token', async (t) => {
  const logs = captureLogs(t, 'debug');
  const archivist = defaultArchivist({ token: 'secret-77' });
  const w = await world(t, { archivist, config: { ...CONFIG, token: 'secret-77' } });
  w.archivist.online = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*again/);
  assert.ok(!text.includes('secret-77'), 'never the token');
});
