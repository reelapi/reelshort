// screens/AboutScreen.tsx
// What Scroll is, where its content comes from, and what it does and doesn't
// claim. This page exists so the app's position is stated plainly and in one
// place: it is a personal client for a public API, it hosts nothing, and it
// claims no rights over anything it displays.

import React from 'react';
import { Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { API_BASE } from '../lib/api/client';
import { colors, radii, spacing, typography, weights } from '../lib/theme';

/** Read from the manifest so it can't drift from app.json. */
const APP_VERSION = Constants.expoConfig?.version ?? '—';

/** The endpoints the app actually calls, credited in full. */
const ENDPOINTS = [
  { path: '/api/foryou', purpose: 'Recommended titles' },
  { path: '/api/latest', purpose: 'Newest titles' },
  { path: '/api/trending', purpose: 'Trending titles' },
  { path: '/search', purpose: 'Keyword search' },
  { path: '/api/details', purpose: 'Synopsis and genres' },
  { path: '/api/chapters/details', purpose: 'Episode listing' },
  { path: '/api/stream/all-episode', purpose: 'Episode video URLs' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

export default function AboutScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.back}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={26} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.hero}>
          <Text style={styles.brand}>Scroll</Text>
          <Text style={styles.tagline}>Short dramas, one reel at a time.</Text>
          <Text style={styles.version}>Version {APP_VERSION}</Text>
        </View>

        <Section title="What this app is">
          <Paragraph>
            Scroll is a personal, non-commercial viewer for short-form vertical dramas. It was
            built for one reason: to watch a specific series that wasn't available in any app or
            store the author could find. It is a hobby project, not a business.
          </Paragraph>
          <Paragraph>
            There are no accounts, no adverts, no analytics, no tracking, and nothing is sold.
            Everything the app remembers — your list, your progress, your settings — stays on your
            device and is deleted when you uninstall it.
          </Paragraph>
        </Section>

        <Section title="Where the content comes from">
          <Paragraph>
            Scroll stores and hosts no video, images, or metadata of its own. Everything you see is
            requested live, at the moment you view it, from a publicly reachable third-party API:
          </Paragraph>

          <Pressable style={styles.linkCard} onPress={() => open(API_BASE)}>
            <Ionicons name="link-outline" size={18} color={colors.accent} />
            <Text style={styles.linkText}>{API_BASE}</Text>
          </Pressable>

          <Paragraph>The app calls only these endpoints, all read-only:</Paragraph>
          <View style={styles.endpoints}>
            {ENDPOINTS.map((endpoint) => (
              <View key={endpoint.path} style={styles.endpointRow}>
                <Text style={styles.endpointPath}>{endpoint.path}</Text>
                <Text style={styles.endpointPurpose}>{endpoint.purpose}</Text>
              </View>
            ))}
          </View>

          <Paragraph>
            Video streams are played directly from the content delivery network the API points at.
            Scroll does not download, copy, re-host, cache to disk, re-encode, or redistribute any
            of it, and it does not remove or bypass any access control, watermark, or protection.
          </Paragraph>
        </Section>

        <Section title="Rights and ownership">
          <Paragraph>
            All titles, artwork, trademarks, and video remain the property of their respective
            owners. Scroll claims no ownership of, and asserts no rights over, any of it. The app
            is not affiliated with, endorsed by, sponsored by, or connected to ReelShort, Crazy
            Maple Studio, the operators of the API above, or any rights holder.
          </Paragraph>
          <Paragraph>
            Any names or marks that appear in the catalogue belong to their owners and are shown
            only to identify the content being described.
          </Paragraph>
        </Section>

        <Section title="If you own this content">
          <Paragraph>
            If you hold rights to something shown here and would rather it weren't, the fastest and
            most complete fix is with the API operator linked above, since that is the source Scroll
            reads from and the host of the files themselves — removing it there removes it
            everywhere, including here.
          </Paragraph>
          <Paragraph>
            The author will also act on any request sent directly, and will remove access or retire
            the app entirely on request. This app is not distributed for profit and there is no
            interest in keeping anything online against a rights holder's wishes.
          </Paragraph>
        </Section>

        <Section title="For anyone using it">
          <Paragraph>
            Scroll is provided as-is, with no warranty of any kind. Availability depends entirely on
            a third-party service that may change or disappear without notice. Please use it only
            where doing so is lawful for you, and for personal viewing.
          </Paragraph>
        </Section>

        <Section title="Built with">
          <Paragraph>
            React Native and Expo, with expo-video for playback (AVPlayer on iOS, ExoPlayer on
            Android) and hls.js on the web. Open-source components remain under their own licences.
          </Paragraph>
        </Section>

        <Text style={styles.footer}>
          Made for personal use, by one person, to watch one show.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  back: { width: 40 },
  headerTitle: { color: colors.text, fontSize: typography.section, fontWeight: weights.bold },
  scroll: { paddingHorizontal: spacing.lg },
  hero: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  brand: {
    color: colors.text,
    fontSize: typography.hero,
    fontWeight: weights.black,
    letterSpacing: -0.5,
  },
  tagline: { color: colors.accent, fontSize: typography.body, fontWeight: weights.semibold },
  version: { color: colors.textFaint, fontSize: typography.caption, marginTop: spacing.xs },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.section,
    fontWeight: weights.bold,
    marginBottom: spacing.sm,
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  linkText: { color: colors.accent, fontSize: typography.label, fontWeight: weights.semibold, flex: 1 },
  endpoints: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  endpointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  endpointPath: {
    color: colors.textSecondary,
    fontSize: typography.caption,
    fontFamily: 'monospace',
    flexShrink: 1,
  },
  endpointPurpose: { color: colors.textFaint, fontSize: typography.caption, textAlign: 'right' },
  footer: {
    color: colors.textFaint,
    fontSize: typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
