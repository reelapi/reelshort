// tests/api.test.ts
// Integration tests against the live ReelShort API. These deliberately hit the
// network: the point is to catch the upstream changing shape or going away,
// which is the failure mode that actually breaks the app.
//
//   npm test
//
// Only lib/api/* and lib/catalog are imported here — nothing that pulls in
// React Native, so the suite runs under plain Node.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  getChapters,
  getDetails,
  getForYou,
  getLatest,
  getTitleStream,
  search,
} from '../lib/api/reelshort';
import {
  browsableGenres,
  dedupe,
  formatCount,
  formatDuration,
  formatWatchTime,
  loadCatalog,
  personalRows,
  pickRandom,
} from '../lib/catalog';
import type { Drama } from '../lib/api/types';

/** A title from the live feed, fetched once and shared across tests. */
let sample: Drama | null = null;

async function getSample(): Promise<Drama> {
  if (!sample) {
    const feed = await getForYou('en');
    assert.ok(feed.length > 0, 'for-you feed should not be empty');
    // Pick one with a reasonable episode count so the stream test is meaningful.
    sample = feed.find((d) => d.episodeCount > 1) ?? feed[0];
  }
  return sample;
}

function assertDramaShape(drama: Drama, context: string): void {
  assert.ok(drama.id, `${context}: id`);
  assert.equal(typeof drama.id, 'string', `${context}: id is a string`);
  assert.ok(drama.title, `${context}: title`);
  assert.equal(typeof drama.episodeCount, 'number', `${context}: episodeCount is a number`);
  assert.ok(Array.isArray(drama.themes), `${context}: themes is an array`);
}

test('for-you feed returns normalised titles', async () => {
  const feed = await getForYou('en');
  assert.ok(feed.length > 20, `expected a sizeable feed, got ${feed.length}`);
  feed.slice(0, 10).forEach((d, i) => assertDramaShape(d, `foryou[${i}]`));
  assert.ok(
    feed.some((d) => d.cover.startsWith('https://')),
    'covers should be https URLs',
  );
});

test('latest feed returns normalised titles', async () => {
  const feed = await getLatest('en');
  assert.ok(feed.length > 0, 'latest feed should not be empty');
  feed.slice(0, 5).forEach((d, i) => assertDramaShape(d, `latest[${i}]`));
});

test('search finds titles by keyword', async () => {
  const results = await search('ceo', 'en');
  assert.ok(results.length > 0, 'search for "ceo" should return matches');
  results.slice(0, 5).forEach((d, i) => assertDramaShape(d, `search[${i}]`));
  assert.ok(
    results.some((d) => d.title.toLowerCase().includes('ceo')),
    'at least one result should contain the keyword in its title',
  );
});

test('search returns nothing for an empty keyword without calling out', async () => {
  assert.deepEqual(await search('   ', 'en'), []);
});

test('details returns a synopsis for a real title', async () => {
  const drama = await getSample();
  const detail = await getDetails(drama.id, 'en');
  assert.equal(detail.id, drama.id);
  assert.ok(detail.title.length > 0, 'detail should have a title');
  assert.equal(typeof detail.views, 'number');
  assert.equal(typeof detail.description, 'string');
});

test('chapters listing is ordered and numbered from one', async () => {
  const drama = await getSample();
  const chapters = await getChapters(drama.id, 'en');
  assert.ok(chapters.length > 0, 'expected at least one chapter');
  assert.equal(chapters[0].index, 1, 'first chapter is episode 1');
  chapters.forEach((c, i) => {
    assert.equal(c.index, i + 1, 'chapter indices are contiguous');
    assert.ok(c.id, 'chapter has an id');
    assert.equal(typeof c.duration, 'number');
  });
});

test('stream endpoint yields playable HTTPS HLS URLs for every episode', async () => {
  const drama = await getSample();
  const stream = await getTitleStream(drama.id, 'en');

  assert.ok(stream.episodes.length > 0, 'expected episodes');
  assert.equal(stream.episodes[0].index, 1, 'episodes start at 1');

  for (const episode of stream.episodes) {
    assert.ok(
      episode.url.startsWith('https://'),
      `episode ${episode.index} must be HTTPS (Android blocks cleartext), got ${episode.url}`,
    );
    assert.ok(episode.url.includes('.m3u8'), `episode ${episode.index} should be an HLS playlist`);
  }

  // Episodes must be in ascending order, or the pager plays them out of sequence.
  const indices = stream.episodes.map((e) => e.index);
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b), 'episodes are sorted');
});

test('the first episode URL serves a real HLS manifest', async () => {
  const drama = await getSample();
  const stream = await getTitleStream(drama.id, 'en');
  const first = stream.episodes[0];

  const res = await fetch(first.url);
  assert.equal(res.status, 200, `manifest fetch failed for ${first.url}`);

  const body = await res.text();
  assert.ok(body.startsWith('#EXTM3U'), 'response should be an M3U8 playlist');
  assert.ok(body.includes('#EXTINF'), 'playlist should list media segments');
});

