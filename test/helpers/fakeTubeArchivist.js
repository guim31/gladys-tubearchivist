// -----------------------------------------------------------------------------
// An in-memory Tube Archivist behind the `request` seam of the client
// (src/tubearchivist/http.js). Its answers have the shape of a real Tube
// Archivist v0.5.12 (test/fixtures/tubearchivist/, recorded from it and
// trimmed): test/client.test.js reads both. Videos archived, a download queue
// with failed items, running tasks, an API token (DRF answers), a non-admin
// token, a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/tubearchivist/${name}.json`, import.meta.url), 'utf8'),
  );

export const TOKEN = '0123456789abcdef0123456789abcdef01234567';

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

// Pages of 25, from 1 (no page: the first), as Tube Archivist serves them.
const paginate = (data, params, page = 1) => ({
  data: data.slice((page - 1) * 25, page * 25),
  paginate: {
    page_size: 25,
    page_from: (page - 1) * 25,
    prev_pages: null,
    current_page: page > 1 ? page : 0,
    max_hits: false,
    params,
    last_page: Math.ceil(data.length / 25),
    next_pages: [],
    total_hits: data.length,
  },
});

export class FakeTubeArchivist {
  /**
   * @param {object} [options]
   * @param {string} [options.token] the token accepted
   * @param {boolean} [options.admin] false: the queue and tasks answer 403
   */
  constructor({ token = TOKEN, admin = true } = {}) {
    this.token = token;
    this.admin = admin;
    this.online = true;
    this.version = 'v0.5.12';
    this.channels = new Map(); // id -> { name, subscribed }
    this.videos = []; // newest download first
    this.queue = []; // in queue order
    this.notifications = [];
    this.tasks = new Map(); // task id -> { status, result }
    this.history = new Map(); // date -> count
    this.requests = [];
    this.nextTask = 1;
    this.clock = Date.parse('2026-10-25T07:50:00+02:00');
  }

  channel(name, { subscribed = true } = {}) {
    const id = `UC${name.replace(/\W/g, '').padEnd(22, 'x').slice(0, 22)}`;
    this.channels.set(id, { name, subscribed });
    return id;
  }

  /** A video archived now (or at `at`, ms). Returns its id. */
  archive(
    title,
    channel,
    { at = this.now ? this.now() : (this.clock += 60_000), size = 50_000_000, id } = {},
  ) {
    const youtubeId = id ?? `v${String(this.videos.length + this.queue.length).padStart(10, '0')}`;
    const channelId =
      [...this.channels].find(([, c]) => c.name === channel)?.[0] ??
      this.channel(channel, { subscribed: false });
    this.queue = this.queue.filter((item) => item.youtube_id !== youtubeId);
    this.videos.unshift({
      youtube_id: youtubeId,
      title,
      channelId,
      date_downloaded: Math.floor(at / 1000),
      media_size: size,
    });
    const date = new Date(at);
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    this.history.set(day, (this.history.get(day) ?? 0) + 1);
    return youtubeId;
  }

  /** A video waiting in the queue. Returns its id. */
  enqueue(title, channel, { error } = {}) {
    const youtubeId = `q${String(this.videos.length + this.queue.length).padStart(10, '0')}`;
    const item = { youtube_id: youtubeId, title, channel_name: channel };
    if (error) {
      item.message = error;
    }
    this.queue.push(item);
    return youtubeId;
  }

  fail(youtubeId, error = 'ERROR: [youtube] Video unavailable. This video is private') {
    const item = this.queue.find((entry) => entry.youtube_id === youtubeId);
    item.message = error;
  }

