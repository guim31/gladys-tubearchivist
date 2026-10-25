# Tube Archivist

Bring your [Tube Archivist](https://www.tubearchivist.com) server (the
self-hosted archive of YouTube channels, based on yt-dlp) into Gladys, over your
local network: the archived videos, the subscribed channels, the size of the
library, the download queue and its errors, the task in progress, the latest
videos on a dashboard, scenes that react when a new video arrives, when a
download fails or when the queue is empty, and scene actions to add a video or
rescan your subscriptions.

The integration was tested against a real Tube Archivist v0.5.12 (the official
Docker images, with real downloads from YouTube), not yet in a real Gladys
installation: feedback is welcome on the
[Gladys forum](https://community.gladysassistant.com) or in the
[issues](https://github.com/guim31/gladys-tubearchivist/issues).

## What you need

- Gladys Assistant 5.2.0 or later.
- A **Tube Archivist** server v0.5 or later, reachable from Gladys (same
  network), on the port of its web interface (`8000` by default).
- The **API token** of an admin user of Tube Archivist: log in as an admin, open
  **Settings → Application**, and copy the token shown under **API token**. The
  queue and the tasks are reserved to admins in Tube Archivist.

## Set up

1. Install the integration from the Gladys catalog.
2. In **Configuration**, enter the **Address** of Tube Archivist (for example
   `192.168.1.2:8000`; without a port, `8000` is used) and the **API token**.
3. Save, then click **Test the connection**: the message under the button gives
   the version of Tube Archivist, the videos and the size of the library, the
   subscribed channels, the queue and the errors.
4. Open the **Discover** tab: one device for the server. Click **Add**, pick a
   room and save.

Options:

- **Refresh interval**: 1 to 10 minutes (2 minutes by default). Each refresh is
  eight small requests to the API of Tube Archivist.
- **Language of the feature names**: the names given to the features when the
  device is added (French by default), the text of the task in progress and the
  sentences of the scene actions.

The integration reads Tube Archivist. It changes something only when you ask
for it: **Add a video** and **Rescan** (widget buttons or scene actions).

## The device

One device, **Tube Archivist** followed by the address of the server:

| Feature             | What it gives                                                   |
| ------------------- | --------------------------------------------------------------- |
| Online              | 1 when Tube Archivist answers, 0 otherwise                      |
| Archived videos     | videos in the library                                           |
| Subscribed channels | channels you are subscribed to in Tube Archivist                |
| Library size        | size of the videos on disk, in GB                               |
| Videos in the queue | videos waiting to be downloaded (the failed ones not counted)   |
| Failed downloads    | videos of the queue whose download failed                       |
| Downloaded today    | videos downloaded since midnight, as Tube Archivist counts them |
| Task in progress    | what Tube Archivist does now (download, rescan…), or “None”     |
| Last video archived | its title and its channel, as text                              |

The figures move at each refresh. **Task in progress** gives the video being
downloaded or the channel being searched, with its progress.

## Dashboard

The **Tube Archivist** widget shows three tiles (downloaded today, in the queue,
failed), the task in progress, the list of the latest videos archived (title,
channel and date), and two buttons:

- **Add a video**: a form with the YouTube link (a video, a playlist or a
  channel) and when to download it: **At once** (first in the queue, the
  download starts now) or **In turn** (at the end of the queue).
- **Rescan**: searches your subscribed channels for new videos now.

Add it from the dashboard editor; it needs no setting, and it works before the
device is added.

## Scenes

### Triggers

- **Tube Archivist video archived**: Tube Archivist has just downloaded a new
  video into the library. Filter: **Channel** (the name of the YouTube channel
  exactly as Tube Archivist shows it; empty: any). Information passed on to the
  actions: the channel, the title, the publication date on YouTube, the
  duration, the page of the video in Tube Archivist, and the number of videos
  downloaded today.
- **Tube Archivist download failed**: the download of a video of the queue
  failed (video unavailable, members only, blocked, yt-dlp error). Same filter.
  Information: the channel, the title, the error message and the link of the
  video on YouTube.
- **Tube Archivist queue emptied**: Tube Archivist has no video left to
  download (the failed ones stay in its queue and are not counted).
  Information: the videos downloaded today and the failed downloads.

Each event is announced once, even after a restart of the integration. What
Tube Archivist already had when the integration started is not announced.

### Actions

- **Read the latest Tube Archivist videos**: reads Tube Archivist now and gives
  a sentence for a message or a voice announcement, such as “Tube Archivist: 2
  videos downloaded today; latest: “…” (…), “…” (…). 4 in the queue, 1
  failed.”, with the figures separately (downloaded today, in the queue,
  failed, archived videos, title and channel of the last video). Option: the
  number of videos named in the sentence (3 by default).
- **Rescan the Tube Archivist subscriptions**: searches your subscribed
  channels for new videos now, like **Rescan your Subscriptions** in Tube
  Archivist. The new videos are added to the queue; the channels set to auto
  start are then downloaded.
- **Add a video to Tube Archivist**: adds a YouTube link (video, playlist,
  channel) to the queue, downloaded **At once** (by default) or **In turn**. A
  link Tube Archivist refuses fails the action, with its reason.

### Scene ideas

- When a video of your favorite channel is archived, send yourself a message:
  “New in the archive: {title} ({channel}, {duration})”.
- Every evening at 7 pm, rescan the subscriptions; when the queue is emptied,
  read the latest Tube Archivist videos and announce the sentence on the
  living room speaker.
- When a download fails, send the error message, so you can update the cookies
  of yt-dlp or check the video.

## Troubleshooting

- **“Tube Archivist does not answer”**: check the address and the port
  (`8000`), and that Gladys can reach the server (same network, firewall).
- **“API token refused”**: copy the token again from **Settings →
  Application** in Tube Archivist (a token changes when it is revoked).
- **“This token cannot read the download queue”**: the token belongs to a user
  who is not an admin; use the token of an admin user.
- **“No Tube Archivist v0.5 or later at this address”**: another service
  answers on this port, or Tube Archivist is older than v0.5 (its API paths
  were different): update it.
- **“The address redirects”**: a reverse proxy sends to a login page or to
  HTTPS; enter the direct address of Tube Archivist on your network.
- **Downloaded today** stays at 0 while videos arrive: Tube Archivist counts the
  days in its own time zone (`TZ` of its container); give it the time zone of
  Gladys.
- More details: set the `LOG_LEVEL` of the integration to `debug` and open its
  logs.

## Limits

- The figures, the events and the task in progress are as fresh as the refresh
  interval: a short task between two refreshes is not seen.
- Only the 25 most recent downloads are compared at each refresh: beyond 10 new
  videos (a large playlist added at once), the videos are counted, not all
  announced. A video imported or rescanned with an old download date is not
  announced.
- The 25 to 50 most recent failed downloads are read; the others are counted.
- **Add a video** waits up to 15 seconds for Tube Archivist to accept the link;
  a playlist or a channel can take longer: the action then succeeds, and its
  videos show in the queue at the next refresh.
- The integration was written for the API of Tube Archivist v0.5 (tested on
  v0.5.12): a future version that changes it may need an update.
- Not affiliated with Tube Archivist, YouTube or Google.
