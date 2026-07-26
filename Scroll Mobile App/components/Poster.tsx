// components/Poster.tsx
// A single piece of cover art. Used everywhere a title appears in a list.

import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, POSTER, radii, spacing, typography, weights } from '../lib/theme';
import type { Drama } from '../lib/api/types';

/** Low-cost placeholder while artwork decodes. */
const BLURHASH = 'L02rgs00~q00WBofofof00of00of';

interface Props {
  drama: Drama;
  onPress: (drama: Drama) => void;
  width?: number;
  height?: number;
  /** Renders the oversized rank numeral beside the art, Netflix Top-10 style. */
  rank?: number;
  /** 0–1 watch progress bar along the bottom edge. */
  progress?: number;
  style?: ViewStyle;
  showTitle?: boolean;
}

function Poster({
  drama,
  onPress,
  width = POSTER.width,
  height = POSTER.height,
  rank,
  progress,
  style,
  showTitle = false,
}: Props) {
  return (
    <Pressable
      onPress={() => onPress(drama)}
      style={({ pressed }) => [
        styles.wrap,
        rank !== undefined && styles.rankedWrap,
        { opacity: pressed ? 0.7 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${drama.title}, ${drama.episodeCount} episodes`}
    >
      {rank !== undefined && (
        // The numeral is clipped by the artwork sitting on top of it, which is
        // what gives the Top-10 row its signature overlap.
        <Text style={[styles.rank, { fontSize: height * 0.62 }]} allowFontScaling={false}>
          {rank}
        </Text>
      )}

      <View style={[styles.art, { width, height }]}>
        {drama.cover ? (
          <Image
            source={{ uri: drama.cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={220}
            placeholder={BLURHASH}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.fallback]}>
            <Ionicons name="film-outline" size={26} color={colors.textFaint} />
          </View>
        )}

        {progress !== undefined && progress > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
          </View>
        )}
      </View>

      {showTitle && (
        <Text style={[styles.title, { width }]} numberOfLines={2}>
          {drama.title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: spacing.sm },
  rankedWrap: { flexDirection: 'row', alignItems: 'flex-end', marginRight: spacing.md },
  art: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  rank: {
    color: colors.black,
    fontWeight: weights.black,
    lineHeight: undefined,
    // A black numeral with a light outline reads on the black canvas without
    // competing with the artwork.
    textShadowColor: colors.textMuted,
    textShadowRadius: 1,
    textShadowOffset: { width: 1, height: 0 },
    marginRight: -spacing.sm,
    marginBottom: -8,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  title: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    marginTop: spacing.xs,
    lineHeight: 14,
  },
});

// Rows re-render on every scroll frame; posters are pure, so memoise them.
export default React.memo(Poster);
