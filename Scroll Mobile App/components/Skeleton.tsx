// components/Skeleton.tsx
// Pulsing placeholders shown while the catalogue loads, shaped like the
// content they stand in for so the layout doesn't jump on arrival.

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, POSTER, radii, spacing } from '../lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** A single pulsing block. */
export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.block, style, { opacity: pulse }]} />;
}

/** Hero + two poster rows: the shape of Home before data lands. */
export function HomeSkeleton() {
  return (
    <View style={styles.screen}>
      <SkeletonBlock style={styles.hero} />
      {[0, 1].map((row) => (
        <View key={row} style={styles.row}>
          <SkeletonBlock style={styles.heading} />
          <View style={styles.posters}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} style={styles.poster} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A grid of poster placeholders, for Search and My List. */
export function GridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} style={styles.gridItem} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  block: { backgroundColor: colors.surfaceElevated, borderRadius: radii.md },
  hero: {
    height: Math.min(SCREEN_WIDTH * 1.35, 560),
    borderRadius: 0,
    marginBottom: spacing.xl,
  },
  row: { marginBottom: spacing.xl },
  heading: {
    height: 16,
    width: 160,
    marginBottom: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  posters: { flexDirection: 'row', paddingHorizontal: spacing.lg },
  poster: {
    width: POSTER.width,
    height: POSTER.height,
    marginRight: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  gridItem: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3,
    aspectRatio: 2 / 3,
  },
});
