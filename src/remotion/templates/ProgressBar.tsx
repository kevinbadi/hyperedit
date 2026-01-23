import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  style?: 'linear' | 'circular' | 'steps' | 'gradient' | 'neon';
  color?: string;
  position?: 'center' | 'bottom' | 'top';
  steps?: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress = 75,
  label = '',
  showPercentage = true,
  style = 'linear',
  color = '#f97316',
  position = 'center',
  steps = 5,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Animate progress value
  const animatedProgress = interpolate(
    frame,
    [0, durationInFrames * 0.6],
    [0, progress],
    { extrapolateRight: 'clamp' }
  );

  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  const positionStyles: React.CSSProperties = {
    center: { justifyContent: 'center', alignItems: 'center' },
    bottom: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 100 },
    top: { justifyContent: 'flex-start', alignItems: 'center', paddingTop: 100 },
  }[position];

  // Linear style
  if (style === 'linear') {
    return (
      <AbsoluteFill style={{ ...positionStyles, display: 'flex' }}>
        <div style={{ width: '60%', maxWidth: 800, opacity }}>
          {label && (
            <div style={{ color: '#ffffff', fontSize: 24, marginBottom: 16, fontFamily: 'Inter, system-ui' }}>
              {label}
            </div>
          )}
          {/* Track */}
          <div
            style={{
              height: 20,
              backgroundColor: '#27272a',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {/* Fill */}
            <div
              style={{
                height: '100%',
                width: `${animatedProgress}%`,
                backgroundColor: color,
                borderRadius: 10,
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
          {showPercentage && (
            <div style={{ color: '#a1a1aa', fontSize: 18, marginTop: 12, textAlign: 'right' }}>
              {Math.round(animatedProgress)}%
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Circular style
  if (style === 'circular') {
    const size = 250;
    const strokeWidth = 20;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (animatedProgress / 100) * circumference;

    const scale = spring({
      frame,
      fps,
      config: { damping: 15, stiffness: 100 },
    });

    return (
      <AbsoluteFill style={{ ...positionStyles, display: 'flex' }}>
        <div style={{ transform: `scale(${scale})`, opacity, textAlign: 'center' }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            {/* Background circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#27272a"
              strokeWidth={strokeWidth}
            />
            {/* Progress circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${color})` }}
            />
          </svg>
          {/* Center text */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            {showPercentage && (
              <div style={{ fontSize: 56, fontWeight: 'bold', color: '#ffffff', fontFamily: 'Inter, system-ui' }}>
                {Math.round(animatedProgress)}%
              </div>
            )}
            {label && (
              <div style={{ fontSize: 18, color: '#a1a1aa', marginTop: 8 }}>
                {label}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Steps style
  if (style === 'steps') {
    const completedSteps = Math.floor((animatedProgress / 100) * steps);

    return (
      <AbsoluteFill style={{ ...positionStyles, display: 'flex' }}>
        <div style={{ opacity }}>
          {label && (
            <div style={{ color: '#ffffff', fontSize: 24, marginBottom: 24, textAlign: 'center', fontFamily: 'Inter, system-ui' }}>
              {label}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {Array.from({ length: steps }, (_, i) => {
              const isCompleted = i < completedSteps;
              const isCurrent = i === completedSteps;
              const stepScale = spring({
                frame: isCompleted ? Math.max(0, frame - i * 10) : 0,
                fps,
                config: { damping: 10, stiffness: 200 },
              });

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      backgroundColor: isCompleted ? color : '#27272a',
                      border: isCurrent ? `3px solid ${color}` : 'none',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      transform: `scale(${isCompleted ? stepScale : 1})`,
                      boxShadow: isCompleted ? `0 0 20px ${color}60` : 'none',
                    }}
                  >
                    {isCompleted && (
                      <span style={{ color: '#ffffff', fontSize: 24 }}>✓</span>
                    )}
                    {!isCompleted && (
                      <span style={{ color: '#71717a', fontSize: 18 }}>{i + 1}</span>
                    )}
                  </div>
                  {i < steps - 1 && (
                    <div
                      style={{
                        width: 60,
                        height: 4,
                        backgroundColor: isCompleted ? color : '#27272a',
                        marginLeft: 8,
                        borderRadius: 2,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {showPercentage && (
            <div style={{ color: '#a1a1aa', fontSize: 18, marginTop: 24, textAlign: 'center' }}>
              Step {Math.min(completedSteps + 1, steps)} of {steps}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Gradient style
  if (style === 'gradient') {
    return (
      <AbsoluteFill style={{ ...positionStyles, display: 'flex' }}>
        <div style={{ width: '60%', maxWidth: 800, opacity }}>
          {label && (
            <div style={{ color: '#ffffff', fontSize: 24, marginBottom: 16, fontFamily: 'Inter, system-ui' }}>
              {label}
            </div>
          )}
          <div
            style={{
              height: 30,
              backgroundColor: '#27272a',
              borderRadius: 15,
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${animatedProgress}%`,
                background: `linear-gradient(90deg, ${color}, #ec4899, #8b5cf6)`,
                borderRadius: 15,
                boxShadow: `0 0 20px ${color}60`,
              }}
            />
          </div>
          {showPercentage && (
            <div style={{ color: '#a1a1aa', fontSize: 18, marginTop: 12, textAlign: 'right' }}>
              {Math.round(animatedProgress)}%
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  // Neon style
  if (style === 'neon') {
    return (
      <AbsoluteFill style={{ ...positionStyles, display: 'flex', backgroundColor: '#0a0a0a' }}>
        <div style={{ width: '60%', maxWidth: 800, opacity }}>
          {label && (
            <div style={{
              color: '#ffffff',
              fontSize: 24,
              marginBottom: 16,
              fontFamily: 'Inter, system-ui',
              textShadow: `0 0 10px ${color}`,
            }}>
              {label}
            </div>
          )}
          <div
            style={{
              height: 16,
              backgroundColor: '#1a1a1a',
              borderRadius: 8,
              overflow: 'hidden',
              border: `1px solid ${color}40`,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${animatedProgress}%`,
                backgroundColor: color,
                borderRadius: 8,
                boxShadow: `0 0 20px ${color}, 0 0 40px ${color}60`,
              }}
            />
          </div>
          {showPercentage && (
            <div style={{
              color: color,
              fontSize: 18,
              marginTop: 12,
              textAlign: 'right',
              textShadow: `0 0 10px ${color}`,
            }}>
              {Math.round(animatedProgress)}%
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
