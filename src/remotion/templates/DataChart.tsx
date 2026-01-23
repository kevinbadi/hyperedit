import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export interface DataChartProps {
  type?: 'bar' | 'line' | 'pie' | 'donut';
  data?: Array<{ label: string; value: number; color?: string }>;
  title?: string;
  style?: 'minimal' | 'gradient' | 'neon' | 'glass';
  color?: string;
  showValues?: boolean;
  showLabels?: boolean;
}

const defaultData = [
  { label: 'Jan', value: 65, color: '#f97316' },
  { label: 'Feb', value: 85, color: '#ec4899' },
  { label: 'Mar', value: 45, color: '#8b5cf6' },
  { label: 'Apr', value: 90, color: '#22c55e' },
  { label: 'May', value: 70, color: '#3b82f6' },
];

export const DataChart: React.FC<DataChartProps> = ({
  type = 'bar',
  data = defaultData,
  title = '',
  style = 'minimal',
  color = '#f97316',
  showValues = true,
  showLabels = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const maxValue = Math.max(...data.map(d => d.value));

  // Bar chart
  if (type === 'bar') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ width: '80%', maxWidth: 1000, opacity }}>
          {title && (
            <div style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: '#ffffff',
              marginBottom: 40,
              textAlign: 'center',
              fontFamily: 'Inter, system-ui',
            }}>
              {title}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, height: 300 }}>
            {data.map((item, i) => {
              const barHeight = spring({
                frame: Math.max(0, frame - i * 8),
                fps,
                config: { damping: 15, stiffness: 100 },
              });

              const height = (item.value / maxValue) * 250 * barHeight;

              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Value */}
                  {showValues && (
                    <div style={{
                      color: '#ffffff',
                      fontSize: 18,
                      fontWeight: 'bold',
                      marginBottom: 8,
                      opacity: barHeight,
                    }}>
                      {item.value}
                    </div>
                  )}
                  {/* Bar */}
                  <div
                    style={{
                      width: '100%',
                      height,
                      backgroundColor: item.color || color,
                      borderRadius: '8px 8px 0 0',
                      boxShadow: style === 'neon' ? `0 0 20px ${item.color || color}60` : 'none',
                      background: style === 'gradient'
                        ? `linear-gradient(to top, ${item.color || color}, ${item.color || color}80)`
                        : item.color || color,
                    }}
                  />
                  {/* Label */}
                  {showLabels && (
                    <div style={{
                      color: '#a1a1aa',
                      fontSize: 14,
                      marginTop: 12,
                    }}>
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Line chart
  if (type === 'line') {
    const chartWidth = 800;
    const chartHeight = 300;
    const padding = 40;

    const points = data.map((item, i) => {
      const x = padding + (i / (data.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - (item.value / maxValue) * (chartHeight - padding * 2);
      return { x, y, ...item };
    });

    const lineProgress = interpolate(frame, [0, durationInFrames * 0.6], [0, 1], { extrapolateRight: 'clamp' });

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ opacity }}>
          {title && (
            <div style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: '#ffffff',
              marginBottom: 40,
              textAlign: 'center',
              fontFamily: 'Inter, system-ui',
            }}>
              {title}
            </div>
          )}
          <svg width={chartWidth} height={chartHeight}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
              <line
                key={i}
                x1={padding}
                y1={chartHeight - padding - ratio * (chartHeight - padding * 2)}
                x2={chartWidth - padding}
                y2={chartHeight - padding - ratio * (chartHeight - padding * 2)}
                stroke="#27272a"
                strokeWidth={1}
              />
            ))}

            {/* Line path */}
            <path
              d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={1000}
              strokeDashoffset={1000 - lineProgress * 1000}
              style={{ filter: style === 'neon' ? `drop-shadow(0 0 10px ${color})` : 'none' }}
            />

            {/* Area fill */}
            <path
              d={`${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`}
              fill={`${color}20`}
              opacity={lineProgress}
            />

            {/* Points */}
            {points.map((p, i) => {
              const pointScale = spring({
                frame: Math.max(0, frame - 20 - i * 5),
                fps,
                config: { damping: 10, stiffness: 200 },
              });

              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={8 * pointScale}
                    fill={color}
                    style={{ filter: style === 'neon' ? `drop-shadow(0 0 5px ${color})` : 'none' }}
                  />
                  {showValues && (
                    <text
                      x={p.x}
                      y={p.y - 15}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={14}
                      fontWeight="bold"
                      opacity={pointScale}
                    >
                      {p.value}
                    </text>
                  )}
                  {showLabels && (
                    <text
                      x={p.x}
                      y={chartHeight - 10}
                      textAnchor="middle"
                      fill="#a1a1aa"
                      fontSize={12}
                    >
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </AbsoluteFill>
    );
  }

  // Pie/Donut chart
  if (type === 'pie' || type === 'donut') {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const size = 300;
    const center = size / 2;
    const radius = size / 2 - 10;
    const innerRadius = type === 'donut' ? radius * 0.6 : 0;

    let currentAngle = -90; // Start from top

    const segments = data.map((item) => {
      const angle = (item.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      // Convert angles to radians
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      // Calculate arc path
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const largeArc = angle > 180 ? 1 : 0;

      let path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      if (type === 'donut') {
        const ix1 = center + innerRadius * Math.cos(startRad);
        const iy1 = center + innerRadius * Math.sin(startRad);
        const ix2 = center + innerRadius * Math.cos(endRad);
        const iy2 = center + innerRadius * Math.sin(endRad);

        path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
      }

      return {
        path,
        color: item.color || color,
        label: item.label,
        value: item.value,
        percentage: ((item.value / total) * 100).toFixed(1),
      };
    });

    const scale = spring({
      frame,
      fps,
      config: { damping: 15, stiffness: 100 },
    });

    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 60, opacity }}>
          {/* Chart */}
          <svg width={size} height={size} style={{ transform: `scale(${scale})` }}>
            {segments.map((segment, i) => {
              const segmentOpacity = interpolate(
                frame,
                [10 + i * 5, 25 + i * 5],
                [0, 1],
                { extrapolateRight: 'clamp' }
              );

              return (
                <path
                  key={i}
                  d={segment.path}
                  fill={segment.color}
                  opacity={segmentOpacity}
                  style={{
                    filter: style === 'neon' ? `drop-shadow(0 0 10px ${segment.color})` : 'none',
                  }}
                />
              );
            })}
            {/* Center text for donut */}
            {type === 'donut' && (
              <text
                x={center}
                y={center}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#ffffff"
                fontSize={36}
                fontWeight="bold"
              >
                {total}
              </text>
            )}
          </svg>

          {/* Legend */}
          {showLabels && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {segments.map((segment, i) => {
                const legendOpacity = interpolate(
                  frame,
                  [30 + i * 5, 40 + i * 5],
                  [0, 1],
                  { extrapolateRight: 'clamp' }
                );

                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: legendOpacity }}>
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        backgroundColor: segment.color,
                      }}
                    />
                    <span style={{ color: '#ffffff', fontSize: 16 }}>{segment.label}</span>
                    {showValues && (
                      <span style={{ color: '#71717a', fontSize: 14 }}>({segment.percentage}%)</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AbsoluteFill>
    );
  }

  return null;
};
