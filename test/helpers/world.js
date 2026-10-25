// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Tube Archivist on a fake
// network, a temporary /data and a manual clock, with the integration wired
// on top through registerHandlers. No timer runs unless `timers: true`: the
// tests read Tube Archivist with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeTubeArchivist, TOKEN, createNetwork } from './fakeTubeArchivist.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const TA_URL = 'http://192.0.2.20:8000';

/** A manual clock, the morning of the real captures (local time, Europe/Paris). */
export function createClock(start = Date.parse('2026-10-25T08:00:00+01:00')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: '192.0.2.20', token: TOKEN, language: 'en' };

/** A Tube Archivist with two channels, three videos, a queue with one failed download. */
export function defaultArchivist(options) {
  const archivist = new FakeTubeArchivist(options);
  archivist.channel('Blender');
  archivist.channel('Kurzgesagt');
  archivist.archive('Me at the zoo', 'jawed', { at: Date.parse('2026-10-24T20:00:00+02:00') });
  archivist.archive('Big Buck Bunny', 'Blender', { at: Date.parse('2026-10-24T21:00:00+02:00') });
  archivist.archive('Sintel', 'Blender', { at: Date.parse('2026-10-25T07:30:00+01:00') });
  archivist.enqueue('Spring', 'Blender');
  archivist.enqueue('Agent 327', 'Blender', {
    error: 'ERROR: [youtube] abc: Video unavailable. This video is private',
  });
  return archivist;
}

/**
 * @param {object} [options]
 * @param {FakeTubeArchivist} [options.archivist]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  archivist = defaultArchivist(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-tubearchivist-')),
  timings = {},
  timers = false,
} = {}) {
  archivist.now = clock.now;
  const network = createNetwork({ [TA_URL]: archivist });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    sleep: async () => {},
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, archivist, app, hub: app.hub, clock, dataDir };
}

export const serverDevice = (gladys) => gladys.externalIds('server', 'main').device;
export const serverFeature = (gladys, key) => gladys.externalIds('server', 'main').feature(key);

export { FakeTubeArchivist, TOKEN };
