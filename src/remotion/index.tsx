// Entry point for Remotion rendering
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

// Register the root component for Remotion CLI
registerRoot(RemotionRoot);

// Re-export for use in the React app
export { RemotionRoot } from './Root';
export { DynamicAnimation } from './DynamicAnimation';
export type { Scene, DynamicAnimationProps } from './Root';
