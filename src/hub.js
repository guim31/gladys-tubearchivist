// -----------------------------------------------------------------------------
// The hub: reads Tube Archivist on a timer of the container (the interval
// chosen in the configuration), publishes the states of the server device
// when they change, fires the scene events, and runs the commands (rescan the
// subscriptions, add a video), the scene actions, the widget and "Test the
// connection".
//
// Each reading is eight small GETs of the REST API (src/tubearchivist/client.js):
// ping, the statistics of the videos, channels, queue and downloads per day,
// the latest videos downloaded, the failed downloads and the running tasks.
//
// Gladys never polls this device (should_poll: false): the scene events must
// fire even when the device was not added, and a device created without
// should_poll is never polled by Gladys 5.2 anyway.
//
// Scene events:
//   - video_archived: a video never seen before is among the latest downloaded
//     ones, downloaded after the last one seen;
//   - download_failed: an item of the queue shows a download error not seen yet;
//   - queue_empty: the queue had videos to download, it has none left (the
//     failed ones stay in the queue of Tube Archivist, they do not count).
// What was seen is kept under /data, so a restart announces nothing twice; the
// first reading of a new server announces nothing.
// No webhook: the sandbox has no inbound port (Apprise notifications of Tube
// Archivist cannot reach the container).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  ERROR_KINDS,
  TASKS,
  TubeArchivistClient,
  parseYoutubeLink,
} from './tubearchivist/client.js';
import { FEATURE_KEYS, buildServer, featureValues, serverIds, toGigabytes } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SUMMARY_TEXT,
  TASK_TEXT,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'tubearchivist-hub' });

export const WIDGET_KEY = 'library';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  VIDEO_ARCHIVED: 'video_archived',
  DOWNLOAD_FAILED: 'download_failed',
  QUEUE_EMPTY: 'queue_empty',
});

export const HUB_TIMINGS = {
  // At most this many events of each kind per reading.
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
  // How long "Add a video" waits for Tube Archivist to accept the link.
  addWaitMs: 15_000,
  addStepMs: 1_000,
};

// Video ids remembered (downloaded, failed), and the size of the recent list.
const KNOWN_SIZE = 200;
export const RECENT_SIZE = 10;

