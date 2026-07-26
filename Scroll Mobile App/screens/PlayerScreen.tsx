// screens/PlayerScreen.tsx
// Full-screen playback for one series. Episodes are stacked vertically and
// swiped like a reel — which is how short dramas are actually watched — with
// an episode grid for jumping around and resume support via the local store.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoStage from '../components/VideoStage';
import EpisodeSheet from '../components/EpisodeSheet';
import EmptyState from '../components/EmptyState';
import { getTitleStream } from '../lib/api/reelshort';
import type { Drama, Episode, TitleStream } from '../lib/api/types';
import {
  addWatchTime,
  getPrefs,
  getProgressFor,
  isInMyList,
  recordEpisodeComplete,
  recordTitleStarted,
  saveProgress,
  setPrefs,
  toggleMyList,
} from '../lib/store';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

/** Speeds offered in the playback-rate sheet. */
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
/** Seconds of countdown before the next episode rolls. */
const AUTOPLAY_COUNTDOWN = 5;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Params {
  id: string;
  title?: string;
  drama?: Drama;
  /** 1-based episode to open on. Defaults to the saved resume point. */
  startEpisode?: number;
}

export default function PlayerScreen({ route, navigation }: any) {
  const { id, title: fallbackTitle, drama, startEpisode }: Params = route.params ?? {};
  const insets = useSafeAreaInsets();

  const [stream, setStream] = useState<TitleStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [resumeAt, setResumeAt] = useState(0);
  const [rate, setRate] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  /** Non-null while the post-episode autoplay countdown is running. */
  const [countdown, setCountdown] = useState<number | null>(null);

  const listRef = useRef<FlatList<Episode>>(null);
  /** Where the list should land once data arrives. */
  const initialIndex = useRef(0);
  /** Throttles progress writes to roughly one every few seconds. */
  const lastSaved = useRef(0);
  /** Last reported position, so watch time accrues from real deltas. */
  const lastPosition = useRef(0);
  /** Guards the once-per-visit "title started" stat. */
  const countedStart = useRef(false);

  /**
   * A page must match the viewport exactly or the pager drifts, leaving the
   * neighbouring episodes half-visible. The player is a stack screen with no
   * tab bar, so the viewport is the full window — read reactively so rotation
   * and split-screen stay correct.
   */
  const { height: pageHeight } = useWindowDimensions();

  /* --------------------------------- loading -------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await getPrefs();
      setAutoplayNext(prefs.autoplayNext);
      setRate(prefs.playbackRate);

      const data = await getTitleStream(id, prefs.lang);
      if (!data.episodes.length) {
        setError('No episodes are available for this title yet.');
        setStream(data);
        return;
      }

      // Explicit episode wins; otherwise pick up where the viewer left off.
      const progress = await getProgressFor(id);
      const target = startEpisode ?? progress?.episodeIndex ?? 1;
      const index = Math.max(0, Math.min(target - 1, data.episodes.length - 1));

      initialIndex.current = index;
      setActiveIndex(index);
      // Only resume mid-episode when returning to the very episode we saved.
      setResumeAt(!startEpisode && progress?.episodeIndex === target ? progress.positionSec : 0);
      setStream(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [id, startEpisode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    isInMyList(id).then(setSaved);
  }, [id]);

  /**
   * Land on the requested episode once the list exists. `initialScrollIndex`
   * alone isn't enough — it doesn't reliably apply the starting offset, which
   * left "resume episode 60" opening on episode 1 instead.
   */
  useEffect(() => {
    const index = initialIndex.current;
    if (!stream?.episodes.length || index <= 0) return;

    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: false });
      } catch {
        // onScrollToIndexFailed picks up the retry.
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [stream]);

  /* ------------------------------ progress saving ---------------------------- */

  const persist = useCallback(
    (positionSec: number, durationSec: number) => {
      if (!stream) return;

      // Watch time accrues from the gap between ticks. addWatchTime discards
      // implausible jumps, so seeks and backgrounding don't inflate it.
      addWatchTime(positionSec - lastPosition.current);
      lastPosition.current = positionSec;

      if (!countedStart.current) {
        countedStart.current = true;
        recordTitleStarted();
      }

      const now = Date.now();
      if (now - lastSaved.current < 4000) return;
      lastSaved.current = now;

      const entry: Drama = drama ?? {
        id: stream.id,
        title: stream.title,
        cover: stream.cover,
        episodeCount: stream.episodeCount,
        collectCount: stream.collectCount,
        themes: stream.themes,
      };

      saveProgress({
        drama: entry,
        episodeIndex: activeIndex + 1,
        positionSec,
        durationSec,
        totalEpisodes: stream.episodes.length,
      });
    },
    [stream, drama, activeIndex],
  );

  // Flush the final position when leaving, so "Continue Watching" is accurate
  // even if the viewer backs out seconds after the last throttled write.
  useEffect(() => {
    return navigation.addListener('beforeRemove', () => {
      lastSaved.current = 0;
    });
  }, [navigation]);

  /* -------------------------------- navigation ------------------------------- */

  const goToIndex = useCallback(
    (index: number, animated = true) => {
      if (!stream || index < 0 || index >= stream.episodes.length) return;
      setCountdown(null);
      setResumeAt(0);
      lastPosition.current = 0;
      setActiveIndex(index);
      listRef.current?.scrollToIndex({ index, animated });
    },
    [stream],
  );

  const handleEnded = useCallback(() => {
    recordEpisodeComplete();
    if (!stream) return;

    const hasNext = activeIndex < stream.episodes.length - 1;
    if (!hasNext) return;

    if (autoplayNext) {
      // A short countdown gives the viewer a chance to stop the roll-on.
      setCountdown(AUTOPLAY_COUNTDOWN);
    }
  }, [autoplayNext, stream, activeIndex]);

  // Ticks the autoplay countdown and advances when it reaches zero.
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      Haptics.selectionAsync().catch(() => {});
      goToIndex(activeIndex + 1);
      return;
    }

    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown, activeIndex, goToIndex]);

  const changeRate = useCallback((next: number) => {
    setRate(next);
    setSpeedOpen(false);
    setPrefs({ playbackRate: next });
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const onShare = useCallback(async () => {
    if (!stream) return;
    try {
      await Share.share({
        message: `Watching "${stream.title}" on Scroll — ${stream.episodeCount} episodes.`,
      });
    } catch {
      // The viewer dismissed the sheet; nothing to do.
    }
  }, [stream]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActiveIndex(first.index);
      setResumeAt(0);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onToggleSaved = useCallback(async () => {
    if (!stream) return;
    const entry: Drama = drama ?? {
      id: stream.id,
      title: stream.title,
      cover: stream.cover,
      episodeCount: stream.episodeCount,
      collectCount: stream.collectCount,
      themes: stream.themes,
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSaved(await toggleMyList(entry));
  }, [stream, drama]);

  const episodes = stream?.episodes ?? [];
  const title = stream?.title ?? fallbackTitle ?? '';

  const getItemLayout = useMemo(
    () => (_: unknown, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight],
  );

  /* --------------------------------- render --------------------------------- */

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading episodes…</Text>
      </View>
    );
  }

  if (error || !episodes.length) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <EmptyState
          icon="alert-circle-outline"
          title="Can't play this title"
          message={error ?? 'No episodes are available.'}
          actionLabel="Try again"
          onAction={load}
        />
        <Pressable style={styles.errorBack} onPress={() => navigation.goBack()}>
          <Text style={styles.errorBackText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        ref={listRef}
        data={episodes}
        keyExtractor={(ep) => ep.chapterId}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={pageHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        initialScrollIndex={initialIndex.current}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        // Keep the neighbours mounted so the next swipe is already buffered,
        // but no more than that — each mounted page holds a video player.
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews
        onScrollToIndexFailed={({ index }) => {
          // getItemLayout makes this rare, but recover rather than freeze.
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 80);
        }}
        renderItem={({ item, index }) => {
          const isActive = index === activeIndex;
          const shouldLoad = Math.abs(index - activeIndex) <= 1;

          return (
            <VideoStage
              url={shouldLoad ? item.url : null}
              poster={item.thumbnail}
              active={isActive}
              height={pageHeight}
              width={SCREEN_WIDTH}
              muted={muted}
              rate={rate}
              resumeAt={isActive ? resumeAt : 0}
              onEnded={isActive ? handleEnded : undefined}
              onProgress={isActive ? persist : undefined}
            >
              {/* Top chrome */}
              <LinearGradient
                colors={['rgba(0,0,0,0.75)', 'transparent']}
                style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}
                pointerEvents="box-none"
              >
                <Pressable
                  onPress={() => navigation.goBack()}
                  hitSlop={12}
                  style={styles.iconBtn}
                  accessibilityLabel="Back"
                >
                  <Ionicons name="chevron-back" size={28} color={colors.white} />
                </Pressable>

                <View style={styles.topTitle} pointerEvents="none">
                  <Text style={styles.titleText} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.episodeText}>
                    Episode {item.index} of {episodes.length}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setMuted((m) => !m)}
                  hitSlop={12}
                  style={styles.iconBtn}
                  accessibilityLabel={muted ? 'Unmute' : 'Mute'}
                >
                  <Ionicons
                    name={muted ? 'volume-mute' : 'volume-high'}
                    size={22}
                    color={colors.white}
                  />
                </Pressable>
              </LinearGradient>

              {/* Right-hand action rail */}
              <View style={[styles.rail, { bottom: insets.bottom + 110 }]} pointerEvents="box-none">
                <Pressable style={styles.railBtn} onPress={onToggleSaved} accessibilityLabel="My List">
                  <Ionicons
                    name={saved ? 'checkmark-circle' : 'add-circle-outline'}
                    size={30}
                    color={saved ? colors.accent : colors.white}
                  />
                  <Text style={styles.railLabel}>My List</Text>
                </Pressable>

                <Pressable
                  style={styles.railBtn}
                  onPress={() => setSheetOpen(true)}
                  accessibilityLabel="All episodes"
                >
                  <Ionicons name="grid-outline" size={28} color={colors.white} />
                  <Text style={styles.railLabel}>Episodes</Text>
                </Pressable>

                <Pressable
                  style={styles.railBtn}
                  onPress={() => setSpeedOpen(true)}
                  accessibilityLabel="Playback speed"
                >
                  <Ionicons name="speedometer-outline" size={28} color={colors.white} />
                  <Text style={styles.railLabel}>{rate}x</Text>
                </Pressable>

                <Pressable style={styles.railBtn} onPress={onShare} accessibilityLabel="Share">
                  <Ionicons name="share-social-outline" size={27} color={colors.white} />
                  <Text style={styles.railLabel}>Share</Text>
                </Pressable>

                <Pressable
                  style={styles.railBtn}
                  onPress={() => goToIndex(activeIndex + 1)}
                  disabled={activeIndex >= episodes.length - 1}
                  accessibilityLabel="Next episode"
                >
                  <Ionicons
                    name="play-skip-forward-outline"
                    size={28}
                    color={activeIndex >= episodes.length - 1 ? colors.textFaint : colors.white}
                  />
                  <Text style={styles.railLabel}>Next</Text>
                </Pressable>
              </View>

              {/* Roll-on to the next episode, with an escape hatch. */}
              {isActive && countdown !== null && (
                <View style={[styles.countdown, { bottom: insets.bottom + 96 }]}>
                  <Text style={styles.countdownText}>
                    Next episode in {countdown}s
                  </Text>
                  <View style={styles.countdownActions}>
                    <Pressable
                      style={styles.countdownCancel}
                      onPress={() => setCountdown(null)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.countdownCancelText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={styles.countdownPlay}
                      onPress={() => goToIndex(activeIndex + 1)}
                      accessibilityRole="button"
                    >
                      <Ionicons name="play" size={15} color={colors.black} />
                      <Text style={styles.countdownPlayText}>Play now</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Swipe affordance, only on the very first episode. */}
              {index === 0 && episodes.length > 1 && (
                <View style={[styles.hint, { bottom: insets.bottom + 74 }]} pointerEvents="none">
                  <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                  <Text style={styles.hintText}>Swipe up for the next episode</Text>
                </View>
              )}
            </VideoStage>
          );
        }}
      />

      <EpisodeSheet
        visible={sheetOpen}
        episodes={episodes}
        currentIndex={activeIndex}
        title={title}
        onSelect={(index) => {
          setSheetOpen(false);
          goToIndex(index, false);
        }}
        onClose={() => setSheetOpen(false)}
      />

      <Modal
        visible={speedOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setSpeedOpen(false)}
      >
        <Pressable style={styles.speedBackdrop} onPress={() => setSpeedOpen(false)} />
        <View style={[styles.speedSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.speedTitle}>Playback speed</Text>
          {SPEEDS.map((speed) => {
            const active = rate === speed;
            return (
              <Pressable
                key={speed}
                style={({ pressed }) => [styles.speedRow, pressed && styles.speedRowPressed]}
                onPress={() => changeRate(speed)}
                accessibilityRole="button"
              >
                <Text style={[styles.speedLabel, active && styles.speedLabelActive]}>
                  {speed === 1 ? 'Normal' : `${speed}x`}
                </Text>
                {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  center: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: { color: colors.textMuted, fontSize: typography.body },
  errorBack: { padding: spacing.md },
  errorBackText: { color: colors.textSecondary, fontSize: typography.body, fontWeight: weights.semibold },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  iconBtn: { padding: spacing.xs },
  topTitle: { flex: 1 },
  titleText: { color: colors.white, fontSize: typography.body + 1, fontWeight: weights.bold },
  episodeText: { color: colors.textSecondary, fontSize: typography.caption, marginTop: 1 },
  rail: { position: 'absolute', right: spacing.md, gap: spacing.lg, alignItems: 'center' },
  railBtn: { alignItems: 'center', gap: 3, width: 58 },
  railLabel: { color: colors.white, fontSize: 10, fontWeight: weights.semibold },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  hintText: { color: colors.textSecondary, fontSize: typography.caption },
  countdown: {
    position: 'absolute',
    left: spacing.lg,
    right: 80,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  countdownText: { color: colors.white, fontSize: typography.label, fontWeight: weights.semibold },
  countdownActions: { flexDirection: 'row', gap: spacing.sm },
  countdownCancel: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  countdownCancelText: { color: colors.white, fontSize: typography.caption, fontWeight: weights.semibold },
  countdownPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  countdownPlayText: { color: colors.black, fontSize: typography.caption, fontWeight: weights.bold },
  speedBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  speedSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  speedTitle: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  speedRowPressed: { opacity: 0.6 },
  speedLabel: { color: colors.textSecondary, fontSize: typography.body + 1 },
  speedLabelActive: { color: colors.text, fontWeight: weights.bold },
});
