// components/EpisodeSheet.tsx
// The episode picker: a bottom sheet with a numbered grid, so a 90-episode
// series stays one tap away from any point in it.

import React, { useMemo, useRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, weights } from '../lib/theme';
import { formatDuration } from '../lib/catalog';
import type { Episode } from '../lib/api/types';

interface Props {
  visible: boolean;
  episodes: Episode[];
  currentIndex: number;
  title: string;
  onSelect: (index: number) => void;
  onClose: () => void;
}

const COLUMNS = 5;
const CELL_HEIGHT = 54;
const ROW_GAP = spacing.sm;
/** One grid row: the cell plus the gap beneath it. */
const ROW_HEIGHT = CELL_HEIGHT + ROW_GAP;

export default function EpisodeSheet({
  visible,
  episodes,
  currentIndex,
  title,
  onSelect,
  onClose,
}: Props) {
  // With numColumns > 1, FlatList collapses the data into rows: getItemLayout
  // and initialScrollIndex both receive ROW indices, not item indices. Treating
  // them as item indices understates the content height by a factor of COLUMNS
  // and scrolls far past the end — which left the grid blank when it opened on
  // a late episode.
  const rowCount = Math.ceil(episodes.length / COLUMNS);
  const listRef = useRef<FlatList<Episode>>(null);

  /** Land a row above the current episode, so it has context around it. */
  const initialRow = useMemo(
    () =>
      Math.min(Math.max(0, Math.floor(currentIndex / COLUMNS) - 1), Math.max(0, rowCount - 1)),
    [currentIndex, rowCount],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{episodes.length} episodes</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close episode list">
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <FlatList
          data={episodes}
          keyExtractor={(ep) => ep.chapterId}
          numColumns={COLUMNS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          initialScrollIndex={initialRow}
          getItemLayout={(_, rowIndex) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * rowIndex,
            index: rowIndex,
          })}
          onScrollToIndexFailed={({ index }) => {
            // Never leave the grid stranded on a blank stretch.
            setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 60);
          }}
          ref={listRef}
          renderItem={({ item, index }) => {
            const isCurrent = index === currentIndex;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.cell,
                  isCurrent && styles.cellCurrent,
                  pressed && styles.cellPressed,
                ]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityLabel={`Episode ${item.index}`}
              >
                <Text style={[styles.cellNumber, isCurrent && styles.cellNumberCurrent]}>
                  {item.index}
                </Text>
                {item.duration > 0 && (
                  <Text style={styles.cellDuration}>{formatDuration(item.duration)}</Text>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingBottom: spacing.xl,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerText: { flex: 1, marginRight: spacing.md },
  title: { color: colors.text, fontSize: typography.section, fontWeight: weights.bold },
  subtitle: { color: colors.textMuted, fontSize: typography.label, marginTop: 2 },
  grid: { paddingHorizontal: spacing.lg },
  // These two must stay in step with ROW_HEIGHT, or getItemLayout lies.
  gridRow: { gap: spacing.sm, marginBottom: ROW_GAP },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellCurrent: { backgroundColor: colors.accent },
  cellPressed: { opacity: 0.7 },
  cellNumber: { color: colors.textSecondary, fontSize: typography.body, fontWeight: weights.bold },
  cellNumberCurrent: { color: colors.white },
  cellDuration: { color: colors.textFaint, fontSize: 9, marginTop: 2 },
});
