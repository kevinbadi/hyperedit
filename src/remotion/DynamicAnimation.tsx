import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Easing } from 'remotion';

export interface Scene {
  id: string;
  type: 'title' | 'steps' | 'features' | 'stats' | 'text' | 'transition';
  duration: number;
  content: {
    title?: string;
    subtitle?: string;
    items?: Array<{
      icon?: string;
      label: string;
      description?: string;
    }>;
    stats?: Array<{
      value: string;
      label: string;
    }>;
    color?: string;
    backgroundColor?: string;
  };
}

interface DynamicAnimationProps {
  scenes: Scene[];
  title?: string;
  backgroundColor?: string;
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
  const { fps } = useVideoConfig();
  const characters = text.split('');

  return (
    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap' }}>
      {characters.map((char, i) => {
        const charDelay = delay + i * 2;

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

  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleY = interpolate(frame, [20, 40], [20, 0], { extrapolateRight: 'clamp' });

  // Exit animation
  const exitProgress = interpolate(frame, [durationInFrames - 20, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
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
              delay={25}
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
          const delay = 20 + index * 15;

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

// Enhanced Stats Scene with counting animation
const StatsScene: React.FC<{ content: Scene['content'] }> = ({ content }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const stats = content.stats || [];
  const accentColor = content.color || '#f97316';

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

      <div style={{ display: 'flex', gap: 140, justifyContent: 'center' }}>
        {stats.map((stat, index) => {
          const delay = 15 + index * 12;

          const entrySpring = spring({
            frame: frame - delay,
            fps,
            config: { damping: 8, stiffness: 100, mass: 1 },
          });

          const scale = interpolate(entrySpring, [0, 1], [0, 1]);
          const rotation = interpolate(entrySpring, [0, 1], [180, 0]);

          // Glow pulse
          const glowPulse = Math.sin((frame - delay) * 0.08) * 10 + 30;

          return (
            <div
              key={index}
              style={{
                textAlign: 'center',
                transform: `scale(${scale}) rotateY(${rotation}deg)`,
                perspective: 1000,
              }}
            >
              <div
                style={{
                  fontSize: 108,
                  fontWeight: 900,
                  color: accentColor,
                  fontFamily: 'Inter, system-ui, sans-serif',
                  textShadow: `0 0 ${glowPulse}px ${accentColor}, 0 0 ${glowPulse * 2}px ${accentColor}66`,
                  letterSpacing: '-0.02em',
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: '#a1a1aa',
                  marginTop: 16,
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
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

  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
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

// Scene renderer
const SceneRenderer: React.FC<{ scene: Scene }> = ({ scene }) => {
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
    default:
      return <TitleScene content={scene.content} />;
  }
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
