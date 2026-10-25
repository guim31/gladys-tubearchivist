// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.2+): `library`.
//
// The use case: what arrived in the archive and what Tube Archivist is doing,
// at a glance on the wall tablet, and a link pasted from the phone. Three
// tiles (downloaded today, in the queue, failed), the task in progress as a
// status row, the latest videos archived as a list (title, channel, date), and
// two buttons:
//   - "Add a video": a form (link, when to download) that adds it to the
//     queue; the form of a widget button needs Gladys 5.2.0;
//   - "Rescan": searches the subscribed channels for new videos now.
//
// Budget (8 components, 6 tiles, 1 status, 1 focal, 4 buttons, 2 texts):
// three tiles, one status, one list, two buttons. The figures are sent as
// values, not bound to device features, so the widget works before the
// device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS, WIDGET_KEY } from './hub.js';
import { DEFAULT_START, START_OPTIONS } from './scenes.js';
import { CONNECTION_TEXT, ERROR_TEXT, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  ADD: 'add',
  RESCAN: 'rescan',
});

// Rows of the list.
const LIST_SIZE = 5;

export const TEXT = {
  waiting: {
    en: 'Waiting for the first reading of Tube Archivist…',
    fr: 'En attente de la première lecture de Tube Archivist…',
    de: 'Warte auf die erste Abfrage von Tube Archivist…',
    es: 'Esperando la primera lectura de Tube Archivist…',
  },
  none: {
    en: 'No video archived yet.',
    fr: 'Aucune vidéo archivée pour le moment.',
    de: 'Noch kein Video archiviert.',
    es: 'Todavía no se ha archivado ningún vídeo.',
  },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  queue: { en: 'In the queue', fr: 'En attente', de: 'In der Warteschlange', es: 'En la cola' },
  errors: { en: 'Failed', fr: 'En erreur', de: 'Fehlgeschlagen', es: 'Fallidos' },
  task: { en: 'Task', fr: 'Tâche', de: 'Aufgabe', es: 'Tarea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  problem: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  add: {
    en: 'Add a video',
    fr: 'Ajouter une vidéo',
    de: 'Video hinzufügen',
    es: 'Añadir un vídeo',
  },
  rescan: { en: 'Rescan', fr: 'Rechercher', de: 'Neu suchen', es: 'Buscar' },
  link: { en: 'YouTube link', fr: 'Lien YouTube', de: 'YouTube-Link', es: 'Enlace de YouTube' },
  linkHelp: {
    en: 'A video, a playlist or a channel.',
    fr: 'Une vidéo, une playlist ou une chaîne.',
    de: 'Ein Video, eine Playlist oder ein Kanal.',
    es: 'Un vídeo, una lista o un canal.',
  },
  start: { en: 'Download', fr: 'Téléchargement', de: 'Download', es: 'Descarga' },
};

export const START_TEXT = {
  now: { en: 'At once', fr: 'Tout de suite', de: 'Sofort', es: 'Ahora mismo' },
  queue: { en: 'In turn', fr: 'À son tour', de: 'Der Reihe nach', es: 'Por turno' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: fit(t(text, language), 300) }],
  };
}

/** One row of the list: title, channel, date of the download. */
export function videoItem(video) {
  const item = { title: fit(video.title || '…', 60) };
  if (video.channel) {
    item.subtitle = fit(video.channel, 60);
  }
  const date = video.at ? new Date(video.at) : null;
  if (date && Number.isFinite(date.getTime())) {
    item.date = date.toISOString();
  }
  return item;
}

/** The "Add a video" button and its form (form texts: multi-language objects). */
function addButton(language) {
  return {
    type: 'button',
    label: t(TEXT.add, language),
    icon: 'plus',
    action: {
      key: ACTIONS.ADD,
      fields: [
        {
          key: 'url',
          type: 'string',
          required: true,
          label: TEXT.link,
          description: TEXT.linkHelp,
          placeholder: {
            en: 'https://www.youtube.com/watch?v=…',
            fr: 'https://www.youtube.com/watch?v=…',
            de: 'https://www.youtube.com/watch?v=…',
            es: 'https://www.youtube.com/watch?v=…',
          },
        },
        {
          key: 'start',
          type: 'select',
          required: false,
          default: DEFAULT_START,
          label: TEXT.start,
          options: START_OPTIONS.map((value) => ({ value, label: START_TEXT[value] })),
        },
      ],
    },
  };
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(hub.connectionStatus().message ?? CONNECTION_TEXT.noServer, language);
  }
  if (hub.error) {
    const unreachable = hub.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      ttl_seconds: 120,
      components: [
        {
          type: 'status',
          items: [
            {
              label: 'Tube Archivist',
              icon: 'alert-triangle',
              value: fit(t(unreachable ? TEXT.offline : TEXT.problem, language), 40),
              color: WIDGET_COLORS.DANGER,
            },
          ],
        },
        { type: 'text', variant: 'body', text: fit(t(ERROR_TEXT[hub.error.kind], language), 300) },
      ],
    };
  }
  const totals = hub.totals();
  if (!hub.server.reachable || !totals) {
    return message(TEXT.waiting, language);
  }
  const components = [
    {
      type: 'value',
      value: totals.downloadedToday,
      label: t(TEXT.today, language),
      icon: 'download',
      color: totals.downloadedToday ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    { type: 'value', value: totals.pending, label: t(TEXT.queue, language), icon: 'clock' },
    {
      type: 'value',
      value: totals.errors,
      label: t(TEXT.errors, language),
      icon: 'alert-circle',
      color: totals.errors ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    },
  ];
  const task = hub.currentTask(language, 40);
  if (task) {
    components.push({
      type: 'status',
      items: [
        {
          label: t(TEXT.task, language),
          icon: 'activity',
          value: task,
          color: WIDGET_COLORS.PRIMARY,
        },
      ],
    });
  }
  const videos = hub.recent().slice(0, LIST_SIZE);
  components.push(
    videos.length
      ? { type: 'card-list', display: 'list', items: videos.map(videoItem) }
      : { type: 'text', variant: 'body', text: t(TEXT.none, language) },
  );
  components.push(addButton(language));
  components.push({
    type: 'button',
    label: t(TEXT.rescan, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.RESCAN },
  });
  // Short while a task runs: its progress moves.
  return { ttl_seconds: task ? 30 : 300, components };
}

async function action(hub, { actionKey, values = {}, language }) {
  if (actionKey === ACTIONS.ADD) {
    return hub.addVideo(values.url, values.start, language);
  }
  if (actionKey === ACTIONS.RESCAN) {
    return hub.rescan(language);
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
