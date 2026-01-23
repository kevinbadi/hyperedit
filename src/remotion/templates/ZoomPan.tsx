import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from 'remotion';

export interface ZoomPanProps {
  imageUrl?: string;
  effect?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'ken-burns';
  intensity?: number; // 1-10
  backgroundColor?: string;
  overlayText?: string;
  overlayPosition?: 'center' | 'bottom' | 'top';
}

export const ZoomPan: React.FC<ZoomPanProps> = ({
  imageUrl,
  effect = 'ken-burns',
  intensity = 5,
  backgroundColor = '#0a0a0a',
  overlayText = '',
  overlayPosition = 'bottom',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Scale intensity from 1-10 to actual values
  const zoomAmount = 1 + (intensity / 10) * 0.3; // 1.03 to 1.3
  const panAmount = (intensity / 10) * 15; // 1.5% to 15%

  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  let transform = '';

  if (effect === 'zoom-in') {
    const scale = interpolate(progress, [0, 1], [1, zoomAmount]);
    transform = `scale(${scale})`;
  }

  if (effect === 'zoom-out') {
    const scale = interpolate(progress, [0, 1], [zoomAmount, 1]);
    transform = `scale(${scale})`;
  }

  if (effect === 'pan-left') {
    const x = interpolate(progress, [0, 1], [panAmount, -panAmount]);
    transform = `scale(1.1) translateX(${x}%)`;
  }

  if (effect === 'pan-right') {
    const x = interpolate(progress, [0, 1], [-panAmount, panAmount]);
    transform = `scale(1.1) translateX(${x}%)`;
  }

  if (effect === 'pan-up') {
    const y = interpolate(progress, [0, 1], [panAmount, -panAmount]);
    transform = `scale(1.1) translateY(${y}%)`;
  }

  if (effect === 'pan-down') {
    const y = interpolate(progress, [0, 1], [-panAmount, panAmount]);
    transform = `scale(1.1) translateY(${y}%)`;
  }

  if (effect === 'ken-burns') {
    // Classic Ken Burns: zoom in while panning
    const scale = interpolate(progress, [0, 1], [1, zoomAmount]);
    const x = interpolate(progress, [0, 1], [-panAmount / 2, panAmount / 2]);
    const y = interpolate(progress, [0, 1], [-panAmount / 3, panAmount / 3]);
    transform = `scale(${scale}) translate(${x}%, ${y}%)`;
  }

  const textOpacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: 'clamp' });

  const overlayPositionStyles: React.CSSProperties = {
    center: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    bottom: { bottom: 60, left: '50%', transform: 'translateX(-50%)' },
    top: { top: 60, left: '50%', transform: 'translateX(-50%)' },
  }[overlayPosition];

  return (
    <AbsoluteFill style={{ backgroundColor, overflow: 'hidden' }}>
      {/* Image container with effect */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {imageUrl ? (
          <Img
            src={imageUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform,
            }}
          />
        ) : (
          // Placeholder when no image
          <div
            style={{
              width: '120%',
              height: '120%',
              background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`,
              transform,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 24,
                color: '#ffffff40',
                fontFamily: 'Inter, system-ui',
              }}
            >
              Add an image URL for Ken Burns effect
            </div>
          </div>
        )}
      </div>

      {/* Optional overlay text */}
      {overlayText && (
        <div
          style={{
            position: 'absolute',
            ...overlayPositionStyles,
            opacity: textOpacity,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: '#ffffff',
              padding: '16px 32px',
              borderRadius: 12,
              fontSize: 28,
              fontWeight: 'bold',
              fontFamily: 'Inter, system-ui',
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
            }}
          >
            {overlayText}
          </div>
        </div>
      )}

      {/* Subtle vignette effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
