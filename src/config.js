// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Tube Archivist server: its address (port 8000 by default), its API token
// (Settings → Application in Tube Archivist), the refresh interval and the
// language of the feature names and sentences.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

export const DEFAULT_PORT = 8000;

export const DEFAULT_CONFIG = {
  url: '',
  token: '',
  poll_interval: '120',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 8000 added), or the URL copied from the browser, with
 * the base path of a server behind a reverse proxy. HTTP by default; the
 * query, the fragment, a page of the interface and a trailing slash dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // A bare host means the default port of Tube Archivist, not 80.
  if (!hasScheme && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  // A page of the interface copied from the browser (/channel/…, /settings/…).
  const path = url.pathname
    .replace(/\/(api|video|channel|playlist|downloads|settings|search|about|login)(\/.*)?$/i, '')
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const typed = text('url');
  const url = parseServerUrl(typed);
  const interval =
    source.poll_interval === undefined || source.poll_interval === null
      ? ''
      : String(source.poll_interval);
  return {
    url,
    invalidUrl: Boolean(typed) && !url,
    // A token is 40 hexadecimal characters: spaces around it come from a copy.
    token: text('token'),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(interval) ? interval : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
