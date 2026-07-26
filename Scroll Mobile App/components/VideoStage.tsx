// components/VideoStage.tsx
// One full-screen episode: the video surface, a tap-to-pause overlay, a
// scrubbable progress bar, and slots for whatever chrome the screen wants on
// top. Both the player and the reels feed are vertical pagers built from this.
//
// The decoder lives behind VideoSurface (expo-video on native, hls.js on web);
// everything here is presentation and gesture handling.
//
// The parent decides which stages are *loaded* (the active page and its
// immediate neighbours, so the next swipe is already buffered) and which one is
// *active* (the only one allowed to play).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import VideoSurface from './VideoSurface';
import type { VideoSurfaceHandle } from './VideoSurface.types';
import { colors, radii, spacing, typography, weights } from '../lib/theme';
import { formatDuration } from '../lib/catalog';

interface Props {
  /** HLS URL. Pass null to leave this page unloaded. */
  url: string | null;
  /** Poster frame shown until the first video frame arrives. */
  poster?: string;
  /** Only the active stage plays; everything else stays paused. */
  active: boolean;
  height: number;
  width: number;
  muted?: boolean;
  /** Playback speed multiplier. */
  rate?: number;
  /** Fires when the episode plays through to the end. */
  onEnded?: () => void;
  /** Fires roughly once a second while playing. */
  onProgress?: (positionSec: number, durationSec: number) => void;
  /** Seconds to jump to once the video is ready — used to resume. */
  resumeAt?: number;
  /** Chrome drawn above the video (titles, action rails, episode buttons). */
  children?: React.ReactNode;
  /** Hides the scrubber for a cleaner discovery feed. */
  showScrubber?: boolean;
}

