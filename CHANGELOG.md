# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Tube Archivist in Gladys: one device for the server (online, archived
  videos, subscribed channels, library size, videos in the queue, failed
  downloads, downloaded today, task in progress, last video archived).
- Scene triggers: a video was archived, a download failed (both can be
  filtered on a channel), the queue was emptied.
- Scene actions: read the latest videos (a sentence for a message or a voice
  announcement, and the figures), rescan the subscriptions, add a YouTube link
  to the queue (downloaded at once or in turn).
- A dashboard widget: downloaded today, in the queue, failed, the task in
  progress, the latest videos, and the buttons “Add a video” and “Rescan”.
- Configuration: address, API token, refresh interval, language of the feature
  names. Documentation in English, French, German and Spanish.