/** The local date (TZ of Gladys, injected by the supervisor), `YYYY-MM-DD`. */
export const localDate = (ms) => {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class CommandError extends Error {}

export class TubeArchivistHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/tubearchivist/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ gladys, store, request, timers = true, timings, now, sleep: wait }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.sleep = wait ?? sleep;
    this.config = null;
    this.client = null;
    this.signature = null;
    this.server = this.emptyServer();
    this.error = null;
    this.devicesKey = null;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.saved = this.emptySaved(null);
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyServer() {
    return { reachable: null, version: null, reading: null };
  }

  emptySaved(url) {
    return {
      url,
      seeded: false,
      lastDownloaded: 0,
      known: [],
      failed: [],
      toDownload: 0,
      recent: [],
    };
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      seeded: saved.seeded === true,
      lastDownloaded: Number.isFinite(saved.lastDownloaded) ? saved.lastDownloaded : 0,
      known: ids(saved.known).slice(0, KNOWN_SIZE),
      failed: ids(saved.failed).slice(0, KNOWN_SIZE),
      toDownload: Number.isInteger(saved.toDownload) ? saved.toDownload : 0,
      recent: Array.isArray(saved.recent)
        ? saved.recent
            .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
            .slice(0, RECENT_SIZE)
        : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const signature = JSON.stringify([config.url, config.token]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        config.url && config.token
          ? new TubeArchivistClient({ url: config.url, token: config.token, request: this.request })
          : null;
      this.error = null;
      this.server = this.emptyServer();
      if (config.url && this.saved.url !== config.url) {
        // Another server: its videos are new, not news.
        this.saved = this.emptySaved(config.url);
        this.store.save(this.saved);
      }
    }
    this.devicesKey = null; // the language may have changed
    try {
      await this.refresh();
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices ---------------------------------------------------------------

  devices() {
    return this.client ? [buildServer(this.gladys, this.config)] : [];
  }

  /** Publish the device when it changed (name, language). */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Tube Archivist, publish the device again. */
  async rediscover() {
    await this.refresh();
    await this.publishDevices({ force: true });
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.client || device.external_id !== serverIds(this.gladys).device) {
      return;
    }
    await this.publishStates({ force: true });
    this.transport = null;
    await this.publishTransport();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading Tube Archivist ------------------------------------------------

  /** Read Tube Archivist and apply what changed. Concurrent calls share the read. */
  pollAll() {
    this.polling ??= this.readAll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** A reading that starts after this call (a scene action wants fresh figures). */
  async refresh() {
    if (this.polling) {
      await this.polling.catch(() => {});
    }
    return this.pollAll();
  }

  /** Gladys asks for a refresh (onPoll): read Tube Archivist now. */
  async pollDevice(device) {
    if (this.client && device.external_id === serverIds(this.gladys).device) {
      await this.pollAll();
    }
  }

  async readAll() {
    if (!this.client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    const client = this.client;
    const before = this.widgetView();
    try {
      const reading = await client.read();
      if (client !== this.client) {
        return; // reconfigured meanwhile
      }
      await this.applyReading(client, reading);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      this.applyFailure(err);
    }
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (this.widgetView() !== before) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async applyReading(client, reading) {
    if (this.error) {
      logger.info(`Tube Archivist ${this.config.url}: connection restored`);
    } else if (this.server.reachable === null) {
      logger.info(
        `Tube Archivist ${this.config.url}: connected, version ${reading.version ?? 'unknown'}, ${reading.videos} video(s)`,
      );
    }
    this.error = null;
    this.server = { reachable: true, version: reading.version, reading };

    const saved = this.saved;
    const toDownload = Math.max(0, reading.pending - reading.failedTotal);
    const events = { archived: [], failed: [], emptied: false };

    if (!saved.seeded) {
      // First reading of this server: the latest videos fill the widget,
      // nothing is announced.
      saved.seeded = true;
      saved.recent = reading.latest.slice(0, RECENT_SIZE).map((video) => this.recentItem(video));
    } else {
      // Newest first in the answer: announced oldest first.
      const known = new Set(saved.known);
      const fresh = reading.latest.filter(
        (video) => !known.has(video.id) && (video.downloaded ?? 0) >= saved.lastDownloaded,
      );
      if (fresh.length >= 25 && fresh.length === reading.latest.length) {
        // A whole page is new: older arrivals beyond it are counted, not announced.
        logger.debug(
          `Tube Archivist: ${fresh.length}+ new videos at once, the older ones not announced`,
        );
      }
      events.archived = fresh.reverse();
      for (const video of events.archived) {
        saved.recent = [
          this.recentItem(video),
          ...saved.recent.filter((item) => item.id !== video.id),
        ].slice(0, RECENT_SIZE);
      }
      const failed = new Set(saved.failed);
      // Oldest first in the answer, the order they failed in.
      events.failed = reading.failed.filter((item) => !failed.has(item.id));
      events.emptied = saved.toDownload > 0 && toDownload === 0;
    }
    // A video deleted from the library leaves the widget.
    if (reading.latest.length < RECENT_SIZE) {
      const present = new Set(reading.latest.map((video) => video.id));
      saved.recent = saved.recent.filter((item) => present.has(item.id));
    }

    saved.known = [...new Set([...reading.latest.map((video) => video.id), ...saved.known])].slice(
      0,
      KNOWN_SIZE,
    );
    saved.lastDownloaded = Math.max(
      saved.lastDownloaded,
      ...reading.latest.map((video) => video.downloaded ?? 0),
    );
    // The first page of the failed downloads (25) is all of them, or the
    // ones beyond it stay known: a failure is not announced twice.
    const shown = reading.failed.map((item) => item.id);
    saved.failed =
      reading.failed.length >= reading.failedTotal
        ? shown
        : [...new Set([...shown, ...saved.failed])].slice(0, KNOWN_SIZE);
    saved.toDownload = toDownload;

    // On disk before the events: a crash in between announces nothing twice.
    this.store.save(saved);
    await this.store.flush();
    if (client !== this.client) {
      return;
    }
    const max = this.timings.maxEventsPerRead;
    const today = this.downloadedToday();
    for (const video of events.archived.slice(-max)) {
      logger.debug(`Tube Archivist: archived "${video.title}" (${video.channel})`);
      await this.fire(TRIGGERS.VIDEO_ARCHIVED, {
        channel: video.channel,
        title: video.title,
        published: video.published.slice(0, 10),
        duration: video.duration,
        url: client.videoUrl(video.id),
        downloaded_today: today,
      });
    }
    for (const item of events.failed.slice(-max)) {
      logger.debug(`Tube Archivist: download failed for "${item.title}" (${item.channel})`);
      await this.fire(TRIGGERS.DOWNLOAD_FAILED, {
        channel: item.channel,
        title: item.title,
        error: item.error.slice(0, 1000),
        youtube_url: `https://www.youtube.com/watch?v=${item.id}`,
      });
    }
    if (events.emptied) {
      logger.debug('Tube Archivist: the queue is empty');
      await this.fire(TRIGGERS.QUEUE_EMPTY, {
        downloaded_today: today,
        errors: reading.failedTotal,
      });
    }
  }

  recentItem(video) {
    return {
      id: video.id,
      title: video.title,
      channel: video.channel,
      // Milliseconds, for the date of the widget.
      at: video.downloaded ? video.downloaded * 1000 : null,
    };
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.server = { ...this.server, reachable: false };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Tube Archivist ${this.config.url}: ${err.message}`);
    } else {
      logger.debug(`Tube Archivist ${this.config.url}: ${err.message} (again)`);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Figures ---------------------------------------------------------------

  /** Videos downloaded today (local date of Gladys) according to Tube Archivist. */
  downloadedToday() {
    const today = localDate(this.now());
    return this.server.reading?.history.find((day) => day.date === today)?.count ?? 0;
  }

  /** The figures of the last reading (null before the first one). */
  totals() {
    const reading = this.server.reading;
    if (!reading) {
      return null;
    }
    return {
      videos: reading.videos,
      subscribed: reading.subscribed,
      sizeGb: toGigabytes(reading.size),
      pending: Math.max(0, reading.pending - reading.failedTotal),
      errors: reading.failedTotal,
      downloadedToday: this.downloadedToday(),
    };
  }

  /** The task Tube Archivist runs now, as one line in the language; '' when none. */
  currentTask(language = this.config?.language, max = 250) {
    const text = TASK_TEXT[language] ?? TASK_TEXT.en;
    const tasks = (this.server.reading?.tasks ?? []).filter(
      (task) =>
        task.level !== 'error' && !task.messages.some((line) => /^Task completed/i.test(line)),
    );
    if (tasks.length === 0) {
      return '';
    }
    // The download first: it is what the user waits for.
    const task = tasks.find((item) => item.group === 'download:run') ?? tasks[0];
    const label = text.groups[task.group] ?? task.title;
    let detail = '';
    if (task.group === 'download:run') {
      detail = (task.messages[0] ?? '').replace(/^Processing Video:\s*/i, '');
    } else if (task.group === 'download:scan') {
      detail = /Channel:\s*'(.*)'/.exec(task.messages[0] ?? '')?.[1] ?? '';
    }
    const percent =
      task.progress !== null && task.progress > 0 && task.progress < 1
        ? ` (${Math.round(task.progress * 100)} %)`
        : '';
    // The detail is cut, never the label nor the progress.
    const room = max - label.length - text.colon.length - percent.length;
    if (detail.length > room) {
      detail = room > 1 ? `${detail.slice(0, room - 1).trimEnd()}…` : '';
    }
    const line = `${label}${detail ? `${text.colon}${detail}` : ''}${percent}`;
    return line.length > max ? `${line.slice(0, max - 1)}…` : line;
  }

  /** The recent videos, newest first. */
  recent() {
    return this.saved.recent;
  }

  /** What the widget shows: a change asks Gladys to reload it. */
  widgetView() {
    return JSON.stringify([
      this.server.reachable,
      this.error?.kind ?? null,
      this.totals(),
      this.currentTask('en'),
      this.saved.recent.map((item) => item.id),
    ]);
  }

  // --- Publishing to Gladys --------------------------------------------------

  snapshot() {
    if (!this.server.reachable) {
      return { reachable: this.server.reachable };
    }
    const last = this.saved.recent[0];
    return {
      reachable: true,
      ...this.totals(),
      task: this.currentTask() || pick(TASK_TEXT.none, this.config.language),
      lastVideo: last ? `${last.title} (${last.channel})`.slice(0, 250) : null,
    };
  }

  async publishStates({ force = false } = {}) {
    if (!this.client) {
      return;
    }
    const now = this.now();
    const down = this.server.reachable === false;
    const states = [];
    for (const { key, externalId, value, text } of featureValues(
      serverIds(this.gladys),
      this.snapshot(),
    )) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While Tube Archivist is down, its last figures are not republished as fresh.
      const stale = down && key !== FEATURE_KEYS.ONLINE;
      const fresh =
        last && last.value === value && (stale || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransport() {
    if (!this.client || this.server.reachable === null) {
      return;
    }
    const value = this.server.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
    if (this.transport === value) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport: value },
      ]);
      this.transport = value;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------

  ensureServer(language = this.config?.language) {
    if (!this.client) {
      const status = this.connectionStatus();
      throw new CommandError(pick(status.message ?? ACTION_TEXT.noServer, language));
    }
  }

  /** A command error in the language, from an error of the client. */
  commandError(err, language) {
    if (!err.kind) {
      return err;
    }
    return new CommandError(pick(ERROR_TEXT[err.kind], language));
  }

  /** Rescan the subscriptions now (the task "Rescan your Subscriptions"). */
  async rescan(language = this.config?.language) {
    this.ensureServer(language);
    try {
      await this.client.startTask(TASKS.RESCAN);
    } catch (err) {
      throw this.commandError(err, language);
    }
    logger.info('Tube Archivist: rescan of the subscriptions started');
    await this.refresh().catch(() => {});
    return ACTION_TEXT.rescanStarted;
  }

  /**
   * Add a YouTube link to the queue, downloaded at once (`start: now`) or in
   * turn. Waits a little for Tube Archivist to accept it: a link it refuses
   * fails the command with its reason.
   */
  async addVideo(url, start = 'now', language = this.config?.language) {
    this.ensureServer(language);
    const link = parseYoutubeLink(url);
    if (!link) {
      throw new CommandError(pick(ACTION_TEXT.badUrl, language));
    }
    const autostart = start !== 'queue';
    let taskId;
    try {
      taskId = await this.client.addToQueue(link, { autostart });
    } catch (err) {
      throw this.commandError(err, language);
    }
    // Only that a link was added: it may carry a playlist or a private token.
    logger.info(
      `Tube Archivist: link added to the queue${autostart ? ', downloaded at once' : ''}`,
    );
    const attempts = Math.ceil(this.timings.addWaitMs / this.timings.addStepMs);
    let state = { status: 'PENDING', error: '' };
    for (let attempt = 0; taskId && attempt < attempts; attempt += 1) {
      await this.sleep(this.timings.addStepMs);
      try {
        state = await this.client.task(taskId);
      } catch {
        break; // the link was sent: its fate shows in the queue
      }
      if (state.status === 'SUCCESS' || state.status === 'FAILURE') {
        break;
      }
    }
    // In the background: the widget action has 30 s, the wait above up to 15.
    this.refresh().catch(() => {});
    if (state.status === 'FAILURE') {
      logger.info('Tube Archivist refused the link');
      throw new CommandError(
        `${pick(ACTION_TEXT.refused, language)}${state.error ? ` ${state.error.slice(0, 150)}` : ''}`,
      );
    }
    return autostart ? ACTION_TEXT.addedNow : ACTION_TEXT.added;
  }

  // --- Reports ---------------------------------------------------------------

  /** The sentence of the scene action: today's videos, the latest ones, the queue. */
  summary(count = 3) {
    this.ensureServer();
    const text = SUMMARY_TEXT[this.config.language] ?? SUMMARY_TEXT.en;
    if (!this.server.reachable) {
      return text.down;
    }
    const totals = this.totals();
    const latest = this.saved.recent.slice(0, count);
    const parts = [
      text.today(totals.downloadedToday),
      latest.length
        ? `${text.latest}${text.colon}${latest.map((video) => text.video(video.title, video.channel)).join(', ')}`
        : text.none,
    ];
    const queue = [text.pending(totals.pending)];
    if (totals.errors) {
      queue.push(text.errors(totals.errors));
    }
    const sentence = `Tube Archivist${text.colon}${parts.join(text.semicolon)}. ${queue.join(', ')}.`;
    return sentence.length > 1000 ? `${sentence.slice(0, 999)}…` : sentence;
  }

  /** "Test the connection": read Tube Archivist now, one report. */
  async testConnection() {
    await this.refresh();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!this.client || this.error) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const totals = this.totals();
      message[language] = [
        text.ok(this.server.version),
        text.videos(totals.videos, totals.sizeGb),
        text.channels(totals.subscribed),
        text.pending(totals.pending),
        ...(totals.errors ? [text.errors(totals.errors)] : []),
      ].join(', ');
    }
    return message;
  }
}

export { ERROR_KINDS };
