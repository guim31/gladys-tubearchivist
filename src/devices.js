// -----------------------------------------------------------------------------
// The Gladys device of a Tube Archivist server (`server:main`): online, videos
// archived, subscribed channels, size of the library, videos waiting in the
// download queue, failed downloads, videos downloaded today, the task running
// (text) and the last video archived (text).
//
// Feature category/type couples come from the core table (see
// test/gladys-rules.test.js). should_poll: false: the hub reads Tube Archivist
// on its own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';

export const DEVICE_TYPE = 'server';
export const SERVER_ID = 'main';
export const URL_PARAM = 'TUBEARCHIVIST_URL';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  VIDEOS: 'videos',
  CHANNELS: 'channels',
  LIBRARY_SIZE: 'library_size',
  PENDING: 'pending',
  ERRORS: 'errors',
  DOWNLOADED_TODAY: 'downloaded_today',
  TASK: 'task',
  LAST_VIDEO: 'last_video',
});

const K = FEATURE_KEYS;

// Feature names per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [K.ONLINE]: 'Online',
    [K.VIDEOS]: 'Archived videos',
    [K.CHANNELS]: 'Subscribed channels',
    [K.LIBRARY_SIZE]: 'Library size',
    [K.PENDING]: 'Videos in the queue',
    [K.ERRORS]: 'Failed downloads',
    [K.DOWNLOADED_TODAY]: 'Downloaded today',
    [K.TASK]: 'Task in progress',
    [K.LAST_VIDEO]: 'Last video archived',
  },
  fr: {
    [K.ONLINE]: 'En ligne',
    [K.VIDEOS]: 'Vidéos archivées',
    [K.CHANNELS]: 'Chaînes suivies',
    [K.LIBRARY_SIZE]: 'Taille de la bibliothèque',
    [K.PENDING]: "Vidéos en file d'attente",
    [K.ERRORS]: 'Téléchargements en erreur',
    [K.DOWNLOADED_TODAY]: "Téléchargées aujourd'hui",
    [K.TASK]: 'Tâche en cours',
    [K.LAST_VIDEO]: 'Dernière vidéo archivée',
  },
  de: {
    [K.ONLINE]: 'Online',
    [K.VIDEOS]: 'Archivierte Videos',
    [K.CHANNELS]: 'Abonnierte Kanäle',
    [K.LIBRARY_SIZE]: 'Größe der Bibliothek',
    [K.PENDING]: 'Videos in der Warteschlange',
    [K.ERRORS]: 'Fehlgeschlagene Downloads',
    [K.DOWNLOADED_TODAY]: 'Heute heruntergeladen',
    [K.TASK]: 'Laufende Aufgabe',
    [K.LAST_VIDEO]: 'Zuletzt archiviertes Video',
  },
  es: {
    [K.ONLINE]: 'En línea',
    [K.VIDEOS]: 'Vídeos archivados',
    [K.CHANNELS]: 'Canales suscritos',
    [K.LIBRARY_SIZE]: 'Tamaño de la biblioteca',
    [K.PENDING]: 'Vídeos en la cola',
    [K.ERRORS]: 'Descargas fallidas',
    [K.DOWNLOADED_TODAY]: 'Descargados hoy',
    [K.TASK]: 'Tarea en curso',
    [K.LAST_VIDEO]: 'Último vídeo archivado',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10_000_000;
const SIZE_MAX_GB = 1_000_000;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const DEFINITIONS = {
  online: sensor(DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    min: 0,
    max: 1,
  }),
  counter: sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
    min: 0,
    max: COUNTER_MAX,
  }),
  size: sensor(DEVICE_FEATURE_CATEGORIES.DATA, DEVICE_FEATURE_TYPES.DATA.SIZE, {
    unit: DEVICE_FEATURE_UNITS.GIGABYTE,
    min: 0,
    max: SIZE_MAX_GB,
  }),
  text: sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  }),
};

// Order = display order in Gladys. `value` reads the snapshot of the hub.
const FEATURES = [
  { key: K.ONLINE, definition: 'online', value: (s) => bit(s.reachable) },
  { key: K.VIDEOS, definition: 'counter', value: (s) => s.videos },
  { key: K.CHANNELS, definition: 'counter', value: (s) => s.subscribed },
  { key: K.LIBRARY_SIZE, definition: 'size', value: (s) => s.sizeGb },
  { key: K.PENDING, definition: 'counter', value: (s) => s.pending },
  { key: K.ERRORS, definition: 'counter', value: (s) => s.errors },
  { key: K.DOWNLOADED_TODAY, definition: 'counter', value: (s) => s.downloadedToday },
  { key: K.TASK, definition: 'text', value: (s) => s.task || null },
  { key: K.LAST_VIDEO, definition: 'text', value: (s) => s.lastVideo || null },
];

function bit(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

/** Bytes to gigabytes (10^9, as Tube Archivist shows them), two decimals. */
export const toGigabytes = (bytes) => Math.round(bytes / 1e7) / 100;

export const serverIds = (gladys) => gladys.externalIds(DEVICE_TYPE, SERVER_ID);

/** The server device. */
export function buildServer(gladys, config) {
  const ids = serverIds(gladys);
  const names = NAMES[config.language] ?? NAMES.en;
  return {
    name: `Tube Archivist ${hostOf(config.url)}`.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: config.url }],
    features: FEATURES.map(({ key, definition }) => ({
      ...DEFINITIONS[definition],
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(ids, snapshot) {
  return FEATURES.map(({ key, definition, value }) => {
    const read = value(snapshot);
    return {
      key,
      externalId: ids.feature(key),
      value: read === undefined ? null : read,
      text: definition === 'text',
    };
  });
}
