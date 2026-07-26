// lib/catalog.ts
// The API exposes three flat feeds (for-you, latest, trending). This module
// turns them into the browsable, Netflix-shaped catalogue the home screen
// renders: a hero pick, a Top 10, and a set of genre rows derived from the
// `themes` each title already carries. No invented data — every row is a view
// over titles the API actually returned.

import { getForYou, getLatest, getTrending } from './api/reelshort';
import type { CatalogRow, Drama, Lang } from './api/types';

/** Minimum titles sharing a theme before it earns its own row. */
const MIN_ROW_SIZE = 6;
/** Cap on generated genre rows, so the home screen stays scrollable. */
const MAX_GENRE_ROWS = 10;
const ROW_LENGTH = 20;

/** Removes repeats by id, keeping the first (highest-priority) occurrence. */
export function dedupe(items: Drama[]): Drama[] {
  const seen = new Set<string>();
  const out: Drama[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Deterministic per-id ordering. A plain shuffle would reorder rows on every
 * render; salting the hash per row keeps each row distinct but stable.
 */
function stableRank(id: string, salt: string): number {
  let hash = 2166136261;
  const input = `${salt}:${id}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function varied(items: Drama[], salt: string, limit = ROW_LENGTH): Drama[] {
  return [...items].sort((a, b) => stableRank(a.id, salt) - stableRank(b.id, salt)).slice(0, limit);
}

function byPopularity(items: Drama[]): Drama[] {
  return [...items].sort((a, b) => b.collectCount - a.collectCount);
}

/** Titles carrying a given theme label (case-insensitive). */
export function withTheme(items: Drama[], theme: string): Drama[] {
  const needle = theme.toLowerCase();
  return items.filter((d) => d.themes.some((t) => t.toLowerCase() === needle));
}

/** Every distinct theme in the pool, most common first. */
export function themeCounts(items: Drama[]): { theme: string; count: number }[] {
  const counts = new Map<string, { theme: string; count: number }>();
  for (const item of items) {
    for (const theme of item.themes) {
      const key = theme.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { theme, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Distinct genres with enough titles to be worth browsing. */
export function browsableGenres(items: Drama[]): string[] {
  return themeCounts(items)
    .filter((t) => t.count >= MIN_ROW_SIZE)
    .map((t) => t.theme);
}

export interface Catalog {
  /** Featured title for the billboard. */
  hero: Drama | null;
  rows: CatalogRow[];
  /** Everything we loaded, deduped — powers offline search and genre browsing. */
  pool: Drama[];
  /** Set when every feed failed; the UI shows a retry state. */
  error: string | null;
}

const EMPTY: Catalog = { hero: null, rows: [], pool: [], error: null };

/**
 * Loads all three feeds in parallel and assembles the home screen. A feed that
 * fails (or, like trending on some languages, returns nothing) is simply left
 * out rather than failing the whole screen.
 */
export async function loadCatalog(lang: Lang = 'en'): Promise<Catalog> {
  const [forYouRes, latestRes, trendingRes] = await Promise.allSettled([
    getForYou(lang),
    getLatest(lang),
    getTrending(lang),
  ]);

  const value = <T>(res: PromiseSettledResult<T[]>): T[] =>
    res.status === 'fulfilled' ? res.value : [];

  const forYou = value(forYouRes);
  const latest = value(latestRes);
  const trending = value(trendingRes);

  if (!forYou.length && !latest.length && !trending.length) {
    const reason =
      forYouRes.status === 'rejected' ? String((forYouRes.reason as Error)?.message ?? '') : '';
    return { ...EMPTY, error: reason || 'Could not reach the catalogue.' };
  }

  const pool = dedupe([...forYou, ...trending, ...latest]);
  const popular = byPopularity(pool);

  const rows: CatalogRow[] = [];
  const push = (key: string, title: string, items: Drama[], ranked = false) => {
    const unique = dedupe(items);
    if (unique.length >= 3) rows.push({ key, title, items: unique, ranked });
  };

  // Trending is only populated for some languages — fall back to popularity.
  push('trending', 'Trending Now', trending.length ? trending.slice(0, ROW_LENGTH) : popular.slice(0, ROW_LENGTH));
  push('top10', 'Top 10 Series Today', popular.slice(0, 10), true);
  push('new', 'New Releases', latest.slice(0, ROW_LENGTH));
  push('foryou', 'Made For You', varied(forYou, 'foryou'));

  for (const genre of browsableGenres(pool).slice(0, MAX_GENRE_ROWS)) {
    push(`genre:${genre}`, genre, varied(withTheme(pool, genre), genre));
  }

  push('binge', 'Binge-Worthy: 60+ Episodes', varied(pool.filter((d) => d.episodeCount >= 60), 'binge'));
  push('quick', 'Short & Sweet', varied(pool.filter((d) => d.episodeCount > 0 && d.episodeCount <= 40), 'quick'));
  push('loved', 'Most Loved', popular.slice(10, 10 + ROW_LENGTH));

  // The hero should be a title with artwork and a real audience behind it.
  const hero = popular.find((d) => !!d.cover) ?? pool[0] ?? null;

  return { hero, rows, pool, error: null };
}

/** Local substring match over an already-loaded pool — used for instant results. */
export function filterPool(pool: Drama[], query: string): Drama[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return pool.filter(
    (d) =>
      d.title.toLowerCase().includes(needle) ||
      d.themes.some((t) => t.toLowerCase().includes(needle)),
  );
}

/**
 * Rows built from what this viewer has actually watched and browsed. Returned
 * separately from loadCatalog so Home can slot them above the generic rows
 * without refetching the catalogue.
 */
export function personalRows(
  pool: Drama[],
  opts: { tasteGenres: string[]; viewed: Drama[]; lastWatched?: Drama | null },
): CatalogRow[] {
  const rows: CatalogRow[] = [];
  if (!pool.length) return rows;

  const exclude = new Set<string>();
  const push = (key: string, title: string, items: Drama[]) => {
    const unique = dedupe(items).filter((d) => !exclude.has(d.id));
    if (unique.length < 3) return;
    const capped = unique.slice(0, ROW_LENGTH);
    capped.forEach((d) => exclude.add(d.id));
    rows.push({ key, title, items: capped });
  };

  // "Because you watched X" — other titles sharing that series' genres.
  if (opts.lastWatched?.themes.length) {
    const related = pool.filter(
      (d) =>
        d.id !== opts.lastWatched!.id &&
        d.themes.some((t) => opts.lastWatched!.themes.some((s) => s.toLowerCase() === t.toLowerCase())),
    );
    push(
      'because',
      `Because you watched ${opts.lastWatched.title}`,
      varied(related, `because:${opts.lastWatched.id}`),
    );
  }

  // A row per stated or inferred favourite genre.
  for (const genre of opts.tasteGenres.slice(0, 4)) {
    const items = withTheme(pool, genre);
    if (items.length >= MIN_ROW_SIZE) push(`taste:${genre}`, `More ${genre}`, varied(items, genre));
  }

  // Titles the viewer opened but hasn't started.
  if (opts.viewed.length >= 3) {
    rows.push({
      key: 'viewed',
      title: 'Recently Viewed',
      items: dedupe(opts.viewed).slice(0, ROW_LENGTH),
    });
  }

  return rows;
}

/** A random title with artwork — powers the "Surprise Me" shuffle button. */
export function pickRandom(pool: Drama[]): Drama | null {
  const candidates = pool.filter((d) => !!d.cover && d.episodeCount > 0);
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Seconds -> "3h 42m" / "12m" / "48s", for the watch-time stat. */
export function formatWatchTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0m';
  const total = Math.floor(seconds);
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

/** "1.2M views" / "84K views" */
export function formatCount(n: number): string {
  if (!n || n < 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** Seconds -> "2:05". */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
