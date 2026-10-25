// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the command
// messages, the task in progress and the sentence of the scene action. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './tubearchivist/client.js';

export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Tube Archivist server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Tube Archivist dans la configuration.",
    de: 'Gib die Adresse deines Tube-Archivist-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Tube Archivist en la configuración.',
  },
  invalid: {
    en: 'The address of the Tube Archivist server is not valid (e.g. http://192.168.1.2:8000).',
    fr: "L'adresse du serveur Tube Archivist n'est pas valide (ex. http://192.168.1.2:8000).",
    de: 'Die Adresse des Tube-Archivist-Servers ist ungültig (z. B. http://192.168.1.2:8000).',
    es: 'La dirección del servidor Tube Archivist no es válida (p. ej. http://192.168.1.2:8000).',
  },
  noToken: {
    en: 'Enter the API token of Tube Archivist (Settings → Application) in the configuration.',
    fr: "Saisissez le jeton d'API de Tube Archivist (Settings → Application) dans la configuration.",
    de: 'Gib das API-Token von Tube Archivist (Settings → Application) in der Konfiguration ein.',
    es: 'Introduzca el token de API de Tube Archivist (Settings → Application) en la configuración.',
  },
};

// One explanation per error kind (src/tubearchivist/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Tube Archivist does not answer: check the address and the port (8000).',
    fr: "Tube Archivist ne répond pas : vérifiez l'adresse et le port (8000).",
    de: 'Tube Archivist antwortet nicht: Prüfe die Adresse und den Port (8000).',
    es: 'Tube Archivist no responde: compruebe la dirección y el puerto (8000).',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: use the http:// address on your network.',
    fr: 'Certificat refusé : utilisez l’adresse en http:// de votre réseau.',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk.',
    es: 'Certificado rechazado: use la dirección http:// de su red.',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: copy it again from Settings → Application in Tube Archivist.',
    fr: "Jeton d'API refusé : recopiez-le depuis Settings → Application dans Tube Archivist.",
    de: 'API-Token abgelehnt: Kopiere es erneut aus Settings → Application in Tube Archivist.',
    es: 'Token de API rechazado: cópielo de nuevo desde Settings → Application en Tube Archivist.',
  },
  [ERROR_KINDS.NOT_ADMIN]: {
    en: 'This token cannot read the download queue: use the token of an admin user.',
    fr: "Ce jeton ne peut pas lire la file de téléchargement : utilisez celui d'un administrateur.",
    de: 'Dieses Token kann die Download-Warteschlange nicht lesen: Nimm das Token eines Admins.',
    es: 'Este token no puede leer la cola de descargas: use el token de un administrador.',
  },
  [ERROR_KINDS.NOT_TUBEARCHIVIST]: {
    en: 'No Tube Archivist v0.5 or later at this address (port 8000 by default).',
    fr: 'Aucun Tube Archivist v0.5 ou plus récent à cette adresse (port 8000 par défaut).',
    de: 'Kein Tube Archivist ab v0.5 unter dieser Adresse (standardmäßig Port 8000).',
    es: 'No hay ningún Tube Archivist v0.5 o posterior en esta dirección (puerto 8000).',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'The address redirects (a login page?): enter the direct address of Tube Archivist.',
    fr: "L'adresse redirige (page de connexion ?) : saisissez l'adresse directe de Tube Archivist.",
    de: 'Die Adresse leitet um (Anmeldeseite?): Gib die direkte Adresse von Tube Archivist ein.',
    es: 'La dirección redirige (¿página de acceso?): introduzca la dirección directa de Tube Archivist.',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Unexpected answer from Tube Archivist, see the logs of the integration.',
    fr: "Réponse inattendue de Tube Archivist, voir les logs de l'intégration.",
    de: 'Unerwartete Antwort von Tube Archivist, sieh in den Protokollen der Integration nach.',
    es: 'Respuesta inesperada de Tube Archivist, consulte los registros de la integración.',
  },
};

// Messages of the commands (widget buttons, scene actions).
export const ACTION_TEXT = {
  noServer: CONNECTION_TEXT.noServer,
  badUrl: {
    en: 'Enter the YouTube link of a video, a playlist or a channel.',
    fr: "Saisissez le lien YouTube d'une vidéo, d'une playlist ou d'une chaîne.",
    de: 'Gib den YouTube-Link eines Videos, einer Playlist oder eines Kanals ein.',
    es: 'Introduzca el enlace de YouTube de un vídeo, una lista o un canal.',
  },
  refused: {
    en: 'Tube Archivist refused the link:',
    fr: 'Tube Archivist a refusé le lien :',
    de: 'Tube Archivist hat den Link abgelehnt:',
    es: 'Tube Archivist ha rechazado el enlace:',
  },
  addedNow: {
    en: 'Added to Tube Archivist, downloaded at once.',
    fr: 'Ajouté à Tube Archivist, téléchargé tout de suite.',
    de: 'Zu Tube Archivist hinzugefügt, wird sofort heruntergeladen.',
    es: 'Añadido a Tube Archivist, se descarga ahora mismo.',
  },
  added: {
    en: 'Added to the queue of Tube Archivist.',
    fr: "Ajouté à la file d'attente de Tube Archivist.",
    de: 'Zur Warteschlange von Tube Archivist hinzugefügt.',
    es: 'Añadido a la cola de Tube Archivist.',
  },
  rescanStarted: {
    en: 'Search for new videos of the subscriptions started.',
    fr: 'Recherche de nouvelles vidéos des abonnements lancée.',
    de: 'Suche nach neuen Videos der Abos gestartet.',
    es: 'Búsqueda de nuevos vídeos de las suscripciones iniciada.',
  },
};

