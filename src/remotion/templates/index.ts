export { AnimatedText, type AnimatedTextProps } from './AnimatedText';
export { LowerThird, type LowerThirdProps } from './LowerThird';
export { CallToAction, type CallToActionProps } from './CallToAction';
export { Counter, type CounterProps } from './Counter';
export { LogoReveal, type LogoRevealProps } from './LogoReveal';
export { ScreenFrame, type ScreenFrameProps } from './ScreenFrame';
export { SocialProof, type SocialProofProps } from './SocialProof';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export { Comparison, type ComparisonProps } from './Comparison';
export { ZoomPan, type ZoomPanProps } from './ZoomPan';
export { DataChart, type DataChartProps } from './DataChart';

// Template registry for easy lookup
export const MOTION_TEMPLATES = {
  'animated-text': {
    name: 'Animated Text',
    description: 'Text with various animation styles',
    component: 'AnimatedText',
    category: 'text',
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
    category: 'text',
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
    category: 'engagement',
    defaultProps: {
      type: 'subscribe',
      style: 'pill',
      primaryColor: '#ef4444',
      position: 'bottom-right',
    },
    styles: ['pill', 'box', 'floating', 'pulse'],
    types: ['subscribe', 'like', 'follow', 'share', 'custom'],
  },
  'counter': {
    name: 'Counter',
    description: 'Animated number counter for stats',
    component: 'Counter',
    category: 'data',
    defaultProps: {
      value: 10000,
      prefix: '',
      suffix: '+',
      label: 'Active Users',
      style: 'simple',
      color: '#f97316',
      fontSize: 120,
    },
    styles: ['simple', 'card', 'gradient', 'neon', 'minimal'],
  },
  'logo-reveal': {
    name: 'Logo Reveal',
    description: 'Animated logo intro/outro',
    component: 'LogoReveal',
    category: 'branding',
    defaultProps: {
      logoText: 'LOGO',
      tagline: 'Your tagline here',
      style: 'scale',
      color: '#ffffff',
    },
    styles: ['fade', 'scale', 'slide', 'glitch', 'particles'],
  },
  'screen-frame': {
    name: 'Screen Frame',
    description: 'Browser, phone, or desktop mockup',
    component: 'ScreenFrame',
    category: 'mockup',
    defaultProps: {
      frameType: 'browser',
      title: 'My App',
      url: 'https://example.com',
      style: 'dark',
      animateIn: true,
    },
    styles: ['light', 'dark', 'gradient'],
    frameTypes: ['browser', 'phone', 'tablet', 'desktop'],
  },
  'social-proof': {
    name: 'Social Proof',
    description: 'Testimonials, ratings, and trust signals',
    component: 'SocialProof',
    category: 'engagement',
    defaultProps: {
      type: 'testimonial',
      quote: '"This product changed everything for us."',
      author: 'Jane Doe',
      role: 'CEO, Company',
      style: 'card',
      color: '#f97316',
    },
    styles: ['card', 'minimal', 'gradient', 'glass'],
    types: ['testimonial', 'rating', 'stats', 'logos'],
  },
  'progress-bar': {
    name: 'Progress Bar',
    description: 'Animated progress indicators',
    component: 'ProgressBar',
    category: 'data',
    defaultProps: {
      progress: 75,
      label: 'Project Progress',
      showPercentage: true,
      style: 'linear',
      color: '#f97316',
    },
    styles: ['linear', 'circular', 'steps', 'gradient', 'neon'],
  },
  'comparison': {
    name: 'Comparison',
    description: 'Before/after and side-by-side views',
    component: 'Comparison',
    category: 'showcase',
    defaultProps: {
      type: 'slider',
      beforeLabel: 'Before',
      afterLabel: 'After',
      beforeColor: '#ef4444',
      afterColor: '#22c55e',
      style: 'labeled',
    },
    styles: ['minimal', 'labeled', 'dramatic'],
    types: ['slider', 'side-by-side', 'flip', 'fade'],
  },
  'zoom-pan': {
    name: 'Zoom & Pan',
    description: 'Ken Burns effect for images',
    component: 'ZoomPan',
    category: 'showcase',
    defaultProps: {
      effect: 'ken-burns',
      intensity: 5,
      overlayText: '',
      overlayPosition: 'bottom',
    },
    effects: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'ken-burns'],
  },
  'data-chart': {
    name: 'Data Chart',
    description: 'Animated bar, line, and pie charts',
    component: 'DataChart',
    category: 'data',
    defaultProps: {
      type: 'bar',
      title: 'Monthly Revenue',
      style: 'minimal',
      color: '#f97316',
      showValues: true,
      showLabels: true,
    },
    styles: ['minimal', 'gradient', 'neon', 'glass'],
    types: ['bar', 'line', 'pie', 'donut'],
  },
} as const;

export type TemplateId = keyof typeof MOTION_TEMPLATES;

// Group templates by category
export const TEMPLATE_CATEGORIES = {
  text: {
    name: 'Text & Titles',
    templates: ['animated-text', 'lower-third'],
  },
  engagement: {
    name: 'Engagement',
    templates: ['call-to-action', 'social-proof'],
  },
  data: {
    name: 'Data & Stats',
    templates: ['counter', 'progress-bar', 'data-chart'],
  },
  branding: {
    name: 'Branding',
    templates: ['logo-reveal'],
  },
  mockup: {
    name: 'Mockups',
    templates: ['screen-frame'],
  },
  showcase: {
    name: 'Showcase',
    templates: ['comparison', 'zoom-pan'],
  },
} as const;
