import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from 'remotion';

export interface ScreenFrameProps {
  imageUrl?: string;
  frameType?: 'browser' | 'phone' | 'tablet' | 'desktop';
  title?: string;
  url?: string;
  style?: 'light' | 'dark' | 'gradient';
  animateIn?: boolean;
}

export const ScreenFrame: React.FC<ScreenFrameProps> = ({
  imageUrl,
  frameType = 'browser',
  title = 'My App',
  url = 'https://example.com',
  style = 'dark',
  animateIn = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = animateIn
    ? spring({ frame, fps, config: { damping: 15, stiffness: 100 } })
    : 1;

  const opacity = animateIn
    ? interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  const bgColor = style === 'light' ? '#f4f4f5' : style === 'gradient' ? '#1a1a2e' : '#18181b';
  const frameColor = style === 'light' ? '#ffffff' : '#27272a';
  const textColor = style === 'light' ? '#18181b' : '#a1a1aa';
  const dotColors = ['#ff5f57', '#febc2e', '#28c840'];

  // Browser frame
  if (frameType === 'browser') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          background: style === 'gradient' ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : bgColor,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            opacity,
            width: '85%',
            maxWidth: 1400,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Browser chrome */}
          <div
            style={{
              backgroundColor: frameColor,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderBottom: `1px solid ${style === 'light' ? '#e4e4e7' : '#3f3f46'}`,
            }}
          >
            {/* Traffic lights */}
            <div style={{ display: 'flex', gap: 8 }}>
              {dotColors.map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
            {/* URL bar */}
            <div
              style={{
                flex: 1,
                backgroundColor: style === 'light' ? '#f4f4f5' : '#3f3f46',
                borderRadius: 6,
                padding: '8px 16px',
                fontSize: 13,
                color: textColor,
                fontFamily: 'Inter, system-ui',
              }}
            >
              {url}
            </div>
          </div>
          {/* Content area */}
          <div
            style={{
              backgroundColor: style === 'light' ? '#ffffff' : '#09090b',
              aspectRatio: '16/10',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {imageUrl ? (
              <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ color: textColor, fontSize: 24 }}>Your content here</div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Phone frame
  if (frameType === 'phone') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          background: style === 'gradient' ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : bgColor,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            opacity,
            width: 320,
            height: 650,
            backgroundColor: '#000000',
            borderRadius: 40,
            padding: 12,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Screen */}
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style === 'light' ? '#ffffff' : '#09090b',
              borderRadius: 32,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Notch */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 120,
                height: 30,
                backgroundColor: '#000000',
                borderRadius: '0 0 20px 20px',
                zIndex: 10,
              }}
            />
            {/* Content */}
            <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {imageUrl ? (
                <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: textColor, fontSize: 18 }}>{title}</div>
              )}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Tablet frame
  if (frameType === 'tablet') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          background: style === 'gradient' ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : bgColor,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            opacity,
            width: 900,
            height: 600,
            backgroundColor: '#1c1c1e',
            borderRadius: 24,
            padding: 16,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: style === 'light' ? '#ffffff' : '#09090b',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {imageUrl ? (
              <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ color: textColor, fontSize: 24 }}>{title}</div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Desktop frame
  if (frameType === 'desktop') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex',
          background: style === 'gradient' ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' : bgColor,
        }}
      >
        <div style={{ transform: `scale(${scale})`, opacity, textAlign: 'center' }}>
          {/* Monitor */}
          <div
            style={{
              width: 1000,
              height: 580,
              backgroundColor: '#1c1c1e',
              borderRadius: '16px 16px 0 0',
              padding: 16,
              border: '2px solid #3f3f46',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: style === 'light' ? '#ffffff' : '#09090b',
                borderRadius: 4,
                overflow: 'hidden',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {imageUrl ? (
                <Img src={imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ color: textColor, fontSize: 24 }}>{title}</div>
              )}
            </div>
          </div>
          {/* Stand */}
          <div
            style={{
              width: 200,
              height: 60,
              backgroundColor: '#27272a',
              margin: '0 auto',
              borderRadius: '0 0 8px 8px',
            }}
          />
          <div
            style={{
              width: 300,
              height: 16,
              backgroundColor: '#3f3f46',
              margin: '0 auto',
              borderRadius: 8,
            }}
          />
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