// The task in progress (feature and widget). The task titles of Tube
// Archivist are in English: the common ones are translated by their group.
export const TASK_TEXT = {
  none: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' },
  en: {
    colon: ': ',
    groups: {
      'download:run': 'Downloading',
      'download:scan': 'Searching for new videos',
      'download:add': 'Adding to the queue',
    },
  },
  fr: {
    colon: ' : ',
    groups: {
      'download:run': 'Téléchargement',
      'download:scan': 'Recherche de nouvelles vidéos',
      'download:add': "Ajout à la file d'attente",
    },
  },
  de: {
    colon: ': ',
    groups: {
      'download:run': 'Download',
      'download:scan': 'Suche nach neuen Videos',
      'download:add': 'Hinzufügen zur Warteschlange',
    },
  },
  es: {
    colon: ': ',
    groups: {
      'download:run': 'Descargando',
      'download:scan': 'Buscando nuevos vídeos',
      'download:add': 'Añadiendo a la cola',
    },
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => (version ? `OK, Tube Archivist ${version}` : 'OK, Tube Archivist'),
    videos: (count, gb) => `${count} video(s) (${gb} GB)`,
    channels: (count) => `${count} subscribed channel(s)`,
    pending: (count) => `${count} in the queue`,
    errors: (count) => `${count} failed`,
  },
  fr: {
    ok: (version) => (version ? `OK, Tube Archivist ${version}` : 'OK, Tube Archivist'),
    videos: (count, gb) => `${count} vidéo(s) (${String(gb).replace('.', ',')} Go)`,
    channels: (count) => `${count} chaîne(s) suivie(s)`,
    pending: (count) => `${count} en file d'attente`,
    errors: (count) => `${count} en erreur`,
  },
  de: {
    ok: (version) => (version ? `OK, Tube Archivist ${version}` : 'OK, Tube Archivist'),
    videos: (count, gb) => `${count} Video(s) (${String(gb).replace('.', ',')} GB)`,
    channels: (count) => `abonnierte Kanäle: ${count}`,
    pending: (count) => `${count} in der Warteschlange`,
    errors: (count) => `${count} fehlgeschlagen`,
  },
  es: {
    ok: (version) => (version ? `OK, Tube Archivist ${version}` : 'OK, Tube Archivist'),
    videos: (count, gb) => `${count} vídeo(s) (${String(gb).replace('.', ',')} GB)`,
    channels: (count) => `${count} canal(es) suscrito(s)`,
    pending: (count) => `${count} en la cola`,
    errors: (count) => `${count} fallido(s)`,
  },
};

// The sentence of the "Read the latest videos" scene action.
export const SUMMARY_TEXT = {
  en: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'no video downloaded today'
        : `${count} video${count > 1 ? 's' : ''} downloaded today`,
    latest: 'latest',
    video: (title, channel) => `“${title}” (${channel})`,
    none: 'no video archived yet',
    pending: (count) => `${count} in the queue`,
    errors: (count) => `${count} failed`,
    down: 'Tube Archivist does not answer.',
  },
  fr: {
    colon: ' : ',
    semicolon: ' ; ',
    today: (count) =>
      count === 0
        ? "aucune vidéo téléchargée aujourd'hui"
        : `${count} vidéo${count > 1 ? 's' : ''} téléchargée${count > 1 ? 's' : ''} aujourd'hui`,
    latest: 'dernières',
    video: (title, channel) => `« ${title} » (${channel})`,
    none: 'aucune vidéo archivée pour le moment',
    pending: (count) => `${count} en file d'attente`,
    errors: (count) => `${count} en erreur`,
    down: 'Tube Archivist ne répond pas.',
  },
  de: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'heute kein Video heruntergeladen'
        : `${count} Video${count > 1 ? 's' : ''} heute heruntergeladen`,
    latest: 'zuletzt',
    video: (title, channel) => `„${title}“ (${channel})`,
    none: 'noch kein Video archiviert',
    pending: (count) => `${count} in der Warteschlange`,
    errors: (count) => `${count} fehlgeschlagen`,
    down: 'Tube Archivist antwortet nicht.',
  },
  es: {
    colon: ': ',
    semicolon: '; ',
    today: (count) =>
      count === 0
        ? 'ningún vídeo descargado hoy'
        : `${count} vídeo${count > 1 ? 's' : ''} descargado${count > 1 ? 's' : ''} hoy`,
    latest: 'últimos',
    video: (title, channel) => `«${title}» (${channel})`,
    none: 'todavía ningún vídeo archivado',
    pending: (count) => `${count} en la cola`,
    errors: (count) => `${count} fallido${count > 1 ? 's' : ''}`,
    down: 'Tube Archivist no responde.',
  },
};
