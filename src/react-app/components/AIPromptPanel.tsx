import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Wand2, Clock, Terminal, CheckCircle, Loader2, VolumeX, FileVideo, Type, Image, Zap, X, Scissors, Plus, Film, Music, MapPin, Timer, ImagePlus } from 'lucide-react';
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

// Attached asset for animation creation
interface AttachedAsset {
  id: string;
  filename: string;
  type: 'image' | 'video';
  thumbnailUrl?: string | null;
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
  // For in-place animation edits (no "open in tab" button needed)
  isInPlaceEdit?: boolean;
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
  timeRange?: { start: number; end: number };
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
  startTime?: number; // Optional: where to place the animation on timeline
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

// Context info for V1 clip in edit tab (for hybrid asset approach)
interface EditTabV1Context {
  assetId: string;
  filename: string;
  type: 'video' | 'image' | 'audio';
  duration?: number;
  aiGenerated?: boolean; // True if this is a Remotion-generated animation
}

interface AIPromptPanelProps {
  onApplyEdit?: (command: string) => Promise<void>;
  onExtractKeywordsAndAddGifs?: () => Promise<void>;
  onTranscribeAndAddCaptions?: (options?: CaptionOptions) => Promise<void>;
  onGenerateBroll?: () => Promise<void>;
  onRemoveDeadAir?: () => Promise<{ duration: number; removedDuration: number }>;
  onChapterCuts?: () => Promise<ChapterCutResult>;
  onAddMotionGraphic?: (config: MotionGraphicConfig) => Promise<void>;
  onCreateCustomAnimation?: (description: string, startTime?: number, endTime?: number, attachedAssetIds?: string[]) => Promise<CustomAnimationResult>;
  onUploadAttachment?: (file: File) => Promise<Asset>;
  onAnalyzeForAnimation?: (request: ContextualAnimationRequest) => Promise<{ concept: AnimationConcept }>;
  onRenderFromConcept?: (concept: AnimationConcept) => Promise<CustomAnimationResult>;
  onCreateContextualAnimation?: (request: ContextualAnimationRequest) => Promise<CustomAnimationResult>;
  onGenerateTranscriptAnimation?: () => Promise<CustomAnimationResult>;
  onOpenAnimationInTab?: (assetId: string, animationName: string) => string | undefined;
  onEditAnimation?: (assetId: string, editPrompt: string, v1Context?: EditTabV1Context, tabIdToUpdate?: string) => Promise<{ assetId: string; duration: number; sceneCount: number }>;
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
  // Edit tab context
  activeTabId?: string;
  editTabAssetId?: string;
  editTabClips?: TimelineClip[]; // Clips in the edit tab's timeline
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
  onUploadAttachment,
  onAnalyzeForAnimation,
  onRenderFromConcept,
  onCreateContextualAnimation: _onCreateContextualAnimation,
  onGenerateTranscriptAnimation,
  onOpenAnimationInTab,
  onEditAnimation,
  isApplying,
  applyProgress,
  applyStatus,
  hasVideo,
  clips = [],
  tracks: _tracks = [],
  assets = [],
  currentTime = 0,
  selectedClipId,
  activeTabId = 'main',
  editTabAssetId,
  editTabClips = [],
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
  const [attachedAssets, setAttachedAssets] = useState<AttachedAsset[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDragOverChat, setIsDragOverChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const referencePickerRef = useRef<HTMLDivElement>(null);
  const timeRangePickerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [captionOptions, setCaptionOptions] = useState<CaptionOptions>({
    highlightColor: '#FFD700',
    fontFamily: 'Inter',
  });
  const [pendingQuestion, setPendingQuestion] = useState<ClarifyingQuestion | null>(null);
  const [pendingAnimationConcept, setPendingAnimationConcept] = useState<AnimationConcept | null>(null);

  // Intentionally unused - kept for backwards compatibility
  void _onCreateContextualAnimation;

  // Compute V1 clip context from edit tab timeline (hybrid approach)
  // This auto-detects what's on V1 to give the AI context about available clips
  const editTabV1Context: EditTabV1Context | null = (() => {
    if (activeTabId === 'main' || !editTabClips || editTabClips.length === 0) {
      return null;
    }
    // Find the first clip on V1 track in the edit tab
    const v1Clip = editTabClips.find(c => c.trackId === 'V1');
    if (!v1Clip) return null;

    // Get the asset info for this clip
    const asset = assets.find(a => a.id === v1Clip.assetId);
    if (!asset) return null;

    return {
      assetId: asset.id,
      filename: asset.filename,
      type: asset.type,
      duration: asset.duration,
      aiGenerated: asset.aiGenerated,
    };
  })();

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

  // Auto-scroll to bottom when chat history changes or processing state changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isProcessing]);

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

  // Handle file attachment for animations
  const handleFileAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onUploadAttachment) return;

