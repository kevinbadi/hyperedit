import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface CallToActionProps {
  type: 'subscribe' | 'like' | 'follow' | 'share' | 'custom';
  customText?: string;
  style?: 'pill' | 'box' | 'floating' | 'pulse';
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
}

const icons = {
  subscribe: '🔔',
  like: '👍',
  follow: '➕',
  share: '🔗',
  custom: '✨',
};

const labels = {
  subscribe: 'Subscribe',
  like: 'Like',
  follow: 'Follow',
  share: 'Share',
  custom: '',
};

export const CallToAction: React.FC<CallToActionProps> = ({
  type,
  customText,
  style = 'pill',
  primaryColor = '#ef4444', // red-500
  position = 'bottom-right',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const text = customText || labels[type];
  const icon = icons[type];

  // Position mapping
  const positionStyles: Record<string, React.CSSProperties> = {
    'bottom-right': { bottom: 40, right: 40 },
    'bottom-left': { bottom: 40, left: 40 },
    'top-right': { top: 40, right: 40 },
    'top-left': { top: 40, left: 40 },
    'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  };

  // Entrance animation
  const scaleIn = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.8 },
  });

  // Exit animation
  const scaleOut = frame > durationInFrames - 15
    ? interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
    : 1;

  const scale = scaleIn * scaleOut;

  // Pill style - rounded button
  if (style === 'pill') {
    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          transform: `scale(${scale})`,
        }}>
          <div style={{
            backgroundColor: primaryColor,
            padding: '12px 24px',
            borderRadius: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span style={{
              color: 'white',
              fontSize: 20,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              {text}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Box style - square with icon on top
  if (style === 'box') {
    const bounce = Math.sin(frame * 0.15) * 3;

    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          transform: `scale(${scale}) translateY(${bounce}px)`,
        }}>
          <div style={{
            backgroundColor: primaryColor,
            padding: 20,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            minWidth: 100,
          }}>
            <span style={{ fontSize: 36 }}>{icon}</span>
            <span style={{
              color: 'white',
              fontSize: 14,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              {text}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Floating style - icon with glow
  if (style === 'floating') {
    const float = Math.sin(frame * 0.1) * 8;
    const glow = interpolate(Math.sin(frame * 0.2), [-1, 1], [0.5, 1]);

    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          transform: `scale(${scale}) translateY(${float}px)`,
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              fontSize: 56,
              filter: `drop-shadow(0 0 ${20 * glow}px ${primaryColor})`,
            }}>
              {icon}
            </div>
            <span style={{
              color: 'white',
              fontSize: 16,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textShadow: '0 2px 8px rgba(0,0,0,0.5)',
              textTransform: 'uppercase',
            }}>
              {text}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Pulse style - pulsating button
  if (style === 'pulse') {
    const pulse = interpolate(Math.sin(frame * 0.2), [-1, 1], [1, 1.1]);
    const ringScale = interpolate(frame % 30, [0, 30], [1, 1.5]);
    const ringOpacity = interpolate(frame % 30, [0, 30], [0.5, 0]);

    return (
      <AbsoluteFill>
        <div style={{
          position: 'absolute',
          ...positionStyles[position],
          transform: `scale(${scale})`,
        }}>
          {/* Pulse ring */}
          <div style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 50,
            border: `3px solid ${primaryColor}`,
            transform: `scale(${ringScale})`,
            opacity: ringOpacity,
          }} />
          {/* Button */}
          <div style={{
            backgroundColor: primaryColor,
            padding: '14px 28px',
            borderRadius: 50,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            transform: `scale(${pulse})`,
          }}>
            <span style={{ fontSize: 24 }}>{icon}</span>
            <span style={{
              color: 'white',
              fontSize: 18,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui, sans-serif',
              textTransform: 'uppercase',
            }}>
              {text}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
