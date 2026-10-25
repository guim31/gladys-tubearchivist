// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `read_latest`: read Tube Archivist now and give a sentence for a message or
// a voice announcement (videos of the day, the latest ones, the queue), and
// the figures separately for the conditions of the scene. Read only.
// `rescan_subscriptions`: search the subscribed channels for new videos now
// (the task "Rescan your Subscriptions"); the channels set to auto start in
// Tube Archivist are then downloaded.
// `add_video`: add a YouTube link (video, playlist, channel) to the queue,
// downloaded at once or in turn. A link Tube Archivist refuses fails the
// action with its reason; a download that fails later fires `download_failed`.
// -----------------------------------------------------------------------------

import { RECENT_SIZE } from './hub.js';

export const LATEST_COUNTS = ['1', '3', '5', '10'];
export const DEFAULT_LATEST_COUNT = '3';
export const START_OPTIONS = ['now', 'queue'];
export const DEFAULT_START = 'now';

export const SCENE_ACTIONS = {
  async read_latest(hub, { fields = {} }) {
    hub.ensureServer();
    // Read now: the sentence says what is true at the time of the scene.
    await hub.refresh();
    const raw = String(fields.count ?? DEFAULT_LATEST_COUNT);
    const count = Math.min(
      Number(LATEST_COUNTS.includes(raw) ? raw : DEFAULT_LATEST_COUNT),
      RECENT_SIZE,
    );
    const totals = hub.server.reachable ? hub.totals() : null;
    const last = hub.server.reachable ? hub.recent()[0] : null;
    return {
      summary: hub.summary(count),
      downloaded_today: totals?.downloadedToday ?? 0,
      pending: totals?.pending ?? 0,
      errors: totals?.errors ?? 0,
      videos: totals?.videos ?? 0,
      last_title: last?.title ?? '',
      last_channel: last?.channel ?? '',
    };
  },

  async rescan_subscriptions(hub) {
    await hub.rescan();
    return {};
  },

  async add_video(hub, { fields = {} }) {
    const start = START_OPTIONS.includes(fields.start) ? fields.start : DEFAULT_START;
    await hub.addVideo(fields.url, start);
    return {};
  },
};
