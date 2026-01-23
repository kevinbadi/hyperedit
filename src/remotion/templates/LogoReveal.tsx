import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

export interface LogoRevealProps {
  logoUrl?: string;
  logoText?: string;
  tagline?: string;
  style?: 'fade' | 'scale' | 'slide' | 'glitch' | 'particles';
  color?: string;
  backgroundColor?: string;
}

export const LogoReveal: React.FC<LogoRevealProps> = ({
  logoUrl,
  logoText = 'LOGO',
  tagline = '',
  style = 'scale',
  color = '#ffffff',
  backgroundColor = 'transparent',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade style
  if (style === 'fade') {
    const opacity = interpolate(frame, [0, 30, durationInFrames - 30, durationInFrames], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

    return (
      <AbsoluteFill style={{ backgroundColor, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ opacity, textAlign: 'center' }}>
          {logoUrl ? (
            <Img src={logoUrl} style={{ maxWidth: 300, maxHeight: 150 }} />
          ) : (
            <div style={{ fontSize: 80, fontWeight: 'bold', color, fontFamily: 'Inter, system-ui' }}>
              {logoText}
            </div>
          )}
          {tagline && (
            <div style={{ color: '#a1a1aa', fontSize: 24, marginTop: 20, opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }) }}>
              {tagline}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Scale style
  if (style === 'scale') {
    const scale = spring({
      frame,
      fps,
      config: { damping: 12, stiffness: 100, mass: 0.8 },
    });

    const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });
    const taglineY = interpolate(frame, [30, 50], [20, 0], { extrapolateRight: 'clamp' });

    return (
      <AbsoluteFill style={{ backgroundColor, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ transform: `scale(${scale})` }}>
            {logoUrl ? (
              <Img src={logoUrl} style={{ maxWidth: 300, maxHeight: 150 }} />
            ) : (
              <div style={{ fontSize: 80, fontWeight: 'bold', color, fontFamily: 'Inter, system-ui' }}>
                {logoText}
              </div>
            )}
          </div>
          {tagline && (
            <div style={{
              color: '#a1a1aa',
              fontSize: 24,
              marginTop: 20,
              opacity: taglineOpacity,
              transform: `translateY(${taglineY}px)`,
            }}>
              {tagline}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Slide style
  if (style === 'slide') {
    const x = interpolate(frame, [0, 30], [-200, 0], { extrapolateRight: 'clamp' });
    const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

    // Line that sweeps across
    const lineX = interpolate(frame, [0, 40], [-100, 110], { extrapolateRight: 'clamp' });

    return (
      <AbsoluteFill style={{ backgroundColor, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ transform: `translateX(${x}px)`, opacity }}>
            {logoUrl ? (
              <Img src={logoUrl} style={{ maxWidth: 300, maxHeight: 150 }} />
            ) : (
              <div style={{ fontSize: 80, fontWeight: 'bold', color, fontFamily: 'Inter, system-ui' }}>
                {logoText}
              </div>
            )}
          </div>
          {/* Sweep line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${lineX}%`,
              width: 4,
              height: '100%',
              backgroundColor: color,
              boxShadow: `0 0 20px ${color}`,
              opacity: frame < 40 ? 1 : 0,
            }}
          />
          {tagline && (
            <div style={{
              color: '#a1a1aa',
              fontSize: 24,
              marginTop: 20,
              opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' }),
            }}>
              {tagline}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Glitch style
  if (style === 'glitch') {
    const showGlitch = frame % 20 < 4;
    const glitchOffset = Math.sin(frame * 0.8) * 5;
    const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

    return (
      <AbsoluteFill style={{ backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ position: 'relative', textAlign: 'center', opacity }}>
          {/* Glitch layers */}
          {showGlitch && (
            <>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                fontSize: 80,
                fontWeight: 'bold',
                color: '#ff0000',
                fontFamily: 'Inter, system-ui',
                transform: `translate(${glitchOffset}px, ${-glitchOffset}px)`,
                opacity: 0.7,
              }}>
                {logoText}
              </div>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                fontSize: 80,
                fontWeight: 'bold',
                color: '#00ffff',
                fontFamily: 'Inter, system-ui',
                transform: `translate(${-glitchOffset}px, ${glitchOffset}px)`,
                opacity: 0.7,
              }}>
                {logoText}
              </div>
            </>
          )}
          <div style={{ fontSize: 80, fontWeight: 'bold', color, fontFamily: 'Inter, system-ui', position: 'relative' }}>
            {logoText}
          </div>
          {tagline && (
            <div style={{ color: '#a1a1aa', fontSize: 24, marginTop: 20 }}>
              {tagline}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Particles style
  if (style === 'particles') {
    const scale = spring({
      frame: Math.max(0, frame - 20),
      fps,
      config: { damping: 15, stiffness: 100 },
    });

    // Generate particles
    const particles = Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 20) * Math.PI * 2;
      const distance = interpolate(frame, [0, 30], [0, 150 + (i % 3) * 50], { extrapolateRight: 'clamp' });
      const particleOpacity = interpolate(frame, [0, 15, 40, 60], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
            transform: `translate(${x}px, ${y}px)`,
            opacity: particleOpacity,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      );
    });

    return (
      <AbsoluteFill style={{ backgroundColor, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ position: 'relative', textAlign: 'center' }}>
          {/* Particles container */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            {particles}
          </div>
          {/* Logo */}
          <div style={{ transform: `scale(${scale})`, position: 'relative' }}>
            {logoUrl ? (
              <Img src={logoUrl} style={{ maxWidth: 300, maxHeight: 150 }} />
            ) : (
              <div style={{ fontSize: 80, fontWeight: 'bold', color, fontFamily: 'Inter, system-ui' }}>
                {logoText}
              </div>
            )}
          </div>
          {tagline && (
            <div style={{
              color: '#a1a1aa',
              fontSize: 24,
              marginTop: 20,
              opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' }),
            }}>
              {tagline}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Default
  return (
    <AbsoluteFill style={{ backgroundColor, justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
      <div style={{ fontSize: 80, fontWeight: 'bold', color }}>{logoText}</div>
    </AbsoluteFill>
  );
};