  /** The `request` seam of the client. */
  handle(url, { method = 'GET', headers = {}, body } = {}) {
    const target = new URL(url);
    const path = target.pathname;
    this.requests.push({ method, path: `${path}${target.search}`, body });
    if (!path.startsWith('/api/')) {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<!doctype html>' };
    }
    const auth = headers.authorization ?? '';
    if (auth === 'Token ' || !auth) {
      return json(403, { detail: 'Invalid token header. No credentials provided.' });
    }
    if (auth !== `Token ${this.token}`) {
      return json(403, { detail: 'Invalid token.' });
    }
    const adminOnly = path.startsWith('/api/download/') || path.startsWith('/api/task/');
    if (adminOnly && !this.admin) {
      return json(403, { detail: 'You do not have permission to perform this action.' });
    }
    const query = target.searchParams;
    if (path === '/api/ping/') {
      return json(200, { response: 'pong', user: 1, version: this.version, ta_update: null });
    }
    if (path === '/api/stats/video/') {
      const size = this.videos.reduce((sum, video) => sum + video.media_size, 0);
      return json(
        200,
        this.videos.length
          ? { ...fixture('stats-video'), doc_count: this.videos.length, media_size: size }
          : fixture('stats-video-empty'),
      );
    }
    if (path === '/api/stats/channel/') {
      if (this.channels.size === 0) {
        return json(200, fixture('stats-channel-empty'));
      }
      const subscribed = [...this.channels.values()].filter((c) => c.subscribed).length;
      return json(200, {
        doc_count: this.channels.size,
        active_true: this.channels.size,
        active_false: null,
        subscribed_true: subscribed || null,
        subscribed_false: this.channels.size - subscribed || null,
      });
    }
    if (path === '/api/stats/download/') {
      return json(
        200,
        this.queue.length
          ? {
              ...fixture('stats-download'),
              pending: this.queue.length,
              pending_videos: this.queue.length,
            }
          : fixture('stats-download-empty'),
      );
    }
    if (path === '/api/stats/downloadhist/') {
      return json(
        200,
        [...this.history].map(([date, count]) => ({ date, count, media_size: count * 1000 })),
      );
    }
    if (path === '/api/video/') {
      const template = fixture('video-list').data[0];
      const data = this.videos.map((video) => ({
        ...template,
        youtube_id: video.youtube_id,
        title: video.title,
        date_downloaded: video.date_downloaded,
        media_size: video.media_size,
        channel: {
          ...template.channel,
          channel_id: video.channelId,
          channel_name: this.channels.get(video.channelId).name,
        },
      }));
      return json(200, paginate(data, target.search.slice(1)));
    }
    if (path === '/api/download/' && method === 'GET') {
      let items = this.queue;
      if (query.get('error') === 'true') {
        items = items.filter((item) => item.message);
      }
      const template = fixture('download-list').data[0];
      return json(
        200,
        paginate(
          items.map(({ message, ...item }) => ({
            ...template,
            ...item,
            ...(message ? { message } : {}),
          })),
          target.search.slice(1),
          Number(query.get('page') ?? 1),
        ),
      );
    }
    if (path === '/api/download/' && method === 'POST') {
      const link = JSON.parse(body).data[0].youtube_id;
      const id = `task-${this.nextTask++}`;
      if (/\s/.test(link) || link.includes('invalid')) {
        this.tasks.set(id, {
          status: 'FAILURE',
          result: `{'exc_type': 'ValueError', 'exc_message': ['not a valid id_str: ${link}'], 'exc_module': 'builtins'}`,
        });
      } else {
        this.tasks.set(id, { status: 'SUCCESS', result: null });
        this.enqueue(`Added ${link}`, 'Added');
      }
      this.lastAdded = { link, autostart: query.get('autostart') === 'true' };
      return json(200, { message: 'add to queue task started', task_id: id });
    }
    let match = /^\/api\/task\/by-name\/([\w-]+)\/$/.exec(path);
    if (match && method === 'POST') {
      if (!['update_subscribed', 'download_pending'].includes(match[1])) {
        return json(404, { error: 'task name not found' });
      }
      this.started = [...(this.started ?? []), match[1]];
      return json(200, { task_id: `task-${this.nextTask++}`, status: 'PENDING' });
    }
    match = /^\/api\/task\/by-id\/([\w-]+)\/$/.exec(path);
    if (match) {
      const task = this.tasks.get(match[1]);
      return task
        ? json(200, { ...task, task_id: match[1] })
        : json(404, { error: 'task not found' });
    }
    if (path === '/api/notification/') {
      return json(200, this.notifications);
    }
    return {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<h1>Not Found</h1>',
    };
  }
}

/** A fake network: `request(url, options)` reaches the Tube Archivist at its base URL. */
export function createNetwork(servers) {
  const request = async (url, options) => {
    for (const [base, server] of Object.entries(servers)) {
      if (url.startsWith(base)) {
        if (!server.online) {
          const error = new Error('connect ECONNREFUSED');
          error.code = 'ECONNREFUSED';
          throw error;
        }
        return server.handle(url, options);
      }
    }
    const error = new Error('getaddrinfo ENOTFOUND');
    error.code = 'ENOTFOUND';
    throw error;
  };
  return { request };
}
