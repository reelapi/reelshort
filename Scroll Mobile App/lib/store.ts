// lib/store.ts
// On-device persistence: My List, Continue Watching, recent searches, and
// preferences. AsyncStorage only — the app has no account system and nothing
// leaves the device.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Drama, Lang } from './api/types';

const KEYS = {
  myList: 'scroll:mylist:v1',
  progress: 'scroll:progress:v1',
  searches: 'scroll:searches:v1',
  prefs: 'scroll:prefs:v1',
  viewed: 'scroll:viewed:v1',
  genres: 'scroll:genres:v1',
  stats: 'scroll:stats:v1',
  onboarded: 'scroll:onboarded:v1',
} as const;

const MAX_RECENT_SEARCHES = 12;
const MAX_CONTINUE_WATCHING = 30;
const MAX_RECENTLY_VIEWED = 24;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full disk shouldn't take the screen down with it.
  }
}

/* ---------------------------------- My List --------------------------------- */

/** Saved titles, most recently added first. */
export function getMyList(): Promise<Drama[]> {
  return readJson<Drama[]>(KEYS.myList, []);
}

export async function isInMyList(id: string): Promise<boolean> {
  return (await getMyList()).some((d) => d.id === id);
}

export async function addToMyList(drama: Drama): Promise<Drama[]> {
  const list = await getMyList();
  const next = [drama, ...list.filter((d) => d.id !== drama.id)];
  await writeJson(KEYS.myList, next);
  return next;
}

export async function removeFromMyList(id: string): Promise<Drama[]> {
  const next = (await getMyList()).filter((d) => d.id !== id);
  await writeJson(KEYS.myList, next);
  return next;
}

/** Adds or removes, returning whether the title is saved afterwards. */
export async function toggleMyList(drama: Drama): Promise<boolean> {
  const saved = await isInMyList(drama.id);
  if (saved) await removeFromMyList(drama.id);
  else await addToMyList(drama);
  return !saved;
}

/* ----------------------------- Continue Watching ---------------------------- */

export interface WatchProgress {
  drama: Drama;
  /** 1-based episode the user was last on. */
  episodeIndex: number;
  /** Seconds into that episode. */
  positionSec: number;
  durationSec: number;
  totalEpisodes: number;
  updatedAt: number;
}

/** Most recently watched first. */
export function getContinueWatching(): Promise<WatchProgress[]> {
  return readJson<WatchProgress[]>(KEYS.progress, []);
}

export async function getProgressFor(id: string): Promise<WatchProgress | null> {
  return (await getContinueWatching()).find((p) => p.drama.id === id) ?? null;
}

/** Records where the viewer stopped. Called as playback advances. */
export async function saveProgress(entry: Omit<WatchProgress, 'updatedAt'>): Promise<void> {
  const list = await getContinueWatching();
  const next = [
    { ...entry, updatedAt: Date.now() },
    ...list.filter((p) => p.drama.id !== entry.drama.id),
  ].slice(0, MAX_CONTINUE_WATCHING);
  await writeJson(KEYS.progress, next);
}

export async function clearProgress(id: string): Promise<WatchProgress[]> {
  const next = (await getContinueWatching()).filter((p) => p.drama.id !== id);
  await writeJson(KEYS.progress, next);
  return next;
}

/** 0–1 across the whole series, blending finished episodes with the current one. */
export function seriesProgress(p: WatchProgress): number {
  if (!p.totalEpisodes) return 0;
  const withinEpisode = p.durationSec > 0 ? Math.min(p.positionSec / p.durationSec, 1) : 0;
  return Math.min((p.episodeIndex - 1 + withinEpisode) / p.totalEpisodes, 1);
}

/* ------------------------------ Recent searches ----------------------------- */

export function getRecentSearches(): Promise<string[]> {
  return readJson<string[]>(KEYS.searches, []);
}

export async function addRecentSearch(term: string): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return getRecentSearches();
  const list = await getRecentSearches();
  const next = [trimmed, ...list.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES,
  );
  await writeJson(KEYS.searches, next);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await writeJson(KEYS.searches, []);
}

/* -------------------------------- Preferences ------------------------------- */

export interface Prefs {
  lang: Lang;
  /** Autoplay the next episode when one finishes. */
  autoplayNext: boolean;
  /** Start the reels feed muted. */
  startMuted: boolean;
  /** Playback speed multiplier, remembered across episodes. */
  playbackRate: number;
}

