// -----------------------------------------------------------------------------
// Tube Archivist client (REST API under /api/, port 8000 by default).
//
// Every request carries `Authorization: Token <token>`, the API token shown in
// the settings of Tube Archivist (Settings → Application → API token): never
// in the URL, never in the logs. The queue and the tasks need the token of an
// admin user (AdminOnly in Tube Archivist): a token that reads the library but
// is refused on the queue is reported as such.
//
// Paths and fields checked on a real Tube Archivist v0.5.12 (the fixtures in
// test/fixtures/tubearchivist/ are its answers, trimmed). Older versions
// (before v0.5) had other paths: they answer 404, reported as "not a Tube
// Archivist, or too old".
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // token missing or refused (403 on /api/ping/)
  NOT_ADMIN: 'not_admin', // the token reads the library, the queue is refused
  NOT_TUBEARCHIVIST: 'not_tubearchivist', // something answers, not this API
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

// Tasks started by the API (TASK_CONFIG of Tube Archivist, `api_start: true`).
export const TASKS = Object.freeze({
  RESCAN: 'update_subscribed',
  DOWNLOAD: 'download_pending',
});

export class TubeArchivistError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'TubeArchivistError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const int = (value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
const str = (value) => (typeof value === 'string' ? value : '');

/** A video of the library (GET /api/video/), reduced to what is used. */
export function parseVideo(raw) {
  return {
    id: str(raw?.youtube_id),
    title: str(raw?.title),
    channel: str(raw?.channel?.channel_name),
    published: str(raw?.published),
    // Seconds since the epoch.
    downloaded: Number.isFinite(raw?.date_downloaded) ? raw.date_downloaded : null,
    size: int(raw?.media_size),
    duration: str(raw?.player?.duration_str),
  };
}

/** An item of the download queue (GET /api/download/). */
export function parseQueueItem(raw) {
  return {
    id: str(raw?.youtube_id),
    title: str(raw?.title),
    channel: str(raw?.channel_name),
    published: str(raw?.published),
    // The error of yt-dlp, when the download failed.
    error: str(raw?.message),
  };
}

/** A notification of a running task (GET /api/notification/). */
export function parseNotification(raw) {
  return {
    id: str(raw?.id),
    title: str(raw?.title),
    group: str(raw?.group),
    level: str(raw?.level),
    messages: Array.isArray(raw?.messages) ? raw.messages.map(str).filter(Boolean) : [],
    progress: Number.isFinite(raw?.progress) ? raw.progress : null,
  };
}

/**
 * One YouTube link or id, as Tube Archivist takes them (a video, a channel,
 * a playlist); null when it is not one. Tube Archivist splits what it gets on
 * spaces: a single link only, the integration never sends a list.
 */
export function parseYoutubeLink(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || /\s/.test(text) || text.length > 500) {
    return null;
  }
  // A bare video id (11 characters), channel id (UC + 22) or playlist id.
  if (
    /^[\w-]{11}$/.test(text) ||
    /^UC[\w-]{22}$/.test(text) ||
    /^(PL|UU|OL)[\w-]{10,}$/.test(text)
  ) {
    return text;
  }
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (!['youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
    return null;
  }
  return url.toString();
}