export default function VideoStage({
  url,
  poster,
  active,
  height,
  width,
  muted = false,
  rate = 1,
  onEnded,
  onProgress,
  resumeAt = 0,
  children,
  showScrubber = true,
}: Props) {
  const surface = useRef<VideoSurfaceHandle>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  /** An explicit tap-to-pause, cleared whenever the episode changes. */
  const [userPaused, setUserPaused] = useState(false);

  /** Which side the last double-tap seek hit, for the ±10s bubble. */
  const [seekHint, setSeekHint] = useState<'back' | 'forward' | null>(null);

  const trackWidth = useRef(width - spacing.lg * 2);
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const seekOpacity = useRef(new Animated.Value(0)).current;
  /** Read inside stable callbacks without making them depend on the value. */
  const scrubbingRef = useRef(false);
  const durationRef = useRef(0);
  const positionRef = useRef(0);
  /** Double-tap bookkeeping: a lone tap toggles play, two seek. */
  const lastTap = useRef(0);
  const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrubbingRef.current = scrubbing;
  }, [scrubbing]);

  useEffect(() => {
    setUserPaused(false);
    setPosition(0);
    setDuration(0);
    durationRef.current = 0;
    setFailed(false);
    setBuffering(true);
  }, [url]);

  /* ----------------------------- surface callbacks --------------------------- */
  // These are handed to VideoSurface, which subscribes to them in an effect.
  // Keeping them stable avoids tearing down and rebuilding the listeners on
  // every render.

  const handleTime = useCallback(
    (pos: number, dur: number) => {
      durationRef.current = dur;
      positionRef.current = pos;
      setDuration(dur);
      if (!scrubbingRef.current) setPosition(pos);
      onProgress?.(pos, dur);
    },
    [onProgress],
  );

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    onEnded?.();
  }, [onEnded]);

  const handleBuffering = useCallback((b: boolean) => setBuffering(b), []);
  const handleFailed = useCallback((f: boolean) => setFailed(f), []);
  const handlePlayingChange = useCallback((p: boolean) => setIsPlaying(p), []);

  /* -------------------------------- interaction ------------------------------ */

  const flashIcon = useCallback(() => {
    iconOpacity.setValue(1);
    Animated.timing(iconOpacity, {
      toValue: 0,
      duration: 650,
      delay: 250,
      useNativeDriver: true,
    }).start();
  }, [iconOpacity]);

  const togglePlay = useCallback(() => {
    if (!url) return;
    setUserPaused((paused) => !paused);
    flashIcon();
  }, [url, flashIcon]);

  /** Jump by ±10s, clamped, with a bubble on the side that was tapped. */
  const seekBy = useCallback(
    (deltaSec: number) => {
      const total = durationRef.current;
      if (!total) return;
      const target = Math.max(0, Math.min(positionRef.current + deltaSec, total - 0.5));
      positionRef.current = target;
      surface.current?.seek(target);
      setPosition(target);

      setSeekHint(deltaSec < 0 ? 'back' : 'forward');
      seekOpacity.setValue(1);
      Animated.timing(seekOpacity, {
        toValue: 0,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSeekHint(null);
      });
    },
    [seekOpacity],
  );

  /**
   * One tap toggles playback, two taps on the left or right third seek. The
   * single-tap action is deferred briefly so a double-tap can cancel it.
   */
  const handleTap = useCallback(
    (x: number) => {
      if (!url) return;
      const now = Date.now();

      if (now - lastTap.current < 280) {
        if (singleTap.current) {
          clearTimeout(singleTap.current);
          singleTap.current = null;
        }
        lastTap.current = 0;

        if (x < width * 0.35) seekBy(-10);
        else if (x > width * 0.65) seekBy(10);
        else togglePlay();
        return;
      }

      lastTap.current = now;
      singleTap.current = setTimeout(() => {
        singleTap.current = null;
        togglePlay();
      }, 280);
    },
    [url, width, seekBy, togglePlay],
  );

  useEffect(
    () => () => {
      if (singleTap.current) clearTimeout(singleTap.current);
    },
    [],
  );

  const seekToFraction = useCallback((fraction: number) => {
    const total = durationRef.current;
    if (!total) return;
    const target = Math.max(0, Math.min(fraction, 1)) * total;
    surface.current?.seek(target);
    setPosition(target);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setScrubbing(true);
        scrubbingRef.current = true;
        setScrubValue(Math.max(0, Math.min(evt.nativeEvent.locationX / trackWidth.current, 1)));
      },
      onPanResponderMove: (evt) => {
        setScrubValue(Math.max(0, Math.min(evt.nativeEvent.locationX / trackWidth.current, 1)));
      },
      onPanResponderRelease: (evt) => {
        const fraction = Math.max(0, Math.min(evt.nativeEvent.locationX / trackWidth.current, 1));
        seekToFraction(fraction);
        setScrubbing(false);
        scrubbingRef.current = false;
      },
      onPanResponderTerminate: () => {
        setScrubbing(false);
        scrubbingRef.current = false;
      },
    }),
  ).current;

  const total = duration || 0;
  const fraction = scrubbing ? scrubValue : total > 0 ? Math.min(position / total, 1) : 0;
  const showPoster = !!poster && (buffering || !isPlaying) && position === 0;

  return (
    <View style={[styles.stage, { height, width }]}>
      <VideoSurface
        ref={surface}
        url={url}
        shouldPlay={active && !userPaused}
        muted={muted}
        rate={rate}
        resumeAt={resumeAt}
        onBuffering={handleBuffering}
        onFailed={handleFailed}
        onPlayingChange={handlePlayingChange}
        onTime={handleTime}
        onEnded={handleEnded}
        style={StyleSheet.absoluteFill}
      />

      {showPoster && (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
          pointerEvents="none"
        />
      )}

      {/* Tap target sits under the chrome so buttons still win the touch. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(e) => {
          // react-native-web doesn't populate locationX on click events, so
          // fall back to pageX — the stage is full-bleed from x=0 either way.
          const { locationX, pageX } = e.nativeEvent;
          handleTap(typeof locationX === 'number' ? locationX : (pageX ?? 0));
        }}
      />

      {seekHint && (
        <Animated.View
          style={[
            styles.seekBubble,
            seekHint === 'back' ? styles.seekBubbleLeft : styles.seekBubbleRight,
            { opacity: seekOpacity },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={seekHint === 'back' ? 'play-back' : 'play-forward'}
            size={22}
            color={colors.white}
          />
          <Text style={styles.seekBubbleText}>10s</Text>
        </Animated.View>
      )}

      {buffering && !failed && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {failed && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={styles.failedText}>This episode wouldn't load</Text>
        </View>
      )}

      {/* The play/pause glyph that flashes on tap. */}
      <Animated.View style={[styles.centerOverlay, { opacity: iconOpacity }]} pointerEvents="none">
        <View style={styles.iconBubble}>
          <Ionicons name={isPlaying ? 'play' : 'pause'} size={34} color={colors.white} />
        </View>
      </Animated.View>

      {/* A persistent glyph while paused, so the state is never ambiguous. */}
      {!isPlaying && !buffering && !failed && active && (
        <View style={styles.centerOverlay} pointerEvents="none">
          <View style={styles.iconBubble}>
            <Ionicons name="play" size={34} color={colors.white} />
          </View>
        </View>
      )}

      {children}

      {showScrubber && (
        <View style={styles.scrubberWrap}>
          <View
            style={styles.touchTrack}
            onLayout={(e) => {
              trackWidth.current = e.nativeEvent.layout.width;
            }}
            {...panResponder.panHandlers}
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
              <View
                style={[styles.knob, { left: `${fraction * 100}%` }, scrubbing && styles.knobActive]}
              />
            </View>
          </View>
          <View style={styles.times}>
            <Text style={styles.time}>
              {formatDuration(scrubbing ? scrubValue * total : position)}
            </Text>
            <Text style={styles.time}>{formatDuration(total)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: colors.black, justifyContent: 'center' },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  failedText: { color: colors.textMuted, fontSize: typography.body, marginTop: spacing.md },
  // The ±10s bubble, anchored to whichever side was double-tapped.
  seekBubble: {
    position: 'absolute',
    top: '46%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  seekBubbleLeft: { left: spacing.xl },
  seekBubbleRight: { right: spacing.xl },
  seekBubbleText: { color: colors.white, fontSize: typography.caption, fontWeight: weights.bold },
  scrubberWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  // A tall, transparent strip: the visible bar is thin but the finger target
  // is comfortable.
  touchTrack: { height: 24, justifyContent: 'center' },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: radii.pill },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: radii.pill },
  knob: {
    position: 'absolute',
    top: -4.5,
    width: 12,
    height: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    marginLeft: -6,
  },
  knobActive: { transform: [{ scale: 1.6 }] },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  time: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: weights.medium },
});
