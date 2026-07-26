<div align="center">

# Scroll

**Short dramas, one reel at a time.**

A Netflix-styled Android & iOS app for watching short-form vertical dramas,
built with Expo and React Native on top of the ReelShort API in this repository.

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20Web-black)](#running-it)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61dafb)](https://reactnative.dev)
[![License](https://img.shields.io/badge/license-0BSD-blue)](#licence)

</div>

---

## Install

**Just want to watch?** Grab the APK from the
[Releases page](https://github.com/surenjanath/reelshort_added_mobile/releases)
and sideload it on Android.

1. Download `Scroll-v*.apk` to your phone.
2. Open it. Android will ask you to allow installs from this source — that
   setting is per-app, so you're granting it to your browser or file manager,
   not to Scroll.
3. Play Protect will show **"Unsafe app blocked"** or a similar warning. Choose
   *More details → Install anyway*.

### Before you install — please read

- **The APK is debug-signed.** It's built with Android's default debug key, not
  a private release key. That's why Play Protect warns about it. It means the
  build is unverified: nothing proves it came from me rather than someone who
  modified it. Only install a copy you downloaded from this repository's
  Releases page.
- **It can't upgrade a Play Store app**, and a future Play Store build couldn't
  upgrade it either. Signatures must match to update in place, so switching
  means uninstalling first and losing your list and watch progress.
- **Upgrading between releases here works normally**, as long as each one is
  debug-signed with the same key — which they are.
- **Android only.** There's no iOS build: distributing one outside the App Store
  needs a paid Apple Developer account. iOS users can build from source.
- **Requires Android 7.0+** (API 24) and an internet connection. There's no
  offline mode.
- **It's a universal APK** — it carries native code for `arm64-v8a`,
  `armeabi-v7a`, `x86`, and `x86_64`, so it runs on any device and emulator.
  That's most of the ~74 MB; a per-ABI split would be roughly a quarter of it.

**Want to build it yourself?** See [Running it](#running-it). Building from
source is the way to get a copy signed with your own key.

---

## What it does

| Screen | What you get |
| --- | --- |
| **Home** | A full-bleed billboard hero, genre shortcuts, and horizontal rows — Trending, Top 10, New Releases, Continue Watching, and a row for every genre in the catalogue. A shuffle button drops you into a random series. |
| **Reels** | A vertical swipe feed playing episode one of a different series on every page. Tap to pause, swipe for the next, one tap through to the full show. |
| **Search** | Debounced live search across the whole catalogue, with sorting, recent searches, genre filters, and a popular grid when the box is empty. |
| **My List** | Saved titles and Continue Watching with per-episode resume, plus watch statistics and settings. |
| **Title** | Synopsis, view count, genre chips, an episode list with real per-episode thumbnails, and "More Like This". |
| **Player** | Full-screen HLS playback. Episodes are stacked vertically and swiped like a reel, with a scrubber, double-tap ±10s seek, 0.75×–2× speed, an episode grid, and an autoplay countdown into the next episode. |

Other things it does:

- **Learns what you like.** A first-launch genre picker seeds your home screen;
  after that, taste is inferred from what you actually watch and open, weighted
  so a started series counts for more than a browsed one. You get "Because you
  watched …" and per-genre rows.
- **Remembers where you were**, per episode, across the whole series.
- **Seven languages** of catalogue: English, Indonesian, Japanese, Korean, Thai,
  Vietnamese, Chinese.
- **Works offline-ish.** Feeds are cached in memory with a TTL, and search shows
  local matches instantly while the network call is in flight.

---

## Running it

```bash
cd "Scroll Mobile App"
npm install

npm start          # Metro — press a / i, or scan the QR with Expo Go
npm run android    # build and run on a device or emulator
npm run ios        # build and run on a simulator
npm run web        # run in a browser
```

Checks:

```bash
npm run typecheck  # tsc --noEmit
npm test           # integration tests against the live API
```

The test suite deliberately hits the network. It asserts the upstream still
returns the shapes the app parses, and that a real `.m3u8` manifest comes back
for episode one — the failure mode that actually breaks the app.

### Building a release APK

The native `android/` project isn't committed; it's generated from `app.json`.
Regenerate it first:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

The APK lands in `android/app/build/outputs/apk/release/`.

If Gradle can't find your JDK or SDK, point at them explicitly:

```bash
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

Publishing to the Play Store needs a real upload keystore wired into
`android/keystore.properties` — the default build is debug-signed.

---

## How it works

### Data

Content comes from the ReelShort API in this repository
(`https://reelshort.vercel.app`). Every endpoint is a `GET` and takes a `lang`
parameter (`en`, `in`, `ja`, `ko`, `th`, `vi`, `zh`).

| Endpoint | Returns |
| --- | --- |
| `/api/foryou` | Recommended feed (~480 titles) |
| `/api/latest` | Newest additions |
| `/api/trending` | Trending — empty for some languages, so the app falls back to popularity |
| `/search?keyword=` | Keyword search (~250 results) |
| `/api/details?bookId=` | Synopsis, genres, view count |
| `/api/chapters/details?bookId=` | Episode list with durations |
| `/api/stream/all-episode?bookId=` | Title metadata **and every episode's playable HLS URL** |

`lib/api/reelshort.ts` wraps these and normalises the upstream `snake_case`
into camelCase types, so no screen touches a raw response. `lib/api/client.ts`
adds timeouts, a retry for serverless cold starts, request de-duping, and a TTL
cache.

Two things worth knowing if you're modifying this:

- **Playback uses `sourceVideoUrl`, not `videoUrl`.** The API's `videoUrl`
  redirect is plain `http`, which Android blocks by default and iOS rejects
  under ATS. The CDN's direct HTTPS `.m3u8` plays natively on both.
- **One request serves a whole series.** `/api/stream/all-episode` returns every
  episode URL *and* the synopsis, so the Title screen and Player share a single
  cached response.

### Building the catalogue

The API exposes three flat feeds; a Netflix-style home needs many rows.
`lib/catalog.ts` merges and dedupes the feeds, then derives rows as *views* over
that pool — Top 10 by save count, a row per genre with enough titles behind it,
"Binge-Worthy" for 60+ episode series, and so on. Nothing is invented: every row
is titles the API actually returned, grouped by the genre labels they carry.

### Playback

| Platform | Decoder |
| --- | --- |
| iOS | `expo-video` → AVPlayer (native HLS) |
| Android | `expo-video` → ExoPlayer (native HLS) |
| Web | `hls.js` via Media Source Extensions |

Web needs the extra path because desktop Chrome reports
`canPlayType('application/vnd.apple.mpegurl')` as `"maybe"`, then decodes only
the audio track and leaves `videoWidth` at 0 — audio over a black frame. Metro
resolves `VideoSurface.web.tsx` for web only, so `hls.js` never ships in the
mobile bundles.

### Layout

```
App.tsx                    tabs (Home/Reels/Search/My List) inside a stack
lib/
  api/client.ts            fetch wrapper: timeout, retry, cache, de-dupe
  api/reelshort.ts         typed endpoint wrappers
  api/types.ts             Drama, Episode, TitleStream, Lang
  catalog.ts               feeds -> browsable rows, personalised rows, formatters
  store.ts                 AsyncStorage: My List, progress, history, taste, stats
  theme.ts                 design tokens
components/
  VideoStage.tsx           one full-screen episode + custom controls
  VideoSurface.tsx         native decoder (expo-video)
  VideoSurface.web.tsx     web decoder (hls.js)
  Billboard.tsx            home hero
  Row.tsx / Poster.tsx     the horizontal carousel unit
  EpisodeSheet.tsx         numbered episode grid
  GenreOnboarding.tsx      first-launch taste picker
screens/                   Home, Reels, Search, MyList, Title, Player, About
tests/api.test.ts          live integration tests
```

---

## Gotchas

Two `react-native-web` gaps cost real debugging time here. Both fail silently —
no error, no warning, the feature just does nothing:

- **`View.onLayout` never fires.** Anything needing a measured size must get it
  another way. The vertical pagers take their page height from
  `useBottomTabBarHeight()` (Reels, inside the tab navigator) and
  `useWindowDimensions()` (Player, a full-screen stack screen). A page that
  doesn't exactly match its viewport makes the pager drift, leaving the next
  reel half-visible.
- **`locationX` is unset on click events.** Double-tap-to-seek falls back to
  `pageX`, or every tap registers as play/pause.

And one React Native gotcha:

- **With `numColumns > 1`, `FlatList` collapses data into rows.** `getItemLayout`
  and `initialScrollIndex` receive *row* indices, not item indices. Getting this
  wrong understates the content height and scrolls past the end — which showed
  up as a blank episode grid.

---

## About this app

Scroll is a personal, non-commercial hobby project. It was built for one reason:
to watch a specific short drama that wasn't available in any app or store I
could find.

**It hosts nothing.** Scroll stores no video, images, or metadata of its own.
Everything is requested live, at the moment you view it, from the third-party
API above, and streams play directly from that service's CDN. The app does not
download, copy, re-host, cache to disk, re-encode, or redistribute any content,
and it does not remove or bypass any access control, watermark, or protection.

**It claims nothing.** All titles, artwork, trademarks, and video remain the
property of their respective owners. Scroll asserts no rights over any of it and
is not affiliated with, endorsed by, or connected to ReelShort, Crazy Maple
Studio, or any rights holder.

**No tracking.** No accounts, no adverts, no analytics, no telemetry. Your list,
your progress, and your settings stay on your device and are deleted when you
uninstall. See [PRIVACY.md](PRIVACY.md).

The same statement is in the app itself, on the **About** page — reachable from
the ⓘ beside Search on Home.

### If you own this content

If you hold rights to something shown here and would rather it weren't, the
fastest and most complete fix is with the API operator, since that is the source
Scroll reads from and the host of the files themselves — removing it there
removes it everywhere, including here.

I'll also act on any request sent directly, and will remove access or retire the
app entirely on request. This isn't distributed for profit and there's no
interest in keeping anything online against a rights holder's wishes. Open an
issue on this repository.

### Use it lawfully

Provided as-is, with no warranty. Availability depends entirely on a third-party
service that may change or disappear without notice. Please use it only where
doing so is lawful for you, and for personal viewing.

---

## Licence

Application code is [0BSD](https://opensource.org/license/0bsd). This covers the
code in this folder only — **not** any content the app displays, which belongs to
its respective owners.
