import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Wand2, Clock, Terminal, CheckCircle, Loader2, VolumeX, FileVideo, Type, Image, Zap, X, Scissors, Plus, Film, Music, MapPin, Timer } from 'lucide-react';
import type { TimelineClip, Track, Asset } from '@/react-app/hooks/useProject';
import { MOTION_TEMPLATES, type TemplateId } from '@/remotion/templates';
import MotionGraphicsPanel from './MotionGraphicsPanel';

// Reference to a timeline element
interface TimelineReference {
  type: 'clip' | 'track' | 'timestamp';
  id?: string;
  label: string;
  details: string;
  trackId?: string;
  timestamp?: number;
}

// Time range for scoped edits
interface TimeRange {
  start: number;  // seconds
  end: number;    // seconds
}

interface TranscriptKeyword {
  keyword: string;
  timestamp: number;
  confidence: number;
  gifUrl?: string;
  assetId?: string;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  text: string;
  command?: string;
  explanation?: string;
  applied?: boolean;
  // For auto-GIF workflow
  extractedKeywords?: TranscriptKeyword[];
  isProcessingGifs?: boolean;
  // For caption workflow
  isCaptionWorkflow?: boolean;
  // For B-roll workflow
  isBrollWorkflow?: boolean;
  // For dead air removal workflow
  isDeadAirWorkflow?: boolean;
  // For chapter cuts workflow
  youtubeChapters?: string;
  // For animation follow-up (edit in new tab)
  animationAssetId?: string;
  animationName?: string;
}

interface CaptionOptions {
  highlightColor: string;
  fontFamily: string;
}

interface ChapterCutResult {
  chapters: Array<{ start: number; title: string }>;
  cutsApplied: number;
  youtubeFormat: string;
}

interface MotionGraphicConfig {
  templateId: TemplateId;
  props: Record<string, unknown>;
  duration: number;
  startTime?: number;
}

interface CustomAnimationResult {
  assetId: string;
  duration: number;
}

interface ContextualAnimationRequest {
  type: 'intro' | 'outro' | 'transition' | 'highlight';
  description?: string;
}

// Animation concept returned from analysis (for approval workflow)
interface AnimationConcept {
  type: 'intro' | 'outro' | 'transition' | 'highlight';
  transcript: string;
  transcriptPreview: string;
  contentSummary: string;
  keyTopics: string[];
  scenes: Array<{
    id: string;
    type: string;
    duration: number;
    content: {
      title?: string;
      subtitle?: string;
      items?: Array<{ icon?: string; label: string; description?: string }>;
      stats?: Array<{ value: string; label: string }>;
      color?: string;
      backgroundColor?: string;
    };
  }>;
  totalDuration: number;
  durationInSeconds: number;
  backgroundColor: string;
}

// Clarifying question for tool selection
interface ClarifyingQuestion {
  id: string;
  question: string;
  options: Array<{
    label: string;
    value: string;
    description: string;
    icon?: string;
  }>;
  context: {
    originalPrompt: string;
    category: 'animation' | 'overlay' | 'edit' | 'effect';
  };
}

interface AIPromptPanelProps {
  onApplyEdit?: (command: string) => Promise<void>;
  onExtractKeywordsAndAddGifs?: () => Promise<void>;
  onTranscribeAndAddCaptions?: (options?: CaptionOptions) => Promise<void>;
  onGenerateBroll?: () => Promise<void>;
  onRemoveDeadAir?: () => Promise<{ duration: number; removedDuration: number }>;
  onChapterCuts?: () => Promise<ChapterCutResult>;
  onAddMotionGraphic?: (config: MotionGraphicConfig) => Promise<void>;
  onCreateCustomAnimation?: (description: string) => Promise<CustomAnimationResult>;
  onAnalyzeForAnimation?: (request: ContextualAnimationRequest) => Promise<{ concept: AnimationConcept }>;
  onRenderFromConcept?: (concept: AnimationConcept) => Promise<CustomAnimationResult>;
  onCreateContextualAnimation?: (request: ContextualAnimationRequest) => Promise<CustomAnimationResult>;
  onGenerateTranscriptAnimation?: () => Promise<CustomAnimationResult>;
  onOpenAnimationInTab?: (assetId: string, animationName: string) => string | undefined;
  isApplying?: boolean;
  applyProgress?: number;
  applyStatus?: string;
  hasVideo?: boolean;
  // Timeline data for reference picker
  clips?: TimelineClip[];
  tracks?: Track[];
  assets?: Asset[];
  currentTime?: number;
  selectedClipId?: string | null;
}

