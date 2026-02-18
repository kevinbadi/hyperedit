import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, Video, OffthreadVideo, staticFile, continueRender, delayRender } from 'remotion';
import { preloadVideo, preloadImage } from '@remotion/preload';
import { Circle, Rect, Triangle, Star, Polygon, Ellipse } from '@remotion/shapes';
import { AnimatedEmoji, getAvailableEmojis } from '@remotion/animated-emoji';
import { Gif } from '@remotion/gif';
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { Scene3D, Scene3DConfig } from './components/Scene3D';

// Shape definition for shapes scene
export interface ShapeConfig {
  type: 'circle' | 'rect' | 'triangle' | 'star' | 'polygon' | 'ellipse';
  // Common props
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  // Position and animation
  x?: number; // percentage from left (0-100)
  y?: number; // percentage from top (0-100)
  scale?: number; // base scale
  rotation?: number; // degrees
  delay?: number; // animation delay in frames
  // Shape-specific props
  radius?: number; // circle, polygon
  width?: number; // rect
  height?: number; // rect
  cornerRadius?: number; // rect, triangle
  length?: number; // triangle
  direction?: 'up' | 'down' | 'left' | 'right'; // triangle
  points?: number; // star, polygon
  innerRadius?: number; // star
  outerRadius?: number; // star
  rx?: number; // ellipse horizontal radius
  ry?: number; // ellipse vertical radius
  // Animation
  animation?: 'none' | 'pop' | 'spin' | 'bounce' | 'float' | 'pulse' | 'draw';
}

// Emoji configuration for emoji scenes
export interface EmojiConfig {
  emoji: string; // Emoji name (e.g., 'fire', 'heart', 'star-struck', 'rocket') or actual emoji character
  x?: number; // Position as percentage (0-100)
  y?: number; // Position as percentage (0-100)
  scale?: number; // Size multiplier (default 1 = 1024px)
  delay?: number; // Animation delay in frames
  animation?: 'none' | 'pop' | 'bounce' | 'float' | 'pulse' | 'spin' | 'shake' | 'wave';
}

// GIF configuration for gif scenes
export interface GifConfig {
  src: string; // URL to the GIF
  x?: number; // Position as percentage (0-100)
  y?: number; // Position as percentage (0-100)
  width?: number; // Width in pixels
  height?: number; // Height in pixels (auto-calculated if not set)
  scale?: number; // Size multiplier
  delay?: number; // Animation delay in frames
  loop?: boolean; // Whether to loop the GIF (default true)
  fit?: 'fill' | 'contain' | 'cover'; // How to fit the GIF
  playbackRate?: number; // Speed multiplier (0.5 = slow, 2 = fast)
  animation?: 'none' | 'pop' | 'bounce' | 'float' | 'pulse' | 'spin' | 'shake';
}

// Lottie animation configuration for lottie scenes
export interface LottieConfig {
  src: string; // URL to Lottie JSON file
  x?: number; // Position as percentage (0-100)
  y?: number; // Position as percentage (0-100)
  width?: number; // Width in pixels
  height?: number; // Height in pixels
  scale?: number; // Size multiplier
  delay?: number; // Animation delay in frames
  loop?: boolean; // Whether to loop the animation
  playbackRate?: number; // Speed multiplier
  direction?: 'forward' | 'backward'; // Animation direction
}

export interface Scene {
  id: string;
  type: 'title' | 'steps' | 'features' | 'stats' | 'text' | 'transition' | 'media' | 'chart' | 'countdown' | 'comparison' | 'shapes' | 'emoji' | 'gif' | 'lottie' | '3d';
  duration: number;
  content: {
    title?: string;
    subtitle?: string;
    items?: Array<{
      icon?: string;
      label: string;
      description?: string;
      value?: number; // For chart data
      color?: string; // Per-item color
    }>;
    stats?: Array<{
      value: string;
      label: string;
      numericValue?: number; // For animated counting (e.g., 10000 for "10K+")
      prefix?: string; // e.g., "$"
      suffix?: string; // e.g., "+", "%", "K"
    }>;
    color?: string;
    backgroundColor?: string;
    // For shapes scenes
    shapes?: ShapeConfig[];
    shapesLayout?: 'scattered' | 'grid' | 'circle' | 'custom'; // how to arrange multiple shapes
    // For emoji scenes
    emojis?: EmojiConfig[];
    emojiLayout?: 'scattered' | 'grid' | 'circle' | 'row' | 'custom';
    // For gif scenes
    gifs?: GifConfig[];
    gifLayout?: 'scattered' | 'grid' | 'circle' | 'row' | 'fullscreen' | 'custom';
    gifBackground?: string; // URL to main background GIF
    // For lottie scenes
    lotties?: LottieConfig[];
    lottieLayout?: 'scattered' | 'grid' | 'circle' | 'row' | 'fullscreen' | 'custom';
    lottieBackground?: string; // URL to background Lottie JSON
    // For media scenes - enhanced with video controls
    mediaAssetId?: string;
    mediaPath?: string;
    mediaType?: 'image' | 'video';
    mediaStyle?: 'fullscreen' | 'framed' | 'pip' | 'background' | 'split-left' | 'split-right' | 'circle' | 'phone-frame';
    // Video-specific controls
    videoStartFrom?: number; // Start playing from this frame
    videoEndAt?: number; // Stop playing at this frame
    videoVolume?: number; // 0-1, default 1
    videoPlaybackRate?: number; // 0.5 = slow-mo, 2 = fast forward
    videoLoop?: boolean; // Loop the video
    videoMuted?: boolean; // Mute audio
    // Media animation (applied to the media itself)
    mediaAnimation?: {
      type: 'none' | 'ken-burns' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'rotate' | 'parallax';
      intensity?: number; // 0-1
    };
    // For multiple media (montage/collage)
    additionalMedia?: Array<{
      mediaPath: string;
      mediaType: 'image' | 'video';
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    }>;
    // Overlay effects
    overlayText?: string;
    overlayPosition?: 'top' | 'center' | 'bottom';
    overlayStyle?: 'minimal' | 'bold' | 'gradient-bar';
    // For chart scenes
    chartType?: 'bar' | 'progress' | 'pie' | 'line';
    chartData?: Array<{ label: string; value: number; color?: string }>;
    maxValue?: number;
    // For countdown scenes
    countFrom?: number;
    countTo?: number;
    // For comparison scenes
    beforeLabel?: string;
    afterLabel?: string;
    beforeValue?: string;
    afterValue?: string;
    beforeMedia?: string; // Path to before image/video
    afterMedia?: string; // Path to after image/video
    // Camera movement (on the entire scene)
    camera?: {
      type: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'ken-burns' | 'shake';
      intensity?: number; // 0-1, default 0.3
    };
    // For 3D scenes
    scene3d?: {
      style: '3d-text' | '3d-logo' | '3d-product' | '3d-particles' | '3d-shapes' | '3d-showcase';
      text?: string;
      secondaryColor?: string;
      cameraAnimation?: 'orbit' | 'zoom-in' | 'zoom-out' | 'pan' | 'static';
      intensity?: number;
      shapes?: Array<{
        type: 'cube' | 'sphere' | 'torus' | 'cylinder' | 'cone' | 'dodecahedron' | 'octahedron';
        color?: string;
        position?: [number, number, number];
        scale?: number;
        animation?: 'spin' | 'float' | 'pulse' | 'bounce';
      }>;
    };
  };
  // Scene transition (how this scene exits / next scene enters)
  transition?: {
    type: 'none' | 'fade' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down' | 'zoom-in' | 'zoom-out' | 'wipe-left' | 'wipe-right' | 'blur' | 'flip';
    duration?: number; // frames, default 15
  };
}

interface AttachedAsset {
  id: string;
  path: string;
  type: 'image' | 'video';
  filename: string;
}

interface DynamicAnimationProps {
  scenes: Scene[];
  title?: string;
  backgroundColor?: string;
  attachedAssets?: AttachedAsset[];
}

// Particle component for explosion effects
const Particle: React.FC<{
  delay: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
  duration: number;
}> = ({ delay, angle, distance, size, color, duration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.5 },
  });

  const x = Math.cos(angle) * distance * progress;
  const y = Math.sin(angle) * distance * progress;
  const opacity = interpolate(progress, [0, 0.3, 1], [0, 1, 0], { extrapolateRight: 'clamp' });
  const scale = interpolate(progress, [0, 0.2, 1], [0, 1.5, 0.3], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        opacity,
        boxShadow: `0 0 ${size * 2}px ${color}`,
      }}
    />
  );
};

// Explosion effect component
const ExplosionEffect: React.FC<{
  color?: string;
  particleCount?: number;
  delay?: number;
}> = ({ color = '#f97316', particleCount = 12, delay = 0 }) => {
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => ({
      angle: (i / particleCount) * Math.PI * 2,
      distance: 150 + Math.random() * 100,
      size: 8 + Math.random() * 12,
      delay: delay + Math.random() * 5,
    }));
  }, [particleCount, delay]);

  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%' }}>
      {particles.map((p, i) => (
        <Particle
          key={i}
          angle={p.angle}
          distance={p.distance}
          size={p.size}
          color={color}
          delay={p.delay}
          duration={30}
        />
      ))}
    </div>
  );
};

// Animated gradient background
const GradientBackground: React.FC<{
  color1?: string;
  color2?: string;
  color3?: string;
}> = ({ color1 = '#0a0a0a', color2 = '#1a1a2e', color3 = '#16213e' }) => {
  const frame = useCurrentFrame();
  const rotation = interpolate(frame, [0, 300], [0, 360], { extrapolateRight: 'extend' });

  return (
    <div
      style={{
        position: 'absolute',
        inset: -100,
        background: `conic-gradient(from ${rotation}deg at 50% 50%, ${color1}, ${color2}, ${color3}, ${color1})`,
        filter: 'blur(80px)',
        opacity: 0.6,
      }}
    />
  );
};

