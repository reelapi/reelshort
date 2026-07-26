// screens/HomeScreen.tsx
// The browse surface: a full-bleed billboard over a stack of horizontal rows,
// with Continue Watching promoted to the top once there's something to resume.

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Billboard from '../components/Billboard';
import Row from '../components/Row';
import Poster from '../components/Poster';
import EmptyState from '../components/EmptyState';
import { HomeSkeleton } from '../components/Skeleton';
import GenreOnboarding from '../components/GenreOnboarding';
import { browsableGenres, loadCatalog, personalRows, pickRandom, Catalog } from '../lib/catalog';
import { clearCache } from '../lib/api/client';
import {
  getContinueWatching,
  getMyList,
  getPrefs,
  getRecentlyViewed,
  getTasteGenres,
  isOnboarded,
  seriesProgress,
  setFavouriteGenres,
  setOnboarded,
  toggleMyList,
  WatchProgress,
} from '../lib/store';
import type { CatalogRow, Drama } from '../lib/api/types';
import { colors, POSTER, radii, spacing, typography, weights } from '../lib/theme';

/** Row entries the FlatList renders, so the whole page is virtualised. */
type Section =
  | { kind: 'hero'; hero: Drama }
  | { kind: 'genres'; genres: string[] }
  | { kind: 'continue'; items: WatchProgress[] }
  | { kind: 'row'; row: CatalogRow };

