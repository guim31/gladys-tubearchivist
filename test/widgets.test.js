// -----------------------------------------------------------------------------
// The `library` widget: content valid for the core (budget, vocabulary), in
// every language, before and after a download, its buttons and its messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FakeTubeArchivist, createWorld } from './helpers/world.js';
import { videoItem } from '../src/widgets.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, language = 'en') => {
  const ack = await w.fake.widgetGet('library', { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], JSON.stringify(ack.data));
  return ack.data.content.components;
};

test('the widget shows the figures, the task and the latest videos, in every language', async (t) => {
  const w = await world(t);
  w.archivist.archive('x'.repeat(80), 'Kurzgesagt');
  w.archivist.notifications = [
    {
      id: 'n1',
      title: 'Downloading',
      group: 'download:run',
      level: 'info',
      messages: ['Processing Video: Spring', ' 60.3% of 679.44MiB'],
      progress: 0.603,
    },
  ];
  await w.hub.pollAll();
  const tasks = { en: 'Downloading: Spring (60 %)', fr: 'Téléchargement : Spring (60 %)' };
  for (const language of ['en', 'fr', 'de', 'es']) {
    const components = await get(w, language);
    assert.ok(components.length <= 8);
    assert.ok(components.filter((c) => c.type === 'text').length <= 2);
    assert.deepEqual(
      components.filter((c) => c.type === 'value').map((c) => c.value),
      [2, 1, 1],
      'today, in the queue, failed',
    );
    const status = components.find((c) => c.type === 'status');
    if (tasks[language]) {
      assert.equal(status.items[0].value, tasks[language]);
    }
    const list = components.find((c) => c.type === 'card-list');
    assert.equal(list.items.length, 4);
    assert.equal(list.items[0].title.length, 60);
    assert.equal(list.items[0].subtitle, 'Kurzgesagt');
    assert.equal(
      list.items[0].date,
      new Date(Math.floor(w.clock.now() / 1000) * 1000).toISOString(),
    );
    const buttons = components.filter((c) => c.type === 'button');
    assert.deepEqual(
      buttons.map((b) => b.action.key),
      ['add', 'rescan'],
    );
    assert.deepEqual(
      buttons[0].action.fields.map((f) => f.key),
      ['url', 'start'],
    );
  }
});

test('the buttons add a video and start a rescan', async (t) => {
  const w = await world(t);
  let ack = await w.fake.widgetAction(
    'library',
    'add',
    {},
    {
      values: { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', start: 'queue' },
    },
  );
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.archivist.lastAdded, {
    link: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    autostart: false,
  });
  assert.match(JSON.stringify(ack.data), /Added to the queue/);
  ack = await w.fake.widgetAction('library', 'rescan', {}, {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.archivist.started, ['update_subscribed']);
  ack = await w.fake.widgetAction('library', 'add', {}, { values: { url: 'https://vimeo.com/1' } });
  assert.equal(ack.success, false);
  assert.match(ack.error, /YouTube link/);
});

test('no video yet: a sentence instead of the list', async (t) => {
  const w = await world(t, { archivist: new FakeTubeArchivist() });
  const components = await get(w, 'de');
  assert.equal(components.find((c) => c.type === 'text').text, 'Noch kein Video archiviert.');
});

test('no server, no token, or a server down: a message instead of figures', async (t) => {
  const empty = await world(t, { config: {} });
  assert.match((await get(empty))[0].text, /address of your Tube Archivist server/);
  const noToken = await world(t, { config: { url: '192.0.2.20', language: 'en' } });
  assert.match((await get(noToken))[0].text, /API token/);
  const w = await world(t);
  w.archivist.online = false;
  await w.hub.pollAll();
  const components = await get(w, 'fr');
  assert.equal(components[0].items[0].value, 'Hors ligne');
});

test('a row without a date or a channel stays valid', () => {
  assert.deepEqual(videoItem({ title: 'Lonely', channel: '', at: null }), { title: 'Lonely' });
});
