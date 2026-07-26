// components/VideoSurface.web.tsx
// Web video surface.
//
// Desktop browsers can't decode HLS on their own: Chrome reports
// canPlayType('application/vnd.apple.mpegurl') as "maybe", then decodes only
// the audio track and leaves videoWidth at 0 — audio with a black frame. So on
// web the stream is demuxed by hls.js through Media Source Extensions, and the
// native <video> path is kept for Safari, which really does handle HLS itself.
//
// Metro resolves this file only for the web bundle, so hls.js never reaches the
// iOS or Android builds — those use VideoSurface.tsx and expo-video.

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import Hls from 'hls.js';
import type { VideoSurfaceHandle, VideoSurfaceProps } from './VideoSurface.types';

/** Fills its parent; the wrapping View carries the layout. */
const VIDEO_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  backgroundColor: '#000000',
};

const VideoSurface = forwardRef<VideoSurfaceHandle, VideoSurfaceProps>(function VideoSurface(
  {
    url,
    shouldPlay,
    muted,
    rate,
    resumeAt,
    onBuffering,
    onFailed,
    onPlayingChange,
    onTime,
    onEnded,
    style,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const resumed = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      seek(seconds: number) {
        const video = videoRef.current;
        if (video && Number.isFinite(seconds)) video.currentTime = seconds;
      },
    }),
    [],
  );

  /* ------------------------------ source loading ----------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Tear down whatever was attached before switching sources.
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();
    resumed.current = false;

    if (!url) return;

    onBuffering(true);
    onFailed(false);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        // Media and network errors are often recoverable; only a fatal one
        // that resists recovery should surface as a failure.
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else {
          onFailed(true);
          onBuffering(false);
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari decodes HLS natively.
      video.src = url;
      video.load();
    } else {
      onFailed(true);
      onBuffering(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, onBuffering, onFailed]);

  /* --------------------------------- events --------------------------------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const applyResume = () => {
      if (resumed.current) return;
      resumed.current = true;
      if (resumeAt > 1 && Number.isFinite(video.duration)) video.currentTime = resumeAt;
    };

    const handlers: [string, EventListener][] = [
      ['loadedmetadata', applyResume],
      ['canplay', () => onBuffering(false)],
      ['playing', () => {
        onBuffering(false);
        onPlayingChange(true);
      }],
      ['waiting', () => onBuffering(true)],
      ['pause', () => onPlayingChange(false)],
      ['play', () => onPlayingChange(true)],
      ['timeupdate', () => onTime(video.currentTime, video.duration || 0)],
      ['ended', () => onEnded()],
      ['error', () => {
        onFailed(true);
        onBuffering(false);
      }],
    ];

    handlers.forEach(([event, handler]) => video.addEventListener(event, handler));
    return () => handlers.forEach(([event, handler]) => video.removeEventListener(event, handler));
  }, [resumeAt, onBuffering, onFailed, onPlayingChange, onTime, onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  // Depends on url as well: swapping the source resets the element to 1x.
  // Guarded: assigning a non-finite rate throws, and an exception here would
  // tear down the whole player tree rather than just dropping the speed change.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  }, [rate, url]);

  /* ------------------------------ play / pause ------------------------------ */

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    if (shouldPlay) {
      // Browsers reject autoplay with sound until the page has been interacted
      // with. Reflecting that back keeps the paused glyph honest.
      video.play().catch(() => onPlayingChange(false));
    } else {
      video.pause();
    }
  }, [shouldPlay, url, onPlayingChange]);

  return (
    <View style={style}>
      <video ref={videoRef} style={VIDEO_STYLE} playsInline preload="auto" />
    </View>
  );
});

export default VideoSurface;
