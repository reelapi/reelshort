// screens/MyListScreen.tsx
// Everything the viewer has kept: titles they saved and series they're partway
// through. Also hosts the app's few settings, since there's no account screen.

import React, { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Poster from '../components/Poster';
import EmptyState from '../components/EmptyState';
import { clearCache } from '../lib/api/client';
import { LANGUAGES, LANGUAGE_LABELS } from '../lib/api/types';
import type { Drama, Lang } from '../lib/api/types';
import {
  clearProgress,
  DEFAULT_PREFS,
  getContinueWatching,
  getMyList,
  getPrefs,
  getStats,
  Prefs,
  removeFromMyList,
  resetStats,
  seriesProgress,
  setPrefs,
  WatchStats,
  WatchProgress,
} from '../lib/store';
import { formatWatchTime } from '../lib/catalog';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

/** Orderings for the saved grid. */
const LIST_SORTS = [
  { key: 'added', label: 'Recently added' },
  { key: 'az', label: 'A–Z' },
  { key: 'longest', label: 'Most episodes' },
] as const;

type ListSort = (typeof LIST_SORTS)[number]['key'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = spacing.sm;
const TILE_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const TILE_HEIGHT = TILE_WIDTH * 1.5;

export default function MyListScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<Drama[]>([]);
  const [watching, setWatching] = useState<WatchProgress[]>([]);
  const [prefs, setLocalPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stats, setStats] = useState<WatchStats | null>(null);
  const [listSort, setListSort] = useState<ListSort>('added');

  const refresh = useCallback(() => {
    getMyList().then(setList);
    getContinueWatching().then(setWatching);
    getPrefs().then(setLocalPrefs);
    getStats().then(setStats);
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const openTitle = useCallback(
    (drama: Drama) => navigation.navigate('Title', { id: drama.id, drama }),
    [navigation],
  );

  const savePref = useCallback(async (patch: Partial<Prefs>) => {
    const next = await setPrefs(patch);
    setLocalPrefs(next);
    // The catalogue is language-scoped, so a language change invalidates it.
    if (patch.lang) clearCache();
  }, []);

  // getMyList already returns most-recent-first, so 'added' needs no sorting.
  const sortedList = useMemo(() => {
    if (listSort === 'added') return list;
    const sorted = [...list];
    if (listSort === 'az') return sorted.sort((a, b) => a.title.localeCompare(b.title));
    return sorted.sort((a, b) => b.episodeCount - a.episodeCount);
  }, [list, listSort]);

  const hasStats = !!stats && (stats.secondsWatched > 0 || stats.episodesCompleted > 0);
  const isEmpty = !list.length && !watching.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.screenTitle}>My List</Text>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} accessibilityLabel="Settings">
          <Ionicons name="settings-outline" size={22} color={colors.white} />
        </Pressable>
      </View>

      {isEmpty ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="bookmark-outline"
            title="Nothing saved yet"
            message="Titles you add to My List — and anything you start watching — show up here."
            actionLabel="Browse titles"
            onAction={() => navigation.navigate('Home')}
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {hasStats && stats && (
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatWatchTime(stats.secondsWatched)}</Text>
                <Text style={styles.statLabel}>Watched</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.episodesCompleted}</Text>
                <Text style={styles.statLabel}>Episodes</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.titlesStarted}</Text>
                <Text style={styles.statLabel}>Series</Text>
              </View>
            </View>
          )}

          {watching.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Continue Watching</Text>
              {watching.map((entry) => {
                const progress = seriesProgress(entry);
                return (
                  <Pressable
                    key={entry.drama.id}
                    style={({ pressed }) => [styles.watchRow, pressed && styles.rowPressed]}
                    onPress={() =>
                      navigation.navigate('Player', {
                        id: entry.drama.id,
                        drama: entry.drama,
                        title: entry.drama.title,
                        startEpisode: entry.episodeIndex,
                      })
                    }
                  >
                    <Poster
                      drama={entry.drama}
                      onPress={() =>
                        navigation.navigate('Player', {
                          id: entry.drama.id,
                          drama: entry.drama,
                          title: entry.drama.title,
                          startEpisode: entry.episodeIndex,
                        })
                      }
                      width={64}
                      height={96}
                      progress={progress}
                    />
                    <View style={styles.watchInfo}>
                      <Text style={styles.watchTitle} numberOfLines={2}>
                        {entry.drama.title}
                      </Text>
                      <Text style={styles.watchMeta}>
                        Episode {entry.episodeIndex} of {entry.totalEpisodes}
                      </Text>
                      <Text style={styles.watchProgress}>{Math.round(progress * 100)}% watched</Text>
                    </View>
                    <Pressable
                      onPress={() => clearProgress(entry.drama.id).then(setWatching)}
                      hitSlop={10}
                      style={styles.removeBtn}
                      accessibilityLabel={`Remove ${entry.drama.title} from Continue Watching`}
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )}

          {list.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>Saved Titles</Text>

              {list.length > 2 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.sortRow}
                  style={styles.sortWrap}
                >
                  {LIST_SORTS.map((option) => {
                    const active = listSort === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        style={[styles.sortChip, active && styles.sortChipActive]}
                        onPress={() => setListSort(option.key)}
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

              <FlatList
                data={sortedList}
                keyExtractor={(item) => item.id}
                numColumns={COLUMNS}
                scrollEnabled={false}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => (
                  <Pressable
                    onLongPress={() => removeFromMyList(item.id).then(setList)}
                    delayLongPress={400}
                  >
                    <Poster
                      drama={item}
                      onPress={openTitle}
                      width={TILE_WIDTH}
                      height={TILE_HEIGHT}
                      style={styles.tile}
                      showTitle
                    />
                  </Pressable>
                )}
              />
              <Text style={styles.hint}>Long-press a title to remove it.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ------------------------------- settings ------------------------------ */}
      <Modal
        visible={settingsOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSettingsOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Settings</Text>
            <Pressable onPress={() => setSettingsOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.settingLabel}>Catalogue language</Text>
            <View style={styles.langChips}>
              {LANGUAGES.map((code: Lang) => {
                const active = prefs.lang === code;
                return (
                  <Pressable
                    key={code}
                    style={[styles.langChip, active && styles.langChipActive]}
                    onPress={() => savePref({ lang: code })}
                  >
                    <Text style={[styles.langChipText, active && styles.langChipTextActive]}>
                      {LANGUAGE_LABELS[code]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.settingHint}>
              Titles and episodes are published per language. Changing this reloads the catalogue.
            </Text>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Autoplay next episode</Text>
                <Text style={styles.toggleSub}>Roll into the next episode automatically.</Text>
              </View>
              <Switch
                value={prefs.autoplayNext}
                onValueChange={(v) => savePref({ autoplayNext: v })}
                trackColor={{ false: colors.surfaceHover, true: colors.accentDim }}
                thumbColor={prefs.autoplayNext ? colors.accent : colors.textMuted}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Start reels muted</Text>
                <Text style={styles.toggleSub}>Open the discovery feed without sound.</Text>
              </View>
              <Switch
                value={prefs.startMuted}
                onValueChange={(v) => savePref({ startMuted: v })}
                trackColor={{ false: colors.surfaceHover, true: colors.accentDim }}
                thumbColor={prefs.startMuted ? colors.accent : colors.textMuted}
              />
            </View>

            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              onPress={() => {
                clearCache();
                setSettingsOpen(false);
                refresh();
              }}
            >
              <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionText}>Refresh catalogue</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]}
              onPress={() => resetStats().then(setStats)}
            >
              <Ionicons name="stats-chart-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.actionText}>Reset watch statistics</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  screenTitle: { color: colors.text, fontSize: typography.title, fontWeight: weights.black },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: typography.title - 2, fontWeight: weights.black },
  statLabel: { color: colors.textMuted, fontSize: typography.caption },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.border },
  sortWrap: { marginBottom: spacing.md },
  sortRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  sortChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  sortChipActive: { backgroundColor: colors.white, borderColor: colors.white },
  sortChipText: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontWeight: weights.medium,
  },
  sortChipTextActive: { color: colors.black, fontWeight: weights.bold },
  scroll: { paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.xxl },
  sectionHeading: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  watchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: colors.surface },
  watchInfo: { flex: 1, gap: 2 },
  watchTitle: { color: colors.text, fontSize: typography.body, fontWeight: weights.semibold },
  watchMeta: { color: colors.textMuted, fontSize: typography.label },
  watchProgress: { color: colors.accent, fontSize: typography.caption, fontWeight: weights.semibold },
  removeBtn: { padding: spacing.sm },
  grid: { paddingHorizontal: spacing.lg },
  gridRow: { gap: GAP, marginBottom: spacing.md },
  tile: { marginRight: 0 },
  hint: {
    color: colors.textFaint,
    fontSize: typography.caption,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.lg,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  sheetTitle: { color: colors.text, fontSize: typography.section, fontWeight: weights.bold },
  settingLabel: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: weights.semibold,
    marginBottom: spacing.md,
  },
  langChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  langChip: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  langChipActive: { backgroundColor: colors.accent },
  langChipText: { color: colors.textSecondary, fontSize: typography.label, fontWeight: weights.medium },
  langChipTextActive: { color: colors.white, fontWeight: weights.bold },
  settingHint: {
    color: colors.textFaint,
    fontSize: typography.caption,
    marginTop: spacing.sm,
    lineHeight: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: spacing.lg,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { color: colors.text, fontSize: typography.body, fontWeight: weights.semibold },
  toggleSub: { color: colors.textMuted, fontSize: typography.caption },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionText: { color: colors.textSecondary, fontSize: typography.body, fontWeight: weights.medium },
});