export default function AIPromptPanel({
  onApplyEdit,
  onExtractKeywordsAndAddGifs,
  onTranscribeAndAddCaptions,
  onGenerateBroll,
  onRemoveDeadAir,
  onChapterCuts,
  onAddMotionGraphic,
  onCreateCustomAnimation,
  onAnalyzeForAnimation,
  onRenderFromConcept,
  onCreateContextualAnimation: _onCreateContextualAnimation,
  onGenerateTranscriptAnimation,
  onOpenAnimationInTab,
  isApplying,
  applyProgress,
  applyStatus,
  hasVideo,
  clips = [],
  tracks = [],
  assets = [],
  currentTime = 0,
  selectedClipId,
}: AIPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [showCaptionOptions, setShowCaptionOptions] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const [selectedReferences, setSelectedReferences] = useState<TimelineReference[]>([]);
  const [showTimeRangePicker, setShowTimeRangePicker] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [timeRangeInputs, setTimeRangeInputs] = useState({ start: '', end: '' });
  const [showMotionGraphicsModal, setShowMotionGraphicsModal] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const referencePickerRef = useRef<HTMLDivElement>(null);
  const timeRangePickerRef = useRef<HTMLDivElement>(null);
  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    highlightColor: '#FFD700',
    fontFamily: 'Inter',
  });
  const [pendingQuestion, setPendingQuestion] = useState<ClarifyingQuestion | null>(null);
  const [pendingAnimationConcept, setPendingAnimationConcept] = useState<AnimationConcept | null>(null);

  // Intentionally unused - kept for backwards compatibility
  void _onCreateContextualAnimation;

  // Close quick actions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setShowQuickActions(false);
      }
    };

    if (showQuickActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickActions]);

  // Close reference picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (referencePickerRef.current && !referencePickerRef.current.contains(event.target as Node)) {
        setShowReferencePicker(false);
      }
    };

    if (showReferencePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showReferencePicker]);

  // Close time range picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timeRangePickerRef.current && !timeRangePickerRef.current.contains(event.target as Node)) {
        setShowTimeRangePicker(false);
      }
    };

    if (showTimeRangePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showTimeRangePicker]);

  // Helper to format time
  const formatTimeShort = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse time string (M:SS or MM:SS) to seconds
  const parseTimeString = (timeStr: string): number | null => {
    const trimmed = timeStr.trim();
    if (!trimmed) return null;

    // Handle M:SS or MM:SS format
    const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
      const mins = parseInt(colonMatch[1], 10);
      const secs = parseInt(colonMatch[2], 10);
      if (secs < 60) {
        return mins * 60 + secs;
      }
    }

    // Handle plain seconds
    const plainSeconds = parseFloat(trimmed);
    if (!isNaN(plainSeconds) && plainSeconds >= 0) {
      return plainSeconds;
    }

    return null;
  };

  // Apply time range from inputs
  const applyTimeRange = () => {
    const start = parseTimeString(timeRangeInputs.start);
    const end = parseTimeString(timeRangeInputs.end);

    if (start !== null && end !== null && end > start) {
      setTimeRange({ start, end });
      setShowTimeRangePicker(false);
    }
  };

  // Clear time range
  const clearTimeRange = () => {
    setTimeRange(null);
    setTimeRangeInputs({ start: '', end: '' });
  };

  // Get asset for a clip
  const getAssetForClip = (clip: TimelineClip): Asset | undefined => {
    return assets.find(a => a.id === clip.assetId);
  };

  // Add a reference
  const addReference = (ref: TimelineReference) => {
    // Don't add duplicates
    if (selectedReferences.some(r => r.type === ref.type && r.id === ref.id && r.timestamp === ref.timestamp)) {
      return;
    }
    setSelectedReferences(prev => [...prev, ref]);
    setShowReferencePicker(false);
  };

  // Remove a reference
  const removeReference = (index: number) => {
    setSelectedReferences(prev => prev.filter((_, i) => i !== index));
  };

  // Build reference context for the prompt
  const buildReferenceContext = (): string => {
    const parts: string[] = [];

    // Add time range context if set
    if (timeRange) {
      parts.push(`[Time Range: ${formatTimeShort(timeRange.start)} - ${formatTimeShort(timeRange.end)}]`);
    }

    // Add reference context
    selectedReferences.forEach(ref => {
      if (ref.type === 'clip') {
        parts.push(`[Clip: ${ref.label} on ${ref.trackId} at ${ref.details}]`);
      } else if (ref.type === 'track') {
        parts.push(`[Track: ${ref.label}]`);
      } else if (ref.type === 'timestamp') {
        parts.push(`[Timestamp: ${ref.details}]`);
      }
    });

    if (parts.length === 0) return '';
    return parts.join(' ') + '\n\n';
  };

  const FONT_OPTIONS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald', 'Bebas Neue', 'Arial', 'Helvetica'
  ];

  const suggestions = [
    { icon: Type, text: 'Add captions' },
    { icon: VolumeX, text: 'Remove dead air / silence' },
    { icon: Wand2, text: 'Remove background noise' },
    { icon: Clock, text: 'Speed up by 1.5x' },
    { icon: FileVideo, text: 'Add GIF animations' },
    { icon: Image, text: 'Add B-roll images' },
    { icon: Scissors, text: 'Cut at chapters' },
    { icon: Sparkles, text: 'Create demo animation' },
    { icon: Zap, text: 'Animate transcript' },
  ];

  // Check if prompt is asking for auto-GIF extraction
  const isAutoGifPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('add gif') ||
      lower.includes('gif animation') ||
      lower.includes('extract keyword') ||
      lower.includes('find keyword') ||
      lower.includes('auto gif') ||
      lower.includes('smart gif') ||
      lower.includes('overlay gif') ||
      lower.includes('brand gif')
    );
  };

  // Check if prompt is asking for captions/subtitles
  const isCaptionPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('caption') ||
      lower.includes('subtitle') ||
      lower.includes('transcribe') ||
      lower.includes('transcript') ||
      lower.includes('add text') ||
      lower.includes('speech to text')
    );
  };

  // Check if prompt is asking for B-roll images
  const isBrollPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('b-roll') ||
      lower.includes('broll') ||
      lower.includes('b roll') ||
      lower.includes('add image') ||
      lower.includes('generate image') ||
      lower.includes('ai image') ||
      lower.includes('visual overlay') ||
      lower.includes('stock image')
    );
  };

  // Check if prompt is asking for chapter-based cuts
  const isChapterCutPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      (lower.includes('chapter') && (lower.includes('cut') || lower.includes('split'))) ||
      (lower.includes('review') && lower.includes('chapter') && lower.includes('cut')) ||
      lower.includes('cut at chapter') ||
      lower.includes('split by chapter') ||
      lower.includes('chapter markers') ||
      lower.includes('auto chapter') ||
      (lower.includes('identify') && lower.includes('chapter') && lower.includes('cut')) ||
      (lower.includes('detect') && lower.includes('chapter') && lower.includes('cut')) ||
      (lower.includes('find') && lower.includes('chapter') && lower.includes('cut'))
    );
  };

  // Check if prompt is asking for dead air/silence removal
  const isDeadAirPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('dead air') ||
      lower.includes('silence') ||
      lower.includes('remove pauses') ||
      lower.includes('cut pauses') ||
      lower.includes('remove gaps') ||
      lower.includes('trim silence') ||
      lower.includes('delete silence') ||
      (lower.includes('remove') && lower.includes('quiet'))
    );
  };

  // Check if prompt is asking for transcript-based animation (kinetic typography)
  const isTranscriptAnimationPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      // Direct transcript animation requests
      (lower.includes('animate') && lower.includes('transcript')) ||
      (lower.includes('animate') && lower.includes('words')) ||
      (lower.includes('animate') && lower.includes('speech')) ||
      (lower.includes('animate') && lower.includes('what') && lower.includes('said')) ||
      // Kinetic typography keywords
      lower.includes('kinetic typography') ||
      lower.includes('kinetic text') ||
      lower.includes('animated words') ||
      lower.includes('word animation') ||
      // Show text synced to audio
      (lower.includes('show') && lower.includes('text') && lower.includes('sync')) ||
      (lower.includes('text') && lower.includes('sync') && lower.includes('audio')) ||
      // Transcript visualization
      (lower.includes('visualize') && lower.includes('transcript')) ||
      (lower.includes('visualize') && lower.includes('speech')) ||
      // Animated transcript overlay
      (lower.includes('animated') && lower.includes('transcript')) ||
      (lower.includes('transcript') && lower.includes('overlay') && lower.includes('animate'))
    );
  };

  // Check if prompt is asking for a contextual animation (intro/outro that needs video context)
  const isContextualAnimationPrompt = (text: string): { isMatch: boolean; type: 'intro' | 'outro' | 'transition' | 'highlight' } => {
    const lower = text.toLowerCase();

    // Intro detection
    if (
      lower.includes('intro') ||
      lower.includes('introduction') ||
      lower.includes('opening') ||
      (lower.includes('start') && (lower.includes('animation') || lower.includes('video'))) ||
      (lower.includes('beginning') && lower.includes('animation'))
    ) {
      return { isMatch: true, type: 'intro' };
    }

    // Outro detection
    if (
      lower.includes('outro') ||
      lower.includes('ending') ||
      lower.includes('conclusion') ||
      (lower.includes('end') && (lower.includes('animation') || lower.includes('video'))) ||
      lower.includes('closing')
    ) {
      return { isMatch: true, type: 'outro' };
    }

    // Transition detection
    if (
      lower.includes('transition') ||
      lower.includes('between scene') ||
      lower.includes('scene change')
    ) {
      return { isMatch: true, type: 'transition' };
    }

    // Highlight detection
    if (
      lower.includes('highlight') ||
      lower.includes('key moment') ||
      lower.includes('important part')
    ) {
      return { isMatch: true, type: 'highlight' };
    }

    return { isMatch: false, type: 'intro' };
  };

  // Handle contextual animation workflow (analyzes first, shows concept for approval)
  const handleContextualAnimationWorkflow = async (type: 'intro' | 'outro' | 'transition' | 'highlight', description?: string) => {
    if (!onAnalyzeForAnimation) return;

    setIsProcessing(true);

    const typeLabels = {
      intro: 'intro animation',
      outro: 'outro animation',
      transition: 'transition',
      highlight: 'highlight animation',
    };

    setProcessingStatus(`Analyzing video for ${typeLabels[type]}...`);

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `🎬 Analyzing your video for a contextual ${typeLabels[type]}...\n\n1. Transcribing video to understand content\n2. Identifying key themes and topics\n3. Designing animation scenes\n\nPlease wait...`,
        isProcessingGifs: true,
      }]);

      // Step 1: Analyze the video and get the concept
      const { concept } = await onAnalyzeForAnimation({ type, description });

      // Store the concept for approval
      setPendingAnimationConcept(concept);

      // Update chat to show the concept for approval
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `📋 **Animation Concept Ready for Review**\n\n**Type:** ${typeLabels[type]}\n**Duration:** ${concept.durationInSeconds.toFixed(1)}s (${concept.totalDuration} frames)\n\n**Video Summary:**\n${concept.contentSummary}\n\n**Key Topics:** ${concept.keyTopics.join(', ') || 'N/A'}\n\n**Proposed Scenes (${concept.scenes.length}):**\n${concept.scenes.map((s, i) => `${i + 1}. **${s.type}** (${(s.duration / 30).toFixed(1)}s): ${s.content.title || s.content.items?.map(item => item.label).join(', ') || 'Transition'}`).join('\n')}\n\n👆 Review the concept above and click **Approve** to render, or **Edit** to modify.`,
            isProcessingGifs: false,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Contextual animation workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMake sure you have a video uploaded and the FFmpeg server is running.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle approving the animation concept and rendering
  const handleApproveAnimation = async () => {
    if (!pendingAnimationConcept || !onRenderFromConcept) return;

    setIsProcessing(true);
    setProcessingStatus('Rendering animation...');

    const typeLabels = {
      intro: 'intro animation',
      outro: 'outro animation',
      transition: 'transition',
      highlight: 'highlight animation',
    };

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `✅ Concept approved! Rendering ${typeLabels[pendingAnimationConcept.type]}...\n\nThis may take a moment...`,
        isProcessingGifs: true,
      }]);

      // Pass the full concept with scenes to render directly
      const result = await onRenderFromConcept(pendingAnimationConcept);

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `🎉 ${typeLabels[pendingAnimationConcept.type]} rendered successfully!\n\nDuration: ${result.duration}s\n\nThe animation has been added to your timeline.`,
            isProcessingGifs: false,
            applied: true,
          };
        }
        return updated;
      });

      // Clear the pending concept
      setPendingAnimationConcept(null);

    } catch (error) {
      console.error('Animation render error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to render animation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle canceling/editing the animation concept
  const handleCancelAnimation = () => {
    setPendingAnimationConcept(null);
    setChatHistory(prev => [...prev, {
      type: 'assistant',
      text: `Animation concept cancelled. You can try again with a different prompt or adjust your request.`,
    }]);
  };

  // Handle when user selects a clarification option
  const handleClarificationChoice = async (questionId: string, choice: string) => {
    if (!pendingQuestion || pendingQuestion.id !== questionId) return;

    const { originalPrompt: _originalPrompt } = pendingQuestion.context;
    void _originalPrompt; // May be used for future context
    setPendingQuestion(null);

    // Add user's choice to chat
    const selectedOption = pendingQuestion.options.find(o => o.value === choice);
    setChatHistory(prev => [...prev, {
      type: 'user',
      text: `${selectedOption?.icon || ''} ${selectedOption?.label}`,
    }]);

    // Route to appropriate workflow based on choice
    switch (choice) {
      case 'custom-animation':
        // Ask for more details about the animation
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Great! Describe what you want to animate. For example:\n\n• "A 3-step demo: Sign up, Browse, Purchase"\n• "Show our 3 main features with icons"\n• "Animated stats: 10K users, 99% uptime"',
        }]);
        break;

      case 'motion-template':
        // Show available template categories
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'What type of template would you like?\n\n• **Lower Third** - Name & title overlay\n• **Counter** - Animated numbers/stats\n• **Progress Bar** - Visual progress indicator\n• **Call to Action** - Subscribe/Like buttons\n• **Chart** - Bar, pie, or line charts\n• **Logo Reveal** - Animated logo intro\n\nDescribe what you need, e.g. "Add a lower third for John Smith, CEO"',
        }]);
        break;

      case 'gif-overlay':
        await handleAutoGifWorkflow();
        break;

      case 'text-animation':
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'What text would you like to animate? Include the style if you have a preference:\n\n• **Typewriter** - Text appears letter by letter\n• **Bounce** - Text bounces in\n• **Fade** - Smooth fade in\n• **Glitch** - Digital glitch effect\n\nExample: "Add animated text \'Welcome!\' with bounce effect"',
        }]);
        break;

      default:
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'I\'ll help you with that. Could you describe what you want in more detail?',
        }]);
    }
  };

  // Check if prompt is asking for a custom AI-generated animation (demo, explainer, creative scenarios, etc.)
  const isCustomAnimationPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();

    // Direct animation creation keywords
    const hasAnimationKeyword = lower.includes('animation') || lower.includes('animate') || lower.includes('animated');
    const hasCreationVerb = lower.includes('create') || lower.includes('make') || lower.includes('generate') ||
                           lower.includes('build') || lower.includes('design') || lower.includes('produce');
    const hasShowVerb = lower.includes('show') || lower.includes('display') || lower.includes('visualize') ||
                       lower.includes('illustrate') || lower.includes('depict') || lower.includes('portray');

    // Creative/descriptive content indicators (companies, characters, scenarios)
    const hasCreativeContent = lower.includes('company') || lower.includes('brand') || lower.includes('logo') ||
                              lower.includes('character') || lower.includes('story') || lower.includes('scene') ||
                              lower.includes('battle') || lower.includes('versus') || lower.includes(' vs ') ||
                              lower.includes('destroy') || lower.includes('fight') || lower.includes('compete') ||
                              lower.includes('transform') || lower.includes('evolve') || lower.includes('journey');

    return (
      // Direct requests: "create animation", "make animated video", etc.
      (hasCreationVerb && hasAnimationKeyword) ||
      // Show something in animation: "show X in the animation", "show X getting Y"
      (hasShowVerb && hasAnimationKeyword) ||
      (hasShowVerb && hasCreativeContent) ||
      // Animate a concept/scenario
      (lower.includes('animate') && (lower.includes('explanation') || lower.includes('how') || lower.includes('showing'))) ||
      // Specific video types
      lower.includes('product walkthrough') ||
      lower.includes('feature demo') ||
      lower.includes('explainer video') ||
      lower.includes('step by step animation') ||
      lower.includes('demo video') ||
      lower.includes('promo video') ||
      lower.includes('promotional animation') ||
      // Visualize concepts
      (lower.includes('visualize') && (lower.includes('concept') || lower.includes('process') || lower.includes('workflow'))) ||
      // Creative scenarios that imply animation generation
      (hasCreativeContent && (hasAnimationKeyword || lower.includes('video'))) ||
      // "in the animation" phrase
      lower.includes('in the animation') ||
      lower.includes('in an animation') ||
      // Describe a scenario to animate
      (lower.includes('getting') && hasCreativeContent)
    );
  };

  // Check if prompt is asking for motion graphics / animated overlays
  const isMotionGraphicsPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('lower third') ||
      lower.includes('lowerthird') ||
      lower.includes('name title') ||
      lower.includes('animated text') ||
      lower.includes('text animation') ||
      lower.includes('counter animation') ||
      lower.includes('number counter') ||
      lower.includes('count up') ||
      lower.includes('progress bar') ||
      lower.includes('call to action') ||
      lower.includes('cta button') ||
      lower.includes('subscribe button') ||
      lower.includes('like button') ||
      lower.includes('logo reveal') ||
      lower.includes('logo animation') ||
      lower.includes('intro animation') ||
      lower.includes('outro animation') ||
      lower.includes('screen mockup') ||
      lower.includes('device mockup') ||
      lower.includes('browser mockup') ||
      lower.includes('phone mockup') ||
      lower.includes('testimonial') ||
      lower.includes('social proof') ||
      lower.includes('before after') ||
      lower.includes('comparison') ||
      lower.includes('chart animation') ||
      lower.includes('animated chart') ||
      lower.includes('data visualization') ||
      lower.includes('pie chart') ||
      lower.includes('bar chart') ||
      (lower.includes('motion') && lower.includes('graphic'))
    );
  };

  // Handle chapter cuts workflow
  const handleChapterCutWorkflow = async () => {
    if (!onChapterCuts) return;

    setIsProcessing(true);
    setProcessingStatus('Analyzing video for chapters...');

    setChatHistory(prev => [...prev, {
      type: 'assistant',
      text: '🎬 Analyzing your video to identify chapters and key sections...',
    }]);

    try {
      setProcessingStatus('Transcribing and identifying chapters...');

      const result = await onChapterCuts();

      // Build chapter list for display
      const chapterList = result.chapters
        .map((ch, i) => {
          const mins = Math.floor(ch.start / 60);
          const secs = Math.floor(ch.start % 60);
          return `${i + 1}. ${mins}:${secs.toString().padStart(2, '0')} - ${ch.title}`;
        })
        .join('\n');

      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `✅ Found ${result.chapters.length} chapters and made ${result.cutsApplied} cuts!\n\n**Chapters:**\n${chapterList}\n\nYour video has been split at each chapter point. You can now rearrange, trim, or delete sections as needed.`,
      }]);

    } catch (error) {
      console.error('Chapter cuts failed:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to generate chapter cuts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Poll for job completion
  const pollForResult = async (jobId: string, maxAttempts = 60): Promise<any> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      setProcessingStatus(`AI is working... (${attempt + 1}s)`);

      try {
        const response = await fetch(`/api/ai-edit/status/${jobId}`);
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'complete') {
          return data;
        }

        if (data.status === 'error') {
          throw new Error(data.error || 'Processing failed');
        }

        // Still processing, wait and try again
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // On network error, wait and retry
        console.error('Poll error:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Request timed out after 60 seconds');
  };

  // Handle the caption workflow
  const handleCaptionWorkflow = async () => {
    if (!onTranscribeAndAddCaptions) return;

    setShowCaptionOptions(false);
    setIsProcessing(true);
    setProcessingStatus('Starting transcription...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Transcribing your video...\n\n1. Extracting audio from video\n2. Running local Whisper for accurate timestamps\n3. Adding captions to T1 track\n\nFont: ${captionOptions.fontFamily}\nHighlight: ${captionOptions.highlightColor}`,
        isProcessingGifs: true,
        isCaptionWorkflow: true,
      }]);

      await onTranscribeAndAddCaptions(captionOptions);

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: 'Captions generated and added to your timeline! Select a caption clip to customize the style.',
            isProcessingGifs: false,
            applied: true,
            isCaptionWorkflow: true,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Caption workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Make sure the ffmpeg server is running.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle the auto-GIF workflow
  const handleAutoGifWorkflow = async () => {
    if (!onExtractKeywordsAndAddGifs) return;

    setIsProcessing(true);
    setProcessingStatus('Starting keyword extraction...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Analyzing your video for keywords and brands...\n\n1. Extracting audio and transcribing\n2. Finding keywords and brands\n3. Searching for relevant GIFs\n4. Adding to timeline at correct timestamps',
        isProcessingGifs: true,
      }]);

      await onExtractKeywordsAndAddGifs();

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: 'Keywords extracted, GIFs found, and added to your timeline!',
            isProcessingGifs: false,
            applied: true,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Auto-GIF workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Parse prompt and determine motion graphic template
  const parseMotionGraphicFromPrompt = (text: string): MotionGraphicConfig | null => {
    const lower = text.toLowerCase();

    // Lower Third detection
    if (lower.includes('lower third') || lower.includes('lowerthird') || lower.includes('name title')) {
      const nameMatch = text.match(/(?:name|for|called?)\s*[:\-"]?\s*["']?([A-Z][a-zA-Z\s]+?)["']?(?:\s|,|$)/i);
      const titleMatch = text.match(/(?:title|as|position)\s*[:\-"]?\s*["']?([A-Za-z\s&]+?)["']?(?:\s|,|$)/i);

      return {
        templateId: 'lower-third',
        props: {
          ...MOTION_TEMPLATES['lower-third'].defaultProps,
          name: nameMatch?.[1]?.trim() || 'John Doe',
          title: titleMatch?.[1]?.trim() || 'CEO & Founder',
        },
        duration: 4,
        startTime: currentTime,
      };
    }

    // Animated Text detection
    if (lower.includes('animated text') || lower.includes('text animation')) {
      const textMatch = text.match(/(?:text|saying?|with)\s*[:\-"]?\s*["']([^"']+)["']/i) ||
                        text.match(/["']([^"']+)["']/);

      return {
        templateId: 'animated-text',
        props: {
          ...MOTION_TEMPLATES['animated-text'].defaultProps,
          text: textMatch?.[1] || 'Your Text Here',
          style: lower.includes('typewriter') ? 'typewriter' :
                 lower.includes('bounce') ? 'bounce' :
                 lower.includes('glitch') ? 'glitch' :
                 lower.includes('fade') ? 'fade-up' : 'typewriter',
        },
        duration: 3,
        startTime: currentTime,
      };
    }

    // Counter detection
    if (lower.includes('counter') || lower.includes('count up') || lower.includes('number animation')) {
      const valueMatch = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)/);
      const labelMatch = text.match(/(?:label|for|showing)\s*[:\-"]?\s*["']?([A-Za-z\s]+?)["']?(?:\s|,|$)/i);

      return {
        templateId: 'counter',
        props: {
          ...MOTION_TEMPLATES['counter'].defaultProps,
          value: valueMatch ? parseInt(valueMatch[1].replace(/,/g, '')) : 10000,
          label: labelMatch?.[1]?.trim() || 'Total Users',
          suffix: lower.includes('+') || lower.includes('plus') ? '+' : '',
          prefix: lower.includes('$') || lower.includes('dollar') ? '$' : '',
        },
        duration: 3,
        startTime: currentTime,
      };
    }

    // Progress Bar detection
    if (lower.includes('progress bar') || lower.includes('loading bar')) {
      const percentMatch = text.match(/(\d+)\s*%/);
      const labelMatch = text.match(/(?:label|for|showing)\s*[:\-"]?\s*["']?([A-Za-z\s]+?)["']?(?:\s|,|$)/i);

      return {
        templateId: 'progress-bar',
        props: {
          ...MOTION_TEMPLATES['progress-bar'].defaultProps,
          progress: percentMatch ? parseInt(percentMatch[1]) : 75,
          label: labelMatch?.[1]?.trim() || 'Progress',
          style: lower.includes('circular') ? 'circular' :
                 lower.includes('neon') ? 'neon' : 'linear',
        },
        duration: 3,
        startTime: currentTime,
      };
    }

    // Call to Action detection
    if (lower.includes('call to action') || lower.includes('cta') ||
        lower.includes('subscribe button') || lower.includes('like button')) {
      return {
        templateId: 'call-to-action',
        props: {
          ...MOTION_TEMPLATES['call-to-action'].defaultProps,
          type: lower.includes('like') ? 'like' :
                lower.includes('follow') ? 'follow' :
                lower.includes('share') ? 'share' : 'subscribe',
        },
        duration: 3,
        startTime: currentTime,
      };
    }

    // Logo Reveal detection
    if (lower.includes('logo reveal') || lower.includes('logo animation') ||
        lower.includes('intro animation') || lower.includes('outro')) {
      const logoMatch = text.match(/(?:logo|brand|text)\s*[:\-"]?\s*["']?([A-Za-z0-9\s]+?)["']?(?:\s|,|$)/i);
      const taglineMatch = text.match(/(?:tagline|slogan)\s*[:\-"]?\s*["']([^"']+)["']/i);

      return {
        templateId: 'logo-reveal',
        props: {
          ...MOTION_TEMPLATES['logo-reveal'].defaultProps,
          logoText: logoMatch?.[1]?.trim() || 'LOGO',
          tagline: taglineMatch?.[1] || 'Your tagline here',
          style: lower.includes('glitch') ? 'glitch' :
                 lower.includes('scale') ? 'scale' :
                 lower.includes('slide') ? 'slide' : 'scale',
        },
        duration: 4,
        startTime: currentTime,
      };
    }

    // Screen Frame / Mockup detection
    if (lower.includes('mockup') || lower.includes('screen frame') || lower.includes('device frame')) {
      return {
        templateId: 'screen-frame',
        props: {
          ...MOTION_TEMPLATES['screen-frame'].defaultProps,
          frameType: lower.includes('phone') || lower.includes('mobile') ? 'phone' :
                     lower.includes('tablet') || lower.includes('ipad') ? 'tablet' :
                     lower.includes('desktop') ? 'desktop' : 'browser',
          style: lower.includes('light') ? 'light' : 'dark',
        },
        duration: 4,
        startTime: currentTime,
      };
    }

    // Testimonial / Social Proof detection
    if (lower.includes('testimonial') || lower.includes('social proof') || lower.includes('rating')) {
      const quoteMatch = text.match(/["']([^"']+)["']/);
      const authorMatch = text.match(/(?:by|from|author)\s*[:\-"]?\s*["']?([A-Z][a-zA-Z\s]+?)["']?(?:\s|,|$)/i);

      return {
        templateId: 'social-proof',
        props: {
          ...MOTION_TEMPLATES['social-proof'].defaultProps,
          type: lower.includes('rating') ? 'rating' :
                lower.includes('stats') ? 'stats' : 'testimonial',
          quote: quoteMatch?.[1] || '"This product changed everything for us."',
          author: authorMatch?.[1]?.trim() || 'Jane Doe',
        },
        duration: 5,
        startTime: currentTime,
      };
    }

    // Comparison detection
    if (lower.includes('before after') || lower.includes('comparison') || lower.includes('versus')) {
      return {
        templateId: 'comparison',
        props: {
          ...MOTION_TEMPLATES['comparison'].defaultProps,
          type: lower.includes('slide') ? 'slider' :
                lower.includes('flip') ? 'flip' :
                lower.includes('fade') ? 'fade' : 'side-by-side',
        },
        duration: 5,
        startTime: currentTime,
      };
    }

    // Data Chart detection
    if (lower.includes('chart') || lower.includes('data visualization') || lower.includes('graph')) {
      return {
        templateId: 'data-chart',
        props: {
          ...MOTION_TEMPLATES['data-chart'].defaultProps,
          type: lower.includes('pie') ? 'pie' :
                lower.includes('donut') ? 'donut' :
                lower.includes('line') ? 'line' : 'bar',
          title: 'Monthly Revenue',
        },
        duration: 4,
        startTime: currentTime,
      };
    }

    return null;
  };

  // Handle custom AI-generated animation workflow
  const handleCustomAnimationWorkflow = async (description: string, _startTimeOverride?: number) => {
    if (!onCreateCustomAnimation) return;

    setIsProcessing(true);
    setProcessingStatus('Generating custom animation with AI...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `🎬 Creating custom animation...\n\n1. Analyzing your description\n2. Generating Remotion component with AI\n3. Rendering animation to video\n4. Adding to timeline\n\nThis may take a moment...`,
        isProcessingGifs: true,
      }]);

      // Note: Custom animations currently use their own placement logic (intro/outro detection)
      // Time range override is accepted but not yet fully implemented for custom animations
      const result = await onCreateCustomAnimation(description);

      // Update the last message to show completion with edit-in-tab option
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `✅ Custom animation created and added to your timeline!\n\nDuration: ${result.duration}s\n\nThe AI-generated animation is now on your V2 overlay track.`,
            isProcessingGifs: false,
            applied: true,
            animationAssetId: result.assetId,
            animationName: 'Custom Animation',
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Custom animation workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to create animation: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTry simplifying your description or being more specific about what you want to animate.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle the motion graphics workflow
  const handleMotionGraphicsWorkflow = async (prompt: string, startTimeOverride?: number) => {
    if (!onAddMotionGraphic) return;

    setIsProcessing(true);
    setProcessingStatus('Parsing motion graphic request...');

    try {
      const config = parseMotionGraphicFromPrompt(prompt);

      if (!config) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: `I couldn't determine which motion graphic to create. Try being more specific, like:\n\n• "Add a lower third for John Smith, CEO"\n• "Add an animated counter showing 10,000+"\n• "Add a subscribe button call to action"\n• "Add a testimonial quote"`,
        }]);
        return;
      }

      // Use time range start if provided, otherwise use the config's startTime
      if (startTimeOverride !== undefined) {
        config.startTime = startTimeOverride;
      }

      const templateInfo = MOTION_TEMPLATES[config.templateId];

      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Adding **${templateInfo.name}** to your timeline at ${formatTimeShort(config.startTime || 0)}...`,
        isProcessingGifs: true,
      }]);

      await onAddMotionGraphic(config);

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `✅ Added **${templateInfo.name}** to your timeline!\n\nYou can select the clip in the timeline to customize its properties.`,
            isProcessingGifs: false,
            applied: true,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Motion graphics workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle the B-roll image workflow
  const handleBrollWorkflow = async () => {
    if (!onGenerateBroll) return;

    setIsProcessing(true);
    setProcessingStatus('Starting B-roll generation...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Generating AI B-roll images for your video...\n\n1. Transcribing video content\n2. Identifying key moments for visuals\n3. Generating images with Gemini Imagen\n4. Adding to V3 track at correct timestamps',
        isProcessingGifs: true,
        isBrollWorkflow: true,
      }]);

      await onGenerateBroll();

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: 'B-roll images generated and added to your timeline on V3 track!',
            isProcessingGifs: false,
            applied: true,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('B-roll workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle dead air removal workflow
  const handleDeadAirWorkflow = async () => {
    if (!onRemoveDeadAir) return;

    setIsProcessing(true);
    setProcessingStatus('Detecting silence...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: '🔇 Analyzing video for dead air and silence...\n\n1. Detecting silent periods\n2. Identifying audio gaps\n3. Removing dead air\n4. Concatenating remaining segments',
        isProcessingGifs: true,
      }]);

      const result = await onRemoveDeadAir();

      // Update the last message to show completion
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          const message = result.removedDuration > 0
            ? `✅ Dead air removed!\n\n**Removed:** ${result.removedDuration.toFixed(1)} seconds of silence\n**New duration:** ${result.duration.toFixed(1)} seconds`
            : '✅ No significant silence detected in your video.';
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: message,
            isProcessingGifs: false,
            applied: true,
            isDeadAirWorkflow: true,
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Dead air removal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Check for the specific "files no longer exist" error
      const isSessionExpired = errorMessage.includes('no longer exist') || errorMessage.includes('ASSET_FILE_MISSING');
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: isSessionExpired
          ? '❌ Session expired - your video files are no longer available. Please re-upload your video and try again.'
          : `❌ Error: ${errorMessage}. Please try again.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle transcript animation workflow (kinetic typography from speech)
  const handleTranscriptAnimationWorkflow = async () => {
    if (!onGenerateTranscriptAnimation) return;

    setIsProcessing(true);
    setProcessingStatus('Analyzing transcript for animation...');

    try {
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: '🎬 Creating kinetic typography animation from your video...\n\n1. Transcribing video with word timestamps\n2. Identifying key phrases to animate\n3. Generating animated text scenes\n4. Rendering with Remotion\n\nThis may take a moment...',
        isProcessingGifs: true,
      }]);

      const result = await onGenerateTranscriptAnimation();

      // Update the last message to show completion with edit-in-tab option
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `✅ Transcript animation created!\n\n**Duration:** ${result.duration}s\n\nAnimated text overlay has been added to your timeline (V2 track).`,
            isProcessingGifs: false,
            applied: true,
            animationAssetId: result.assetId,
            animationName: 'Transcript Animation',
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Transcript animation error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to create transcript animation: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMake sure you have a video uploaded and the FFmpeg server is running.`,
      }]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const referenceContext = buildReferenceContext();
    const userMessage = prompt.trim();
    const fullMessage = referenceContext + userMessage;
    const savedTimeRange = timeRange; // Save for display before clearing
    setPrompt('');
    setSelectedReferences([]); // Clear references after submit
    clearTimeRange(); // Clear time range after submit

    // Add user message to chat (show references and time range as tags visually)
    const timePart = savedTimeRange ? `[${formatTimeShort(savedTimeRange.start)}-${formatTimeShort(savedTimeRange.end)}] ` : '';
    const refPart = selectedReferences.length > 0 ? `${selectedReferences.map(r => `@${r.label}`).join(' ')} ` : '';
    const displayMessage = `${timePart}${refPart}${userMessage}`;
    setChatHistory((prev) => [...prev, { type: 'user', text: displayMessage }]);

    // Check if this is a caption request
    if (isCaptionPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then transcribe it and add animated captions to your timeline.',
        }]);
        return;
      }

      // Show caption options UI
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Configure your caption style below, then click "Add Captions" to start.',
      }]);
      setShowCaptionOptions(true);
      return;
    }

    // Check if this is an auto-GIF request
    if (isAutoGifPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then transcribe it, extract keywords (like brand names), find relevant GIFs, and add them to your timeline automatically.',
        }]);
        return;
      }

      await handleAutoGifWorkflow();
      return;
    }

    // Check if this is a B-roll request
    if (isBrollPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then transcribe it, identify key moments, generate AI images, and add them as B-roll overlays.',
        }]);
        return;
      }

      await handleBrollWorkflow();
      return;
    }

    // Check if this is a dead air removal request
    if (isDeadAirPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then detect and remove silent periods from your video.',
        }]);
        return;
      }

      await handleDeadAirWorkflow();
      return;
    }

    // Check if this is a chapter cuts request
    if (isChapterCutPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then analyze it, identify chapters, and make cuts at each chapter point.',
        }]);
        return;
      }

      await handleChapterCutWorkflow();
      return;
    }

    // Check if this is a transcript animation request (kinetic typography)
    if (isTranscriptAnimationPrompt(userMessage)) {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then transcribe the speech and create animated text overlays synced to what\'s being said.',
        }]);
        return;
      }

      await handleTranscriptAnimationWorkflow();
      return;
    }

    // Check if prompt is asking for a contextual animation (intro/outro that uses video content)
    const contextualCheck = isContextualAnimationPrompt(userMessage);
    if (contextualCheck.isMatch) {
      await handleContextualAnimationWorkflow(contextualCheck.type, userMessage);
      return;
    }

    // Check if this is a custom animation request (AI-generated)
    // This catches any creative/animation requests and sends them to the AI generator
    if (isCustomAnimationPrompt(userMessage)) {
      await handleCustomAnimationWorkflow(userMessage, savedTimeRange?.start);
      return;
    }

    // Check if this is a motion graphics request (template-based)
    if (isMotionGraphicsPrompt(userMessage)) {
      await handleMotionGraphicsWorkflow(userMessage, savedTimeRange?.start);
      return;
    }

    // Regular AI edit flow
    setIsProcessing(true);
    setProcessingStatus('Starting AI...');

    try {
      // Start the job - use fullMessage which includes reference context
      const startResponse = await fetch('/api/ai-edit/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullMessage }),
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        console.error('Start error:', startResponse.status, errorText);
        throw new Error(`Failed to start: ${startResponse.status}`);
      }

      const { jobId } = await startResponse.json();

      if (!jobId) {
        throw new Error('No job ID returned');
      }

      // Poll for the result
      const data = await pollForResult(jobId);

      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: data.explanation,
          command: data.command,
          explanation: data.explanation,
          applied: false,
        },
      ]);
    } catch (error) {
      console.error('AI request error:', error);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        },
      ]);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleApplyEdit = async (command: string, messageIndex: number) => {
    if (!onApplyEdit || !hasVideo) return;

    try {
      await onApplyEdit(command);
      // Mark this message as applied
      setChatHistory((prev) =>
        prev.map((msg, idx) => (idx === messageIndex ? { ...msg, applied: true } : msg))
      );
    } catch (error) {
      console.error('Failed to apply edit:', error);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: `Failed to apply edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ]);
    }
  };

  return (
    <div className="h-full bg-zinc-900/80 border-l border-zinc-800/50 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <h2 className="font-semibold">HyperEdit AI</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Describe what you want to do with your video
        </p>
      </div>


      {/* Processing overlay */}
      {isApplying && (
        <div className="p-4 bg-orange-500/10 border-b border-orange-500/20">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
            <div className="flex-1">
              <p className="text-sm text-orange-200 font-medium">
                {applyStatus || 'Processing video...'}
              </p>
              {(applyProgress ?? 0) > 0 && (
                <>
                  <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-300"
                      style={{ width: `${applyProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">{applyProgress}% complete</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat history */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {chatHistory.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-8">
            {hasVideo
              ? "No edits yet. Use Quick Actions below to get started!"
              : 'Upload a video first to start editing with AI'}
          </div>
        ) : (
          chatHistory.map((message, idx) => (
            <div key={idx} className="space-y-2">
              {message.type === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-white">{message.text}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="bg-zinc-800 rounded-lg p-3 space-y-2">
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap">{message.text}</p>

                    {/* Clarifying question options */}
                    {pendingQuestion && idx === chatHistory.length - 1 && message.text === pendingQuestion.question && (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {pendingQuestion.options.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleClarificationChoice(pendingQuestion.id, option.value)}
                            className="flex items-start gap-3 p-3 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
                          >
                            <span className="text-lg">{option.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white group-hover:text-orange-400 transition-colors">
                                {option.label}
                              </div>
                              <div className="text-xs text-zinc-400 mt-0.5">
                                {option.description}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Animation concept approval buttons */}
                    {pendingAnimationConcept && idx === chatHistory.length - 1 && message.text.includes('Animation Concept Ready') && (
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={handleApproveAnimation}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve & Render
                        </button>
                        <button
                          onClick={handleCancelAnimation}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-zinc-300 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    )}

                    {/* Processing indicator */}
                    {message.isProcessingGifs && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-orange-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Processing...</span>
                      </div>
                    )}

                    {/* Show extracted keywords */}
                    {message.extractedKeywords && message.extractedKeywords.length > 0 && (
                      <div className="mt-2 space-y-2">
                        <div className="text-[10px] text-zinc-500 font-medium">Found keywords:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {message.extractedKeywords.map((kw, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-zinc-700/50 rounded text-[11px] text-zinc-300"
                              title={`At ${Math.floor(kw.timestamp / 60)}:${String(Math.floor(kw.timestamp % 60)).padStart(2, '0')}`}
                            >
                              {kw.keyword} @ {Math.floor(kw.timestamp / 60)}:{String(Math.floor(kw.timestamp % 60)).padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Success indicator for GIF/Caption/B-roll/Dead air workflow */}
                    {message.applied && !message.command && !message.animationAssetId && (
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        {message.isCaptionWorkflow ? 'Captions added to timeline' :
                         message.isBrollWorkflow ? 'B-roll images added to V3 track' :
                         message.isDeadAirWorkflow ? 'Dead air removed from timeline' :
                         'GIFs added to timeline'}
                      </div>
                    )}

                    {/* Animation created - offer to edit in new tab */}
                    {message.applied && message.animationAssetId && onOpenAnimationInTab && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400">
                          <CheckCircle className="w-3 h-3" />
                          Animation added to timeline
                        </div>
                        <button
                          onClick={() => onOpenAnimationInTab(message.animationAssetId!, message.animationName || 'Animation')}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded-lg text-xs font-medium text-blue-400 transition-colors"
                        >
                          <Film className="w-3.5 h-3.5" />
                          Edit in new timeline tab
                        </button>
                      </div>
                    )}

                    {/* FFmpeg command */}
                    {message.command && (
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-zinc-400">
                          <Terminal className="w-3 h-3" />
                          <span>FFmpeg Command</span>
                        </div>
                        <div className="bg-zinc-900 rounded p-2 font-mono text-xs text-orange-400 overflow-x-auto">
                          {message.command}
                        </div>
                        {message.applied ? (
                          <div className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400">
                            <CheckCircle className="w-3 h-3" />
                            Edit Applied
                          </div>
                        ) : (
                          <button
                            onClick={() => handleApplyEdit(message.command!, idx)}
                            disabled={isApplying || !hasVideo}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:from-zinc-700 disabled:to-zinc-700 rounded-lg text-xs font-medium transition-all"
                          >
                            {isApplying ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                Apply Edit
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {isProcessing && (
          <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <div className="w-4 h-4 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
              <span>{processingStatus || 'Thinking...'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Caption Options UI */}
      {showCaptionOptions && (
        <div className="p-4 border-t border-zinc-800/50 bg-zinc-800/50">
          <div className="space-y-3">
            <div className="text-xs font-medium text-zinc-300">Caption Style</div>

            {/* Font Selection */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-20">Font:</label>
              <select
                value={captionOptions.fontFamily}
                onChange={(e) => setCaptionOptions(prev => ({ ...prev, fontFamily: e.target.value }))}
                className="flex-1 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-white"
              >
                {FONT_OPTIONS.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>

            {/* Highlight Color */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400 w-20">Highlight:</label>
              <input
                type="color"
                value={captionOptions.highlightColor}
                onChange={(e) => setCaptionOptions(prev => ({ ...prev, highlightColor: e.target.value }))}
                className="w-8 h-8 rounded cursor-pointer bg-zinc-700 border border-zinc-600"
              />
              <span className="text-xs text-zinc-500">{captionOptions.highlightColor}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCaptionOptions(false)}
                className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCaptionWorkflow}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg text-xs font-medium transition-all"
              >
                Add Captions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800/50">
        {/* Motion Graphics Button */}
        <button
          type="button"
          onClick={() => setShowMotionGraphicsModal(true)}
          disabled={!hasVideo || isProcessing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mb-2 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 text-orange-300 hover:text-orange-200 border border-orange-500/30 hover:border-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-4 h-4" />
          Motion Graphics
        </button>

        {/* Quick Actions Popover */}
        <div className="relative mb-3" ref={quickActionsRef}>
          <button
            type="button"
            onClick={() => setShowQuickActions(!showQuickActions)}
            disabled={!hasVideo || isProcessing}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              showQuickActions
                ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/50'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <Zap className="w-4 h-4" />
            Quick Actions
            {showQuickActions && <X className="w-3 h-3 ml-auto" />}
          </button>

          {/* Popover Menu */}
          {showQuickActions && (
            <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="grid grid-cols-2 gap-1.5">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(suggestion.text);
                      setShowQuickActions(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-xs text-left transition-colors group"
                  >
                    <suggestion.icon className="w-4 h-4 text-zinc-400 group-hover:text-orange-400 transition-colors flex-shrink-0" />
                    <span className="text-zinc-300 leading-tight">{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected References and Time Range Tags */}
        {(selectedReferences.length > 0 || timeRange) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {/* Time Range Tag */}
            {timeRange && (
              <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 rounded-md text-xs">
                <Timer className="w-3 h-3" />
                <span>{formatTimeShort(timeRange.start)} - {formatTimeShort(timeRange.end)}</span>
                <button
                  type="button"
                  onClick={clearTimeRange}
                  className="ml-0.5 hover:text-blue-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {/* Reference Tags */}
            {selectedReferences.map((ref, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 text-orange-300 rounded-md text-xs"
              >
                {ref.type === 'clip' && <Film className="w-3 h-3" />}
                {ref.type === 'track' && <Type className="w-3 h-3" />}
                {ref.type === 'timestamp' && <MapPin className="w-3 h-3" />}
                <span className="truncate max-w-[100px]">{ref.label}</span>
                <button
                  type="button"
                  onClick={() => removeReference(idx)}
                  className="ml-0.5 hover:text-orange-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Unified Input Container */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700/50 focus-within:ring-2 focus-within:ring-orange-500/50 transition-all">
          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={hasVideo ? "Describe your edit..." : "Upload a video first..."}
            className="w-full px-3 pt-3 pb-2 bg-transparent text-sm resize-none focus:outline-none placeholder:text-zinc-500"
            rows={2}
            disabled={isProcessing || !hasVideo}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              {/* Reference Picker Button */}
              <div className="relative" ref={referencePickerRef}>
                <button
                  type="button"
                  onClick={() => setShowReferencePicker(!showReferencePicker)}
                  disabled={!hasVideo || isProcessing}
                  className={`p-1.5 rounded-md transition-all ${
                    showReferencePicker
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 disabled:opacity-50'
                  }`}
                  title="Reference clip or timestamp"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Reference Picker Popover */}
                {showReferencePicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="text-xs font-medium text-zinc-400 px-2 py-1">Reference Element</div>

                    {/* Current Timestamp */}
                    <button
                      type="button"
                      onClick={() => addReference({
                        type: 'timestamp',
                        label: `@${formatTimeShort(currentTime)}`,
                        details: formatTimeShort(currentTime),
                        timestamp: currentTime,
                      })}
                      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-zinc-700 rounded-lg text-left transition-colors"
                    >
                      <MapPin className="w-4 h-4 text-orange-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-200">Current Playhead</div>
                        <div className="text-[10px] text-zinc-500">{formatTimeShort(currentTime)}</div>
                      </div>
                    </button>

                    {/* Selected Clip */}
                    {selectedClipId && (() => {
                      const selectedClip = clips.find(c => c.id === selectedClipId);
                      if (!selectedClip) return null;
                      const asset = getAssetForClip(selectedClip);
                      return (
                        <button
                          type="button"
                          onClick={() => addReference({
                            type: 'clip',
                            id: selectedClip.id,
                            label: asset?.filename || 'Selected Clip',
                            details: `${formatTimeShort(selectedClip.start)} - ${formatTimeShort(selectedClip.start + selectedClip.duration)}`,
                            trackId: selectedClip.trackId,
                          })}
                          className="w-full flex items-center gap-2 px-2 py-2 hover:bg-zinc-700 rounded-lg text-left transition-colors border-l-2 border-orange-500"
                        >
                          <Film className="w-4 h-4 text-blue-400" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-zinc-200 truncate">{asset?.filename || 'Selected Clip'}</div>
                            <div className="text-[10px] text-zinc-500">{selectedClip.trackId} · {formatTimeShort(selectedClip.start)}</div>
                          </div>
                        </button>
                      );
                    })()}

                    {/* Divider */}
                    {clips.length > 0 && (
                      <div className="border-t border-zinc-700 my-1.5" />
                    )}

                    {/* Clips list */}
                    <div className="max-h-32 overflow-y-auto">
                      {clips.slice(0, 8).map(clip => {
                        const asset = getAssetForClip(clip);
                        const isSelected = clip.id === selectedClipId;
                        if (isSelected) return null;
                        return (
                          <button
                            key={clip.id}
                            type="button"
                            onClick={() => addReference({
                              type: 'clip',
                              id: clip.id,
                              label: asset?.filename || 'Clip',
                              details: `${formatTimeShort(clip.start)} - ${formatTimeShort(clip.start + clip.duration)}`,
                              trackId: clip.trackId,
                            })}
                            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-700 rounded-lg text-left transition-colors"
                          >
                            {asset?.type === 'audio' ? (
                              <Music className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <Film className="w-3 h-3 text-blue-400 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] text-zinc-300 truncate">{asset?.filename || 'Clip'}</div>
                              <div className="text-[10px] text-zinc-500">{clip.trackId} · {formatTimeShort(clip.start)}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Tracks */}
                    {tracks.length > 0 && (
                      <>
                        <div className="border-t border-zinc-700 my-1.5" />
                        <div className="text-xs font-medium text-zinc-400 px-2 py-1">Tracks</div>
                        <div className="flex flex-wrap gap-1 px-2">
                          {tracks.map(track => (
                            <button
                              key={track.id}
                              type="button"
                              onClick={() => addReference({
                                type: 'track',
                                id: track.id,
                                label: track.name,
                                details: track.type,
                              })}
                              className="px-2 py-1 bg-zinc-700/50 hover:bg-zinc-700 rounded text-[10px] text-zinc-300 transition-colors"
                            >
                              {track.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Time Range Picker Button */}
              <div className="relative" ref={timeRangePickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (!showTimeRangePicker) {
                      // Get video duration from assets or use a default
                      const videoAsset = assets.find(a => a.type === 'video');
                      const videoDuration = videoAsset?.duration || 60;
                      setTimeRangeInputs({
                        start: formatTimeShort(currentTime),
                        end: formatTimeShort(Math.min(currentTime + 30, videoDuration)),
                      });
                    }
                    setShowTimeRangePicker(!showTimeRangePicker);
                  }}
                  disabled={!hasVideo || isProcessing}
                  className={`p-1.5 rounded-md transition-all ${
                    showTimeRangePicker || timeRange
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 disabled:opacity-50'
                  }`}
                  title={timeRange ? `${formatTimeShort(timeRange.start)} - ${formatTimeShort(timeRange.end)}` : 'Set time range'}
                >
                  <Timer className="w-4 h-4" />
                </button>

                {/* Time Range Picker Popover */}
                {showTimeRangePicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-56 p-3 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="text-xs font-medium text-zinc-300 mb-3">Set Time Range</div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400 w-12">Start:</label>
                        <input
                          type="text"
                          value={timeRangeInputs.start}
                          onChange={(e) => setTimeRangeInputs(prev => ({ ...prev, start: e.target.value }))}
                          placeholder="0:00"
                          className="flex-1 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-400 w-12">End:</label>
                        <input
                          type="text"
                          value={timeRangeInputs.end}
                          onChange={(e) => setTimeRangeInputs(prev => ({ ...prev, end: e.target.value }))}
                          placeholder="1:30"
                          className="flex-1 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-500 mt-2 mb-3">
                      Format: M:SS (e.g., 1:30)
                    </div>

                    <div className="flex gap-2">
                      {timeRange && (
                        <button
                          type="button"
                          onClick={clearTimeRange}
                          className="flex-1 px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={applyTimeRange}
                        className="flex-1 px-2 py-1.5 bg-orange-500 hover:bg-orange-600 rounded text-xs text-white font-medium transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-zinc-700 mx-1" />

              <span className="text-[10px] text-zinc-500">Enter to send</span>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!prompt.trim() || isProcessing || !hasVideo}
              className="w-8 h-8 bg-gradient-to-r from-orange-500 to-amber-500 disabled:from-zinc-700 disabled:to-zinc-700 rounded-lg flex items-center justify-center transition-all hover:shadow-lg hover:shadow-orange-500/50 disabled:shadow-none"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Motion Graphics Modal */}
      {showMotionGraphicsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMotionGraphicsModal(false)}
          />
          {/* Modal */}
          <div className="relative w-full max-w-lg max-h-[80vh] bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setShowMotionGraphicsModal(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="h-[70vh] overflow-y-auto">
              <MotionGraphicsPanel
                onAddToTimeline={(templateId, props, duration) => {
                  if (onAddMotionGraphic) {
                    onAddMotionGraphic({ templateId, props, duration, startTime: currentTime });
                    setShowMotionGraphicsModal(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
