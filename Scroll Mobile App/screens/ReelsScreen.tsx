// screens/ReelsScreen.tsx
// The discovery feed: episode one of a different series on every page, swiped
// vertically. Tapping through opens the full series in the player.
//
// Each page's video URL is resolved lazily — only for the active page and its
// neighbours — so opening the tab doesn't fire hundreds of requests.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  useWindowDimensions,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoStage from '../components/VideoStage';
import EmptyState from '../components/EmptyState';
import { getForYou, getTitleStream } from '../lib/api/reelshort';
import type { Drama } from '../lib/api/types';
import { formatCount } from '../lib/catalog';
import { getMyList, getPrefs, toggleMyList } from '../lib/store';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FEED_SIZE = 40;

export default function ReelsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  /**
   * A page must be exactly as tall as the viewport, or paging drifts and the
   * neighbouring reels stay half-visible. This screen lives inside the tab
   * navigator, so the viewport is the window minus the tab bar — taken from
   * the navigator itself rather than measured, because View.onLayout never
   * fires under react-native-web.
   */
  const { height: windowHeight } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();
  const pageHeight = Math.max(windowHeight - tabBarHeight, 1);

  const [feed, setFeed] = useState<Drama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  /** bookId -> episode-one HLS URL, filled in as pages come into range. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  /** Titles we've already asked about, successful or not. */
  const resolving = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<Drama>>(null);

  /* --------------------------------- loading -------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await getPrefs();
      setMuted(prefs.startMuted);
      const titles = await getForYou(prefs.lang);
      if (!titles.length) throw new Error('The feed is empty right now.');

      // A different slice each visit keeps the feed from feeling static.
      const start = Math.floor(Math.random() * Math.max(1, titles.length - FEED_SIZE));
      setFeed(titles.slice(start, start + FEED_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getMyList().then((list) => setSavedIds(new Set(list.map((d) => d.id))));
  }, [load]);

  /* ----------------------------- URL resolution ----------------------------- */

  const resolve = useCallback(async (drama: Drama) => {
    if (resolving.current.has(drama.id)) return;
    resolving.current.add(drama.id);
    try {
      const stream = await getTitleStream(drama.id);
      const first = stream.episodes[0];
      if (first?.url) setUrls((prev) => ({ ...prev, [drama.id]: first.url }));
    } catch {
      // A title that won't resolve simply shows its poster; the feed goes on.
    }
  }, []);

  // Warm the active page plus the next two, so a fast scroll stays ahead.
  useEffect(() => {
    if (!feed.length) return;
    for (let i = activeIndex; i <= activeIndex + 2 && i < feed.length; i++) {
      resolve(feed[i]);
    }
  }, [feed, activeIndex, resolve]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActiveIndex(first.index);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onToggleList = useCallback(async (drama: Drama) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const nowSaved = await toggleMyList(drama);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(drama.id);
      else next.delete(drama.id);
      return next;
    });
  }, []);

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
        <Text style={styles.loadingText}>Finding something to watch…</Text>
      </View>
    );
  }

  if (error || !feed.length) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <EmptyState
          icon="cloud-offline-outline"
          title="Feed unavailable"
          message={error ?? 'Nothing to show right now.'}
          actionLabel="Retry"
          onAction={load}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        ref={listRef}
        data={feed}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        // Belt and braces alongside pagingEnabled: an explicit interval keeps
        // the snap honest if the container height ever changes mid-scroll.
        snapToInterval={pageHeight}
        snapToAlignment="start"
        disableIntervalMomentum
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        renderItem={({ item, index }) => {
          const url = urls[item.id] ?? null;
          const inRange = Math.abs(index - activeIndex) <= 1;
          // Pause everything when the tab loses focus, or audio keeps playing
          // over the rest of the app.
          const isActive = index === activeIndex && isFocused;
          const saved = savedIds.has(item.id);

          return (
            <VideoStage
              url={inRange ? url : null}
              poster={item.cover}
              active={isActive}
              height={pageHeight}
              width={SCREEN_WIDTH}
              muted={muted}
              showScrubber={false}
              // Roll straight into the next title when this episode ends.
              onEnded={
                isActive && index < feed.length - 1
                  ? () => listRef.current?.scrollToIndex({ index: index + 1, animated: true })
                  : undefined
              }
            >
              {inRange && !url && (
                <View style={styles.resolving} pointerEvents="none">
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              )}

              <Pressable
                onPress={() => setMuted((m) => !m)}
                style={[styles.muteBtn, { top: insets.top + spacing.md }]}
                hitSlop={10}
                accessibilityLabel={muted ? 'Unmute' : 'Mute'}
              >
                <Ionicons
                  name={muted ? 'volume-mute' : 'volume-high'}
                  size={20}
                  color={colors.white}
                />
              </Pressable>

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.92)']}
                // No bottom inset here: the tab bar below already clears the
                // home indicator, so adding it again would float the overlay.
                style={styles.info}
                pointerEvents="box-none"
              >
                <View style={styles.infoText}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{item.episodeCount} episodes</Text>
                    {item.collectCount > 0 && (
                      <>
                        <Text style={styles.metaDot}>•</Text>
                        <Text style={styles.meta}>{formatCount(item.collectCount)} saves</Text>
                      </>
                    )}
                  </View>

                  {item.themes.length > 0 && (
                    <View style={styles.chips}>
                      {item.themes.slice(0, 3).map((theme) => (
                        <View key={theme} style={styles.chip}>
                          <Text style={styles.chipText}>{theme}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.actions}>
                    <Pressable
                      style={({ pressed }) => [styles.watchBtn, pressed && styles.pressed]}
                      onPress={() =>
                        navigation.navigate('Player', {
                          id: item.id,
                          drama: item,
                          title: item.title,
                        })
                      }
                      accessibilityRole="button"
                    >
                      <Ionicons name="play" size={17} color={colors.black} />
                      <Text style={styles.watchText}>Watch Series</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                      onPress={() => onToggleList(item)}
                      accessibilityLabel={saved ? 'Remove from My List' : 'Add to My List'}
                    >
                      <Ionicons
                        name={saved ? 'checkmark' : 'add'}
                        size={22}
                        color={saved ? colors.accent : colors.white}
                      />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [styles.iconAction, pressed && styles.pressed]}
                      onPress={() => navigation.navigate('Title', { id: item.id, drama: item })}
                      accessibilityLabel="More info"
                    >
                      <Ionicons name="information-circle-outline" size={22} color={colors.white} />
                    </Pressable>
                  </View>
                </View>
              </LinearGradient>
            </VideoStage>
          );
        }}
      />
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
  resolving: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  muteBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  infoText: { gap: spacing.sm },
  title: { color: colors.white, fontSize: typography.title, fontWeight: weights.black },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { color: colors.textSecondary, fontSize: typography.label },
  metaDot: { color: colors.textFaint, marginHorizontal: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  chipText: { color: colors.white, fontSize: typography.caption, fontWeight: weights.medium },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  watchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.sm,
  },
  watchText: { color: colors.black, fontSize: typography.body, fontWeight: weights.bold },
  iconAction: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75 },
});
