// lib/api/types.ts
// Shapes returned by the ReelShort API (https://reelshort.vercel.app).
// The upstream sends snake_case; we normalise to camelCase at the client
// boundary so nothing downstream has to think about the wire format.

/** Languages the upstream catalogue is published in. */
export const LANGUAGES = ['en', 'in', 'ja', 'ko', 'th', 'vi', 'zh'] as const;
export type Lang = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Lang, string> = {
  en: 'English',
  in: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  th: 'Thai',
  vi: 'Vietnamese',
  zh: 'Chinese',
};

/** A catalogue entry as it appears in a feed or a search result. */
export interface Drama {
  id: string;
  title: string;
  cover: string;
  episodeCount: number;
  /** Number of users who saved the title. Absent on search results. */
  collectCount: number;
  /** Free-text genre labels, e.g. ["Werewolf", "Fated Lovers"]. */
  themes: string[];
}

/** Everything /api/details knows about a title. */
export interface DramaDetail extends Drama {
  description: string;
  views: number;
  lang: Lang;
}

/** One episode in the chapter listing (no video URL). */
export interface Chapter {
  id: string;
  name: string;
  /** Seconds. */
  duration: number;
  /** The upstream marks later episodes as paywalled, but still serves them. */
  locked: boolean;
  /** 1-based position in the series. */
  index: number;
}

export interface StreamVariant {
  quality: string;
  url: string;
}

/** A playable episode: everything Chapter has, plus a video source. */
export interface Episode {
  /** 1-based position in the series. */
  index: number;
  chapterId: string;
  /** Direct HLS (.m3u8) URL on the CDN — what the player actually loads. */
  url: string;
  /** Poster frame for the episode. */
  thumbnail: string;
  /** Seconds. */
  duration: number;
  isHls: boolean;
  variants: StreamVariant[];
}

/** The full payload for the player: title metadata plus every episode. */
export interface TitleStream extends DramaDetail {
  episodes: Episode[];
}

/** A named horizontal carousel on the home screen. */
export interface CatalogRow {
  key: string;
  title: string;
  items: Drama[];
  /** Renders with the oversized rank numerals, Netflix "Top 10" style. */
  ranked?: boolean;
}
