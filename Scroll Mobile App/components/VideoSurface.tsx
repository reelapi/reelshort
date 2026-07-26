// components/VideoSurface.tsx
// Native video surface, backed by expo-video. iOS decodes HLS with AVPlayer
// and Android with ExoPlayer, so the CDN's .m3u8 streams play directly — no
// JavaScript demuxer involved. (The web build uses VideoSurface.web.tsx.)

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoPlayer } from 'expo-video';
import type { VideoSurfaceHandle, VideoSurfaceProps } from './VideoSurface.types';

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
  // useVideoPlayer rebuilds the player whenever the source changes, so passing
  // null for off-screen pages genuinely frees their buffers.
  const player = useVideoPlayer(
    url ? { uri: url, contentType: 'hls' as const } : null,
    (p: VideoPlayer) => {
      p.loop = false;
      p.muted = muted;
      p.timeUpdateEventInterval = 1;
    },
  );

  /** The resume seek must happen exactly once per source. */
  const resumed = useRef(false);
  useEffect(() => {
    resumed.current = false;
  }, [url]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  // Reapplied whenever the source changes too — a rebuilt player starts at 1x.
  useEffect(() => {
    try {
      player.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    } catch {
      // Not every source honours a rate change; normal speed is a fine fallback.
    }
  }, [player, rate, url]);

  useImperativeHandle(
    ref,
    () => ({
      seek(seconds: number) {
        try {
          player.currentTime = seconds;
        } catch {
          // A source that refuses the seek keeps playing where it was.
        }
      },
    }),
    [player],
  );

  useEffect(() => {
    if (!url) return;

    const subs = [
      player.addListener('statusChange', ({ status, error }) => {
        onBuffering(status === 'loading');
        onFailed(status === 'error' || !!error);

        if (status === 'readyToPlay' && !resumed.current) {
          resumed.current = true;
          if (resumeAt > 1) {
            try {
              player.currentTime = resumeAt;
            } catch {
              // Fall back to playing from the start.
            }
          }
        }
      }),
      player.addListener('playingChange', ({ isPlaying }) => onPlayingChange(isPlaying)),
      player.addListener('timeUpdate', ({ currentTime }) =>
        onTime(currentTime, player.duration || 0),
      ),
      player.addListener('playToEnd', () => onEnded()),
    ];

    return () => subs.forEach((s) => s.remove());
  }, [player, url, resumeAt, onBuffering, onFailed, onPlayingChange, onTime, onEnded]);

  useEffect(() => {
    if (!url) return;
    if (shouldPlay) player.play();
    else player.pause();
  }, [player, url, shouldPlay]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls={false}
      // The app draws its own chrome; system controls would fight it.
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
});

export default VideoSurface;
