// components/GenreOnboarding.tsx
// Shown once, on first launch. Picking a few genres gives Home something to
// personalise around before there's any watch history to infer taste from.

import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

/** Below this, the picks are too thin to build a row from. */
const MIN_PICKS = 2;

interface Props {
  visible: boolean;
  /** Genres to offer — derived from the live catalogue, not hardcoded. */
  genres: string[];
  onDone: (picked: string[]) => void;
}

export default function GenreOnboarding({ visible, genres, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (genre: string) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const enough = picked.length >= MIN_PICKS;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={() => onDone([])}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl }]}>
        <View style={styles.header}>
          <Text style={styles.brand}>
            <Text style={styles.brandAccent}>S</Text>CROLL
          </Text>
          <Text style={styles.title}>What do you like watching?</Text>
          <Text style={styles.subtitle}>
            Pick a few genres and we'll build your home screen around them. You can change your
            mind any time.
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {genres.map((genre) => {
            const active = picked.includes(genre);
            return (
              <Pressable
                key={genre}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggle(genre)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {active && <Ionicons name="checkmark" size={14} color={colors.white} />}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{genre}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Pressable
            style={({ pressed }) => [
              styles.primary,
              !enough && styles.primaryDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => onDone(picked)}
            disabled={!enough}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, !enough && styles.primaryTextDisabled]}>
              {enough ? `Continue with ${picked.length}` : `Pick at least ${MIN_PICKS}`}
            </Text>
          </Pressable>

          <Pressable onPress={() => onDone([])} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.xl },
  brand: {
    color: colors.white,
    fontSize: 18,
    fontWeight: weights.black,
    letterSpacing: 1.5,
    marginBottom: spacing.lg,
  },
  brandAccent: { color: colors.accent },
  title: {
    color: colors.text,
    fontSize: typography.hero - 4,
    fontWeight: weights.black,
    letterSpacing: -0.5,
  },
  subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 20 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: typography.body, fontWeight: weights.medium },
  chipTextActive: { color: colors.white, fontWeight: weights.bold },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  primaryDisabled: { backgroundColor: colors.surfaceElevated },
  pressed: { opacity: 0.8 },
  primaryText: { color: colors.white, fontSize: typography.body + 1, fontWeight: weights.bold },
  primaryTextDisabled: { color: colors.textMuted },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textMuted, fontSize: typography.label, fontWeight: weights.semibold },
});