test('catalog assembles a hero and multiple browsable rows', async () => {
  const catalog = await loadCatalog('en');
  assert.equal(catalog.error, null, 'catalog should load without error');
  assert.ok(catalog.hero, 'catalog should pick a hero');
  assert.ok(catalog.rows.length >= 5, `expected several rows, got ${catalog.rows.length}`);
  assert.ok(catalog.pool.length > 50, 'pool should hold the merged feeds');

  // Every row must be non-trivial and internally unique, or the UI looks broken.
  for (const row of catalog.rows) {
    assert.ok(row.items.length >= 3, `row "${row.title}" is too short`);
    assert.equal(
      new Set(row.items.map((d) => d.id)).size,
      row.items.length,
      `row "${row.title}" contains duplicates`,
    );
  }

  const top10 = catalog.rows.find((r) => r.key === 'top10');
  assert.ok(top10?.ranked, 'the Top 10 row should be marked as ranked');
  assert.ok(top10 && top10.items.length <= 10, 'the Top 10 row holds at most ten titles');
});

test('genres are derived from the live catalogue', async () => {
  const catalog = await loadCatalog('en');
  const genres = browsableGenres(catalog.pool);
  assert.ok(genres.length > 3, `expected several browsable genres, got ${genres.length}`);
});

/* ------------------------------ pure helpers ------------------------------ */

test('dedupe keeps the first occurrence of each id', () => {
  const make = (id: string, title: string): Drama => ({
    id,
    title,
    cover: '',
    episodeCount: 0,
    collectCount: 0,
    themes: [],
  });
  const result = dedupe([make('a', 'first'), make('b', 'other'), make('a', 'duplicate')]);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'first');
});

test('formatCount abbreviates large numbers', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(842), '842');
  assert.equal(formatCount(1200), '1.2K');
  assert.equal(formatCount(51_813), '52K');
  assert.equal(formatCount(1_122_081), '1.1M');
  assert.equal(formatCount(12_500_000), '13M');
});

test('formatDuration renders minutes and seconds', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(9), '0:09');
  assert.equal(formatDuration(167), '2:47');
  assert.equal(formatDuration(605), '10:05');
});

test('formatWatchTime renders hours and minutes', () => {
  assert.equal(formatWatchTime(0), '0m');
  assert.equal(formatWatchTime(48), '48s');
  assert.equal(formatWatchTime(720), '12m');
  assert.equal(formatWatchTime(3600), '1h');
  assert.equal(formatWatchTime(13320), '3h 42m');
});

/* --------------------------- personalised rows --------------------------- */

function fixture(id: string, title: string, themes: string[], episodes = 40): Drama {
  return { id, title, cover: `https://x/${id}.jpg`, episodeCount: episodes, collectCount: 0, themes };
}

const POOL: Drama[] = [
  fixture('1', 'Alpha Moon', ['Werewolf']),
  fixture('2', 'Beta Moon', ['Werewolf']),
  fixture('3', 'Gamma Moon', ['Werewolf']),
  fixture('4', 'Delta Moon', ['Werewolf']),
  fixture('5', 'Boss One', ['Ceo']),
  fixture('6', 'Boss Two', ['Ceo']),
  fixture('7', 'Boss Three', ['Ceo']),
  fixture('8', 'Lone Title', ['Mafia']),
];

test('personalRows builds a "because you watched" row from shared genres', () => {
  const rows = personalRows(POOL, {
    tasteGenres: [],
    viewed: [],
    lastWatched: fixture('9', 'Watched Wolf', ['Werewolf']),
  });

  const because = rows.find((r) => r.key === 'because');
  assert.ok(because, 'expected a because-you-watched row');
  assert.match(because.title, /Watched Wolf/);
  assert.ok(because.items.every((d) => d.themes.includes('Werewolf')));
  assert.ok(!because.items.some((d) => d.id === '9'), 'the seed title is excluded');
});

test('personalRows never repeats a title across its rows', () => {
  const rows = personalRows(POOL, {
    tasteGenres: ['Werewolf', 'Ceo'],
    viewed: [],
    lastWatched: fixture('9', 'Watched Wolf', ['Werewolf']),
  });

  const ids = rows.filter((r) => r.key !== 'viewed').flatMap((r) => r.items.map((d) => d.id));
  assert.equal(new Set(ids).size, ids.length, 'a title appeared in more than one row');
});

test('personalRows skips genres with too few titles', () => {
  const rows = personalRows(POOL, { tasteGenres: ['Mafia'], viewed: [], lastWatched: null });
  assert.ok(!rows.some((r) => r.key === 'taste:Mafia'), 'Mafia has only one title');
});

test('personalRows returns nothing without any signal', () => {
  assert.deepEqual(personalRows(POOL, { tasteGenres: [], viewed: [], lastWatched: null }), []);
});

test('pickRandom returns a title from the pool, or null when empty', () => {
  const pick = pickRandom(POOL);
  assert.ok(pick && POOL.some((d) => d.id === pick.id));
  assert.equal(pickRandom([]), null);
  // Titles without artwork would render as an empty hero.
  assert.equal(pickRandom([{ ...fixture('x', 'No Art', []), cover: '' }]), null);
});
