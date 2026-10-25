import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address: a bare host gets the port of Tube Archivist, a copied URL keeps its base', () => {
  assert.equal(parseServerUrl('192.0.2.20'), 'http://192.0.2.20:8000');
  assert.equal(parseServerUrl(' 192.0.2.20:9000 '), 'http://192.0.2.20:9000');
  assert.equal(parseServerUrl('http://archive.local:8000/'), 'http://archive.local:8000');
  assert.equal(parseServerUrl('https://example.org/ta/'), 'https://example.org/ta');
  assert.equal(
    parseServerUrl('http://192.0.2.20:8000/channel/UCSMOQeBJ2RAnuFungnQOxLg?x=1#top'),
    'http://192.0.2.20:8000',
  );
  assert.equal(
    parseServerUrl('https://example.org/ta/settings/application/'),
    'https://example.org/ta',
  );
  assert.equal(parseServerUrl('http://192.0.2.20:8000/api/ping/'), 'http://192.0.2.20:8000');
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null, 'no credentials in the URL');
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('normalization: defaults, numbers as strings, unknown values', () => {
  const config = normalizeConfig({});
  assert.equal(config.url, null);
  assert.equal(config.invalidUrl, false);
  assert.equal(config.token, '');
  assert.equal(config.pollIntervalMs, 120_000);
  assert.equal(config.language, 'fr');
  const typed = normalizeConfig({
    url: 'http://[bad',
    poll_interval: 300,
    language: 'it',
    token: '  abc123  ',
  });
  assert.equal(typed.invalidUrl, true);
  assert.equal(typed.pollIntervalMs, 300_000);
  assert.equal(typed.language, 'fr');
  assert.equal(typed.token, 'abc123', 'spaces of a copy are dropped');
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 120_000);
});
