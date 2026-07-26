// lib/api/reelshort.ts
// Typed wrappers over the ReelShort endpoints. Every function normalises the
// upstream snake_case payload into the camelCase types in ./types, so screens
// never touch a raw response.
//
// Endpoint surface (all GET, all take ?lang=):
//   /api/foryou                       recommended feed
//   /api/latest                       newest titles
//   /api/trending                     trending (populated for some languages only)
//   /search?keyword=                  keyword search
//   /api/details?bookId=              title metadata
//   /api/chapters/details?bookId=     episode list, no video URLs
//   /api/stream/all-episode?bookId=   title metadata + every episode with a playable URL

import { get, GetOptions } from './client';
import type { Chapter, Drama, DramaDetail, Episode, Lang, TitleStream } from './types';

/** Feeds are stable for a while; cache them longer than the client default. */
const FEED_TTL = 10 * 60 * 1000;
/** An episode list effectively never changes within a session. */
const STREAM_TTL = 30 * 60 * 1000;

type RawDrama = {
  book_id?: string;
  title?: string;
  pic?: string;
  chapter_count?: number;
  collect_count?: number;
  theme?: string[];
};

type FeedResponse = { ok?: boolean; items?: RawDrama[] };

function toDrama(raw: RawDrama): Drama | null {
  if (!raw?.book_id || !raw.title) return null;
  return {
    id: raw.book_id,
    title: raw.title,
    cover: raw.pic ?? '',
    episodeCount: raw.chapter_count ?? 0,
    collectCount: raw.collect_count ?? 0,
    themes: Array.isArray(raw.theme) ? raw.theme.filter(Boolean) : [],
  };
}

function toDramas(items: RawDrama[] | undefined): Drama[] {
  if (!Array.isArray(items)) return [];
  return items.map(toDrama).filter((d): d is Drama => d !== null);
}

async function feed(path: string, lang: Lang, options?: GetOptions): Promise<Drama[]> {
  const json = await get<FeedResponse>(path, { lang }, { ttlMs: FEED_TTL, ...options });
  return toDramas(json.items);
}

/** The recommended feed — the richest single source (hundreds of titles). */
export function getForYou(lang: Lang = 'en', options?: GetOptions): Promise<Drama[]> {
  return feed('/api/foryou', lang, options);
}

/** Newest additions to the catalogue. */
export function getLatest(lang: Lang = 'en', options?: GetOptions): Promise<Drama[]> {
  return feed('/api/latest', lang, options);
}

/**
 * Trending titles. The upstream returns an empty list for several languages,
 * so callers should treat an empty result as "unavailable" rather than an error.
 */
export function getTrending(lang: Lang = 'en', options?: GetOptions): Promise<Drama[]> {
  return feed('/api/trending', lang, options);
}

/** Keyword search. Returns up to ~250 matches. */
export async function search(
  keyword: string,
  lang: Lang = 'en',
  options?: GetOptions,
): Promise<Drama[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  const json = await get<FeedResponse>('/search', { keyword: trimmed, lang }, options);
  return toDramas(json.items);
}

type DetailResponse = {
  ok?: boolean;
  id?: string;
  title?: string;
  pic?: string;
  desc?: string;
  theme?: string[];
  views?: number;
  chapters?: number;
  lang?: string;
};

function toDetail(json: DetailResponse, fallbackId: string, lang: Lang): DramaDetail {
  return {
    id: json.id ?? fallbackId,
    title: json.title ?? 'Untitled',
    cover: json.pic ?? '',
    episodeCount: json.chapters ?? 0,
    collectCount: 0,
    themes: Array.isArray(json.theme) ? json.theme.filter(Boolean) : [],
    description: json.desc ?? '',
    views: json.views ?? 0,
    lang: (json.lang as Lang) ?? lang,
  };
}

/** Title metadata: synopsis, genres, view count, episode count. */
export async function getDetails(
  bookId: string,
  lang: Lang = 'en',
  options?: GetOptions,
): Promise<DramaDetail> {
  const json = await get<DetailResponse>('/api/details', { bookId, lang }, options);
  return toDetail(json, bookId, lang);
}

type RawChapter = { id?: string; name?: string; duration?: number; is_lock?: number };
type ChaptersResponse = { ok?: boolean; chapters?: RawChapter[] };

/** Episode listing without video URLs — cheaper than the full stream payload. */
export async function getChapters(
  bookId: string,
  lang: Lang = 'en',
  options?: GetOptions,
): Promise<Chapter[]> {
  const json = await get<ChaptersResponse>('/api/chapters/details', { bookId, lang }, options);
  const chapters = Array.isArray(json.chapters) ? json.chapters : [];
  return chapters
    .filter((c) => !!c?.id)
    .map((c, i) => ({
      id: c.id as string,
      name: c.name ?? `Episode ${i + 1}`,
      duration: c.duration ?? 0,
      locked: c.is_lock === 1,
      index: i + 1,
    }));
}

type RawStreamVariant = { quality?: string; url?: string; sourceUrl?: string };
type RawEpisode = {
  index?: number;
  chapterId?: string;
  sourceVideoUrl?: string;
  videoUrl?: string;
  streams?: RawStreamVariant[];
  isHls?: boolean;
  video_pic?: string;
  duration?: number;
};
type StreamResponse = DetailResponse & {
  bookId?: string;
  totalChapters?: number;
  episodes?: RawEpisode[];
};

/**
 * Prefer the CDN's own HTTPS `.m3u8` over the API's `videoUrl` redirect: the
 * latter is served over plain http, which Android blocks by default and iOS
 * rejects under ATS. `sourceUrl` on a variant is the same direct CDN link.
 */
function pickUrl(...candidates: (string | undefined)[]): string {
  for (const url of candidates) {
    if (url && url.startsWith('https://')) return url;
  }
  // Nothing HTTPS on offer — upgrade a bare http URL rather than dropping the
  // episode; the CDN serves both schemes.
  for (const url of candidates) {
    if (url) return url.replace(/^http:\/\//, 'https://');
  }
  return '';
}

function toEpisode(raw: RawEpisode, position: number): Episode | null {
  const variants = (Array.isArray(raw.streams) ? raw.streams : [])
    .map((v) => ({ quality: v.quality ?? 'auto', url: pickUrl(v.sourceUrl, v.url) }))
    .filter((v) => !!v.url);

  const url = pickUrl(raw.sourceVideoUrl, variants[0]?.url, raw.videoUrl);
  if (!url) return null;

  return {
    index: raw.index ?? position + 1,
    chapterId: raw.chapterId ?? `ep-${position + 1}`,
    url,
    thumbnail: raw.video_pic ?? '',
    duration: raw.duration ?? 0,
    isHls: raw.isHls ?? url.includes('.m3u8'),
    variants,
  };
}

/**
 * The player's single source of truth: title metadata plus every episode with
 * a directly playable HLS URL. One request serves an entire series.
 */
export async function getTitleStream(
  bookId: string,
  lang: Lang = 'en',
  options?: GetOptions,
): Promise<TitleStream> {
  const json = await get<StreamResponse>(
    '/api/stream/all-episode',
    { bookId, lang },
    { ttlMs: STREAM_TTL, timeoutMs: 30000, ...options },
  );

  const raw = Array.isArray(json.episodes) ? json.episodes : [];
  const episodes = raw
    .map(toEpisode)
    .filter((e): e is Episode => e !== null)
    .sort((a, b) => a.index - b.index);

  const detail = toDetail(json, json.bookId ?? bookId, lang);
  return {
    ...detail,
    episodeCount: json.totalChapters ?? detail.episodeCount ?? episodes.length,
    episodes,
  };
}
