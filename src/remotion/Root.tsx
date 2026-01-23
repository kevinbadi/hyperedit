import React from 'react';
import { Composition } from 'remotion';
import { DynamicAnimation } from './DynamicAnimation';

// Props passed from the CLI via --props
export interface DynamicAnimationProps {
  scenes: Scene[];
  title?: string;
  backgroundColor?: string;
  totalDuration?: number;
}

export interface Scene {
  id: string;
  type: 'title' | 'steps' | 'features' | 'stats' | 'text' | 'transition';
  duration: number; // in frames
  content: SceneContent;
}

export interface SceneContent {
  // For title/text scenes
  title?: string;
  subtitle?: string;
  // For steps/features scenes
  items?: Array<{
    icon?: string;
    label: string;
    description?: string;
  }>;
  // For stats scenes
  stats?: Array<{
    value: string;
    label: string;
  }>;
  // Styling
  color?: string;
  backgroundColor?: string;
}

// Calculate duration from scenes
const calculateDuration = (props: DynamicAnimationProps): number => {
  if (props.totalDuration) {
    return props.totalDuration;
  }
  if (props.scenes && props.scenes.length > 0) {
    return props.scenes.reduce((sum, scene) => sum + (scene.duration || 60), 0);
  }
  return 300; // Default fallback
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DynamicAnimation"
        component={DynamicAnimation}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: [],
          backgroundColor: '#0a0a0a',
        }}
        calculateMetadata={({ props }) => {
          return {
            durationInFrames: calculateDuration(props),
          };
        }}
      />
    </>
  );
};