export default function HomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [tasteGenres, setTasteGenres] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Drama[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const fetchCatalog = useCallback(async () => {
    const prefs = await getPrefs();
    setCatalog(await loadCatalog(prefs.lang));
  }, []);

  useEffect(() => {
    fetchCatalog().finally(() => setLoading(false));
    // Held until the catalogue lands, so the picker can offer real genres.
    isOnboarded().then((done) => setShowOnboarding(!done));
  }, [fetchCatalog]);

  const finishOnboarding = useCallback(async (picked: string[]) => {
    setShowOnboarding(false);
    await setFavouriteGenres(picked);
    await setOnboarded();
    setTasteGenres(await getTasteGenres());
  }, []);

  // Progress and saved state change on other screens; re-read them on focus.
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([
        getContinueWatching(),
        getMyList(),
        getTasteGenres(),
        getRecentlyViewed(),
      ]).then(([progress, list, taste, viewed]) => {
        if (!alive) return;
        setContinueWatching(progress);
        setSavedIds(new Set(list.map((d) => d.id)));
        setTasteGenres(taste);
        setRecentlyViewed(viewed);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    clearCache();
    await fetchCatalog();
    setRefreshing(false);
  }, [fetchCatalog]);

  const openTitle = useCallback(
    (drama: Drama) => navigation.navigate('Title', { id: drama.id, drama }),
    [navigation],
  );

  const play = useCallback(
    (drama: Drama, startEpisode?: number) =>
      navigation.navigate('Player', { id: drama.id, drama, title: drama.title, startEpisode }),
    [navigation],
  );

  const onToggleList = useCallback(async (drama: Drama) => {
    const nowSaved = await toggleMyList(drama);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nowSaved) next.add(drama.id);
      else next.delete(drama.id);
      return next;
    });
  }, []);

  if (loading) return <HomeSkeleton />;

  if (!catalog || (catalog.error && !catalog.rows.length)) {
    return (
      <View style={styles.errorWrap}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load the catalogue"
          message={catalog?.error ?? 'Check your connection and try again.'}
          actionLabel="Retry"
          onAction={() => {
            setLoading(true);
            fetchCatalog().finally(() => setLoading(false));
          }}
        />
      </View>
    );
  }

  const sections: Section[] = [];
  if (catalog.hero) sections.push({ kind: 'hero', hero: catalog.hero });

  const allGenres = browsableGenres(catalog.pool);
  const genres = allGenres.slice(0, 14);
  if (genres.length) sections.push({ kind: 'genres', genres });

  if (continueWatching.length) sections.push({ kind: 'continue', items: continueWatching });

  // Taste-driven rows sit above the generic catalogue, and any title they use
  // is dropped from the generic rows so nothing repeats down the page.
  const personal = personalRows(catalog.pool, {
    tasteGenres,
    viewed: recentlyViewed,
    lastWatched: continueWatching[0]?.drama ?? null,
  });
  for (const row of personal) sections.push({ kind: 'row', row });

  const personalKeys = new Set(personal.map((r) => r.key));
  for (const row of catalog.rows) {
    if (!personalKeys.has(row.key)) sections.push({ kind: 'row', row });
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <FlatList
        data={sections}
        keyExtractor={(section, i) =>
          section.kind === 'row' ? `row:${section.row.key}` : `${section.kind}:${i}`
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
        windowSize={5}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
        renderItem={({ item }) => {
          if (item.kind === 'hero') {
            return (
              <Billboard
                drama={item.hero}
                onPlay={(d) => play(d)}
                onInfo={openTitle}
                onToggleList={onToggleList}
                inMyList={savedIds.has(item.hero.id)}
              />
            );
          }

          if (item.kind === 'genres') {
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.genreRow}
                style={styles.genreWrap}
              >
                {item.genres.map((genre) => (
                  <Pressable
                    key={genre}
                    style={({ pressed }) => [styles.genreChip, pressed && styles.genreChipPressed]}
                    onPress={() =>
                      navigation.navigate('Tabs', {
                        screen: 'Search',
                        params: { query: genre },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${genre}`}
                  >
                    <Text style={styles.genreChipText}>{genre}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            );
          }

          if (item.kind === 'continue') {
            return (
              <View style={styles.continueWrap}>
                <Text style={styles.heading}>Continue Watching</Text>
                <FlatList
                  horizontal
                  data={item.items}
                  keyExtractor={(p) => p.drama.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.continueList}
                  renderItem={({ item: entry }) => (
                    <View style={styles.continueItem}>
                      <Poster
                        drama={entry.drama}
                        onPress={() => play(entry.drama, entry.episodeIndex)}
                        progress={seriesProgress(entry)}
                      />
                      <Text style={styles.continueLabel} numberOfLines={1}>
                        Ep {entry.episodeIndex}
                      </Text>
                    </View>
                  )}
                />
              </View>
            );
          }

          return <Row row={item.row} onSelect={openTitle} />;
        }}
      />

      {/* Header floats over the billboard, Netflix style. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.85)', 'transparent']}
        style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <Text style={styles.brand}>
          <Text style={styles.brandAccent}>S</Text>CROLL
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              const pick = pickRandom(catalog.pool);
              if (pick) play(pick);
            }}
            hitSlop={10}
            accessibilityLabel="Play something at random"
          >
            <Ionicons name="shuffle" size={24} color={colors.white} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Search')}
            hitSlop={10}
            accessibilityLabel="Search"
          >
            <Ionicons name="search" size={24} color={colors.white} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('About')}
            hitSlop={10}
            accessibilityLabel="About this app"
          >
            <Ionicons name="information-circle-outline" size={24} color={colors.white} />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Offered only once the catalogue has real genres to show. */}
      <GenreOnboarding
        visible={showOnboarding && allGenres.length > 0}
        genres={allGenres.slice(0, 28)}
        onDone={finishOnboarding}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  errorWrap: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  brand: {
    color: colors.white,
    fontSize: 20,
    fontWeight: weights.black,
    letterSpacing: 1.5,
  },
  brandAccent: { color: colors.accent },
  headerActions: { flexDirection: 'row', gap: spacing.lg },
  // Genre shortcuts sit directly under the billboard, Netflix-style.
  genreWrap: { marginTop: spacing.lg, marginBottom: spacing.xl },
  genreRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  genreChip: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  genreChipPressed: { backgroundColor: colors.surfaceHover },
  genreChipText: {
    color: colors.textSecondary,
    fontSize: typography.label,
    fontWeight: weights.semibold,
  },
  continueWrap: { marginBottom: spacing.xl },
  heading: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  continueList: { paddingHorizontal: spacing.lg },
  continueItem: { width: POSTER.width, marginRight: spacing.sm },
  continueLabel: {
    color: colors.textMuted,
    fontSize: typography.caption,
    marginTop: spacing.xs,
    fontWeight: weights.semibold,
  },
});
