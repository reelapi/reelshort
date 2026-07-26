// components/VideoSurface.types.ts
// The contract shared by the native and web video surfaces. VideoStage talks
// only to this interface, so all the chrome (controls, scrubber, overlays) is
// written once regardless of which decoder is underneath.

import type { StyleProp, ViewStyle } from 'react-native';

export interface VideoSurfaceProps {
  /** HLS URL. Null leaves the surface unloaded and releases any buffers. */
  url: string | null;
  /** Declarative playback state — the surface reconciles towards it. */
  shouldPlay: boolean;
  muted: boolean;
  /** Playback speed multiplier, e.g. 1 or 1.5. */
  rate: number;
  /** Seconds to jump to once the media is ready. Applied once per source. */
  resumeAt: number;
  onBuffering: (buffering: boolean) => void;
  onFailed: (failed: boolean) => void;
  onPlayingChange: (playing: boolean) => void;
  onTime: (positionSec: number, durationSec: number) => void;
  onEnded: () => void;
  style?: StyleProp<ViewStyle>;
}

export interface VideoSurfaceHandle {
  /** Jump to an absolute position, in seconds. */
  seek: (seconds: number) => void;
}