// Glowing orb decoration
const GlowingOrb: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  delay?: number;
}> = ({ x, y, size, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = spring({
    frame: frame - delay,
    fps,
    config: { damping: 5, stiffness: 20 },
    durationInFrames: 60,
  });

  const scale = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.8, 1.2]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}88, ${color}00)`,
        transform: `scale(${scale * pulse})`,
        filter: `blur(${size / 4}px)`,
      }}
    />
  );
};

// Animated text with character-by-character reveal
const AnimatedText: React.FC<{
  text: string;
  fontSize: number;
  color: string;
  delay?: number;
  style?: 'typewriter' | 'bounce' | 'wave' | 'glitch';
  fontWeight?: string | number;
}> = ({ text, fontSize, color, delay = 0, style = 'bounce', fontWeight = 'bold' }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const characters = text.split('');

  // Scale character stagger based on scene duration so text always fully appears
  // For short scenes (<60 frames), use minimal stagger; for longer scenes, more dramatic
  const maxStaggerTime = Math.min(durationInFrames * 0.3, 40); // Use at most 30% of scene for text entrance
  const charStagger = characters.length > 1 ? Math.min(2, maxStaggerTime / characters.length) : 0;
  // Also scale the delay proportionally for short scenes
  const scaledDelay = durationInFrames < 90 ? Math.min(delay, durationInFrames * 0.15) : delay;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
      {characters.map((char, i) => {
        const charDelay = scaledDelay + i * charStagger;

        let transform = '';
        let opacity = 1;
        let charColor = color;

        if (style === 'bounce') {
          const bounce = spring({
            frame: frame - charDelay,
            fps,
            config: { damping: 8, stiffness: 200, mass: 0.5 },
          });
          const y = interpolate(bounce, [0, 1], [30, 0]);
          opacity = interpolate(bounce, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
          transform = `translateY(${y}px)`;
        } else if (style === 'wave') {
          const wave = Math.sin((frame - charDelay) * 0.15) * 10;
          const fadeIn = interpolate(frame - charDelay, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          opacity = fadeIn;
          transform = `translateY(${wave}px)`;
        } else if (style === 'glitch') {
          const glitchX = frame % 10 === 0 ? (Math.random() - 0.5) * 10 : 0;
          const glitchY = frame % 15 === 0 ? (Math.random() - 0.5) * 5 : 0;
          const fadeIn = interpolate(frame - charDelay, [0, 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          opacity = fadeIn;
          transform = `translate(${glitchX}px, ${glitchY}px)`;
          if (frame % 20 < 2) charColor = '#00ffff';
        } else if (style === 'typewriter') {
          opacity = frame > charDelay ? 1 : 0;
        }

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontSize,
              fontWeight,
              color: charColor,
              fontFamily: 'Inter, system-ui, sans-serif',
              transform,
              opacity,
              textShadow: `0 0 20px ${color}66, 0 0 40px ${color}33`,
              whiteSpace: char === ' ' ? 'pre' : 'normal',
            }}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

// Animated number counter (e.g., 0 → 10,000)
const AnimatedNumber: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
  delay?: number;
  duration?: number; // in frames
}> = ({ value, prefix = '', suffix = '', fontSize = 108, color = '#f97316', delay = 0, duration = 60 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Debug logging (only on first few frames to avoid spam)
  if (frame <= 3) {
    console.log(`[AnimatedNumber] Rendering: value=${value}, prefix="${prefix}", suffix="${suffix}", delay=${delay}, duration=${duration}`);
  }

  // Ensure value is a valid number
  const targetValue = typeof value === 'number' && !isNaN(value) ? value : 0;

  // Use interpolate for smoother, more visible counting (not spring which snaps quickly)
  const animatedFrame = Math.max(0, frame - delay);
  const progress = interpolate(
    animatedFrame,
    [0, duration],
    [0, 1],
    { extrapolateRight: 'clamp' }
  );

  // Ease out for dramatic slowdown at the end
  const easedProgress = 1 - Math.pow(1 - progress, 3);

  const currentValue = Math.floor(easedProgress * targetValue);

  // Format number with commas
  const formattedValue = currentValue.toLocaleString();

  const glowPulse = Math.sin((frame - delay) * 0.08) * 10 + 30;

  return (
    <div
      style={{
        fontSize,
        fontWeight: 900,
        color,
        fontFamily: 'Inter, system-ui, sans-serif',
        textShadow: `0 0 ${glowPulse}px ${color}, 0 0 ${glowPulse * 2}px ${color}66`,
        letterSpacing: '-0.02em',
      }}
    >
      {prefix}{formattedValue}{suffix}
    </div>
  );
};

// Camera movement wrapper
const CameraWrapper: React.FC<{
  children: React.ReactNode;
  type: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'ken-burns' | 'shake' | 'none';
  intensity?: number;
}> = ({ children, type, intensity = 0.3 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const smoothProgress = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 50 },
    durationInFrames,
  });

  let transform = '';
  const maxMove = intensity * 100; // pixels
  const maxZoom = 1 + intensity * 0.5; // 1.0 to 1.5

  switch (type) {
    case 'zoom-in':
      transform = `scale(${interpolate(smoothProgress, [0, 1], [1, maxZoom])})`;
      break;
    case 'zoom-out':
      transform = `scale(${interpolate(smoothProgress, [0, 1], [maxZoom, 1])})`;
      break;
    case 'pan-left':
      transform = `translateX(${interpolate(progress, [0, 1], [maxMove, -maxMove])}px)`;
      break;
    case 'pan-right':
      transform = `translateX(${interpolate(progress, [0, 1], [-maxMove, maxMove])}px)`;
      break;
    case 'pan-up':
      transform = `translateY(${interpolate(progress, [0, 1], [maxMove, -maxMove])}px)`;
      break;
    case 'pan-down':
      transform = `translateY(${interpolate(progress, [0, 1], [-maxMove, maxMove])}px)`;
      break;
    case 'ken-burns': {
      // Classic Ken Burns: slow zoom + slight pan
      const kbScale = interpolate(smoothProgress, [0, 1], [1, maxZoom]);
      const kbX = interpolate(progress, [0, 1], [-maxMove * 0.3, maxMove * 0.3]);
      const kbY = interpolate(progress, [0, 1], [-maxMove * 0.2, maxMove * 0.2]);
      transform = `scale(${kbScale}) translate(${kbX}px, ${kbY}px)`;
      break;
    }
    case 'shake': {
      // Camera shake effect - uses sine waves for organic movement
      const shakeIntensity = intensity * 8; // Max shake in pixels
      const shakeX = Math.sin(frame * 0.5) * shakeIntensity + Math.sin(frame * 1.3) * shakeIntensity * 0.5;
      const shakeY = Math.cos(frame * 0.7) * shakeIntensity * 0.8 + Math.cos(frame * 1.1) * shakeIntensity * 0.3;
      const shakeRotate = Math.sin(frame * 0.3) * intensity * 0.5; // Subtle rotation
      transform = `translate(${shakeX}px, ${shakeY}px) rotate(${shakeRotate}deg)`;
      break;
    }
    default:
      transform = 'none';
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', transform, transformOrigin: 'center center' }}>
        {children}
      </div>
    </div>
  );
};

// Scene transition wrapper - handles entry/exit animations
const TransitionWrapper: React.FC<{
  children: React.ReactNode;
  transitionType: Scene['transition']['type'];
  transitionDuration?: number;
  isEntry?: boolean; // true = entering scene, false = exiting scene
}> = ({ children, transitionType, transitionDuration = 15, isEntry = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width, height } = useVideoConfig();

  // Calculate transition progress
  const entryEnd = transitionDuration;
  const exitStart = durationInFrames - transitionDuration;

  // Entry animation (0 to 1 over first transitionDuration frames)
  const entryProgress = interpolate(
    frame,
    [0, entryEnd],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Exit animation (0 to 1 over last transitionDuration frames)
  const exitProgress = interpolate(
    frame,
    [exitStart, durationInFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Eased progress for smoother animations
  const easedEntry = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
    durationInFrames: transitionDuration,
  });

  const easedExit = spring({
    frame: frame - exitStart,
    fps,
    config: { damping: 15, stiffness: 100 },
    durationInFrames: transitionDuration,
  });

  let style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  };

  let clipPath: string | undefined;
  let transform: string | undefined;
  let opacity: number = 1;
  let filter: string | undefined;

  switch (transitionType) {
    case 'fade':
      opacity = interpolate(entryProgress, [0, 1], [0, 1]) * interpolate(exitProgress, [0, 1], [1, 0]);
      break;

    case 'swipe-left':
      // Enter from right, exit to left
      const swipeLeftEntry = interpolate(easedEntry, [0, 1], [width, 0]);
      const swipeLeftExit = interpolate(easedExit, [0, 1], [0, -width]);
      transform = `translateX(${frame < exitStart ? swipeLeftEntry : swipeLeftExit}px)`;
      break;

    case 'swipe-right':
      // Enter from left, exit to right
      const swipeRightEntry = interpolate(easedEntry, [0, 1], [-width, 0]);
      const swipeRightExit = interpolate(easedExit, [0, 1], [0, width]);
      transform = `translateX(${frame < exitStart ? swipeRightEntry : swipeRightExit}px)`;
      break;

    case 'swipe-up':
      // Enter from bottom, exit to top
      const swipeUpEntry = interpolate(easedEntry, [0, 1], [height, 0]);
      const swipeUpExit = interpolate(easedExit, [0, 1], [0, -height]);
      transform = `translateY(${frame < exitStart ? swipeUpEntry : swipeUpExit}px)`;
      break;

    case 'swipe-down':
      // Enter from top, exit to bottom
      const swipeDownEntry = interpolate(easedEntry, [0, 1], [-height, 0]);
      const swipeDownExit = interpolate(easedExit, [0, 1], [0, height]);
      transform = `translateY(${frame < exitStart ? swipeDownEntry : swipeDownExit}px)`;
      break;

    case 'zoom-in':
      // Start small, grow to full, then shrink out
      const zoomInEntry = interpolate(easedEntry, [0, 1], [0.3, 1]);
      const zoomInExit = interpolate(easedExit, [0, 1], [1, 1.5]);
      const zoomInScale = frame < exitStart ? zoomInEntry : zoomInExit;
      opacity = frame < exitStart ? entryProgress : (1 - exitProgress);
      transform = `scale(${zoomInScale})`;
      break;

    case 'zoom-out':
      // Start large, shrink to full, then zoom out smaller
      const zoomOutEntry = interpolate(easedEntry, [0, 1], [1.5, 1]);
      const zoomOutExit = interpolate(easedExit, [0, 1], [1, 0.3]);
      const zoomOutScale = frame < exitStart ? zoomOutEntry : zoomOutExit;
      opacity = frame < exitStart ? entryProgress : (1 - exitProgress);
      transform = `scale(${zoomOutScale})`;
      break;

    case 'wipe-left':
      // Reveal from right to left using clip-path
      const wipeLeftReveal = interpolate(entryProgress, [0, 1], [100, 0]);
      const wipeLeftHide = interpolate(exitProgress, [0, 1], [0, 100]);
      clipPath = frame < exitStart
        ? `inset(0 ${wipeLeftReveal}% 0 0)`
        : `inset(0 0 0 ${wipeLeftHide}%)`;
      break;

    case 'wipe-right':
      // Reveal from left to right using clip-path
      const wipeRightReveal = interpolate(entryProgress, [0, 1], [100, 0]);
      const wipeRightHide = interpolate(exitProgress, [0, 1], [0, 100]);
      clipPath = frame < exitStart
        ? `inset(0 0 0 ${wipeRightReveal}%)`
        : `inset(0 ${wipeRightHide}% 0 0)`;
      break;

    case 'blur':
      // Blur in and out
      const blurEntry = interpolate(entryProgress, [0, 1], [20, 0]);
      const blurExit = interpolate(exitProgress, [0, 1], [0, 20]);
      const blurAmount = frame < exitStart ? blurEntry : blurExit;
      filter = `blur(${blurAmount}px)`;
      opacity = frame < exitStart ? entryProgress : (1 - exitProgress);
      break;

    case 'flip':
      // 3D flip effect
      const flipEntry = interpolate(easedEntry, [0, 1], [-90, 0]);
      const flipExit = interpolate(easedExit, [0, 1], [0, 90]);
      const flipRotation = frame < exitStart ? flipEntry : flipExit;
      transform = `perspective(1000px) rotateY(${flipRotation}deg)`;
      opacity = frame < exitStart
        ? interpolate(entryProgress, [0, 0.5, 1], [0, 0, 1])
        : interpolate(exitProgress, [0, 0.5, 1], [1, 0, 0]);
      break;

    case 'none':
    default:
      // No transition animation
      break;
  }

  return (
    <div
      style={{
        ...style,
        transform,
        opacity,
        clipPath,
        filter,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  );
};

// Progress bar component
const ProgressBar: React.FC<{
  value: number;
  maxValue: number;
  label: string;
  color?: string;
  delay?: number;
}> = ({ value, maxValue, label, color = '#f97316', delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const barWidth = interpolate(progress, [0, 1], [0, (value / maxValue) * 100]);
  const displayValue = Math.floor(interpolate(progress, [0, 1], [0, value]));

  return (
    <div style={{ width: '100%', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 20, color: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {label}
        </span>
        <span style={{ fontSize: 20, color, fontWeight: 'bold', fontFamily: 'Inter, system-ui, sans-serif' }}>
          {displayValue}%
        </span>
      </div>
      <div style={{ width: '100%', height: 16, backgroundColor: '#333', borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${barWidth}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 8,
            boxShadow: `0 0 20px ${color}`,
          }}
        />
      </div>
    </div>
  );
};

// Bar chart component
const BarChart: React.FC<{
  data: Array<{ label: string; value: number; color?: string }>;
  maxValue?: number;
  delay?: number;
}> = ({ data, maxValue, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const actualMax = maxValue || Math.max(...data.map(d => d.value));
  const colors = ['#f97316', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#eab308'];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 300, padding: '0 40px' }}>
      {data.map((item, index) => {
        const itemDelay = delay + index * 8;
        const progress = spring({
          frame: frame - itemDelay,
          fps,
          config: { damping: 12, stiffness: 100 },
        });

        const barHeight = interpolate(progress, [0, 1], [0, (item.value / actualMax) * 250]);
        const barColor = item.color || colors[index % colors.length];

        return (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 'bold',
                color: barColor,
                marginBottom: 8,
                opacity: interpolate(progress, [0, 0.5, 1], [0, 1, 1]),
              }}
            >
              {item.value}
            </div>
            <div
              style={{
                width: '100%',
                maxWidth: 80,
                height: barHeight,
                backgroundColor: barColor,
                borderRadius: '8px 8px 0 0',
                boxShadow: `0 0 30px ${barColor}66`,
              }}
            />
            <div
              style={{
                marginTop: 12,
                fontSize: 16,
                color: '#a1a1aa',
                textAlign: 'center',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Pie chart component
const PieChart: React.FC<{
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  delay?: number;
}> = ({ data, size = 300, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = ['#f97316', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#eab308'];
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  // Calculate pie segments
  let currentAngle = -90; // Start from top
  const segments = data.map((item, index) => {
    const angle = (item.value / total) * 360 * progress;
    const startAngle = currentAngle;
    currentAngle += angle;
    return {
      ...item,
      startAngle,
      angle,
      color: item.color || colors[index % colors.length],
    };
  });

  // Create conic gradient
  let gradientStops = '';
  let angleAcc = 0;
  segments.forEach((seg, i) => {
    const startPct = (angleAcc / 360) * 100;
    angleAcc += seg.angle;
    const endPct = (angleAcc / 360) * 100;
    gradientStops += `${seg.color} ${startPct}% ${endPct}%${i < segments.length - 1 ? ', ' : ''}`;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `conic-gradient(from -90deg, ${gradientStops || '#333 0% 100%'})`,
          boxShadow: '0 0 60px rgba(0,0,0,0.5)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: seg.color }} />
            <span style={{ color: '#ffffff', fontSize: 18, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {seg.label}: {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Scene transition overlay
const SceneTransition: React.FC<{
  type: 'fade' | 'zoom' | 'swipe' | 'burst';
  color?: string;
  entering?: boolean;
}> = ({ type, color = '#f97316', entering = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const transitionFrames = 15;
  const progress = entering
    ? interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' })
    : interpolate(frame, [durationInFrames - transitionFrames, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });

  if (type === 'burst') {
    const scale = spring({
      frame: entering ? frame : durationInFrames - frame,
      fps,
      config: { damping: 12, stiffness: 100 },
    });

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            backgroundColor: color,
            transform: `scale(${entering ? (1 - scale) * 50 : scale * 50})`,
            opacity: entering ? 1 - progress : progress,
          }}
        />
      </AbsoluteFill>
    );
  }

  return null;
};

// Enhanced Title Scene
const TitleScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const accentColor = content.color || '#f97316';

  // Entry animations
  const titleScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Scale animation timing based on scene duration
  const isShort = durationInFrames < 90;
  const subtitleStart = isShort ? Math.round(durationInFrames * 0.15) : 20;
  const subtitleEnd = isShort ? Math.round(durationInFrames * 0.35) : 40;
  const subtitleOpacity = interpolate(frame, [subtitleStart, subtitleEnd], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleY = interpolate(frame, [subtitleStart, subtitleEnd], [20, 0], { extrapolateRight: 'clamp' });

  // Exit animation
  const exitFrames = isShort ? Math.round(durationInFrames * 0.2) : 20;
  const exitProgress = interpolate(frame, [durationInFrames - exitFrames, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const exitScale = interpolate(exitProgress, [0, 1], [1, 0.8]);
  const exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '33'} color3="#0a0a0a" />

      {/* Decorative orbs */}
      <GlowingOrb x={20} y={30} size={200} color={accentColor} delay={5} />
      <GlowingOrb x={80} y={70} size={150} color="#3b82f6" delay={10} />

      {/* Explosion on entry */}
      {frame < 30 && <ExplosionEffect color={accentColor} particleCount={16} delay={5} />}

      <div
        style={{
          textAlign: 'center',
          transform: `scale(${titleScale * exitScale})`,
          opacity: exitOpacity,
          zIndex: 10,
        }}
      >
        {content.title && (
          <AnimatedText
            text={content.title}
            fontSize={90}
            color={content.color || '#ffffff'}
            style="bounce"
            delay={0}
          />
        )}

        {content.subtitle && (
          <div
            style={{
              marginTop: 30,
              opacity: subtitleOpacity,
              transform: `translateY(${subtitleY}px)`,
            }}
          >
            <AnimatedText
              text={content.subtitle}
              fontSize={36}
              color="#a1a1aa"
              style="wave"
              delay={isShort ? Math.round(durationInFrames * 0.15) : 25}
              fontWeight={400}
            />
          </div>
        )}

        {/* Underline accent */}
        <div
          style={{
            width: interpolate(frame, [15, 35], [0, 300], { extrapolateRight: 'clamp' }),
            height: 4,
            backgroundColor: accentColor,
            margin: '30px auto 0',
            borderRadius: 2,
            boxShadow: `0 0 20px ${accentColor}`,
          }}
        />
      </div>

      <SceneTransition type="burst" color={accentColor} entering />
    </AbsoluteFill>
  );
};

// Enhanced Steps/Features Scene
const StepsScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const items = content.items || [];
  const accentColor = content.color || '#f97316';

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        padding: 80,
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2="#1a1a2e" color3={accentColor + '22'} />

      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            opacity: titleOpacity,
            transform: `translateY(${(1 - titleY) * -30}px)`,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={56}
            color={content.color || '#ffffff'}
            style="bounce"
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 80,
          justifyContent: 'center',
          alignItems: 'flex-start',
          marginTop: content.title ? 80 : 0,
        }}
      >
        {items.map((item, index) => {
          // Scale stagger based on scene duration so all items appear in time
          const itemStagger = durationInFrames < 90
            ? Math.round(durationInFrames * 0.08)
            : 15;
          const itemStart = durationInFrames < 90
            ? Math.round(durationInFrames * 0.1)
            : 20;
          const delay = itemStart + index * itemStagger;

          const itemSpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 10, stiffness: 150, mass: 0.8 },
          });

          const itemScale = interpolate(itemSpring, [0, 1], [0.5, 1]);
          const itemOpacity = interpolate(itemSpring, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
          const itemRotate = interpolate(itemSpring, [0, 1], [-10, 0]);

          // Icon pulse effect
          const pulse = Math.sin((frame - delay) * 0.1) * 0.05 + 1;

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 24,
                maxWidth: 320,
                opacity: itemOpacity,
                transform: `scale(${itemScale}) rotate(${itemRotate}deg)`,
              }}
            >
              {/* Animated icon container */}
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 24,
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: 48,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  transform: `scale(${pulse})`,
                  boxShadow: `0 10px 40px ${accentColor}66, 0 0 60px ${accentColor}33`,
                }}
              >
                {item.icon || index + 1}
              </div>

              {/* Label */}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color: '#ffffff',
                  textAlign: 'center',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                }}
              >
                {item.label}
              </div>

              {/* Description */}
              {item.description && (
                <div
                  style={{
                    fontSize: 18,
                    color: '#a1a1aa',
                    textAlign: 'center',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    lineHeight: 1.5,
                  }}
                >
                  {item.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Client-side numeric extraction fallback
const extractNumericFromString = (valueStr: string): { numericValue: number; prefix: string; suffix: string } | null => {
  if (!valueStr || typeof valueStr !== 'string') return null;

  const str = valueStr.trim();

  // Extract prefix (currency symbols)
  let prefix = '';
  const prefixMatch = str.match(/^([£$€¥₹#@~]+)/);
  if (prefixMatch) {
    prefix = prefixMatch[1];
  }

  // Extract number (including commas and decimals)
  const numberMatch = str.match(/[\d,]+\.?\d*/);
  if (!numberMatch || numberMatch[0] === '') return null;

  let numericValue = parseFloat(numberMatch[0].replace(/,/g, ''));
  if (isNaN(numericValue)) return null;

  // Extract suffix and check for multipliers
  const numberEndIndex = str.indexOf(numberMatch[0]) + numberMatch[0].length;
  const afterNumber = str.substring(numberEndIndex).trim();
  let suffix = '';

  // Apply multipliers
  if (/^k\b/i.test(afterNumber) || /^thousand/i.test(afterNumber)) {
    numericValue *= 1000;
    suffix = afterNumber.replace(/^k\b/i, '').replace(/^thousand/i, '').trim();
  } else if (/^m\b/i.test(afterNumber) || /^million/i.test(afterNumber)) {
    numericValue *= 1000000;
    suffix = afterNumber.replace(/^m\b/i, '').replace(/^million/i, '').trim();
  } else if (/^b\b/i.test(afterNumber) || /^billion/i.test(afterNumber)) {
    numericValue *= 1000000000;
    suffix = afterNumber.replace(/^b\b/i, '').replace(/^billion/i, '').trim();
  } else {
    suffix = afterNumber;
  }

  return { numericValue: Math.round(numericValue), prefix, suffix };
};

// Enhanced Stats Scene with counting animation
const StatsScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const stats = content.stats || [];
  const accentColor = content.color || '#f97316';
  const colors = [accentColor, '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899'];
  const isShort = durationInFrames < 90;

  // Process stats to ensure numericValue is set (client-side fallback)
  const processedStats = useMemo(() => {
    console.log('[StatsScene] Processing stats:', JSON.stringify(stats, null, 2));

    return stats.map((stat, i) => {
      console.log(`[StatsScene] Stat ${i}: value="${stat.value}", numericValue=${stat.numericValue} (type: ${typeof stat.numericValue}), prefix="${stat.prefix}", suffix="${stat.suffix}"`);

      // If numericValue is already set and is a number, use it
      if (typeof stat.numericValue === 'number' && !isNaN(stat.numericValue)) {
        console.log(`[StatsScene] Stat ${i}: Using existing numericValue: ${stat.numericValue}`);
        return stat;
      }

      // Try to extract from numericValue if it's a string
      if (stat.numericValue !== undefined && stat.numericValue !== null) {
        const parsed = parseFloat(String(stat.numericValue));
        if (!isNaN(parsed)) {
          console.log(`[StatsScene] Stat ${i}: Parsed numericValue from string: ${parsed}`);
          return { ...stat, numericValue: parsed };
        }
      }

      // Try to extract from value string
      if (stat.value) {
        const extracted = extractNumericFromString(stat.value);
        if (extracted) {
          console.log(`[StatsScene] Stat ${i}: Extracted from value "${stat.value}": numericValue=${extracted.numericValue}, prefix="${extracted.prefix}", suffix="${extracted.suffix}"`);
          return {
            ...stat,
            numericValue: extracted.numericValue,
            prefix: stat.prefix || extracted.prefix,
            suffix: stat.suffix || extracted.suffix,
          };
        } else {
          console.log(`[StatsScene] Stat ${i}: Could not extract numeric value from "${stat.value}"`);
        }
      }

      console.log(`[StatsScene] Stat ${i}: No numericValue - will show static text`);
      return stat;
    });
  }, [stats]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />

      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 100,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={52}
            color={content.color || '#ffffff'}
            style="bounce"
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 120, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 1400 }}>
        {processedStats.map((stat, index) => {
          const statStagger = isShort ? Math.round(durationInFrames * 0.08) : 12;
          const statStart = isShort ? Math.round(durationInFrames * 0.1) : 15;
          const delay = statStart + index * statStagger;
          const statColor = colors[index % colors.length];

          const entrySpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 8, stiffness: 100, mass: 1 },
          });

          const scale = interpolate(entrySpring, [0, 1], [0, 1]);
          const rotation = interpolate(entrySpring, [0, 1], [180, 0]);

          // Check if we should animate the number (must be a valid number > 0)
          const hasNumericValue = typeof stat.numericValue === 'number' && !isNaN(stat.numericValue) && stat.numericValue > 0;

          // Debug: log the decision (only on first frame to avoid spam)
          if (frame === 0) {
            console.log(`[StatsScene] Render stat ${index}: hasNumericValue=${hasNumericValue}, numericValue=${stat.numericValue}, will use ${hasNumericValue ? 'AnimatedNumber' : 'static text'}`);
          }

          return (
            <div
              key={index}
              style={{
                textAlign: 'center',
                transform: `scale(${scale}) rotateY(${rotation}deg)`,
                perspective: 1000,
                minWidth: 200,
              }}
            >
              {hasNumericValue ? (
                <AnimatedNumber
                  value={stat.numericValue!}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  fontSize={96}
                  color={statColor}
                  delay={delay}
                  duration={isShort ? Math.round(durationInFrames * 0.5) : 75}
                />
              ) : (
                <div
                  style={{
                    fontSize: 96,
                    fontWeight: 900,
                    color: statColor,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textShadow: `0 0 30px ${statColor}, 0 0 60px ${statColor}66`,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {stat.value}
                </div>
              )}
              <div
                style={{
                  fontSize: 22,
                  color: '#a1a1aa',
                  marginTop: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.15em',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Decorative particles */}
      {frame > 10 && frame < 50 && (
        <ExplosionEffect color={accentColor} particleCount={8} delay={10} />
      )}
    </AbsoluteFill>
  );
};

// Enhanced Text Scene
const TextScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accentColor = content.color || '#ffffff';
  const exitFrames = durationInFrames < 90 ? Math.round(durationInFrames * 0.2) : 20;

  const exitOpacity = interpolate(
    frame,
    [durationInFrames - exitFrames, durationInFrames],
    [1, 0],
    { extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        padding: 120,
        overflow: 'hidden',
      }}
    >
      <GradientBackground />

      <div style={{ maxWidth: 1400, opacity: exitOpacity }}>
        <AnimatedText
          text={content.title || ''}
          fontSize={56}
          color={accentColor}
          style="wave"
          fontWeight={600}
        />
      </div>

      {/* Subtle particles */}
      <GlowingOrb x={10} y={20} size={100} color={accentColor} />
      <GlowingOrb x={90} y={80} size={80} color="#3b82f6" delay={5} />
    </AbsoluteFill>
  );
};

// Enhanced Transition Scene
const TransitionScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const accentColor = content.color || '#f97316';

  const progress = interpolate(frame, [0, durationInFrames], [0, 1]);

  // Multiple expanding rings
  const rings = [0, 10, 20].map((delay, i) => {
    const ringProgress = interpolate(frame - delay, [0, durationInFrames - delay], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return {
      scale: interpolate(ringProgress, [0, 1], [0, 30]),
      opacity: interpolate(ringProgress, [0, 0.3, 1], [0.8, 0.5, 0]),
    };
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {rings.map((ring, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: `3px solid ${accentColor}`,
            transform: `scale(${ring.scale})`,
            opacity: ring.opacity,
            boxShadow: `0 0 30px ${accentColor}`,
          }}
        />
      ))}

      <ExplosionEffect color={accentColor} particleCount={20} delay={0} />
    </AbsoluteFill>
  );
};

// Media animation wrapper - applies ken-burns, zoom, pan effects to media
const MediaAnimationWrapper: React.FC<{
  children: React.ReactNode;
  animationType?: Scene['content']['mediaAnimation']['type'];
  intensity?: number;
}> = ({ children, animationType = 'none', intensity = 0.3 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const maxMove = intensity * 50;
  const maxZoom = 1 + intensity * 0.4;

  let transform = '';

  switch (animationType) {
    case 'ken-burns': {
      const scale = interpolate(progress, [0, 1], [1, maxZoom]);
      const x = interpolate(progress, [0, 1], [-maxMove * 0.5, maxMove * 0.5]);
      const y = interpolate(progress, [0, 1], [-maxMove * 0.3, maxMove * 0.3]);
      transform = `scale(${scale}) translate(${x}px, ${y}px)`;
      break;
    }
    case 'zoom-in':
      transform = `scale(${interpolate(progress, [0, 1], [1, maxZoom])})`;
      break;
    case 'zoom-out':
      transform = `scale(${interpolate(progress, [0, 1], [maxZoom, 1])})`;
      break;
    case 'pan-left':
      transform = `translateX(${interpolate(progress, [0, 1], [maxMove, -maxMove])}px)`;
      break;
    case 'pan-right':
      transform = `translateX(${interpolate(progress, [0, 1], [-maxMove, maxMove])}px)`;
      break;
    case 'pan-up':
      transform = `translateY(${interpolate(progress, [0, 1], [maxMove, -maxMove])}px)`;
      break;
    case 'pan-down':
      transform = `translateY(${interpolate(progress, [0, 1], [-maxMove, maxMove])}px)`;
      break;
    case 'rotate': {
      const rotation = interpolate(progress, [0, 1], [0, intensity * 10]);
      transform = `rotate(${rotation}deg)`;
      break;
    }
    case 'parallax': {
      // Parallax effect - subtle 3D depth movement
      const parallaxX = Math.sin(frame * 0.02) * maxMove * 0.3;
      const parallaxY = Math.cos(frame * 0.015) * maxMove * 0.2;
      transform = `translate(${parallaxX}px, ${parallaxY}px)`;
      break;
    }
    default:
      transform = 'none';
  }

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', transform, transformOrigin: 'center center' }}>
        {children}
      </div>
    </div>
  );
};

// Phone frame overlay for mobile-style content
const PhoneFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div
      style={{
        position: 'relative',
        width: 375,
        height: 812,
        borderRadius: 40,
        overflow: 'hidden',
        boxShadow: '0 50px 100px rgba(0,0,0,0.5), 0 0 0 8px #1a1a1a, 0 0 0 10px #333',
        background: '#000',
      }}
    >
      {/* Notch */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 150,
          height: 30,
          backgroundColor: '#000',
          borderRadius: '0 0 20px 20px',
          zIndex: 100,
        }}
      />
      {/* Content */}
      <div style={{ width: '100%', height: '100%' }}>
        {children}
      </div>
    </div>
  );
};

// Text overlay component for media
const MediaTextOverlay: React.FC<{
  text: string;
  position?: 'top' | 'center' | 'bottom';
  style?: 'minimal' | 'bold' | 'gradient-bar';
  color?: string;
}> = ({ text, position = 'bottom', style = 'minimal', color = '#ffffff' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 40px',
    ...(position === 'top' && { top: 40 }),
    ...(position === 'center' && { top: '50%', transform: 'translateY(-50%)' }),
    ...(position === 'bottom' && { bottom: 40 }),
  };

  const getTextStyles = (): React.CSSProperties => {
    switch (style) {
      case 'bold':
        return {
          fontSize: 64,
          fontWeight: 900,
          textShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)',
          letterSpacing: '-0.02em',
        };
      case 'gradient-bar':
        return {
          fontSize: 28,
          fontWeight: 600,
          padding: '16px 32px',
          background: 'linear-gradient(90deg, rgba(0,0,0,0.9), rgba(0,0,0,0.7))',
          borderRadius: 8,
          backdropFilter: 'blur(10px)',
        };
      case 'minimal':
      default:
        return {
          fontSize: 32,
          fontWeight: 500,
          textShadow: '0 2px 10px rgba(0,0,0,0.8)',
        };
    }
  };

  return (
    <div style={{ ...positionStyle, opacity: entryProgress }}>
      <div
        style={{
          color,
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
          transform: `translateY(${interpolate(entryProgress, [0, 1], [20, 0])}px)`,
          ...getTextStyles(),
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Media Scene - displays images or videos with advanced features
const MediaScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const accentColor = content.color || '#f97316';
  const mediaStyle = content.mediaStyle || 'framed';

  // Preload media on first render
  useEffect(() => {
    if (content.mediaPath) {
      try {
        if (content.mediaType === 'video') {
          preloadVideo(content.mediaPath);
        } else {
          preloadImage(content.mediaPath);
        }
        console.log('[MediaScene] Preloading:', content.mediaPath);
      } catch (e) {
        console.log('[MediaScene] Preload failed (non-critical):', e);
      }
    }
  }, [content.mediaPath, content.mediaType]);

  // Entry animation
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const scale = interpolate(entrySpring, [0, 1], [0.8, 1]);
  const opacity = interpolate(entrySpring, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });

  // Exit animation
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateRight: 'clamp' }
  );

  // Get container and media styles based on display mode
  const getStylesForMode = () => {
    const baseMediaStyle: React.CSSProperties = {
      objectFit: 'cover',
    };

    switch (mediaStyle) {
      case 'fullscreen':
        return {
          container: { width: '100%', height: '100%' },
          media: { ...baseMediaStyle, width: '100%', height: '100%' },
          showDecorations: false,
        };
      case 'background':
        return {
          container: { width: '100%', height: '100%' },
          media: { ...baseMediaStyle, width: '100%', height: '100%', filter: 'brightness(0.5)' },
          showDecorations: false,
        };
      case 'pip':
        return {
          container: {
            position: 'absolute' as const,
            bottom: 80,
            right: 80,
            width: '35%',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${accentColor}33`,
          },
          media: { ...baseMediaStyle, width: '100%', height: 'auto' },
          showDecorations: true,
        };
      case 'split-left':
        return {
          container: {
            position: 'absolute' as const,
            left: 0,
            top: 0,
            width: '50%',
            height: '100%',
            overflow: 'hidden',
          },
          media: { ...baseMediaStyle, width: '100%', height: '100%' },
          showDecorations: false,
        };
      case 'split-right':
        return {
          container: {
            position: 'absolute' as const,
            right: 0,
            top: 0,
            width: '50%',
            height: '100%',
            overflow: 'hidden',
          },
          media: { ...baseMediaStyle, width: '100%', height: '100%' },
          showDecorations: false,
        };
      case 'circle':
        return {
          container: {
            width: 500,
            height: 500,
            borderRadius: '50%',
            overflow: 'hidden',
            boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 60px ${accentColor}44`,
          },
          media: { ...baseMediaStyle, width: '100%', height: '100%' },
          showDecorations: true,
        };
      case 'phone-frame':
        return {
          container: {},
          media: { ...baseMediaStyle, width: '100%', height: '100%' },
          showDecorations: true,
          usePhoneFrame: true,
        };
      case 'framed':
      default:
        return {
          container: {
            maxWidth: '80%',
            maxHeight: '70%',
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 60px ${accentColor}44`,
          },
          media: { ...baseMediaStyle, width: '100%', height: 'auto', objectFit: 'contain' as const },
          showDecorations: true,
        };
    }
  };

  const styles = getStylesForMode();

  // If no media path provided, show a placeholder
  if (!content.mediaPath) {
    return (
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: content.backgroundColor || 'transparent',
        }}
      >
        <GradientBackground color1="#0a0a0a" color2={accentColor + '33'} color3="#0a0a0a" />
        <div
          style={{
            fontSize: 32,
            color: '#a1a1aa',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Media not found
        </div>
      </AbsoluteFill>
    );
  }

  // Debug log (only on first few frames)
  if (frame <= 1) {
    console.log('[MediaScene] Rendering media:', {
      mediaPath: content.mediaPath,
      mediaType: content.mediaType,
      mediaStyle: content.mediaStyle,
      videoStartFrom: content.videoStartFrom,
      videoEndAt: content.videoEndAt,
      mediaAnimation: content.mediaAnimation,
    });
  }

  const mediaUrl = content.mediaPath;

  // Render the media element
  const renderMedia = () => {
    if (content.mediaType === 'video') {
      // Use OffthreadVideo for better performance in rendering
      return (
        <OffthreadVideo
          src={mediaUrl}
          style={styles.media}
          startFrom={content.videoStartFrom}
          endAt={content.videoEndAt}
          volume={content.videoMuted ? 0 : (content.videoVolume ?? 1)}
          playbackRate={content.videoPlaybackRate ?? 1}
          loop={content.videoLoop}
        />
      );
    }
    return <Img src={mediaUrl} style={styles.media} />;
  };

  // Wrap media with animation if specified
  const renderAnimatedMedia = () => {
    const media = renderMedia();
    if (content.mediaAnimation?.type && content.mediaAnimation.type !== 'none') {
      return (
        <MediaAnimationWrapper
          animationType={content.mediaAnimation.type}
          intensity={content.mediaAnimation.intensity}
        >
          {media}
        </MediaAnimationWrapper>
      );
    }
    return media;
  };

  // Render media container based on style
  const renderMediaContainer = () => {
    const animatedMedia = renderAnimatedMedia();

    if ((styles as { usePhoneFrame?: boolean }).usePhoneFrame) {
      return <PhoneFrame>{animatedMedia}</PhoneFrame>;
    }

    return (
      <div style={styles.container as React.CSSProperties}>
        {animatedMedia}
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      {/* Background gradient (hidden for fullscreen/background modes) */}
      {styles.showDecorations && (
        <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0a0a0a" />
      )}

      {/* Decorative orbs (hidden for fullscreen modes) */}
      {styles.showDecorations && (
        <>
          <GlowingOrb x={15} y={25} size={180} color={accentColor} delay={0} />
          <GlowingOrb x={85} y={75} size={150} color="#3b82f6" delay={5} />
        </>
      )}

      {/* Title overlay */}
      {content.title && !['fullscreen', 'background'].includes(mediaStyle) && (
        <div
          style={{
            position: 'absolute',
            top: 60,
            zIndex: 20,
            opacity: opacity * exitOpacity,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={48}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Main media container with entry/exit animations */}
      <div
        style={{
          transform: mediaStyle === 'fullscreen' || mediaStyle === 'background' ? 'none' : `scale(${scale})`,
          opacity: opacity * exitOpacity,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: ['fullscreen', 'background', 'split-left', 'split-right'].includes(mediaStyle) ? '100%' : 'auto',
          height: ['fullscreen', 'background', 'split-left', 'split-right'].includes(mediaStyle) ? '100%' : 'auto',
        }}
      >
        {renderMediaContainer()}
      </div>

      {/* Overlay text (for background mode or custom overlays) */}
      {content.overlayText && (
        <MediaTextOverlay
          text={content.overlayText}
          position={content.overlayPosition}
          style={content.overlayStyle}
          color={content.color || '#ffffff'}
        />
      )}

      {/* Title overlay for background mode */}
      {mediaStyle === 'background' && content.title && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={72}
            color="#ffffff"
            style="bounce"
          />
          {content.subtitle && (
            <div style={{ opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }) }}>
              <AnimatedText
                text={content.subtitle}
                fontSize={32}
                color="#a1a1aa"
                style="wave"
                fontWeight={400}
                delay={20}
              />
            </div>
          )}
        </div>
      )}

      {/* Subtitle below media (for non-fullscreen modes) */}
      {content.subtitle && !['fullscreen', 'background'].includes(mediaStyle) && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            zIndex: 20,
            opacity: opacity * exitOpacity,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={28}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={10}
          />
        </div>
      )}

      {/* Entry explosion effect */}
      {frame < 25 && styles.showDecorations && (
        <ExplosionEffect color={accentColor} particleCount={12} delay={3} />
      )}
    </AbsoluteFill>
  );
};