    setIsUploadingAttachment(true);
    try {
      for (const file of Array.from(files)) {
        // Only allow images and videos
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          console.warn('Skipping non-image/video file:', file.name);
          continue;
        }

        const asset = await onUploadAttachment(file);
        if (asset && (asset.type === 'image' || asset.type === 'video')) {
          setAttachedAssets(prev => [...prev, {
            id: asset.id,
            filename: asset.filename,
            type: asset.type as 'image' | 'video',
            thumbnailUrl: asset.thumbnailUrl,
          }]);
        }
      }
    } catch (error) {
      console.error('Failed to upload attachment:', error);
    } finally {
      setIsUploadingAttachment(false);
      // Reset the input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove an attached asset
  const removeAttachment = (index: number) => {
    setAttachedAssets(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all attachments (called after successful animation creation)
  const clearAttachments = () => {
    setAttachedAssets([]);
  };

  // Handle drag over for asset drops from library
  const handleDragOver = (e: React.DragEvent) => {
    // Check if this is an asset drag from the library
    if (e.dataTransfer.types.includes('application/x-hyperedit-asset')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOverChat(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverChat(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverChat(false);

    const assetData = e.dataTransfer.getData('application/x-hyperedit-asset');
    if (!assetData) return;

    try {
      const asset = JSON.parse(assetData);
      // Only accept images and GIFs (which are also type 'image')
      if (asset.type === 'image') {
        // Check if already attached
        if (attachedAssets.some(a => a.id === asset.id)) {
          console.log('Asset already attached:', asset.filename);
          return;
        }
        setAttachedAssets(prev => [...prev, {
          id: asset.id,
          filename: asset.filename,
          type: asset.type as 'image' | 'video',
          thumbnailUrl: asset.thumbnailUrl,
        }]);
        console.log('Asset attached from drag:', asset.filename);
      } else {
        console.log('Only images/GIFs can be dropped here. Got:', asset.type);
      }
    } catch (err) {
      console.error('Failed to parse dropped asset:', err);
    }
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

  // Check if prompt is asking for a contextual animation (intro/outro that needs video context)
  // Note: This is still used by the contextual-animation workflow
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
            text: `📋 Animation Concept Ready for Review\n\nType: ${typeLabels[type]}\nDuration: ${concept.durationInSeconds.toFixed(1)}s (${concept.totalDuration} frames)\n\nVideo Summary:\n${concept.contentSummary}\n\nKey Topics: ${concept.keyTopics.join(', ') || 'N/A'}\n\nProposed Scenes (${concept.scenes.length}):\n${concept.scenes.map((s, i) => `${i + 1}. ${s.type} (${(s.duration / 30).toFixed(1)}s): ${s.content.title || s.content.items?.map(item => item.label).join(', ') || 'Transition'}`).join('\n')}\n\n👆 Review the concept above and click Approve to render, or Edit to modify.`,
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
            animationAssetId: result.assetId,
            animationName: `${typeLabels[pendingAnimationConcept.type]}`,
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
          text: 'What type of template would you like?\n\n• Lower Third - Name & title overlay\n• Counter - Animated numbers/stats\n• Progress Bar - Visual progress indicator\n• Call to Action - Subscribe/Like buttons\n• Chart - Bar, pie, or line charts\n• Logo Reveal - Animated logo intro\n\nDescribe what you need, e.g. "Add a lower third for John Smith, CEO"',
        }]);
        break;

      case 'gif-overlay':
        await handleAutoGifWorkflow();
        break;

      case 'text-animation':
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'What text would you like to animate? Include the style if you have a preference:\n\n• Typewriter - Text appears letter by letter\n• Bounce - Text bounces in\n• Fade - Smooth fade in\n• Glitch - Digital glitch effect\n\nExample: "Add animated text \'Welcome!\' with bounce effect"',
        }]);
        break;

      default:
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'I\'ll help you with that. Could you describe what you want in more detail?',
        }]);
    }
  };

  // ===========================================
  // DIRECTOR: Intelligent workflow routing
  // ===========================================
  // The Director analyzes the user's prompt AND context to determine
  // which workflow is most appropriate. It doesn't use priority - it
  // uses understanding of what the user wants.

  type WorkflowType =
    | 'edit-animation'      // Modify an existing Remotion animation
    | 'create-animation'    // Create a new Remotion animation
    | 'motion-graphics'     // Add template-based motion graphics
    | 'captions'            // Add captions to video
    | 'auto-gif'            // Extract keywords and add GIFs
    | 'b-roll'              // Generate AI B-roll images
    | 'dead-air'            // Remove silence from video
    | 'chapter-cuts'        // Split video into chapters
    | 'transcript-animation' // Kinetic typography from speech
    | 'contextual-animation' // Animation based on video content
    | 'ffmpeg-edit'         // Direct FFmpeg video manipulation
    | 'unknown';            // Need to ask for clarification

  interface DirectorContext {
    prompt: string;
    isOnEditTab: boolean;
    editTabHasAnimation: boolean;
    editTabAssetId?: string;
    hasVideo: boolean;
    hasTimeRange: boolean;
    timeRangeStart?: number;
    timeRangeEnd?: number;
    // Info about AI-generated animations on the main timeline
    hasAiAnimationsOnTimeline: boolean;
    selectedClipIsAiAnimation: boolean;
    selectedAiAnimationAssetId?: string;
  }

  const determineWorkflow = (ctx: DirectorContext): WorkflowType => {
    const lower = ctx.prompt.toLowerCase();

    // ============================================
    // CONTEXT-AWARE DECISIONS
    // ============================================

    // If user has selected an AI animation clip on the main timeline and wants to edit it
    if (ctx.selectedClipIsAiAnimation && !ctx.isOnEditTab) {
      const isEditIntent = lower.includes('edit') || lower.includes('change') ||
                          lower.includes('modify') || lower.includes('update') ||
                          lower.includes('make it') || lower.includes('adjust') ||
                          lower.includes('add') || lower.includes('remove');
      if (isEditIntent) {
        return 'edit-animation';
      }
    }

    // If on an edit tab with an animation, most prompts are about editing that animation
    // Unless they explicitly ask for something unrelated (like "add captions to my main video")
    if (ctx.isOnEditTab && ctx.editTabHasAnimation) {
      // Check if they're explicitly asking about the main video/timeline
      const isAboutMainVideo = lower.includes('main video') ||
                               lower.includes('main timeline') ||
                               lower.includes('original video');

      // Check if they're asking for something that only applies to video content (not animations)
      const isVideoOnlyFeature = lower.includes('caption') ||
                                 lower.includes('subtitle') ||
                                 lower.includes('dead air') ||
                                 lower.includes('silence') ||
                                 lower.includes('chapter');

      // If not explicitly about main video and not a video-only feature, edit the animation
      if (!isAboutMainVideo && !isVideoOnlyFeature) {
        // This includes: "make it bigger", "change colors", "add more scenes",
        // "make it faster", "add an image", etc.
        return 'edit-animation';
      }
    }

    // ============================================
    // INTENT-BASED DECISIONS (when not in edit tab)
    // ============================================

    // Caption-related requests
    if (lower.includes('caption') || lower.includes('subtitle') ||
        lower.includes('transcribe') || lower.includes('transcription')) {
      return 'captions';
    }

    // Dead air / silence removal
    if (lower.includes('dead air') || lower.includes('silence') ||
        lower.includes('remove quiet') || lower.includes('remove pauses')) {
      return 'dead-air';
    }

    // Chapter cuts
    if (lower.includes('chapter') || lower.includes('split into sections') ||
        lower.includes('segment') || (lower.includes('cut') && lower.includes('topic'))) {
      return 'chapter-cuts';
    }

    // GIF-related requests
    if (lower.includes('gif') || lower.includes('giphy') ||
        (lower.includes('add') && lower.includes('meme'))) {
      return 'auto-gif';
    }

    // B-roll requests
    if (lower.includes('b-roll') || lower.includes('broll') ||
        lower.includes('stock image') || lower.includes('overlay image')) {
      return 'b-roll';
    }

    // Transcript animation (kinetic typography)
    if ((lower.includes('transcript') && lower.includes('animation')) ||
        lower.includes('kinetic typography') || lower.includes('animate the words') ||
        lower.includes('animate text from speech')) {
      return 'transcript-animation';
    }

    // Motion graphics templates (specific template types)
    if (lower.includes('lower third') || lower.includes('counter') ||
        lower.includes('progress bar') || lower.includes('call to action') ||
        lower.includes('cta') || lower.includes('subscribe button') ||
        lower.includes('logo reveal') || lower.includes('testimonial')) {
      return 'motion-graphics';
    }

    // Contextual animation (based on video content at a specific time)
    if (ctx.hasTimeRange && (lower.includes('animation') || lower.includes('animate') ||
        lower.includes('visual') || lower.includes('graphic'))) {
      return 'contextual-animation';
    }

    // Create new animation (explicit creation requests)
    if ((lower.includes('create') || lower.includes('make') || lower.includes('generate')) &&
        (lower.includes('animation') || lower.includes('animated') || lower.includes('motion'))) {
      return 'create-animation';
    }

    // Animation editing language when there might be an animation in context
    if (lower.includes('animation') &&
        (lower.includes('change') || lower.includes('modify') || lower.includes('update') ||
         lower.includes('edit') || lower.includes('adjust'))) {
      // If we have an animation asset in the edit tab, edit it
      if (ctx.editTabHasAnimation) {
        return 'edit-animation';
      }
      // Otherwise they might want to create one
      return 'create-animation';
    }

    // FFmpeg-style video edits (trim, cut, speed, etc.)
    if (lower.includes('trim') || lower.includes('cut') || lower.includes('speed') ||
        lower.includes('slow') || lower.includes('fast') || lower.includes('reverse') ||
        lower.includes('crop') || lower.includes('rotate') || lower.includes('flip') ||
        lower.includes('brightness') || lower.includes('contrast') || lower.includes('filter')) {
      return 'ffmpeg-edit';
    }

    // Default: if nothing specific matched, use ffmpeg for general edits
    return 'ffmpeg-edit';
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
        text: `✅ Found ${result.chapters.length} chapters and made ${result.cutsApplied} cuts!\n\nChapters:\n${chapterList}\n\nYour video has been split at each chapter point. You can now rearrange, trim, or delete sections as needed.`,
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
  const handleCustomAnimationWorkflow = async (description: string, startTimeOverride?: number, endTimeOverride?: number) => {
    // Debug: log what time values we received
    console.log('[DEBUG] handleCustomAnimationWorkflow called with:', JSON.stringify({ description: description.substring(0, 50), startTimeOverride, endTimeOverride }));

    // When a time range is specified, use the contextual workflow with approval step
    // This analyzes the video content and shows scenes for user review before rendering
    if (startTimeOverride !== undefined && onAnalyzeForAnimation) {
      setIsProcessing(true);
      setProcessingStatus('Analyzing video content...');

      try {
        const timeStr = formatTimeShort(startTimeOverride);
        const endTimeStr = endTimeOverride !== undefined ? formatTimeShort(endTimeOverride) : '';
        const rangeStr = endTimeOverride !== undefined ? `${timeStr} - ${endTimeStr}` : timeStr;

        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: `🎬 Analyzing video segment ${rangeStr} for: "${description}"\n\n1. Extracting audio from ${rangeStr}\n2. Transcribing ONLY that segment\n3. Understanding what's being discussed\n4. Designing relevant animation scenes\n\nYou'll be able to review and approve the scenes before rendering...`,
          isProcessingGifs: true,
        }]);

        // Build time range - use provided end time, or create a 20s window around the start time
        const timeRangeToUse = endTimeOverride !== undefined
          ? { start: startTimeOverride, end: endTimeOverride }
          : { start: Math.max(0, startTimeOverride - 5), end: startTimeOverride + 15 }; // Default 20s window around timestamp

        // Debug: log the time range being passed to analysis
        console.log('[DEBUG] Calling onAnalyzeForAnimation with timeRange:', JSON.stringify(timeRangeToUse));

        // Analyze video to get concept - pass description and time range for context
        // The time range ensures only that segment's transcript is analyzed
        const { concept } = await onAnalyzeForAnimation({
          type: 'highlight',
          description: `At timestamp ${timeStr}: ${description}`,
          timeRange: timeRangeToUse,
        });

        // Store the concept with the start time for when it's approved
        const conceptWithTime = { ...concept, startTime: startTimeOverride };
        setPendingAnimationConcept(conceptWithTime);

        // Show the concept for approval
        setChatHistory(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.isProcessingGifs) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              text: `📋 Animation Concept Ready (for ${rangeStr})\n\nContent Summary: ${concept.contentSummary}\n\nKey Topics: ${concept.keyTopics.join(', ')}\n\nProposed Scenes (${concept.scenes.length}):\n${concept.scenes.map((s, i) => `${i + 1}. ${s.type}: ${s.content.title || s.content.subtitle || 'Visual'} (${s.duration}s)`).join('\n')}\n\nTotal Duration: ${concept.totalDuration}s\n\n👇 Review and approve below, or cancel to modify your request.`,
              isProcessingGifs: false,
            };
          }
          return updated;
        });

      } catch (error) {
        console.error('Custom animation analysis error:', error);
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: `❌ Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTry a different description or check that your video has audio.`,
        }]);
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
      }
      return;
    }

    // For requests without time range, render directly (but still get video context)
    if (!onCreateCustomAnimation) return;

    setIsProcessing(true);
    setProcessingStatus('Generating custom animation with AI...');

    // Capture current attachments before clearing
    const currentAttachments = [...attachedAssets];
    const attachedAssetIds = currentAttachments.map(a => a.id);

    try {
      const hasTimeRange = startTimeOverride !== undefined;
      const hasAttachments = currentAttachments.length > 0;

      let statusMessage = `🎬 Creating custom animation...\n\n`;
      statusMessage += `1. ${hasTimeRange ? 'Using specified time range for context' : 'Analyzing video transcript for context'}\n`;
      if (hasAttachments) {
        statusMessage += `2. Including ${currentAttachments.length} attached asset(s): ${currentAttachments.map(a => a.filename).join(', ')}\n`;
        statusMessage += `3. Generating Remotion component with AI\n4. Rendering animation to video\n5. Adding to timeline`;
      } else {
        statusMessage += `2. Generating Remotion component with AI\n3. Rendering animation to video\n4. Adding to timeline`;
      }
      statusMessage += `\n\nThis may take a moment...`;

      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: statusMessage,
        isProcessingGifs: true,
      }]);

      // Pass time range and attached assets to the animation generator
      const result = await onCreateCustomAnimation(description, startTimeOverride, endTimeOverride, attachedAssetIds.length > 0 ? attachedAssetIds : undefined);

      // Clear attachments after successful creation
      clearAttachments();

      // Update the last message to show completion with edit-in-tab option
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `✅ Custom animation created and added to your timeline!\n\nDuration: ${result.duration}s${hasAttachments ? `\nIncluded assets: ${currentAttachments.map(a => a.filename).join(', ')}` : ''}\n\nThe AI-generated animation is now on your V2 overlay track.`,
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

  // Handle editing an existing animation (when on an edit tab)
  const handleEditAnimationWorkflow = async (editPrompt: string, assetId: string) => {
    if (!onEditAnimation) return;

    setIsProcessing(true);
    setProcessingStatus('Editing animation with AI...');

    try {
      // Get the animation asset for display
      const animationAsset = assets.find(a => a.id === assetId);
      const animationName = animationAsset?.filename || 'Animation';

      // Build context message showing what the AI has access to
      let contextInfo = '1. Loading current animation structure\n2. Applying your changes with AI\n3. Re-rendering animation';
      if (editTabV1Context) {
        contextInfo = `1. Loading current animation structure\n2. Using V1 context: "${editTabV1Context.filename}"\n3. Applying your changes with AI\n4. Re-rendering animation`;
      }

      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `🎨 Editing "${animationName}"...\n\n${contextInfo}\n\nThis may take a moment...`,
        isProcessingGifs: true,
      }]);

      // Pass V1 context if available (hybrid approach) and the tab ID to update
      console.log('[handleEditAnimationWorkflow] Calling onEditAnimation with:', {
        assetId,
        editPrompt: editPrompt.substring(0, 50) + '...',
        hasV1Context: !!editTabV1Context,
        activeTabId,
      });

      const result = await onEditAnimation(assetId, editPrompt, editTabV1Context || undefined, activeTabId);

      console.log('[handleEditAnimationWorkflow] Edit complete:', {
        resultAssetId: result.assetId,
        originalAssetId: assetId,
        isSameAsset: result.assetId === assetId,
        duration: result.duration,
        sceneCount: result.sceneCount,
      });

      // Update the last message to show completion
      // Note: Animation is edited in-place (same asset ID), so no need for "open in tab" button
      setChatHistory(prev => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.isProcessingGifs) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: `✅ Animation updated in place!\n\nDuration: ${result.duration}s\nScenes: ${result.sceneCount}\n\nYou can continue editing with more prompts.`,
            isProcessingGifs: false,
            applied: true,
            isInPlaceEdit: true, // Flag to indicate this was an in-place edit (no "open in tab" button)
          };
        }
        return updated;
      });

    } catch (error) {
      console.error('Edit animation workflow error:', error);
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: `❌ Failed to edit animation: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTry a simpler edit request or check that the animation is AI-generated.`,
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
        text: `Adding ${templateInfo.name} to your timeline at ${formatTimeShort(config.startTime || 0)}...`,
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
            text: `✅ Added ${templateInfo.name} to your timeline!\n\nYou can select the clip in the timeline to customize its properties.`,
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
            ? `✅ Dead air removed!\n\nRemoved: ${result.removedDuration.toFixed(1)} seconds of silence\nNew duration: ${result.duration.toFixed(1)} seconds`
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
            text: `✅ Transcript animation created!\n\nDuration: ${result.duration}s\n\nAnimated text overlay has been added to your timeline (V2 track).`,
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

    // ===========================================
    // DIRECTOR: Determine the appropriate workflow
    // ===========================================
    const isManualTab = editTabAssetId?.startsWith('edit-') ?? false;
    const animationAsset = (!isManualTab && editTabAssetId) ? assets.find(a => a.id === editTabAssetId) : null;

    // Check if on an animation edit tab - the tab's assetId indicates it was created via "Open in Tab"
    // Trust this even if the asset isn't found in local state (handles timing issues)
    const isOnAnimationEditTab = !isManualTab && !!editTabAssetId;

    // Check aiGenerated flag - use editTabV1Context directly (don't look up asset again, it might fail)
    // This catches both:
    // 1. Tabs created via "Open in Tab" (animationAsset.aiGenerated)
    // 2. Manual tabs where user dragged an AI animation to V1 (editTabV1Context.aiGenerated)
    const editTabHasRemotionAnimation = !!(animationAsset && animationAsset.aiGenerated) ||
                                         !!(editTabV1Context?.aiGenerated);

    // For edit detection: trust either the tab metadata (assetId set) OR the aiGenerated flag
    // This ensures we route to edit-animation even if there's a timing issue with assets state
    const editTabHasAnimation = isOnAnimationEditTab || editTabHasRemotionAnimation;

    // Check for AI-generated animations on the main timeline
    const aiAnimationsOnTimeline = clips
      .map(clip => {
        const asset = assets.find(a => a.id === clip.assetId);
        return asset?.aiGenerated ? { clipId: clip.id, assetId: asset.id, asset } : null;
      })
      .filter(Boolean);
    const hasAiAnimationsOnTimeline = aiAnimationsOnTimeline.length > 0;

    // Check if the currently selected clip is an AI animation
    const selectedClip = selectedClipId ? clips.find(c => c.id === selectedClipId) : null;
    const selectedClipAsset = selectedClip ? assets.find(a => a.id === selectedClip.assetId) : null;
    const selectedClipIsAiAnimation = !!(selectedClipAsset?.aiGenerated);

    const directorContext: DirectorContext = {
      prompt: userMessage,
      isOnEditTab: activeTabId !== 'main',
      editTabHasAnimation,
      editTabAssetId,
      hasVideo: hasVideo ?? false,
      hasTimeRange: !!savedTimeRange,
      timeRangeStart: savedTimeRange?.start,
      timeRangeEnd: savedTimeRange?.end,
      hasAiAnimationsOnTimeline,
      selectedClipIsAiAnimation,
      selectedAiAnimationAssetId: selectedClipIsAiAnimation ? selectedClipAsset?.id : undefined,
    };

    const workflow = determineWorkflow(directorContext);
    console.log('[Director] Determined workflow:', workflow);
    console.log('[Director] Full context:', {
      prompt: userMessage.substring(0, 50) + '...',
      isOnEditTab: directorContext.isOnEditTab,
      editTabHasAnimation: directorContext.editTabHasAnimation,
      isOnAnimationEditTab,
      editTabHasRemotionAnimation,
      editTabAssetId,
      activeTabId,
      hasTimeRange: directorContext.hasTimeRange,
      animationAssetFound: !!animationAsset,
      animationAssetAiGenerated: animationAsset?.aiGenerated,
      // AI animations on main timeline
      hasAiAnimationsOnTimeline: directorContext.hasAiAnimationsOnTimeline,
      selectedClipIsAiAnimation: directorContext.selectedClipIsAiAnimation,
      selectedAiAnimationAssetId: directorContext.selectedAiAnimationAssetId,
      editTabV1Context: editTabV1Context ? {
        assetId: editTabV1Context.assetId,
        filename: editTabV1Context.filename,
        aiGenerated: editTabV1Context.aiGenerated,
      } : null,
    });

    // ===========================================
    // Execute the determined workflow
    // ===========================================

    // Edit existing animation (Remotion)
    // Priority for asset ID:
    // 1. Selected AI animation on main timeline (selectedAiAnimationAssetId)
    // 2. V1 clip's asset ID in edit tab (for manual tabs with dragged animations)
    // 3. editTabAssetId (for tabs created via "Edit in new tab")
    const animationAssetIdToEdit = directorContext.selectedAiAnimationAssetId ||
                                   editTabV1Context?.assetId ||
                                   editTabAssetId;
    if (workflow === 'edit-animation' && animationAssetIdToEdit && onEditAnimation) {
      console.log('[Director] Editing animation with asset ID:', animationAssetIdToEdit);
      console.log('[Director] Source: selectedAiAnimation=%s, editTabV1Context=%s, editTabAssetId=%s',
        directorContext.selectedAiAnimationAssetId,
        editTabV1Context?.assetId,
        editTabAssetId);
      await handleEditAnimationWorkflow(userMessage, animationAssetIdToEdit);
      return;
    }

    // Captions
    if (workflow === 'captions') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then transcribe it and add animated captions to your timeline.',
        }]);
        return;
      }
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        text: 'Configure your caption style below, then click "Add Captions" to start.',
      }]);
      setShowCaptionOptions(true);
      return;
    }

    // Auto-GIF
    if (workflow === 'auto-gif') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then extract keywords and add relevant GIFs.',
        }]);
        return;
      }
      await handleAutoGifWorkflow();
      return;
    }

    // B-roll
    if (workflow === 'b-roll') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then generate AI B-roll images.',
        }]);
        return;
      }
      await handleBrollWorkflow();
      return;
    }

    // Dead air removal
    if (workflow === 'dead-air') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then detect and remove silent periods.',
        }]);
        return;
      }
      await handleDeadAirWorkflow();
      return;
    }

    // Chapter cuts
    if (workflow === 'chapter-cuts') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then identify chapters and make cuts.',
        }]);
        return;
      }
      await handleChapterCutWorkflow();
      return;
    }

    // Transcript animation (kinetic typography)
    if (workflow === 'transcript-animation') {
      if (!hasVideo) {
        setChatHistory(prev => [...prev, {
          type: 'assistant',
          text: 'Please upload a video first. I\'ll then create animated text from speech.',
        }]);
        return;
      }
      await handleTranscriptAnimationWorkflow();
      return;
    }

    // Contextual animation (based on video content at specific time)
    if (workflow === 'contextual-animation') {
      const contextualCheck = isContextualAnimationPrompt(userMessage);
      if (contextualCheck.isMatch) {
        await handleContextualAnimationWorkflow(contextualCheck.type, userMessage);
        return;
      }
      // Fall through to create-animation if contextual check didn't match
      await handleCustomAnimationWorkflow(userMessage, savedTimeRange?.start, savedTimeRange?.end);
      return;
    }

    // Create new animation (Remotion)
    if (workflow === 'create-animation') {
      await handleCustomAnimationWorkflow(userMessage, savedTimeRange?.start, savedTimeRange?.end);
      return;
    }

    // Motion graphics templates
    if (workflow === 'motion-graphics') {
      await handleMotionGraphicsWorkflow(userMessage, savedTimeRange?.start);
      return;
    }

    // FFmpeg video edit (default for video manipulation)
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
    <div
      className={`h-full bg-zinc-900/80 border-l border-zinc-800/50 flex flex-col backdrop-blur-sm transition-colors relative ${
        isDragOverChat ? 'ring-2 ring-inset ring-purple-500/50 bg-purple-500/5' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay indicator */}
      {isDragOverChat && (
        <div className="absolute inset-0 flex items-center justify-center bg-purple-500/10 z-50 pointer-events-none">
          <div className="px-4 py-3 bg-purple-500/20 border border-purple-500/40 rounded-xl">
            <p className="text-sm text-purple-300 font-medium">Drop image to attach</p>
          </div>
        </div>
      )}
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


      {/* Edit animation mode indicator */}
      {activeTabId !== 'main' && editTabAssetId && (
        <div className="p-3 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-blue-400" />
            <div className="flex-1">
              <p className="text-xs text-blue-300 font-medium">
                {editTabV1Context?.aiGenerated ? 'Remotion Animation Edit Mode' : 'Edit Mode'}
              </p>
              <p className="text-[10px] text-blue-400/70">
                {editTabV1Context?.aiGenerated
                  ? 'All edits will use Remotion. Use + to add assets from library.'
                  : 'Prompts will modify this clip. Use + to add assets from library.'}
              </p>
              {/* Show V1 context if detected */}
              {editTabV1Context && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] text-blue-400/50">V1:</span>
                  <span className="px-1.5 py-0.5 bg-blue-500/20 rounded text-[10px] text-blue-300 truncate max-w-[150px]">
                    {editTabV1Context.filename}
                  </span>
                  {editTabV1Context.aiGenerated && (
                    <span className="px-1.5 py-0.5 bg-purple-500/20 rounded text-[10px] text-purple-300">
                      Remotion
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

                    {/* Success indicator for GIF/Caption/B-roll/Dead air/Animation edit workflow */}
                    {message.applied && !message.command && !message.animationAssetId && (
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-500/20 rounded-lg text-xs font-medium text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        {message.isCaptionWorkflow ? 'Captions added to timeline' :
                         message.isBrollWorkflow ? 'B-roll images added to V3 track' :
                         message.isDeadAirWorkflow ? 'Dead air removed from timeline' :
                         message.isInPlaceEdit ? 'Edit added to animation' :
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
        {/* Scroll anchor */}
        <div ref={chatEndRef} />
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

        {/* Selected References, Time Range, and Attached Assets Tags */}
        {(selectedReferences.length > 0 || timeRange || attachedAssets.length > 0) && (
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
            {/* Attached Assets Tags */}
            {attachedAssets.map((asset, idx) => (
              <div
                key={asset.id}
                className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-xs"
              >
                {asset.type === 'image' ? <Image className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                <span className="truncate max-w-[100px]">{asset.filename}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="ml-0.5 hover:text-purple-100"
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
                  title="Add asset from library"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Reference Picker Popover - Assets Only */}
                {showReferencePicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="text-xs font-medium text-zinc-400 px-2 py-1 mb-1">Select Asset</div>

                    {/* Assets list */}
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {assets.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-zinc-500">
                          No assets in library
                        </div>
                      ) : (
                        assets.map(asset => {
                          // Create a friendly display name
                          const displayName = asset.aiGenerated
                            ? asset.filename.replace(/^picasso-/, '').replace(/\.[^/.]+$/, '').replace(/-/g, ' ')
                            : asset.filename.replace(/\.[^/.]+$/, '');
                          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(displayName);
                          const friendlyName = isUUID
                            ? `${asset.aiGenerated ? 'AI ' : ''}${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)}`
                            : displayName.length > 25 ? displayName.substring(0, 25) + '...' : displayName;

                          return (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => {
                                addReference({
                                  type: 'clip',
                                  id: asset.id,
                                  label: asset.filename,
                                  details: asset.type,
                                });
                                setShowReferencePicker(false);
                              }}
                              className="w-full flex items-center gap-3 px-2 py-2 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
                            >
                              {/* Thumbnail or icon placeholder */}
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-700 flex-shrink-0 flex items-center justify-center">
                                {asset.thumbnailUrl ? (
                                  <img
                                    src={`http://localhost:3333${asset.thumbnailUrl}`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                    }}
                                  />
                                ) : null}
                                <div className={asset.thumbnailUrl ? 'hidden' : ''}>
                                  {asset.type === 'audio' ? (
                                    <Music className="w-5 h-5 text-emerald-400" />
                                  ) : asset.type === 'image' ? (
                                    <Image className="w-5 h-5 text-purple-400" />
                                  ) : (
                                    <Film className="w-5 h-5 text-blue-400" />
                                  )}
                                </div>
                              </div>

                              {/* Text info */}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-zinc-200 truncate font-medium">{friendlyName}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    asset.type === 'video' ? 'bg-blue-500/20 text-blue-300' :
                                    asset.type === 'image' ? 'bg-purple-500/20 text-purple-300' :
                                    'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    {asset.type}
                                  </span>
                                  {asset.aiGenerated && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">
                                      AI
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* File Attachment Button for Animations */}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleFileAttachment}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!hasVideo || isProcessing || isUploadingAttachment || !onUploadAttachment}
                  className={`p-1.5 rounded-md transition-all ${
                    attachedAssets.length > 0
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 disabled:opacity-50'
                  }`}
                  title={attachedAssets.length > 0 ? `${attachedAssets.length} file(s) attached` : 'Attach images/videos for animation'}
                >
                  {isUploadingAttachment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4" />
                  )}
                </button>
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
