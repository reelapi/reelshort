# Changelog

All notable changes to Scroll.

## 1.2.1 — July 2026

### Fixed

- **Jumping to a late episode landed on episode 1.** `initialScrollIndex`
  doesn't reliably apply the starting offset, so resuming at episode 60 opened
  episode 1 instead. The player now scrolls to the target index explicitly once
  the list has mounted.
- **The episode grid came up blank on a late episode.** With `numColumns > 1`,
  FlatList collapses the data into rows and hands `getItemLayout` and
  `initialScrollIndex` *row* indices — but both were being given item indices.
  That understated the content height fivefold and scrolled far past the end.
- **A bad playback speed could black out the whole player.** Assigning a
  non-finite `playbackRate` throws, and the exception tore down the entire
  player tree instead of just dropping the speed change. Both video surfaces
  now clamp the rate and fall back to 1x.

## 1.2.0 — July 2026

### Changed

- **Renamed from ShortReel to Scroll**, with a new mark: a geometric "S" inside
  a film reel. The Android package changed to `com.scroll.app`, so this build
  installs alongside rather than over 1.1.0 — uninstall the old one first, and
  note that its saved list and progress don't carry across.

### Added

- **About page**, reachable from the icon beside Search on Home. States what the
  app is for, credits the third-party API and lists every endpoint it calls,
  and sets out that Scroll hosts no content, claims no rights, and is not
  affiliated with any rights holder.

### Fixed

- **Reels paged to the wrong height.** Pages were sized to the window, but the
  feed sits inside the tab navigator, so its viewport is shorter by the tab bar.
  Every page overshot, leaving the neighbouring reels half-visible at the top
  and bottom. The reels feed now derives its page height from
  `useBottomTabBarHeight()`, and the player — a full-screen stack screen — from
  `useWindowDimensions()`. Measuring the container with `View.onLayout` was
  tried first and doesn't work: the callback never fires under
  react-native-web.
- The reels overlay added a bottom safe-area inset on top of the tab bar, which
  floated it above where it belonged.

## 1.1.0 — July 2026

### Added

- **Genre onboarding** — a first-launch picker, built from the live catalogue's
  own genres, that seeds the personalised rows.
- **Personalised Home rows** — "Because you watched …", a row per favourite or
  inferred genre, and Recently Viewed. Titles used here are dropped from the
  generic rows so nothing repeats down the page.
- **Shuffle** — a header button that drops straight into a random series.
- **Double-tap to seek** — ±10 seconds on the left and right thirds of the
  player, with an on-screen bubble.
- **Playback speed** — 0.75x to 2x, remembered across episodes and sessions.
- **Autoplay countdown** — a five-second roll-on to the next episode, with
  Cancel and Play now.
- **Share** — from both the title page and the player.
- **Sorting** — best match, most saved, most episodes, shortest, and A–Z on
  Search; recently added, A–Z, and most episodes on My List.
- **Watch statistics** — total watch time, episodes finished, and series
  started, shown on My List and resettable from Settings.

### Fixed

- Double-tap seek did nothing on web: `react-native-web` leaves `locationX`
  unset on click events, so every tap fell through to play/pause. It now falls
  back to `pageX`.

## 1.0.0 — July 2026

First release. The project was rebuilt from the ground up as a short-drama
streaming client; nothing of the previous app remains.

### Added

- **Home** — full-bleed billboard hero, genre shortcuts, and horizontal rows:
  Trending, Top 10, New Releases, Made For You, Binge-Worthy, Short & Sweet,
  Most Loved, plus a row for every genre with enough titles behind it.
- **Reels** — vertical discovery feed playing episode one of a different series
  per page, with lazy URL resolution for the active page and its neighbours.
- **Search** — debounced live search over the whole catalogue, with local
  instant matches, recent searches, genre filters, and a popular grid.
- **My List** — saved titles and Continue Watching with per-episode resume,
  plus settings for catalogue language, autoplay-next, and starting muted.
- **Title** — synopsis, view count, genre chips, an episode list with real
  per-episode thumbnails, and a "More Like This" row.
- **Player** — full-screen HLS playback with episodes stacked vertically and
  swiped like a reel; scrubber, episode grid, autoplay-next, and resume.
- Typed API layer over the ReelShort endpoints, with timeouts, a retry for
  serverless cold starts, request de-duping, and a TTL cache.
- Integration tests that run against the live API, including a real `.m3u8`
  manifest fetch.

### Notes

- Playback resolves to the CDN's HTTPS `.m3u8` rather than the API's `videoUrl`
  redirect, which is plain `http` and blocked by Android and iOS by default.
- Web builds decode HLS with `hls.js`; desktop Chrome otherwise plays the audio
  track only. iOS and Android decode HLS natively via `expo-video`.