// Chart Scene - displays various chart types
const ChartScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accentColor = content.color || '#f97316';
  const chartType = content.chartType || 'bar';
  const chartData = content.chartData || content.items?.map(item => ({
    label: item.label,
    value: item.value || 0,
    color: item.color,
  })) || [];

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
        padding: 60,
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />

      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            opacity: titleOpacity,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={48}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      <div style={{ marginTop: content.title ? 60 : 0 }}>
        {chartType === 'bar' && (
          <BarChart data={chartData} maxValue={content.maxValue} delay={15} />
        )}
        {chartType === 'pie' && (
          <PieChart data={chartData} size={280} delay={15} />
        )}
        {chartType === 'progress' && (
          <div style={{ width: 600 }}>
            {chartData.map((item, i) => (
              <ProgressBar
                key={i}
                value={item.value}
                maxValue={content.maxValue || 100}
                label={item.label}
                color={item.color || accentColor}
                delay={15 + i * 10}
              />
            ))}
          </div>
        )}
      </div>

      {content.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            opacity: titleOpacity,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={24}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Comparison Scene - before/after or side-by-side comparison
const ComparisonScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();
  const accentColor = content.color || '#f97316';

  const revealProgress = spring({
    frame: frame - 20,
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const dividerPosition = interpolate(revealProgress, [0, 1], [0, 50]); // 0% to 50%

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2="#1a1a2e" color3={accentColor + '22'} />

      {content.title && (
        <div style={{ position: 'absolute', top: 60 }}>
          <AnimatedText
            text={content.title}
            fontSize={48}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Comparison boxes */}
      <div style={{ display: 'flex', gap: 60, marginTop: content.title ? 40 : 0 }}>
        {/* Before */}
        <div
          style={{
            width: 400,
            padding: 40,
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            borderRadius: 24,
            border: '2px solid rgba(239, 68, 68, 0.3)',
            transform: `translateX(${interpolate(revealProgress, [0, 1], [-100, 0])}px)`,
            opacity: revealProgress,
          }}
        >
          <div style={{ fontSize: 20, color: '#ef4444', fontWeight: 600, marginBottom: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {content.beforeLabel || 'BEFORE'}
          </div>
          <div style={{ fontSize: 48, color: '#ffffff', fontWeight: 800, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {content.beforeValue || '—'}
          </div>
        </div>

        {/* Divider with arrow */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          <div style={{ fontSize: 60, color: accentColor }}>→</div>
        </div>

        {/* After */}
        <div
          style={{
            width: 400,
            padding: 40,
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            borderRadius: 24,
            border: '2px solid rgba(34, 197, 94, 0.3)',
            transform: `translateX(${interpolate(revealProgress, [0, 1], [100, 0])}px)`,
            opacity: revealProgress,
          }}
        >
          <div style={{ fontSize: 20, color: '#22c55e', fontWeight: 600, marginBottom: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {content.afterLabel || 'AFTER'}
          </div>
          <div style={{ fontSize: 48, color: '#ffffff', fontWeight: 800, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {content.afterValue || '—'}
          </div>
        </div>
      </div>

      {content.subtitle && (
        <div style={{ position: 'absolute', bottom: 60 }}>
          <AnimatedText
            text={content.subtitle}
            fontSize={24}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={40}
          />
        </div>
      )}

      {/* Success particles on reveal */}
      {frame > 40 && frame < 70 && (
        <ExplosionEffect color="#22c55e" particleCount={10} delay={40} />
      )}
    </AbsoluteFill>
  );
};

// Countdown Scene - animated countdown
const CountdownScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const accentColor = content.color || '#f97316';
  const countFrom = content.countFrom ?? 3;
  const countTo = content.countTo ?? 0;

  // Calculate current count based on frame
  const totalCount = Math.abs(countFrom - countTo) + 1;
  const framesPerCount = Math.floor(durationInFrames / totalCount);
  const currentCountIndex = Math.min(Math.floor(frame / framesPerCount), totalCount - 1);
  const currentNumber = countFrom > countTo
    ? countFrom - currentCountIndex
    : countFrom + currentCountIndex;

  // Animation within each count
  const frameInCount = frame % framesPerCount;
  const countProgress = spring({
    frame: frameInCount,
    fps,
    config: { damping: 8, stiffness: 200 },
  });

  const scale = interpolate(countProgress, [0, 0.5, 1], [0.5, 1.2, 1]);
  const opacity = interpolate(frameInCount, [0, 5, framesPerCount - 5, framesPerCount], [0, 1, 1, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '33'} color3="#0a0a0a" />

      <div
        style={{
          fontSize: 300,
          fontWeight: 900,
          color: accentColor,
          fontFamily: 'Inter, system-ui, sans-serif',
          transform: `scale(${scale})`,
          opacity,
          textShadow: `0 0 60px ${accentColor}, 0 0 120px ${accentColor}66`,
        }}
      >
        {currentNumber}
      </div>

      {content.title && (
        <div style={{ position: 'absolute', bottom: 120 }}>
          <AnimatedText
            text={content.title}
            fontSize={36}
            color="#ffffff"
            style="wave"
          />
        </div>
      )}

      <ExplosionEffect color={accentColor} particleCount={6} delay={frameInCount < 5 ? 0 : 999} />
    </AbsoluteFill>
  );
};

// Animated shape component - renders any shape with animation
const AnimatedShape: React.FC<{
  shape: ShapeConfig;
  index: number;
}> = ({ shape, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const delay = shape.delay ?? index * 8;
  const animation = shape.animation || 'pop';

  // Base entry animation
  const entryProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Calculate transform based on animation type
  let scale = shape.scale ?? 1;
  let rotation = shape.rotation ?? 0;
  let opacity = 1;
  let translateY = 0;

  switch (animation) {
    case 'pop':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      rotation += interpolate(entryProgress, [0, 1], [-15, 0]);
      opacity = interpolate(entryProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
      break;
    case 'spin':
      scale *= interpolate(entryProgress, [0, 1], [0.5, 1]);
      rotation += interpolate(frame - delay, [0, 60], [0, 360], { extrapolateRight: 'extend' });
      opacity = entryProgress;
      break;
    case 'bounce':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      translateY = Math.sin((frame - delay) * 0.15) * 10 * entryProgress;
      opacity = entryProgress;
      break;
    case 'float':
      scale *= interpolate(entryProgress, [0, 1], [0.8, 1]);
      translateY = Math.sin((frame - delay) * 0.08) * 15;
      opacity = interpolate(entryProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
      break;
    case 'pulse':
      const pulseScale = 1 + Math.sin((frame - delay) * 0.1) * 0.1;
      scale *= interpolate(entryProgress, [0, 1], [0, pulseScale]);
      opacity = entryProgress;
      break;
    case 'draw':
      // Draw animation uses stroke-dasharray (handled in shape rendering)
      scale *= interpolate(entryProgress, [0, 1], [0.9, 1]);
      opacity = entryProgress;
      break;
    case 'none':
    default:
      opacity = interpolate(entryProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
      break;
  }

  // Position
  const x = shape.x ?? 50;
  const y = shape.y ?? 50;

  // Render the appropriate shape
  const renderShape = () => {
    const commonProps = {
      fill: shape.fill || '#f97316',
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
    };

    switch (shape.type) {
      case 'circle':
        return <Circle radius={shape.radius || 50} {...commonProps} />;
      case 'rect':
        return (
          <Rect
            width={shape.width || 100}
            height={shape.height || 100}
            cornerRadius={shape.cornerRadius}
            {...commonProps}
          />
        );
      case 'triangle':
        return (
          <Triangle
            length={shape.length || 100}
            direction={shape.direction || 'up'}
            cornerRadius={shape.cornerRadius}
            {...commonProps}
          />
        );
      case 'star':
        return (
          <Star
            points={shape.points || 5}
            innerRadius={shape.innerRadius || 30}
            outerRadius={shape.outerRadius || 60}
            {...commonProps}
          />
        );
      case 'polygon':
        return (
          <Polygon
            points={shape.points || 6}
            radius={shape.radius || 50}
            {...commonProps}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            rx={shape.rx || 60}
            ry={shape.ry || 40}
            {...commonProps}
          />
        );
      default:
        return <Circle radius={50} {...commonProps} />;
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg) translateY(${translateY}px)`,
        opacity,
        filter: shape.fill ? `drop-shadow(0 0 20px ${shape.fill}40)` : undefined,
      }}
    >
      {renderShape()}
    </div>
  );
};

// Shapes Scene - displays animated SVG shapes
const ShapesScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const shapes = content.shapes || [];
  const layout = content.shapesLayout || 'custom';
  const accentColor = content.color || '#f97316';

  // Generate default scattered positions if not specified
  const processedShapes = useMemo(() => {
    if (layout === 'custom') {
      return shapes;
    }

    return shapes.map((shape, index) => {
      let x = shape.x;
      let y = shape.y;

      if (x === undefined || y === undefined) {
        switch (layout) {
          case 'scattered':
            // Random-ish but deterministic positions
            x = 20 + (index * 37) % 60;
            y = 20 + (index * 53) % 60;
            break;
          case 'grid': {
            const cols = Math.ceil(Math.sqrt(shapes.length));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const spacing = 80 / cols;
            x = 10 + spacing / 2 + col * spacing;
            y = 20 + spacing / 2 + row * spacing;
            break;
          }
          case 'circle': {
            const angle = (index / shapes.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 30;
            x = 50 + Math.cos(angle) * radius;
            y = 50 + Math.sin(angle) * radius;
            break;
          }
        }
      }

      return { ...shape, x, y };
    });
  }, [shapes, layout]);

  // Default shapes if none provided
  const displayShapes = processedShapes.length > 0 ? processedShapes : [
    { type: 'circle' as const, fill: accentColor, radius: 60, x: 30, y: 40, animation: 'pop' as const },
    { type: 'triangle' as const, fill: '#3b82f6', length: 80, x: 70, y: 35, animation: 'spin' as const, delay: 10 },
    { type: 'star' as const, fill: '#22c55e', points: 5, innerRadius: 25, outerRadius: 50, x: 50, y: 65, animation: 'bounce' as const, delay: 20 },
  ];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />

      {/* Title */}
      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={52}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Shapes */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {displayShapes.map((shape, index) => (
          <AnimatedShape key={index} shape={shape} index={index} />
        ))}
      </div>

      {/* Subtitle */}
      {content.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={28}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={30}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Single animated emoji component with animation
const AnimatedEmojiItem: React.FC<{
  emojiConfig: EmojiConfig;
  index: number;
}> = ({ emojiConfig, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [useAnimatedEmoji, setUseAnimatedEmoji] = useState(true);

  const delay = emojiConfig.delay ?? index * 10;
  const animation = emojiConfig.animation || 'pop';
  const baseScale = emojiConfig.scale ?? 0.15; // Default to smaller size

  // Entry animation
  const entryProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  // Calculate transform based on animation type
  let scale = baseScale;
  let rotation = 0;
  let opacity = 1;
  let translateY = 0;
  let translateX = 0;

  switch (animation) {
    case 'pop':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      rotation = interpolate(entryProgress, [0, 1], [-15, 0]);
      opacity = interpolate(entryProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
      break;
    case 'bounce':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      translateY = Math.sin((frame - delay) * 0.2) * 20 * entryProgress;
      opacity = entryProgress;
      break;
    case 'float':
      scale *= interpolate(entryProgress, [0, 1], [0.8, 1]);
      translateY = Math.sin((frame - delay) * 0.08) * 15;
      opacity = interpolate(entryProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
      break;
    case 'pulse':
      const pulseAmount = 1 + Math.sin((frame - delay) * 0.15) * 0.15;
      scale *= interpolate(entryProgress, [0, 1], [0, pulseAmount]);
      opacity = entryProgress;
      break;
    case 'spin':
      scale *= interpolate(entryProgress, [0, 1], [0.5, 1]);
      rotation = interpolate(frame - delay, [0, 90], [0, 360], { extrapolateRight: 'extend' });
      opacity = entryProgress;
      break;
    case 'shake':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      translateX = Math.sin((frame - delay) * 0.5) * 10 * entryProgress;
      rotation = Math.sin((frame - delay) * 0.3) * 5;
      opacity = entryProgress;
      break;
    case 'wave':
      scale *= interpolate(entryProgress, [0, 1], [0, 1]);
      rotation = Math.sin((frame - delay) * 0.15 + index) * 15;
      opacity = entryProgress;
      break;
    case 'none':
    default:
      scale *= interpolate(entryProgress, [0, 1], [0.8, 1]);
      opacity = interpolate(entryProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
      break;
  }

  // Position
  const x = emojiConfig.x ?? 50;
  const y = emojiConfig.y ?? 50;

  // Check if the emoji name is a valid AnimatedEmoji name or just a character
  const isEmojiCharacter = emojiConfig.emoji.length <= 4 && /\p{Emoji}/u.test(emojiConfig.emoji);

  // Render fallback emoji (static with CSS animation)
  const renderFallbackEmoji = () => (
    <div
      style={{
        fontSize: 120 * baseScale * (scale / baseScale),
        lineHeight: 1,
        filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.3))',
      }}
    >
      {isEmojiCharacter ? emojiConfig.emoji : '⭐'}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg) translate(${translateX}px, ${translateY}px)`,
        opacity,
        transformOrigin: 'center center',
      }}
    >
      {useAnimatedEmoji && !isEmojiCharacter ? (
        <AnimatedEmoji
          emoji={emojiConfig.emoji as any}
          scale={1}
        />
      ) : (
        renderFallbackEmoji()
      )}
    </div>
  );
};

// Emoji Scene - displays animated emojis
const EmojiScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const emojis = content.emojis || [];
  const layout = content.emojiLayout || 'custom';
  const accentColor = content.color || '#f97316';

  // Process emoji positions based on layout
  const processedEmojis = useMemo(() => {
    if (layout === 'custom') {
      return emojis;
    }

    return emojis.map((emoji, index) => {
      let x = emoji.x;
      let y = emoji.y;

      if (x === undefined || y === undefined) {
        switch (layout) {
          case 'scattered':
            x = 15 + (index * 41) % 70;
            y = 20 + (index * 37) % 60;
            break;
          case 'grid': {
            const cols = Math.ceil(Math.sqrt(emojis.length));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const spacing = 70 / cols;
            x = 15 + spacing / 2 + col * spacing;
            y = 25 + spacing / 2 + row * spacing;
            break;
          }
          case 'circle': {
            const angle = (index / emojis.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 25;
            x = 50 + Math.cos(angle) * radius;
            y = 50 + Math.sin(angle) * radius;
            break;
          }
          case 'row':
            const spacing = 70 / emojis.length;
            x = 15 + spacing / 2 + index * spacing;
            y = 50;
            break;
        }
      }

      return { ...emoji, x, y };
    });
  }, [emojis, layout]);

  // Default emojis if none provided
  const displayEmojis = processedEmojis.length > 0 ? processedEmojis : [
    { emoji: '🔥', x: 30, y: 40, animation: 'bounce' as const, scale: 0.2 },
    { emoji: '⭐', x: 50, y: 50, animation: 'spin' as const, scale: 0.25, delay: 10 },
    { emoji: '🚀', x: 70, y: 40, animation: 'float' as const, scale: 0.2, delay: 20 },
  ];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || 'transparent',
        overflow: 'hidden',
      }}
    >
      <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />

      {/* Title */}
      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={52}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Emojis */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {displayEmojis.map((emoji, index) => (
          <AnimatedEmojiItem key={index} emojiConfig={emoji} index={index} />
        ))}
      </div>

      {/* Subtitle */}
      {content.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={28}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={30}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Animated GIF item with entrance animations
const AnimatedGifItem: React.FC<{ gifConfig: GifConfig; index: number }> = ({ gifConfig, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const delay = gifConfig.delay || index * 5;

  const {
    src,
    x = 50,
    y = 50,
    width = 300,
    height,
    scale: baseScale = 1,
    fit = 'contain',
    playbackRate = 1,
    animation = 'none',
    loop = true,
  } = gifConfig;

  // Entrance animation
  const entranceProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.8 },
  });

  // Continuous animations
  let animationStyle = {};
  const animFrame = frame - delay;

  switch (animation) {
    case 'pop': {
      const popScale = interpolate(
        Math.sin(animFrame * 0.1) * 0.5 + 0.5,
        [0, 1],
        [0.95, 1.05]
      );
      animationStyle = { transform: `scale(${popScale})` };
      break;
    }
    case 'bounce': {
      const bounceY = Math.sin(animFrame * 0.15) * 15;
      animationStyle = { transform: `translateY(${bounceY}px)` };
      break;
    }
    case 'float': {
      const floatY = Math.sin(animFrame * 0.08) * 20;
      const floatX = Math.cos(animFrame * 0.05) * 10;
      animationStyle = { transform: `translate(${floatX}px, ${floatY}px)` };
      break;
    }
    case 'pulse': {
      const pulseScale = 1 + Math.sin(animFrame * 0.12) * 0.08;
      animationStyle = { transform: `scale(${pulseScale})` };
      break;
    }
    case 'spin': {
      const rotation = animFrame * 3;
      animationStyle = { transform: `rotate(${rotation}deg)` };
      break;
    }
    case 'shake': {
      const shakeX = Math.sin(animFrame * 0.5) * 5;
      const shakeRotation = Math.sin(animFrame * 0.4) * 3;
      animationStyle = { transform: `translateX(${shakeX}px) rotate(${shakeRotation}deg)` };
      break;
    }
  }

  // Calculate which frame of the GIF to show based on playback rate
  const gifFrame = Math.floor(frame * playbackRate);

  if (entranceProgress <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${baseScale * entranceProgress})`,
        opacity: entranceProgress,
        ...animationStyle,
      }}
    >
      <Gif
        src={src}
        width={width}
        height={height}
        fit={fit}
        playbackRate={playbackRate}
        loopBehavior={loop ? 'loop' : 'pause-after-finish'}
        style={{
          borderRadius: 8,
        }}
      />
    </div>
  );
};

// GIF Scene - displays animated GIFs
const GifScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const gifs = content.gifs || [];
  const layout = content.gifLayout || 'custom';
  const accentColor = content.color || '#f97316';
  const backgroundGif = content.gifBackground;

  // Process gif positions based on layout
  const processedGifs = useMemo(() => {
    if (layout === 'custom' || layout === 'fullscreen') {
      return gifs;
    }

    return gifs.map((gif, index) => {
      let x = gif.x;
      let y = gif.y;

      if (x === undefined || y === undefined) {
        switch (layout) {
          case 'scattered':
            x = 15 + (index * 41) % 70;
            y = 20 + (index * 37) % 60;
            break;
          case 'grid': {
            const cols = Math.ceil(Math.sqrt(gifs.length));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const spacing = 70 / cols;
            x = 15 + spacing / 2 + col * spacing;
            y = 25 + spacing / 2 + row * spacing;
            break;
          }
          case 'circle': {
            const angle = (index / gifs.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 25;
            x = 50 + Math.cos(angle) * radius;
            y = 50 + Math.sin(angle) * radius;
            break;
          }
          case 'row':
            const spacing = 70 / gifs.length;
            x = 15 + spacing / 2 + index * spacing;
            y = 50;
            break;
        }
      }

      return { ...gif, x, y };
    });
  }, [gifs, layout]);

  // Default demo GIF if none provided
  const displayGifs = processedGifs.length > 0 ? processedGifs : [];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* Background gradient if no background GIF */}
      {!backgroundGif && (
        <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />
      )}

      {/* Background GIF */}
      {backgroundGif && (
        <AbsoluteFill>
          <Gif
            src={backgroundGif}
            fit="cover"
            style={{
              width: '100%',
              height: '100%',
              opacity: 0.4,
            }}
          />
          {/* Dark overlay for readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
            }}
          />
        </AbsoluteFill>
      )}

      {/* Title */}
      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={52}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Fullscreen layout - single GIF fills the screen */}
      {layout === 'fullscreen' && displayGifs.length > 0 && (
        <AbsoluteFill>
          <Gif
            src={displayGifs[0].src}
            fit={displayGifs[0].fit || 'cover'}
            playbackRate={displayGifs[0].playbackRate || 1}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
        </AbsoluteFill>
      )}

      {/* Multiple GIFs with layout */}
      {layout !== 'fullscreen' && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {displayGifs.map((gif, index) => (
            <AnimatedGifItem key={index} gifConfig={gif} index={index} />
          ))}
        </div>
      )}

      {/* Subtitle */}
      {content.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={28}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={30}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Lottie animation item
const LottieItem: React.FC<{ lottieConfig: LottieConfig; index: number }> = ({ lottieConfig, index }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const delay = lottieConfig.delay || index * 5;

  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender('Loading Lottie animation'));

  const {
    src,
    x = 50,
    y = 50,
    width = 300,
    height = 300,
    scale: baseScale = 1,
    loop = true,
    playbackRate = 1,
    direction = 'forward',
  } = lottieConfig;

  // Fetch Lottie JSON
  useEffect(() => {
    fetch(src)
      .then((res) => res.json())
      .then((data) => {
        setAnimationData(data);
        continueRender(handle);
      })
      .catch((err) => {
        console.error('Failed to load Lottie:', err);
        continueRender(handle);
      });
  }, [src, handle]);

  // Entrance animation
  const entranceProgress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 150, mass: 0.8 },
  });

  if (!animationData || entranceProgress <= 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${baseScale * entranceProgress})`,
        opacity: entranceProgress,
        width,
        height,
      }}
    >
      <Lottie
        animationData={animationData}
        loop={loop}
        playbackRate={playbackRate}
        direction={direction}
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

// Lottie Scene - displays Lottie/After Effects animations
const LottieScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const lotties = content.lotties || [];
  const layout = content.lottieLayout || 'custom';
  const accentColor = content.color || '#f97316';
  const backgroundLottie = content.lottieBackground;

  const [bgAnimationData, setBgAnimationData] = useState<LottieAnimationData | null>(null);

  // Load background Lottie if specified
  useEffect(() => {
    if (backgroundLottie) {
      fetch(backgroundLottie)
        .then((res) => res.json())
        .then((data) => setBgAnimationData(data))
        .catch((err) => console.error('Failed to load background Lottie:', err));
    }
  }, [backgroundLottie]);

  // Process lottie positions based on layout
  const processedLotties = useMemo(() => {
    if (layout === 'custom' || layout === 'fullscreen') {
      return lotties;
    }

    return lotties.map((lottie, index) => {
      let x = lottie.x;
      let y = lottie.y;

      if (x === undefined || y === undefined) {
        switch (layout) {
          case 'scattered':
            x = 15 + (index * 41) % 70;
            y = 20 + (index * 37) % 60;
            break;
          case 'grid': {
            const cols = Math.ceil(Math.sqrt(lotties.length));
            const col = index % cols;
            const row = Math.floor(index / cols);
            const spacing = 70 / cols;
            x = 15 + spacing / 2 + col * spacing;
            y = 25 + spacing / 2 + row * spacing;
            break;
          }
          case 'circle': {
            const angle = (index / lotties.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 25;
            x = 50 + Math.cos(angle) * radius;
            y = 50 + Math.sin(angle) * radius;
            break;
          }
          case 'row':
            const spacing = 70 / lotties.length;
            x = 15 + spacing / 2 + index * spacing;
            y = 50;
            break;
        }
      }

      return { ...lottie, x, y };
    });
  }, [lotties, layout]);

  const displayLotties = processedLotties.length > 0 ? processedLotties : [];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: content.backgroundColor || '#0a0a0a',
        overflow: 'hidden',
      }}
    >
      {/* Background gradient if no background Lottie */}
      {!bgAnimationData && (
        <GradientBackground color1="#0a0a0a" color2={accentColor + '22'} color3="#0f0f23" />
      )}

      {/* Background Lottie */}
      {bgAnimationData && (
        <AbsoluteFill style={{ opacity: 0.4 }}>
          <Lottie
            animationData={bgAnimationData}
            loop
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
            }}
          />
        </AbsoluteFill>
      )}

      {/* Title */}
      {content.title && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.title}
            fontSize={52}
            color="#ffffff"
            style="bounce"
          />
        </div>
      )}

      {/* Fullscreen layout - single Lottie fills the screen */}
      {layout === 'fullscreen' && displayLotties.length > 0 && (
        <LottieItem lottieConfig={{ ...displayLotties[0], x: 50, y: 50, width: 800, height: 800 }} index={0} />
      )}

      {/* Multiple Lotties with layout */}
      {layout !== 'fullscreen' && (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {displayLotties.map((lottie, index) => (
            <LottieItem key={index} lottieConfig={lottie} index={index} />
          ))}
        </div>
      )}

      {/* Subtitle */}
      {content.subtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            zIndex: 20,
          }}
        >
          <AnimatedText
            text={content.subtitle}
            fontSize={28}
            color="#a1a1aa"
            style="wave"
            fontWeight={400}
            delay={30}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Scene renderer with camera and transition support
const SceneRenderer: React.FC<{ scene: Scene }> = ({ scene }) => {
  const renderScene = () => {
    switch (scene.type) {
      case 'title':
        return <TitleScene content={scene.content} />;
      case 'steps':
      case 'features':
        return <StepsScene content={scene.content} />;
      case 'stats':
        return <StatsScene content={scene.content} />;
      case 'text':
        return <TextScene content={scene.content} />;
      case 'transition':
        return <TransitionScene content={scene.content} />;
      case 'media':
        return <MediaScene content={scene.content} />;
      case 'chart':
        return <ChartScene content={scene.content} />;
      case 'comparison':
        return <ComparisonScene content={scene.content} />;
      case 'countdown':
        return <CountdownScene content={scene.content} />;
      case 'shapes':
        return <ShapesScene content={scene.content} />;
      case 'emoji':
        return <EmojiScene content={scene.content} />;
      case 'gif':
        return <GifScene content={scene.content} />;
      case 'lottie':
        return <LottieScene content={scene.content} />;
      case '3d':
        return (
          <Scene3D
            config={{
              style: scene.content.scene3d?.style || '3d-shapes',
              text: scene.content.title || scene.content.scene3d?.text,
              color: scene.content.color,
              backgroundColor: scene.content.backgroundColor,
              secondaryColor: scene.content.scene3d?.secondaryColor,
              cameraAnimation: scene.content.scene3d?.cameraAnimation,
              intensity: scene.content.scene3d?.intensity,
              shapes: scene.content.scene3d?.shapes,
            }}
          />
        );
      default:
        return <TitleScene content={scene.content} />;
    }
  };

  let content = renderScene();

  // Wrap with camera movement if specified
  if (scene.content.camera?.type) {
    content = (
      <CameraWrapper type={scene.content.camera.type} intensity={scene.content.camera.intensity}>
        {content}
      </CameraWrapper>
    );
  }

  // Wrap with transition if specified
  if (scene.transition?.type && scene.transition.type !== 'none') {
    content = (
      <TransitionWrapper
        transitionType={scene.transition.type}
        transitionDuration={scene.transition.duration || 15}
      >
        {content}
      </TransitionWrapper>
    );
  }

  return content;
};

// Main Dynamic Animation Component
export const DynamicAnimation: React.FC<DynamicAnimationProps> = ({
  scenes,
  backgroundColor = '#0a0a0a',
}) => {
  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {scenes.map((scene, index) => {
        const from = frameOffset;
        frameOffset += scene.duration;

        return (
          <Sequence key={scene.id || index} from={from} durationInFrames={scene.duration}>
            <SceneRenderer scene={scene} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
