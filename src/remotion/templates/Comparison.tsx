import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

export interface ComparisonProps {
  type?: 'slider' | 'side-by-side' | 'flip' | 'fade';
  beforeLabel?: string;
  afterLabel?: string;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  beforeColor?: string;
  afterColor?: string;
  style?: 'minimal' | 'labeled' | 'dramatic';
}

export const Comparison: React.FC<ComparisonProps> = ({
  type = 'slider',
  beforeLabel = 'Before',
  afterLabel = 'After',
  beforeImageUrl,
  afterImageUrl,
  beforeColor = '#ef4444',
  afterColor = '#22c55e',
  style = 'labeled',
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Slider type - reveals after image with a sliding divider
  if (type === 'slider') {
    const sliderPosition = interpolate(
      frame,
      [30, durationInFrames * 0.7],
      [10, 90],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div
          style={{
            width: '80%',
            maxWidth: 1200,
            aspectRatio: '16/9',
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 16,
            opacity,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* After (background) */}
          <div style={{ position: 'absolute', inset: 0, backgroundColor: afterColor }}>
            {afterImageUrl ? (
              <Img src={afterImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{afterLabel}</span>
              </div>
            )}
          </div>

          {/* Before (clipped) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
              backgroundColor: beforeColor,
            }}
          >
            {beforeImageUrl ? (
              <Img src={beforeImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{beforeLabel}</span>
              </div>
            )}
          </div>

          {/* Slider line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${sliderPosition}%`,
              width: 4,
              backgroundColor: '#ffffff',
              boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* Handle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 50,
                height: 50,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <span style={{ fontSize: 20 }}>⟷</span>
            </div>
          </div>

          {/* Labels */}
          {style === 'labeled' && (
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 20,
                  backgroundColor: beforeColor,
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 'bold',
                }}
              >
                {beforeLabel}
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  backgroundColor: afterColor,
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 'bold',
                }}
              >
                {afterLabel}
              </div>
            </>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Side by side type
  if (type === 'side-by-side') {
    const leftScale = spring({
      frame,
      fps,
      config: { damping: 15, stiffness: 100 },
    });
    const rightScale = spring({
      frame: Math.max(0, frame - 15),
      fps,
      config: { damping: 15, stiffness: 100 },
    });

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', gap: 40 }}>
        {/* Before */}
        <div
          style={{
            width: '40%',
            aspectRatio: '4/3',
            backgroundColor: beforeColor,
            borderRadius: 16,
            overflow: 'hidden',
            transform: `scale(${leftScale})`,
            opacity,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {beforeImageUrl ? (
            <Img src={beforeImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ color: '#ffffff', fontSize: 36, fontWeight: 'bold' }}>{beforeLabel}</span>
            </div>
          )}
          {style === 'labeled' && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              {beforeLabel}
            </div>
          )}
        </div>

        {/* VS indicator */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 'bold',
            color: '#ffffff',
            opacity: interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' }),
          }}
        >
          VS
        </div>

        {/* After */}
        <div
          style={{
            width: '40%',
            aspectRatio: '4/3',
            backgroundColor: afterColor,
            borderRadius: 16,
            overflow: 'hidden',
            transform: `scale(${rightScale})`,
            opacity,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {afterImageUrl ? (
            <Img src={afterImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ color: '#ffffff', fontSize: 36, fontWeight: 'bold' }}>{afterLabel}</span>
            </div>
          )}
          {style === 'labeled' && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              {afterLabel}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Flip type
  if (type === 'flip') {
    const flipProgress = interpolate(
      frame,
      [30, 50],
      [0, 180],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', perspective: 1000 }}>
        <div
          style={{
            width: '60%',
            maxWidth: 800,
            aspectRatio: '16/9',
            position: 'relative',
            transformStyle: 'preserve-3d',
            transform: `rotateY(${flipProgress}deg)`,
            opacity,
          }}
        >
          {/* Before (front) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: beforeColor,
              borderRadius: 16,
              backfaceVisibility: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {beforeImageUrl ? (
              <Img src={beforeImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            ) : (
              <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{beforeLabel}</span>
            )}
          </div>

          {/* After (back) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: afterColor,
              borderRadius: 16,
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            {afterImageUrl ? (
              <Img src={afterImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 16 }} />
            ) : (
              <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{afterLabel}</span>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Fade type
  if (type === 'fade') {
    const fadeProgress = interpolate(
      frame,
      [30, 60],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div
          style={{
            width: '70%',
            maxWidth: 1000,
            aspectRatio: '16/9',
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            opacity,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Before */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: beforeColor,
              opacity: 1 - fadeProgress,
            }}
          >
            {beforeImageUrl ? (
              <Img src={beforeImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{beforeLabel}</span>
              </div>
            )}
          </div>

          {/* After */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: afterColor,
              opacity: fadeProgress,
            }}
          >
            {afterImageUrl ? (
              <Img src={afterImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 'bold' }}>{afterLabel}</span>
              </div>
            )}
          </div>

          {/* Label */}
          {style === 'labeled' && (
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: 8,
                fontSize: 18,
                fontWeight: 'bold',
              }}
            >
              {fadeProgress < 0.5 ? beforeLabel : afterLabel}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