export class TubeArchivistClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the base path if any
   * @param {string} options.token API token of Tube Archivist
   * @param {Function} [options.request] HTTP seam (src/tubearchivist/http.js)
   */
  constructor({ url, token, request = httpRequest }) {
    this.url = url;
    this.authorization = `Token ${token}`;
    this.request = request;
  }

  /** One call to the API; resolves with the parsed JSON. */
  async call(path, { method = 'GET', body } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        method,
        headers: { authorization: this.authorization },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new TubeArchivistError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new TubeArchivistError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    const { status, headers = {}, body: text } = answer;
    const json = /json/i.test(headers['content-type'] ?? '') ? safeJson(text) : undefined;
    if (status === 401 || status === 403) {
      // DRF says why: no credentials / invalid token on any path, no permission
      // on an admin path with a valid token.
      const detail = str(json?.detail);
      const permission = /permission/i.test(detail);
      throw new TubeArchivistError(
        permission ? ERROR_KINDS.NOT_ADMIN : ERROR_KINDS.AUTH,
        permission
          ? `${path}: the token is not an admin one`
          : `API token refused (${detail || status})`,
        { status },
      );
    }
    if (status >= 300 && status < 400) {
      throw new TubeArchivistError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 404 && json === undefined) {
      throw new TubeArchivistError(ERROR_KINDS.NOT_TUBEARCHIVIST, `${path}: not found`, { status });
    }
    if (status < 200 || status >= 300) {
      const detail = str(json?.error) || str(json?.detail);
      throw new TubeArchivistError(
        ERROR_KINDS.HTTP,
        `${path} answered HTTP ${status}${detail ? ` (${detail.slice(0, 200)})` : ''}`,
        { status },
      );
    }
    if (json === undefined) {
      throw new TubeArchivistError(ERROR_KINDS.NOT_TUBEARCHIVIST, `${path}: not a JSON answer`, {
        status,
      });
    }
    return json;
  }

  /** `{ version }`; throws AUTH on a refused token. */
  async ping() {
    const answer = await this.call('/api/ping/');
    if (answer?.response !== 'pong') {
      throw new TubeArchivistError(ERROR_KINDS.NOT_TUBEARCHIVIST, '/api/ping/: no pong');
    }
    return { version: str(answer.version) || null };
  }

  /**
   * The figures of the library and of the queue, the latest videos, the
   * failed downloads and the running tasks: one reading.
   */
  async read() {
    const { version } = await this.ping();
    const [videoStats, channelStats, downloadStats, history, latest, failed, notifications] =
      await Promise.all([
        this.call('/api/stats/video/'),
        this.call('/api/stats/channel/'),
        this.call('/api/stats/download/'),
        this.call('/api/stats/downloadhist/'),
        this.call('/api/video/?sort=downloaded&order=desc'),
        this.call('/api/download/?filter=pending&error=true'),
        this.call('/api/notification/'),
      ]);
    const list = (answer) => (Array.isArray(answer?.data) ? answer.data : []);
    return {
      version,
      videos: int(videoStats?.doc_count),
      size: int(videoStats?.media_size),
      channels: int(channelStats?.doc_count),
      subscribed: int(channelStats?.subscribed_true),
      // Pending includes the failed downloads (still in the queue, with an error).
      pending: int(downloadStats?.pending),
      // Videos downloaded per day, `YYYY-MM-DD` in the time zone of Tube Archivist.
      history: Array.isArray(history)
        ? history
            .filter((day) => typeof day?.date === 'string')
            .map((day) => ({ date: day.date, count: int(day.count) }))
        : [],
      latest: list(latest)
        .map(parseVideo)
        .filter((video) => video.id),
      failed: list(failed)
        .map(parseQueueItem)
        .filter((item) => item.id && item.error),
      failedTotal: int(failed?.paginate?.total_hits),
      tasks: Array.isArray(notifications)
        ? notifications.map(parseNotification).filter((task) => task.id)
        : [],
    };
  }

  /** Start a task by name (TASKS); resolves with its task id. */
  async startTask(name) {
    const answer = await this.call(`/api/task/by-name/${name}/`, { method: 'POST' });
    return str(answer?.task_id);
  }

  /**
   * Add one link to the queue (`autostart`: downloaded first, at once).
   * Tube Archivist extracts it in a task: resolves with the task id.
   */
  async addToQueue(link, { autostart = false } = {}) {
    const answer = await this.call(`/api/download/${autostart ? '?autostart=true' : ''}`, {
      method: 'POST',
      body: { data: [{ youtube_id: link, status: 'pending' }] },
    });
    return str(answer?.task_id);
  }

  /** The state of a task: `{ status, error }` (PENDING, STARTED, SUCCESS, FAILURE). */
  async task(id) {
    const answer = await this.call(`/api/task/by-id/${encodeURIComponent(id)}/`);
    let error = '';
    if (answer?.status === 'FAILURE') {
      // `result` is the repr of a Python dict: the message is in exc_message.
      const match = /'exc_message': \[(['"])(.*?)\1\]/.exec(str(answer.result));
      error = match ? match[2] : str(answer.result).slice(0, 200);
    }
    return { status: str(answer?.status), error };
  }

  /** The page of a video in the web interface, for the scene events. */
  videoUrl(id) {
    return `${this.url}/video/${encodeURIComponent(id)}`;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
