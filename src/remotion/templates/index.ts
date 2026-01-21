export { AnimatedText, type AnimatedTextProps } from './AnimatedText';
export { LowerThird, type LowerThirdProps } from './LowerThird';
export { CallToAction, type CallToActionProps } from './CallToAction';

// Template registry for easy lookup
export const MOTION_TEMPLATES = {
  'animated-text': {
    name: 'Animated Text',
    description: 'Text with various animation styles',
    component: 'AnimatedText',
    defaultProps: {
      text: 'Your Text Here',
      style: 'typewriter',
      color: '#ffffff',
      fontSize: 64,
    },
    styles: ['typewriter', 'bounce', 'fade-up', 'word-by-word', 'glitch'],
  },
  'lower-third': {
    name: 'Lower Third',
    description: 'Name and title overlay',
    component: 'LowerThird',
    defaultProps: {
      name: 'John Doe',
      title: 'CEO & Founder',
      style: 'modern',
      primaryColor: '#f97316',
    },
    styles: ['modern', 'minimal', 'bold', 'gradient', 'news'],
  },
  'call-to-action': {
    name: 'Call to Action',
    description: 'Subscribe, like, follow buttons',
    component: 'CallToAction',
    defaultProps: {
      type: 'subscribe',
      style: 'pill',
      primaryColor: '#ef4444',
      position: 'bottom-right',
    },
    styles: ['pill', 'box', 'floating', 'pulse'],
    types: ['subscribe', 'like', 'follow', 'share', 'custom'],
  },
} as const;

export type TemplateId = keyof typeof MOTION_TEMPLATES;
