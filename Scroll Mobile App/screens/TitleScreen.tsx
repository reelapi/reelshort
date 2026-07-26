// screens/TitleScreen.tsx
// The detail page for one series: artwork, synopsis, an episode list with
// thumbnails, and a "More Like This" row drawn from the same genre.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import Poster from '../components/Poster';
import { getChapters, getTitleStream, search as searchApi } from '../lib/api/reelshort';
import type { Drama, DramaDetail, Episode } from '../lib/api/types';
import { formatCount, formatDuration } from '../lib/catalog';
import { getPrefs, getProgressFor, isInMyList, recordView, toggleMyList } from '../lib/store';
import { colors, HERO_GRADIENT, radii, spacing, typography, weights } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ART_HEIGHT = Math.min(SCREEN_WIDTH * 1.15, 470);

export default function TitleScreen({ route, navigation }: any) {
  const { id, drama: seed } = route.params ?? {};
  const insets = useSafeAreaInsets();

  const [detail, setDetail] = useState<DramaDetail | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [similar, setSimilar] = useState<Drama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resumeEpisode, setResumeEpisode] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prefs = await getPrefs();

      // One call to /api/stream/all-episode covers the synopsis *and* every
      // episode with its own poster frame — and it's the same cached response
      // the player will use, so opening Play afterwards costs nothing.
      const stream = await getTitleStream(id, prefs.lang);
      const { episodes: eps, ...info } = stream;
      setDetail(info);
      setEpisodes(eps);

      // Feeds "Recently Viewed" and the implicit taste profile on Home.
      const { description: _d, views: _v, lang: _l, ...card } = info;
      recordView(card);

      // Older titles occasionally return no stream entries; the chapter list
      // still describes them, just without thumbnails.
      if (!eps.length) {
        getChapters(id, prefs.lang)
          .then((chapters) =>
            setEpisodes(
              chapters.map((c) => ({
                index: c.index,
                chapterId: c.id,
                url: '',
                thumbnail: '',
                duration: c.duration,
                isHls: false,
                variants: [],
              })),
            ),
          )
          .catch(() => setEpisodes([]));
      }

      // "More Like This" reuses search on the primary genre — the API has no
      // dedicated related-titles endpoint.
      const genre = info.themes[0] ?? seed?.themes?.[0];
      if (genre) {
        searchApi(genre, prefs.lang)
          .then((results) => setSimilar(results.filter((d) => d.id !== id).slice(0, 20)))
          .catch(() => setSimilar([]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [id, seed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    isInMyList(id).then(setSaved);
    getProgressFor(id).then((p) => setResumeEpisode(p?.episodeIndex ?? null));
  }, [id]);

  const asDrama = useCallback((): Drama => {
    if (detail) {
      const { description, views, lang, ...rest } = detail;
      return rest;
    }
    return (
      seed ?? { id, title: '', cover: '', episodeCount: 0, collectCount: 0, themes: [] }
    );
  }, [detail, seed, id]);

  const play = useCallback(
    (startEpisode?: number) => {
      const entry = asDrama();
      navigation.navigate('Player', { id, drama: entry, title: entry.title, startEpisode });
    },
    [navigation, id, asDrama],
  );

  const onToggleList = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSaved(await toggleMyList(asDrama()));
  }, [asDrama]);

  const onShare = useCallback(async () => {
    const entry = asDrama();
    try {
      await Share.share({
        message: `Check out "${entry.title}" on Scroll — ${entry.episodeCount} episodes.`,
      });
    } catch {
      // The viewer dismissed the sheet; nothing to do.
    }
  }, [asDrama]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <EmptyState
          icon="alert-circle-outline"
          title="Couldn't load this title"
          message={error}
          actionLabel="Retry"
          onAction={load}
        />
      </View>
    );
  }

  const title = detail?.title ?? seed?.title ?? 'Untitled';
  const cover = detail?.cover ?? seed?.cover ?? '';
  const themes = detail?.themes ?? seed?.themes ?? [];
  const episodeCount = detail?.episodeCount || episodes.length || seed?.episodeCount || 0;
  const synopsis = detail?.description ?? '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.art}>
          {!!cover && (
            <Image
              source={{ uri: cover }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={250}
              cachePolicy="memory-disk"
            />
          )}
          <LinearGradient
            colors={HERO_GRADIENT}
            locations={[0, 0.5, 0.82, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.metaRow}>
            {!!detail?.views && <Text style={styles.metaHighlight}>{formatCount(detail.views)} views</Text>}
            {!!detail?.views && <Text style={styles.metaDot}>•</Text>}
            <Text style={styles.meta}>{episodeCount} episodes</Text>
          </View>

          {themes.length > 0 && (
            <View style={styles.chips}>
              {themes.map((theme) => (
                <Pressable
                  key={theme}
                  style={styles.chip}
                  // Title lives in the stack, so target the tab explicitly.
                  onPress={() =>
                    navigation.navigate('Tabs', { screen: 'Search', params: { query: theme } })
                  }
                >
                  <Text style={styles.chipText}>{theme}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
            onPress={() => play(resumeEpisode ?? undefined)}
            accessibilityRole="button"
          >
            <Ionicons name="play" size={20} color={colors.black} />
            <Text style={styles.playText}>
              {resumeEpisode ? `Resume Episode ${resumeEpisode}` : 'Play'}
            </Text>
          </Pressable>

          <View style={styles.secondaryActions}>
            <Pressable style={styles.secondaryBtn} onPress={onToggleList}>
              <Ionicons
                name={saved ? 'checkmark' : 'add'}
                size={24}
                color={saved ? colors.accent : colors.white}
              />
              <Text style={styles.secondaryLabel}>My List</Text>
            </Pressable>

            {resumeEpisode && (
              <Pressable style={styles.secondaryBtn} onPress={() => play(1)}>
                <Ionicons name="refresh" size={22} color={colors.white} />
                <Text style={styles.secondaryLabel}>From Start</Text>
              </Pressable>
            )}

            <Pressable style={styles.secondaryBtn} onPress={onShare}>
              <Ionicons name="share-social-outline" size={22} color={colors.white} />
              <Text style={styles.secondaryLabel}>Share</Text>
            </Pressable>
          </View>

          {!!synopsis && (
            <Pressable onPress={() => setExpanded((e) => !e)}>
              <Text style={styles.synopsis} numberOfLines={expanded ? undefined : 4}>
                {synopsis}
              </Text>
              <Text style={styles.more}>{expanded ? 'Show less' : 'Show more'}</Text>
            </Pressable>
          )}
        </View>

        {episodes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Episodes</Text>
            {episodes.map((episode) => {
              const watched = resumeEpisode !== null && episode.index < resumeEpisode;
              const current = episode.index === resumeEpisode;
              return (
                <Pressable
                  key={episode.chapterId}
                  style={({ pressed }) => [styles.episodeRow, pressed && styles.episodeRowPressed]}
                  onPress={() => play(episode.index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Play episode ${episode.index}`}
                >
                  <View style={styles.thumb}>
                    {episode.thumbnail ? (
                      <Image
                        source={{ uri: episode.thumbnail }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={180}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.thumbFallback]}>
                        <Text style={styles.episodeNumberText}>{episode.index}</Text>
                      </View>
                    )}
                    <View style={styles.thumbBadge}>
                      <Text style={styles.thumbBadgeText}>{episode.index}</Text>
                    </View>
                    {watched && (
                      <View style={styles.watchedTick}>
                        <Ionicons name="checkmark" size={11} color={colors.white} />
                      </View>
                    )}
                  </View>

                  <View style={styles.episodeInfo}>
                    <Text
                      style={[styles.episodeName, current && styles.episodeNameCurrent]}
                      numberOfLines={1}
                    >
                      Episode {episode.index}
                      {current ? ' • Resume' : ''}
                    </Text>
                    <Text style={styles.episodeDuration}>{formatDuration(episode.duration)}</Text>
                  </View>
                  <Ionicons name="play-circle-outline" size={26} color={colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>
        )}

        {similar.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>More Like This</Text>
            <FlatList
              horizontal
              data={similar}
              keyExtractor={(d) => d.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.similarList}
              renderItem={({ item }) => (
                <Poster
                  drama={item}
                  onPress={(d) => navigation.push('Title', { id: d.id, drama: d })}
                />
              )}
            />
          </View>
        )}
      </ScrollView>

      <Pressable
        style={[styles.back, { top: insets.top + spacing.sm }]}
        onPress={() => navigation.goBack()}
        hitSlop={12}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={26} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingBottom: spacing.xxl * 2 },
  art: { height: ART_HEIGHT, backgroundColor: colors.surface },
  body: { paddingHorizontal: spacing.lg, marginTop: -spacing.xxl },
  title: {
    color: colors.text,
    fontSize: typography.title + 4,
    fontWeight: weights.black,
    letterSpacing: -0.4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  metaHighlight: { color: colors.success, fontSize: typography.label, fontWeight: weights.bold },
  metaDot: { color: colors.textFaint, marginHorizontal: spacing.sm },
  meta: { color: colors.textMuted, fontSize: typography.label },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  chipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: weights.medium },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  pressed: { opacity: 0.75 },
  playText: { color: colors.black, fontSize: typography.body + 2, fontWeight: weights.bold },
  secondaryActions: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.lg },
  secondaryBtn: { alignItems: 'center', gap: spacing.xs },
  secondaryLabel: { color: colors.textSecondary, fontSize: typography.caption },
  synopsis: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 21,
    marginTop: spacing.lg,
  },
  more: { color: colors.textMuted, fontSize: typography.label, fontWeight: weights.semibold, marginTop: spacing.xs },
  section: { marginTop: spacing.xxl },
  sectionHeading: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  episodeRowPressed: { backgroundColor: colors.surface },
  // Episode thumbnails are 16:9 frames pulled from the stream payload.
  thumb: {
    width: 92,
    height: 52,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbBadge: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
  },
  thumbBadgeText: { color: colors.white, fontSize: 10, fontWeight: weights.bold },
  watchedTick: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 16,
    height: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeNumberText: {
    color: colors.textSecondary,
    fontSize: typography.body,
    fontWeight: weights.bold,
  },
  episodeInfo: { flex: 1 },
  episodeName: { color: colors.text, fontSize: typography.body, fontWeight: weights.semibold },
  episodeNameCurrent: { color: colors.accent },
  episodeDuration: { color: colors.textMuted, fontSize: typography.caption, marginTop: 2 },
  similarList: { paddingHorizontal: spacing.lg },
  back: {
    position: 'absolute',
    left: spacing.md,
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
