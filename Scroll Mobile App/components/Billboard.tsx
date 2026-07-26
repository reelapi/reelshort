// components/Billboard.tsx
// The full-bleed hero at the top of Home: artwork, genre line, and the
// Play / My List actions.

import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, HERO_GRADIENT, radii, spacing, typography, weights } from '../lib/theme';
import type { Drama } from '../lib/api/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
/** Tall enough to feel cinematic, short enough that a row peeks below it. */
const HERO_HEIGHT = Math.min(SCREEN_WIDTH * 1.35, 560);

interface Props {
  drama: Drama;
  onPlay: (drama: Drama) => void;
  onInfo: (drama: Drama) => void;
  onToggleList: (drama: Drama) => void;
  inMyList: boolean;
}

export default function Billboard({ drama, onPlay, onInfo, onToggleList, inMyList }: Props) {
  const genres = drama.themes.slice(0, 3);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => onInfo(drama)} style={StyleSheet.absoluteFill}>
        <Image
          source={{ uri: drama.cover }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          cachePolicy="memory-disk"
        />
      </Pressable>

      {/* Fades the artwork into the page so the rows below feel continuous. */}
      <LinearGradient
        colors={HERO_GRADIENT}
        locations={[0, 0.45, 0.78, 1]}
        style={styles.scrim}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {drama.title}
        </Text>

        {genres.length > 0 && (
          <View style={styles.genres}>
            {genres.map((genre, i) => (
              <React.Fragment key={genre}>
                {i > 0 && <Text style={styles.dot}>•</Text>}
                <Text style={styles.genre}>{genre}</Text>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.action, styles.playBtn, pressed && styles.pressed]}
            onPress={() => onPlay(drama)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${drama.title}`}
          >
            <Ionicons name="play" size={20} color={colors.black} />
            <Text style={styles.playText}>Play</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.action, styles.listBtn, pressed && styles.pressed]}
            onPress={() => onToggleList(drama)}
            accessibilityRole="button"
            accessibilityLabel={inMyList ? 'Remove from My List' : 'Add to My List'}
          >
            <Ionicons name={inMyList ? 'checkmark' : 'add'} size={20} color={colors.white} />
            <Text style={styles.listText}>My List</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HERO_HEIGHT, width: '100%', backgroundColor: colors.surface },
  scrim: { ...StyleSheet.absoluteFillObject },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: typography.hero,
    fontWeight: weights.black,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  genres: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  genre: { color: colors.textSecondary, fontSize: typography.label, fontWeight: weights.medium },
  dot: { color: colors.accent, fontSize: typography.label, marginHorizontal: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.sm,
    minWidth: 132,
  },
  playBtn: { backgroundColor: colors.white },
  listBtn: { backgroundColor: 'rgba(90,90,90,0.75)' },
  pressed: { opacity: 0.75 },
  playText: { color: colors.black, fontSize: typography.body + 2, fontWeight: weights.bold },
  listText: { color: colors.white, fontSize: typography.body + 2, fontWeight: weights.semibold },
});
