// components/Row.tsx
// A titled horizontal carousel of posters — the primary browse unit on Home.

import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Poster from './Poster';
import { colors, POSTER, POSTER_LARGE, spacing, typography, weights } from '../lib/theme';
import type { CatalogRow, Drama } from '../lib/api/types';

interface Props {
  row: CatalogRow;
  onSelect: (drama: Drama) => void;
}

function Row({ row, onSelect }: Props) {
  const size = row.ranked ? POSTER_LARGE : POSTER;

  const renderItem = useCallback(
    ({ item, index }: { item: Drama; index: number }) => (
      <Poster
        drama={item}
        onPress={onSelect}
        width={size.width}
        height={size.height}
        rank={row.ranked ? index + 1 : undefined}
      />
    ),
    [onSelect, row.ranked, size.width, size.height],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{row.title}</Text>
      <FlatList
        horizontal
        data={row.items}
        keyExtractor={(item) => `${row.key}:${item.id}`}
        renderItem={renderItem}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        // Long rows of remote images: keep the window tight so scrolling stays
        // smooth on mid-range Android.
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  heading: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg },
});

export default React.memo(Row);
