// -----------------------------------------------------------------------------
// The hub against the fake Tube Archivist: what each reading publishes, the
// scene events (once, and never for what was there before), a restart, the
// container's own timer, the commands, the scene actions and "Test the
// connection".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  CONFIG,
  FakeTubeArchivist,
  createClock,
  createWorld,
  defaultArchivist,
  serverDevice,
  serverFeature,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const state = (w, key) => w.fake.lastState(serverFeature(w.gladys, key));

test('the first reading publishes the figures and announces nothing', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, 'online'), 1);
  assert.equal(state(w, 'videos'), 3);
  assert.equal(state(w, 'channels'), 2);
  assert.equal(state(w, 'library_size'), 0.15);
  assert.equal(state(w, 'pending'), 1, 'the failed download is not counted as waiting');
  assert.equal(state(w, 'errors'), 1);
  assert.equal(state(w, 'downloaded_today'), 1, 'one of the three today (Europe/Paris)');
  assert.equal(state(w, 'task'), 'None');
  assert.equal(state(w, 'last_video'), 'Sintel (Blender)');
  assert.deepEqual(
    w.hub.recent().map((video) => video.title),
    ['Sintel', 'Big Buck Bunny', 'Me at the zoo'],
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.transports, [
    { device_external_id: serverDevice(w.gladys), transport: DEVICE_TRANSPORTS.LOCAL },
  ]);
  const device = w.fake.discoveredDevices[0];
  assert.equal(device.name, 'Tube Archivist 192.0.2.20:8000');
  assert.equal(device.should_poll, false);
});

test('a new video archived fires video_archived once, with its details', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  const id = w.archivist.archive('Why the Sun shines', 'Kurzgesagt');
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'video_archived'), [
    {
      key: 'video_archived',
      data: {
        channel: 'Kurzgesagt',
        title: 'Why the Sun shines',
        published: '2014-11-10',
        duration: '10m 34s',
        url: `http://192.0.2.20:8000/video/${id}`,
        downloaded_today: 2,
      },
    },
  ]);
  assert.equal(state(w, 'downloaded_today'), 2);
  assert.equal(state(w, 'videos'), 4);
  assert.equal(state(w, 'last_video'), 'Why the Sun shines (Kurzgesagt)');
  assert.ok(w.fake.widgetRefreshes.includes('library'));
});

test('several videos at once are announced oldest first, at most 10 per reading', async (t) => {
  const w = await world(t);
  for (let i = 0; i < 12; i += 1) {
    w.clock.advance(1000);
    w.archivist.archive(`Batch ${i}`, 'Blender');
  }
  await w.hub.pollAll();
  const titles = events(w, 'video_archived').map((event) => event.data.title);
  assert.equal(titles.length, 10);
  assert.equal(titles[0], 'Batch 2');
  assert.equal(titles.at(-1), 'Batch 11');
  assert.equal(w.hub.recent()[0].title, 'Batch 11');
});

test('an old video imported later (older download date) is not news', async (t) => {
  const w = await world(t);
  w.archivist.archive('Imported', 'Blender', { at: Date.parse('2026-01-01T00:00:00Z') });
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'video_archived'), []);
});

test('a failed download fires download_failed once; a retry that fails again fires again', async (t) => {
  const w = await world(t);
  const id = w.archivist.enqueue('Members only', 'Kurzgesagt');
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'download_failed'), []);
  w.archivist.fail(
    id,
    'ERROR: [youtube] xyz: Join this channel to get access to members-only content',
  );
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'download_failed'), [
    {
      key: 'download_failed',
      data: {
        channel: 'Kurzgesagt',
        title: 'Members only',
        error: 'ERROR: [youtube] xyz: Join this channel to get access to members-only content',
        youtube_url: `https://www.youtube.com/watch?v=${id}`,
      },
    },
  ]);
  assert.equal(state(w, 'errors'), 2);
  // "Clear error" in Tube Archivist, then it fails again.
  const item = w.archivist.queue.find((entry) => entry.youtube_id === id);
  delete item.message;
  await w.hub.pollAll();
  w.archivist.fail(id);
  await w.hub.pollAll();
  assert.equal(events(w, 'download_failed').length, 2);
});

test('the queue emptied fires queue_empty once (failed downloads stay)', async (t) => {
  const w = await world(t);
  w.archivist.queue = w.archivist.queue.filter((item) => item.message);
  w.archivist.archive('Spring', 'Blender');
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'queue_empty'), [
    { key: 'queue_empty', data: { downloaded_today: 2, errors: 1 } },
  ]);
  assert.equal(state(w, 'pending'), 0);
});

test('a restart announces nothing twice', async (t) => {
  const first = await createWorld();
  first.clock.advance(60_000);
  first.archivist.archive('Fresh', 'Blender');
  first.archivist.fail(first.archivist.enqueue('Broken', 'Blender'));
  await first.hub.pollAll();
  assert.equal(events(first, 'video_archived').length, 1);
  assert.equal(events(first, 'download_failed').length, 1);
  await first.app.stop();

  const second = await world(t, {
    archivist: first.archivist,
    dataDir: first.dataDir,
    clock: first.clock,
  });
  await second.hub.pollAll();
  assert.deepEqual(second.fake.sceneEvents, []);
  assert.equal(second.hub.recent()[0].title, 'Fresh');
});

