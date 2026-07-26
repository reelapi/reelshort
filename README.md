<div align="center">

# ReelShort + Scroll

A fork of the [ReelShort](https://github.com/reelapi/reelshort) web client and
API proxy, **plus a full native mobile app** for watching short-form vertical
dramas on Android and iOS.

</div>

---

## What's in here

| Folder | What it is |
| --- | --- |
| [`Scroll Mobile App/`](./Scroll%20Mobile%20App) | **Scroll** — a Netflix-styled Android & iOS app built with Expo and React Native. This is the new part. |
| `api/`, `src/`, `server.js` | The original web client (Vite + React + Tailwind) and its serverless API proxy, forked from upstream. |

### Get the app

Download the latest APK from the
**[Releases page](https://github.com/surenjanath/reelshort_added_mobile/releases)**
and sideload it on Android, or build it yourself — see the
[app's README](./Scroll%20Mobile%20App/README.md).

> **Heads up before installing.** The APK is **debug-signed** — built with
> Android's default debug key rather than a private release key. Play Protect
> will warn you ("Unsafe app blocked"); choose *More details → Install anyway*.
> The warning is legitimate: a debug-signed build is unverified, so nothing
> proves it came from me rather than someone who modified it. Only install a
> copy downloaded from this repository's Releases page.
>
> It also can't be installed over, or upgraded by, a Play Store build —
> signatures have to match to update in place. Android 7.0+ required. No iOS
> build is distributed; build from source for that.

---

## Scroll (mobile)

A proper native client, not a web wrapper. Netflix-style browsing over a
TikTok-style player.

- **Home** — billboard hero, genre shortcuts, Top 10, Continue Watching, and a
  row per genre. Shuffle drops you into a random series.
- **Reels** — a vertical swipe feed of episode one from a different series each
  page.
- **Search** — debounced live search with sorting, recent searches, and genre
  filters.
- **Player** — full-screen HLS, episodes swiped vertically, double-tap ±10s
  seek, 0.75×–2× speed, an episode grid, and an autoplay countdown.
- **Personalised** — a first-launch genre picker, then taste inferred from what
  you actually watch. Per-episode resume, My List, and watch statistics.
- **Private** — no accounts, adverts, analytics, or telemetry. Everything stays
  on your device.

Playback is native HLS — AVPlayer on iOS, ExoPlayer on Android — with `hls.js`
on web, where browsers can't decode HLS on their own.

Full documentation, architecture notes, and build instructions:
**[`Scroll Mobile App/README.md`](./Scroll%20Mobile%20App/README.md)**

---

## Web client (upstream fork)

The original Vite + React app and the API proxy it runs on.

```bash
npm install
cp .env.example .env    # set API_URL and AUTH_TOKEN
npm run dev             # Vite dev server
npm run build           # production build
node server.js          # Express server + API proxy on :3004
```

`api/` holds the serverless functions for Vercel; `server.js` is the equivalent
for running it as a plain Node process.

> **Note:** the mobile app does **not** use the `api/` handlers in this folder.
> It talks to the deployed service at `https://reelshort.vercel.app`, whose live
> endpoint surface differs from the handlers here. The app's README documents the
> endpoints it actually calls.

---

## Content, rights, and takedowns

Neither the web client nor the mobile app hosts any content. Both are clients
that request data live from a third-party API and play streams directly from
that service's CDN. Nothing is downloaded, copied, re-hosted, re-encoded, or
redistributed, and no access control or protection is bypassed.

All titles, artwork, trademarks, and video remain the property of their
respective owners. This project claims no rights over any of it and is not
affiliated with, endorsed by, or connected to ReelShort, Crazy Maple Studio, or
any rights holder. It is a non-commercial hobby project.

**If you hold rights to something surfaced here** and would rather it weren't,
the most complete fix is with the API operator, since that's both the source and
the host — removing it there removes it everywhere. I'll also act on any request
sent directly: open an issue on this repository and I'll remove access or retire
the project entirely.

Provided as-is, with no warranty. Availability depends on a third-party service
that may change or disappear at any time. Please use it only where lawful for
you, and for personal viewing.

---

## Licence

Application code is [0BSD](https://opensource.org/license/0bsd). This covers the
code in this repository only — **not** any content it displays.
