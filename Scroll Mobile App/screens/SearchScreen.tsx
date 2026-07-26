// screens/SearchScreen.tsx
// Search across the whole catalogue. Typing runs a debounced query against the
// API; when the box is empty the screen becomes a browse surface with recent
// searches, genre chips, and a popular-titles grid.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '../components/SearchBar';
import Poster from '../components/Poster';
import EmptyState from '../components/EmptyState';
import { GridSkeleton } from '../components/Skeleton';
import { search as searchApi, getForYou } from '../lib/api/reelshort';
import { browsableGenres, dedupe, filterPool, withTheme } from '../lib/catalog';
import { addRecentSearch, clearRecentSearches, getPrefs, getRecentSearches } from '../lib/store';
import type { Drama, Lang } from '../lib/api/types';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = spacing.sm;
const TILE_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const TILE_HEIGHT = TILE_WIDTH * 1.5;

const DEBOUNCE_MS = 350;

/** Orderings offered for both search results and genre browsing. */
const SORTS = [
  { key: 'relevance', label: 'Best match' },
  { key: 'popular', label: 'Most saved' },
  { key: 'longest', label: 'Most episodes' },
  { key: 'shortest', label: 'Shortest' },
  { key: 'az', label: 'A–Z' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

function applySort(items: Drama[], sort: SortKey): Drama[] {
  if (sort === 'relevance') return items;
  const sorted = [...items];
  switch (sort) {
    case 'popular':
      return sorted.sort((a, b) => b.collectCount - a.collectCount);
    case 'longest':
      return sorted.sort((a, b) => b.episodeCount - a.episodeCount);
    case 'shortest':
      // Titles with no episode count would otherwise monopolise the top.
      return sorted
        .filter((d) => d.episodeCount > 0)
        .sort((a, b) => a.episodeCount - b.episodeCount);
    case 'az':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return sorted;
  }
}

export default function SearchScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState<string>(route.params?.query ?? '');
  const [results, setResults] = useState<Drama[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [pool, setPool] = useState<Drama[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [lang, setLang] = useState<Lang>('en');

  /** Guards against an older request resolving after a newer one. */
  const requestId = useRef(0);

  useEffect(() => {
    getRecentSearches().then(setRecents);
    getPrefs().then(({ lang: preferred }) => {
      setLang(preferred);
      getForYou(preferred)
        .then(setPool)
        .catch(() => setPool([]))
        .finally(() => setPoolLoading(false));
    });
  }, []);

  // A genre chip elsewhere in the app can push a query into this screen.
  useEffect(() => {
    if (route.params?.query) {
      setQuery(route.params.query);
      setActiveGenre(null);
    }
  }, [route.params?.query]);

  /* --------------------------------- search --------------------------------- */

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) {
        setResults([]);
        setSearching(false);
        setError(null);
        return;
      }

      const id = ++requestId.current;
      setSearching(true);
      setError(null);

      // Show local matches from the already-loaded pool immediately, so there's
      // never a blank screen while the network call is in flight.
      const local = filterPool(pool, trimmed);
      if (local.length) setResults(local);

      try {
        const remote = await searchApi(trimmed, lang);
        if (id !== requestId.current) return;
        setResults(dedupe([...remote, ...local]));
      } catch (err) {
        if (id !== requestId.current) return;
        if (!local.length) setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    },
    [pool, lang],
  );

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const commitSearch = useCallback(() => {
    Keyboard.dismiss();
    if (query.trim()) addRecentSearch(query).then(setRecents);
  }, [query]);

  const openTitle = useCallback(
    (drama: Drama) => {
      if (query.trim()) addRecentSearch(query).then(setRecents);
      navigation.navigate('Title', { id: drama.id, drama });
    },
    [navigation, query],
  );

  /* --------------------------------- browse --------------------------------- */

  const genres = useMemo(() => browsableGenres(pool).slice(0, 24), [pool]);

  const browseItems = useMemo(() => {
    if (!pool.length) return [];
    const items = activeGenre ? withTheme(pool, activeGenre) : pool;
    // Browsing has no query to be "relevant" to, so it defaults to popularity.
    const ordered = sort === 'relevance' ? applySort(items, 'popular') : applySort(items, sort);
    return ordered.slice(0, 60);
  }, [pool, activeGenre, sort]);

  const isSearchMode = query.trim().length > 0;
  const grid = useMemo(
    () => (isSearchMode ? applySort(results, sort) : browseItems),
    [isSearchMode, results, sort, browseItems],
  );

  const renderTile = useCallback(
    ({ item }: { item: Drama }) => (
      <Poster
        drama={item}
        onPress={openTitle}
        width={TILE_WIDTH}
        height={TILE_HEIGHT}
        style={styles.tile}
        showTitle
      />
    ),
    [openTitle],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <StatusBar barStyle="light-content" />

      <SearchBar value={query} onChangeText={setQuery} onSubmit={commitSearch} />

      <FlatList
        data={grid}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={renderTile}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={Keyboard.dismiss}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            {isSearchMode ? (
              <View style={styles.resultHeader}>
                <Text style={styles.sectionHeading}>
                  {searching && !results.length ? 'Searching…' : `Results for "${query.trim()}"`}
                </Text>
                {searching && <ActivityIndicator size="small" color={colors.accent} />}
              </View>
            ) : (
              <>
                {recents.length > 0 && (
                  <View style={styles.block}>
                    <View style={styles.blockHeader}>
                      <Text style={styles.sectionHeading}>Recent Searches</Text>
                      <Pressable
                        onPress={() => clearRecentSearches().then(() => setRecents([]))}
                        hitSlop={8}
                      >
                        <Text style={styles.clear}>Clear</Text>
                      </Pressable>
                    </View>
                    <View style={styles.chips}>
                      {recents.map((term) => (
                        <Pressable
                          key={term}
                          style={styles.recentChip}
                          onPress={() => setQuery(term)}
                        >
                          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                          <Text style={styles.chipText}>{term}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {genres.length > 0 && (
                  <View style={styles.block}>
                    <Text style={styles.sectionHeading}>Browse by Genre</Text>
                    <View style={styles.chips}>
                      <Pressable
                        style={[styles.chip, !activeGenre && styles.chipActive]}
                        onPress={() => setActiveGenre(null)}
                      >
                        <Text style={[styles.chipText, !activeGenre && styles.chipTextActive]}>
                          All
                        </Text>
                      </Pressable>
                      {genres.map((genre) => {
                        const active = activeGenre === genre;
                        return (
                          <Pressable
                            key={genre}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => setActiveGenre(active ? null : genre)}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {genre}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                <Text style={[styles.sectionHeading, styles.gridHeading]}>
                  {activeGenre ?? 'Popular Right Now'}
                </Text>
              </>
            )}

            {grid.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sortRow}
                style={styles.sortWrap}
                keyboardShouldPersistTaps="handled"
              >
                <Ionicons
                  name="swap-vertical"
                  size={15}
                  color={colors.textMuted}
                  style={styles.sortIcon}
                />
                {SORTS.map((option) => {
                  const active = sort === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      style={[styles.sortChip, active && styles.sortChipActive]}
                      onPress={() => setSort(option.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          poolLoading && !isSearchMode ? (
            <GridSkeleton />
          ) : searching ? (
            <GridSkeleton count={6} />
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Search failed"
              message={error}
              actionLabel="Try again"
              onAction={() => runSearch(query)}
            />
          ) : isSearchMode ? (
            <EmptyState
              icon="search-outline"
              title="No matches"
              message={`Nothing found for "${query.trim()}". Try a different title or genre.`}
            />
          ) : (
            <EmptyState icon="film-outline" title="Nothing to browse yet" />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, paddingTop: spacing.lg },
  gridRow: { gap: GAP, marginBottom: spacing.md },
  tile: { marginRight: 0 },
  block: { marginBottom: spacing.xl },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHeading: { color: colors.text, fontSize: typography.section, fontWeight: weights.bold },
  gridHeading: { marginBottom: spacing.md },
  clear: { color: colors.textMuted, fontSize: typography.label, fontWeight: weights.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.accent },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
  },
  chipText: { color: colors.textSecondary, fontSize: typography.label, fontWeight: weights.medium },
  chipTextActive: { color: colors.white, fontWeight: weights.bold },
  sortWrap: { marginBottom: spacing.lg },
  sortRow: { alignItems: 'center', gap: spacing.sm },
  sortIcon: { marginRight: spacing.xs },
  sortChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  sortChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  sortChipText: { color: colors.textSecondary, fontSize: typography.caption, fontWeight: weights.medium },
  sortChipTextActive: { color: colors.black, fontWeight: weights.bold },
});
