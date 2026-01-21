import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface LowerThirdProps {
  name: string;
  title?: string;
  style?: 'modern' | 'minimal' | 'bold' | 'gradient' | 'news';
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  name,
  title = '',
  style = 'modern',
  primaryColor = '#f97316', // orange-500
  secondaryColor = '#ea580c', // orange-600
  textColor = '#ffffff',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animation progress
  const slideIn = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const slideOut = spring({
    frame: Math.max(0, frame - (durationInFrames - 20)),
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const progress = frame < durationInFrames - 20 ? slideIn : 1 - slideOut;
  const translateX = interpolate(progress, [0, 1], [-400, 0]);
  const opacity = interpolate(progress, [0, 0.3, 0.7, 1], [0, 1, 1, 1]);

  // Modern style - clean with accent bar
  if (style === 'modern') {
    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: 40,
          transform: `translateX(${translateX}px)`,
          opacity,
          display: 'flex',
          alignItems: 'stretch',
        }}>
          {/* Accent bar */}
          <div style={{
            width: 4,
            backgroundColor: primaryColor,
            marginRight: 16,
          }} />
          {/* Content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              color: textColor,
              fontSize: 32,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textShadow: '1px 1px 4px rgba(0,0,0,0.5)',
            }}>
              {name}
            </div>
            {title && (
              <div style={{
                color: primaryColor,
                fontSize: 18,
                fontWeight: '500',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {title}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Minimal style - just text with underline
  if (style === 'minimal') {
    const lineWidth = interpolate(progress, [0.3, 1], [0, 100], { extrapolateLeft: 'clamp' });

    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: 40,
          opacity,
        }}>
          <div style={{
            color: textColor,
            fontSize: 28,
            fontWeight: '600',
            fontFamily: 'Inter, system-ui, sans-serif',
            textShadow: '1px 1px 4px rgba(0,0,0,0.5)',
            transform: `translateX(${translateX}px)`,
          }}>
            {name}
            {title && <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '400' }}> — {title}</span>}
          </div>
          <div style={{
            height: 2,
            backgroundColor: primaryColor,
            width: `${lineWidth}%`,
            marginTop: 8,
          }} />
        </div>
      </AbsoluteFill>
    );
  }

  // Bold style - large with background
  if (style === 'bold') {
    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          right: 0,
          transform: `translateY(${interpolate(progress, [0, 1], [100, 0])}px)`,
          opacity,
        }}>
          <div style={{
            backgroundColor: primaryColor,
            padding: '20px 40px',
            display: 'inline-block',
          }}>
            <div style={{
              color: textColor,
              fontSize: 42,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}>
              {name}
            </div>
          </div>
          {title && (
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.8)',
              padding: '12px 40px',
              display: 'inline-block',
              marginLeft: 0,
            }}>
              <div style={{
                color: textColor,
                fontSize: 20,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {title}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Gradient style - modern gradient background
  if (style === 'gradient') {
    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          bottom: 80,
          left: 40,
          transform: `translateX(${translateX}px)`,
          opacity,
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            padding: '16px 32px',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              color: textColor,
              fontSize: 28,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}>
              {name}
            </div>
            {title && (
              <div style={{
                color: 'rgba(255,255,255,0.9)',
                fontSize: 16,
                fontFamily: 'Inter, system-ui, sans-serif',
                marginTop: 4,
              }}>
                {title}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // News style - professional news broadcast look
  if (style === 'news') {
    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          bottom: 60,
          left: 0,
          transform: `translateX(${translateX}px)`,
          opacity,
          display: 'flex',
        }}>
          {/* Red accent */}
          <div style={{
            width: 8,
            backgroundColor: '#dc2626',
          }} />
          {/* Name box */}
          <div style={{
            backgroundColor: primaryColor,
            padding: '14px 24px',
          }}>
            <div style={{
              color: textColor,
              fontSize: 26,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textTransform: 'uppercase',
            }}>
              {name}
            </div>
          </div>
          {/* Title box */}
          {title && (
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.85)',
              padding: '14px 24px',
            }}>
              <div style={{
                color: textColor,
                fontSize: 20,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}>
                {title}
              </div>
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