test('another server: what it already has is not news', async (t) => {
  const first = await createWorld();
  await first.app.stop();
  const other = defaultArchivist();
  other.archive('Other library', 'Blender');
  const second = await world(t, {
    archivist: other,
    dataDir: first.dataDir,
    clock: first.clock,
    config: { ...CONFIG, url: '192.0.2.20:8001' },
  });
  // The fake network only knows :8000: the new address is down, then fixed.
  assert.equal(second.hub.error.kind, 'unreachable');
  await second.fake.configUpdated({ ...CONFIG });
  await second.hub.pollAll();
  assert.deepEqual(second.fake.sceneEvents, []);
});

test('the task in progress, translated, with its progress', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  w.archivist.notifications = [
    {
      id: 's1',
      title: 'Rescan your Subscriptions',
      group: 'download:scan',
      level: 'info',
      messages: ["Full extracting Channel: 'Blender'", 'Parsing item 42/50.'],
      progress: 0.84,
    },
    {
      id: 'e1',
      title: 'Add to download queue',
      group: 'download:add',
      level: 'error',
      messages: ['Task failed: not a valid id_str: not'],
    },
  ];
  await w.hub.pollAll();
  assert.equal(state(w, 'task'), 'Recherche de nouvelles vidéos : Blender (84 %)');
  w.archivist.notifications = [
    { id: 'x', title: 'Index Backup', group: 'setting:backup', level: 'info', messages: [] },
  ];
  await w.hub.pollAll();
  assert.equal(state(w, 'task'), 'Index Backup', 'an unknown task keeps its title');
  w.archivist.notifications = [{ ...w.archivist.notifications[0], messages: ['Task completed'] }];
  await w.hub.pollAll();
  assert.equal(state(w, 'task'), 'Aucune');
});

test('a server down: offline, its figures not republished; back: restored', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.archivist.online = false;
  await w.hub.pollAll();
  assert.equal(state(w, 'online'), 0);
  assert.equal(w.fake.states.length, before + 1, 'only the online feature');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  assert.equal(w.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.UNREACHABLE);
  w.archivist.online = true;
  await w.hub.pollAll();
  assert.equal(state(w, 'online'), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a refused token, a non-admin token, no token: explained in the status', async (t) => {
  const refused = await world(t, { config: { ...CONFIG, token: 'wrong' } });
  assert.match(refused.fake.connectionStatus.message.en, /API token refused/);
  const user = await world(t, { archivist: defaultArchivist({ admin: false }) });
  assert.match(user.fake.connectionStatus.message.fr, /administrateur/);
  const none = await world(t, { config: { url: '192.0.2.20' } });
  assert.match(none.fake.connectionStatus.message.de, /API-Token/);
  assert.deepEqual(none.fake.discoveredDevices, []);
});

test('the device is re-sent on onDeviceCreated, with every state', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length >= before + 9);
  assert.ok(w.fake.widgetRefreshes.includes('library'));
});

test("the container's own timer reads Tube Archivist (no onPoll needed)", async (t) => {
  const w = await world(t, {
    timers: true,
    config: { ...CONFIG },
  });
  w.hub.config.pollIntervalMs = 20;
  w.hub.schedulePoll();
  const reads = () => w.archivist.requests.filter((r) => r.path === '/api/ping/').length;
  const start = reads();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.ok(reads() > start, 'the timer read again');
});

test('add_video: the link is checked, sent once, autostart by default; a refusal fails', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('add_video', { url: ' youtu.be/jNQXAC9IVRw ' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.archivist.lastAdded, {
    link: 'https://youtu.be/jNQXAC9IVRw',
    autostart: true,
  });
  ack = await w.fake.sceneAction('add_video', { url: 'jNQXAC9IVRw', start: 'queue' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.archivist.lastAdded, { link: 'jNQXAC9IVRw', autostart: false });
  for (const url of ['', 'two links here', 'https://vimeo.com/1', 'ftp://youtube.com/x']) {
    ack = await w.fake.sceneAction('add_video', { url });
    assert.equal(ack.success, false, url);
  }
  ack = await w.fake.sceneAction('add_video', { url: 'https://www.youtube.com/watch?v=invalid' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /refused the link: not a valid id_str/);
});

test('rescan_subscriptions starts the task of Tube Archivist', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('rescan_subscriptions', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.archivist.started, ['update_subscribed']);
  const user = await world(t, { archivist: defaultArchivist({ admin: false }) });
  const refused = await user.fake.sceneAction('rescan_subscriptions', {});
  assert.equal(refused.success, false);
});

test('read_latest: the sentence and the figures, in the configured language', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_latest', { count: '1' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    summary:
      "Tube Archivist : 1 vidéo téléchargée aujourd'hui ; dernières : « Sintel » (Blender). 1 en file d'attente, 1 en erreur.",
    downloaded_today: 1,
    pending: 1,
    errors: 1,
    videos: 3,
    last_title: 'Sintel',
    last_channel: 'Blender',
  });
  const empty = await world(t, { archivist: new FakeTubeArchivist() });
  const quiet = await empty.fake.sceneAction('read_latest', {});
  assert.equal(
    quiet.data.outputs.summary,
    'Tube Archivist: no video downloaded today; no video archived yet. 0 in the queue.',
  );
});

test('Test the connection: a report in four languages', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.en,
    'OK, Tube Archivist v0.5.12, 3 video(s) (0.15 GB), 2 subscribed channel(s), 1 in the queue, 1 failed',
  );
  assert.match(ack.data.message.fr, /3 vidéo\(s\) \(0,15 Go\)/);
  const clock = createClock();
  const down = await world(t, { clock });
  down.archivist.online = false;
  const report = await down.fake.action('test_connection', {});
  assert.match(report.data.message.es, /no responde/);
});
