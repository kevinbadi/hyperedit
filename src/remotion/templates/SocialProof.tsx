import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface SocialProofProps {
  type?: 'testimonial' | 'rating' | 'stats' | 'logos';
  quote?: string;
  author?: string;
  role?: string;
  rating?: number;
  stats?: Array<{ value: string; label: string }>;
  style?: 'card' | 'minimal' | 'gradient' | 'glass';
  color?: string;
}

export const SocialProof: React.FC<SocialProofProps> = ({
  type = 'testimonial',
  quote = '"This product changed everything for us."',
  author = 'Jane Doe',
  role = 'CEO, Company',
  rating = 5,
  stats = [
    { value: '10K+', label: 'Users' },
    { value: '99%', label: 'Uptime' },
    { value: '4.9', label: 'Rating' },
  ],
  style = 'card',
  color = '#f97316',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 100 },
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Testimonial type
  if (type === 'testimonial') {
    const quoteOpacity = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });
    const authorOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: 'clamp' });

    const cardStyle: React.CSSProperties = {
      card: {
        backgroundColor: '#18181b',
        borderRadius: 24,
        padding: 60,
        maxWidth: 900,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      },
      minimal: {
        maxWidth: 900,
      },
      gradient: {
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: 24,
        padding: 60,
        maxWidth: 900,
        border: `1px solid ${color}30`,
      },
      glass: {
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 24,
        padding: 60,
        maxWidth: 900,
        border: '1px solid rgba(255, 255, 255, 0.2)',
      },
    }[style];

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ transform: `scale(${scale})`, opacity, ...cardStyle }}>
          {/* Quote mark */}
          <div style={{ fontSize: 80, color: color, opacity: 0.3, marginBottom: -30, fontFamily: 'Georgia, serif' }}>
            "
          </div>
          {/* Quote text */}
          <div
            style={{
              fontSize: 36,
              color: '#ffffff',
              fontFamily: 'Inter, system-ui',
              lineHeight: 1.5,
              opacity: quoteOpacity,
            }}
          >
            {quote.replace(/^"|"$/g, '')}
          </div>
          {/* Author */}
          <div style={{ marginTop: 40, opacity: authorOpacity }}>
            <div style={{ fontSize: 20, color: '#ffffff', fontWeight: 'bold', fontFamily: 'Inter, system-ui' }}>
              {author}
            </div>
            <div style={{ fontSize: 16, color: '#71717a', marginTop: 4 }}>
              {role}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Rating type
  if (type === 'rating') {
    const starsRevealed = interpolate(frame, [0, 50], [0, rating], { extrapolateRight: 'clamp' });

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ transform: `scale(${scale})`, opacity, textAlign: 'center' }}>
          {/* Stars */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 30 }}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = star <= starsRevealed;
              const starScale = spring({
                frame: Math.max(0, frame - star * 8),
                fps,
                config: { damping: 10, stiffness: 200 },
              });

              return (
                <div
                  key={star}
                  style={{
                    fontSize: 60,
                    color: filled ? '#fbbf24' : '#3f3f46',
                    transform: `scale(${starScale})`,
                    textShadow: filled ? '0 0 20px #fbbf2480' : 'none',
                  }}
                >
                  ★
                </div>
              );
            })}
          </div>
          {/* Rating number */}
          <div style={{ fontSize: 48, fontWeight: 'bold', color: '#ffffff', fontFamily: 'Inter, system-ui' }}>
            {rating.toFixed(1)} out of 5
          </div>
          {/* Subtitle */}
          <div style={{ fontSize: 20, color: '#71717a', marginTop: 12 }}>
            Based on 10,000+ reviews
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Stats type
  if (type === 'stats') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ display: 'flex', gap: 80, opacity }}>
          {stats.map((stat, i) => {
            const statScale = spring({
              frame: Math.max(0, frame - i * 10),
              fps,
              config: { damping: 12, stiffness: 150 },
            });

            return (
              <div key={i} style={{ textAlign: 'center', transform: `scale(${statScale})` }}>
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: 'bold',
                    color: color,
                    fontFamily: 'Inter, system-ui',
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 20, color: '#a1a1aa', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  // Logos type (company logos)
  if (type === 'logos') {
    const logoNames = ['Company A', 'Company B', 'Company C', 'Company D', 'Company E'];

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 20, color: '#71717a', marginBottom: 40, opacity }}>
          Trusted by leading companies
        </div>
        <div style={{ display: 'flex', gap: 60, alignItems: 'center' }}>
          {logoNames.map((name, i) => {
            const logoOpacity = interpolate(frame, [10 + i * 8, 20 + i * 8], [0, 1], { extrapolateRight: 'clamp' });

            return (
              <div
                key={i}
                style={{
                  fontSize: 24,
                  fontWeight: 'bold',
                  color: '#52525b',
                  fontFamily: 'Inter, system-ui',
                  opacity: logoOpacity,
                }}
              >
                {name}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