export const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  autoplayNext: true,
  startMuted: false,
  playbackRate: 1,
};

export async function getPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...(await readJson<Partial<Prefs>>(KEYS.prefs, {})) };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch };
  await writeJson(KEYS.prefs, next);
  return next;
}

/* ------------------------------ Recently viewed ----------------------------- */

/** Titles whose detail page was opened, most recent first. */
export function getRecentlyViewed(): Promise<Drama[]> {
  return readJson<Drama[]>(KEYS.viewed, []);
}

/** Called when a title page opens. Also nudges the implicit taste profile. */
export async function recordView(drama: Drama): Promise<void> {
  const list = await getRecentlyViewed();
  const next = [drama, ...list.filter((d) => d.id !== drama.id)].slice(0, MAX_RECENTLY_VIEWED);
  await writeJson(KEYS.viewed, next);
}

export async function clearRecentlyViewed(): Promise<void> {
  await writeJson(KEYS.viewed, []);
}

/* ----------------------------- Genre preferences ---------------------------- */

/**
 * Genres the viewer picked during onboarding. These seed the personalised rows
 * before there's enough watch history to infer taste.
 */
export function getFavouriteGenres(): Promise<string[]> {
  return readJson<string[]>(KEYS.genres, []);
}

export async function setFavouriteGenres(genres: string[]): Promise<string[]> {
  await writeJson(KEYS.genres, genres);
  return genres;
}

/**
 * Genres inferred from what's actually been watched and opened, most frequent
 * first. Weighted so started series count for more than a browsed title.
 */
export async function getTasteGenres(): Promise<string[]> {
  const [progress, viewed, picked] = await Promise.all([
    getContinueWatching(),
    getRecentlyViewed(),
    getFavouriteGenres(),
  ]);

  const weights = new Map<string, { genre: string; score: number }>();
  const add = (genre: string, score: number) => {
    const key = genre.toLowerCase();
    const entry = weights.get(key);
    if (entry) entry.score += score;
    else weights.set(key, { genre, score });
  };

  picked.forEach((g) => add(g, 4));
  progress.forEach((p) => p.drama.themes.forEach((g) => add(g, 3)));
  viewed.forEach((d) => d.themes.forEach((g) => add(g, 1)));

  return [...weights.values()].sort((a, b) => b.score - a.score).map((e) => e.genre);
}

/* ---------------------------------- Stats ----------------------------------- */

export interface WatchStats {
  /** Episodes played through to the end. */
  episodesCompleted: number;
  /** Total watch time, in seconds. */
  secondsWatched: number;
  /** Distinct series started. */
  titlesStarted: number;
}

const EMPTY_STATS: WatchStats = { episodesCompleted: 0, secondsWatched: 0, titlesStarted: 0 };

export async function getStats(): Promise<WatchStats> {
  return { ...EMPTY_STATS, ...(await readJson<Partial<WatchStats>>(KEYS.stats, {})) };
}

/**
 * Accumulates watch time. Callers pass the elapsed delta since the last tick;
 * implausible jumps (a seek, a backgrounded app) are discarded rather than
 * inflating the total.
 */
export async function addWatchTime(deltaSec: number): Promise<void> {
  if (!(deltaSec > 0) || deltaSec > 30) return;
  const stats = await getStats();
  await writeJson(KEYS.stats, { ...stats, secondsWatched: stats.secondsWatched + deltaSec });
}

export async function recordEpisodeComplete(): Promise<void> {
  const stats = await getStats();
  await writeJson(KEYS.stats, { ...stats, episodesCompleted: stats.episodesCompleted + 1 });
}

export async function recordTitleStarted(): Promise<void> {
  const stats = await getStats();
  await writeJson(KEYS.stats, { ...stats, titlesStarted: stats.titlesStarted + 1 });
}

export async function resetStats(): Promise<WatchStats> {
  await writeJson(KEYS.stats, EMPTY_STATS);
  return EMPTY_STATS;
}

/* -------------------------------- Onboarding -------------------------------- */

export async function isOnboarded(): Promise<boolean> {
  return (await readJson<boolean>(KEYS.onboarded, false)) === true;
}

export async function setOnboarded(): Promise<void> {
  await writeJson(KEYS.onboarded, true);
}
