// components/EmptyState.tsx
// Shared empty / error state, with an optional retry.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon = 'film-outline', title, message, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          onPress={onAction}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    textAlign: 'center',
  },
  message: {
    color: colors.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  action: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.sm,
  },
  pressed: { opacity: 0.75 },
  actionText: { color: colors.white, fontSize: typography.body, fontWeight: weights.bold },
});
