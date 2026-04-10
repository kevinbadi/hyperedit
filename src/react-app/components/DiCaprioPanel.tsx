import { useState, useRef, useEffect } from 'react';
import { Film, Send, Loader2, Video, X, Zap, Plus, Play, Wand2, Eraser, Image as ImageIcon } from 'lucide-react';

type DiCaprioSkill = 'animate' | 'restyle' | 'remove-bg';

interface AttachedAsset {
  id: string;
  filename: string;
  type: 'image' | 'video' | 'audio';
  thumbnailUrl?: string | null;
  duration?: number;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  text: string;
  video?: {
    id: string;
    filename: string;
    thumbnailUrl: string;
    streamUrl: string;
    duration: number;
  };
  error?: string;
  // For source selection flow
  awaitingImageSelection?: boolean;
  awaitingVideoSelection?: boolean;
  pendingPrompt?: string;
  pendingSkill?: DiCaprioSkill;
}

interface DiCaprioPanelProps {
  sessionId: string | null;
  assets: Array<{
    id: string;
    filename: string;
    type: string;
    thumbnailUrl?: string | null;
    duration?: number;
    aiGenerated?: boolean;
  }>;
  onVideoGenerated?: (assetId: string) => void;
  onRefreshAssets?: () => void;
}

const SKILLS = [
  { id: 'animate' as DiCaprioSkill, label: 'Animate', icon: Play, description: 'Image → Video', requiresType: 'image' },
  { id: 'restyle' as DiCaprioSkill, label: 'Restyle', icon: Wand2, description: 'Transform style', requiresType: 'video' },
  { id: 'remove-bg' as DiCaprioSkill, label: 'Remove BG', icon: Eraser, description: 'Remove background', requiresType: 'video' },
];

const QUICK_ACTIONS = [
  { icon: Play, text: 'Animate with slow zoom' },
  { icon: Wand2, text: 'Apply cinematic film style' },
  { icon: Eraser, text: 'Remove video background' },
  { icon: Film, text: 'Add camera movement' },
];

export default function DiCaprioPanel({
  sessionId,
  assets,
  onVideoGenerated,
  onRefreshAssets,
}: DiCaprioPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [duration] = useState('5');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [attachedAsset, setAttachedAsset] = useState<AttachedAsset | null>(null);
  const [activeSkill, setActiveSkill] = useState<DiCaprioSkill | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const assetPickerRef = useRef<HTMLDivElement>(null);

  // Get available assets by type
  const imageAssets = assets.filter(a => a.type === 'image');
  const videoAssets = assets.filter(a => a.type === 'video');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setShowQuickActions(false);
      }
      if (assetPickerRef.current && !assetPickerRef.current.contains(e.target as Node)) {
        setShowAssetPicker(false);
      }
    };
    if (showQuickActions || showAssetPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickActions, showAssetPicker]);

  // Attach an asset
  const attachAsset = (asset: typeof assets[0]) => {
    setAttachedAsset({
      id: asset.id,
      filename: asset.filename,
      type: asset.type as 'image' | 'video' | 'audio',
      thumbnailUrl: asset.thumbnailUrl,
      duration: asset.duration,
    });
    setShowAssetPicker(false);

    // Auto-select appropriate skill based on asset type
    if (asset.type === 'image' && !activeSkill) {
      setActiveSkill('animate');
    } else if (asset.type === 'video' && !activeSkill) {
      setActiveSkill('restyle');
    }
  };

  // Clear attached asset
  const clearAttachment = () => {
    setAttachedAsset(null);
    setActiveSkill(null);
  };

  // Get friendly asset name
  const getFriendlyName = (asset: typeof assets[0]) => {
    const displayName = asset.aiGenerated
      ? asset.filename.replace(/^(picasso|dicaprio)-/, '').replace(/\.[^/.]+$/, '').replace(/-/g, ' ')
      : asset.filename.replace(/\.[^/.]+$/, '');
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(displayName);
    return isUUID
      ? `${asset.aiGenerated ? 'AI ' : ''}${asset.type.charAt(0).toUpperCase() + asset.type.slice(1)}`
      : displayName.length > 20 ? displayName.substring(0, 20) + '...' : displayName;
  };

  // Detect skill from user message
  const detectSkill = (text: string): DiCaprioSkill | null => {
    const lower = text.toLowerCase();

    if (lower.includes('remove background') || lower.includes('remove bg') ||
        lower.includes('green screen') || lower.includes('isolate') ||
        lower.includes('cut out') || lower.includes('background removal')) {
      return 'remove-bg';
    }

    if (lower.includes('restyle') || lower.includes('style transfer') ||
        lower.includes('make it') || lower.includes('turn into') ||
        lower.includes('convert to') || lower.includes('anime') ||
        lower.includes('cartoon') || lower.includes('film grain') ||
        lower.includes('black and white') || lower.includes('vintage') ||
        lower.includes('cinematic') || lower.includes('transform')) {
      return 'restyle';
    }

    if (lower.includes('animate') || lower.includes('bring to life') ||
        lower.includes('add motion') || lower.includes('make it move') ||
        lower.includes('zoom') || lower.includes('pan') ||
        lower.includes('camera movement')) {
      return 'animate';
    }

    return null;
  };

  // Generate video from image (Kling)
  const generateFromImage = async (videoPrompt: string, imageId: string) => {
    setIsGenerating(true);

    try {
      const response = await fetch(`http://localhost:3333/session/${sessionId}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          imageAssetId: imageId,
          duration: parseInt(duration),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to generate video');

      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Your animated video is ready!`,
        video: data.video,
      }]);

      onRefreshAssets?.();
      if (data.video?.id) onVideoGenerated?.(data.video.id);
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      }]);
    } finally {
      setIsGenerating(false);
      clearAttachment();
    }
  };

  // Restyle video (LTX-2)
  const restyleVideo = async (stylePrompt: string, videoId: string) => {
    setIsGenerating(true);

    try {
      const response = await fetch(`http://localhost:3333/session/${sessionId}/restyle-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: stylePrompt,
          videoAssetId: videoId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to restyle video');

      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Your restyled video is ready!`,
        video: data.video,
      }]);

      onRefreshAssets?.();
      if (data.video?.id) onVideoGenerated?.(data.video.id);
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      }]);
    } finally {
      setIsGenerating(false);
      clearAttachment();
    }
  };

  // Remove video background (Bria)
  const removeBackground = async (videoId: string) => {
    setIsGenerating(true);

    try {
      const response = await fetch(`http://localhost:3333/session/${sessionId}/remove-video-bg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoAssetId: videoId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to remove background');

      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Background removed! Your video now has a transparent background.`,
        video: data.video,
      }]);

      onRefreshAssets?.();
      if (data.video?.id) onVideoGenerated?.(data.video.id);
    } catch (error) {
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      }]);
    } finally {
      setIsGenerating(false);
      clearAttachment();
    }
  };

  // Handle asset selection from picker in message
  const handleAssetSelectFromMessage = (assetId: string, skill: DiCaprioSkill, prompt?: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    setMessages(prev => prev.map(m =>
      (m.awaitingImageSelection || m.awaitingVideoSelection)
        ? { ...m, awaitingImageSelection: false, awaitingVideoSelection: false, text: `Processing "${asset.filename}"...` }
        : m
    ));

    if (skill === 'animate') {
      generateFromImage(prompt || 'cinematic camera movement', assetId);
    } else if (skill === 'restyle') {
      restyleVideo(prompt || 'cinematic film style', assetId);
    } else if (skill === 'remove-bg') {
      removeBackground(assetId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating || !sessionId) return;

    const userMessage = prompt.trim();
    setPrompt('');
    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);

    // If we have an attached asset, execute the appropriate action
    if (attachedAsset) {
      if (attachedAsset.type === 'image') {
        await generateFromImage(userMessage, attachedAsset.id);
      } else if (attachedAsset.type === 'video') {
        const detectedSkill = detectSkill(userMessage);
        if (detectedSkill === 'remove-bg') {
          await removeBackground(attachedAsset.id);
        } else {
          await restyleVideo(userMessage, attachedAsset.id);
        }
      }
      return;
    }

    // No attached asset - try to detect skill and find asset
    const detectedSkill = detectSkill(userMessage);

    if (detectedSkill === 'animate') {
      if (imageAssets.length === 0) {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: "I need an image to animate! Use the + button to attach one.",
        }]);
        return;
      }
      if (imageAssets.length === 1) {
        await generateFromImage(userMessage, imageAssets[0].id);
      } else {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'Which image would you like to animate?',
          awaitingImageSelection: true,
          pendingPrompt: userMessage,
          pendingSkill: 'animate',
        }]);
      }
    } else if (detectedSkill === 'restyle') {
      if (videoAssets.length === 0) {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: "I need a video to restyle! Use the + button to attach one.",
        }]);
        return;
      }
      if (videoAssets.length === 1) {
        await restyleVideo(userMessage, videoAssets[0].id);
      } else {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'Which video would you like to restyle?',
          awaitingVideoSelection: true,
          pendingPrompt: userMessage,
          pendingSkill: 'restyle',
        }]);
      }
    } else if (detectedSkill === 'remove-bg') {
      if (videoAssets.length === 0) {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: "I need a video to remove the background from! Use the + button to attach one.",
        }]);
        return;
      }
      if (videoAssets.length === 1) {
        await removeBackground(videoAssets[0].id);
      } else {
        setMessages(prev => [...prev, {
          type: 'assistant',
          text: 'Which video would you like to remove the background from?',
          awaitingVideoSelection: true,
          pendingSkill: 'remove-bg',
        }]);
      }
    } else {
      // Couldn't detect skill
      setMessages(prev => [...prev, {
        type: 'assistant',
        text: "Use the + button to attach an image or video, then describe what you want!",
      }]);
    }
  };

  // Get placeholder based on context
  const getPlaceholder = () => {
    if (attachedAsset) {
      if (attachedAsset.type === 'image') {
        return "Describe the motion (e.g., 'slow zoom in')...";
      }
      return "Describe the style (e.g., 'anime', 'film noir')...";
    }
    return "Describe your video edit...";
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-zinc-400 to-slate-500 rounded-lg flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <h2 className="font-semibold">DiCaprio</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Transform images and videos with AI
        </p>
      </div>

      {/* Processing overlay */}
      {isGenerating && (
        <div className="p-4 bg-zinc-500/10 border-b border-zinc-500/20">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-zinc-300 animate-spin" />
            <div className="flex-1">
              <p className="text-sm text-zinc-200 font-medium">
                Processing... This may take 1-2 minutes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chat history */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-8">
            {sessionId
              ? "No videos yet. Use Quick Actions below to get started!"
              : 'Upload a video first to start'}
          </div>
        ) : (
          messages.map((message, idx) => (
            <div key={idx} className="space-y-2">
              {message.type === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-zinc-500 to-slate-500 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-white">{message.text}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`bg-zinc-800 rounded-lg p-3 space-y-2 ${message.error ? 'border border-red-500/30' : ''}`}>
                    <p className={`text-sm whitespace-pre-wrap ${message.error ? 'text-red-200' : 'text-zinc-200'}`}>{message.text}</p>

                    {/* Image Selection */}
                    {message.awaitingImageSelection && imageAssets.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-3 max-h-48 overflow-y-auto">
                        {imageAssets.map((img) => (
                          <button
                            key={img.id}
                            onClick={() => handleAssetSelectFromMessage(img.id, message.pendingSkill || 'animate', message.pendingPrompt)}
                            disabled={isGenerating}
                            className="flex flex-col items-center gap-1 p-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            {img.thumbnailUrl ? (
                              <img
                                src={img.thumbnailUrl}
                                alt={img.filename}
                                className="w-full aspect-video object-cover rounded"
                              />
                            ) : (
                              <div className="w-full aspect-video bg-zinc-800 rounded flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-zinc-600" />
                              </div>
                            )}
                            <span className="text-xs text-zinc-300 truncate w-full text-center">
                              {getFriendlyName(img)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Video Selection */}
                    {message.awaitingVideoSelection && videoAssets.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-3 max-h-48 overflow-y-auto">
                        {videoAssets.map((vid) => (
                          <button
                            key={vid.id}
                            onClick={() => handleAssetSelectFromMessage(vid.id, message.pendingSkill || 'restyle', message.pendingPrompt)}
                            disabled={isGenerating}
                            className="flex flex-col items-center gap-1 p-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            {vid.thumbnailUrl ? (
                              <img
                                src={vid.thumbnailUrl}
                                alt={vid.filename}
                                className="w-full aspect-video object-cover rounded"
                              />
                            ) : (
                              <div className="w-full aspect-video bg-zinc-800 rounded flex items-center justify-center">
                                <Video className="w-6 h-6 text-zinc-600" />
                              </div>
                            )}
                            <span className="text-xs text-zinc-300 truncate w-full text-center">
                              {getFriendlyName(vid)}
                            </span>
                            {vid.duration && (
                              <span className="text-[10px] text-zinc-500">{vid.duration.toFixed(1)}s</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Generated Video */}
                    {message.video && (
                      <div className="mt-3">
                        <div className="relative rounded-lg overflow-hidden bg-zinc-900">
                          <video
                            src={`http://localhost:3333${message.video.streamUrl}`}
                            controls
                            className="w-full h-auto"
                            poster={message.video.thumbnailUrl ? `http://localhost:3333${message.video.thumbnailUrl}` : undefined}
                          />
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 backdrop-blur-sm pointer-events-none">
                            <p className="text-xs text-zinc-300 truncate">{message.video.filename}</p>
                            <p className="text-xs text-zinc-500">{message.video.duration?.toFixed(1)}s</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800/50">
        {/* Skill Buttons */}
        <div className="flex gap-2 mb-3">
          {SKILLS.map((skill) => {
            const Icon = skill.icon;
            const isActive = activeSkill === skill.id;
            const isDisabled = !!(attachedAsset && (
              (skill.requiresType === 'image' && attachedAsset.type !== 'image') ||
              (skill.requiresType === 'video' && attachedAsset.type !== 'video')
            ));
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => {
                  if (isDisabled) return;
                  setActiveSkill(activeSkill === skill.id ? null : skill.id);
                }}
                disabled={isGenerating || isDisabled}
                className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-zinc-500 text-white'
                    : isDisabled
                    ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                } disabled:opacity-50`}
                title={skill.description}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{skill.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Actions Popover */}
        <div className="relative mb-3" ref={quickActionsRef}>
          <button
            type="button"
            onClick={() => setShowQuickActions(!showQuickActions)}
            disabled={!sessionId || isGenerating}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              showQuickActions
                ? 'bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-400/50'
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
                {QUICK_ACTIONS.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPrompt(action.text);
                      setShowQuickActions(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2.5 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-xs text-left transition-colors group"
                  >
                    <action.icon className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 transition-colors flex-shrink-0" />
                    <span className="text-zinc-300 leading-tight">{action.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Attached Asset Tag */}
        {attachedAsset && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            <div className="flex items-center gap-1 px-2 py-1 bg-zinc-500/20 text-zinc-300 rounded-md text-xs">
              {attachedAsset.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <Video className="w-3 h-3" />}
              <span className="truncate max-w-[150px]">{attachedAsset.filename}</span>
              <button
                type="button"
                onClick={clearAttachment}
                className="ml-0.5 hover:text-zinc-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Unified Input Container */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700/50 focus-within:ring-2 focus-within:ring-zinc-400/50 transition-all">
          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={sessionId ? getPlaceholder() : "Upload a video first..."}
            className="w-full px-3 pt-3 pb-2 bg-transparent text-sm resize-none focus:outline-none placeholder:text-zinc-500"
            rows={2}
            disabled={isGenerating || !sessionId}
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
              {/* Asset Picker Button */}
              <div className="relative" ref={assetPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowAssetPicker(!showAssetPicker)}
                  disabled={isGenerating || !sessionId}
                  className={`p-1.5 rounded-md transition-all ${
                    showAssetPicker || attachedAsset
                      ? 'bg-zinc-500/20 text-zinc-300'
                      : 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 disabled:opacity-50'
                  }`}
                  title="Attach asset"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {/* Asset Picker Popover */}
                {showAssetPicker && (
                  <div className="absolute bottom-full left-0 mb-2 w-72 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="text-xs font-medium text-zinc-400 px-2 py-1 mb-1">Select Asset</div>
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {assets.length === 0 ? (
                        <div className="px-2 py-4 text-center text-xs text-zinc-500">
                          No assets in library
                        </div>
                      ) : (
                        assets.filter(a => a.type === 'image' || a.type === 'video').map(asset => (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => attachAsset(asset)}
                            className="w-full flex items-center gap-3 px-2 py-2 hover:bg-zinc-700 rounded-lg text-left transition-colors group"
                          >
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-700 flex-shrink-0 flex items-center justify-center">
                              {asset.thumbnailUrl ? (
                                <img
                                  src={asset.thumbnailUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : asset.type === 'image' ? (
                                <ImageIcon className="w-5 h-5 text-zinc-500" />
                              ) : (
                                <Video className="w-5 h-5 text-zinc-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-zinc-200 truncate font-medium">{getFriendlyName(asset)}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  asset.type === 'video' ? 'bg-zinc-500/20 text-zinc-300' : 'bg-zinc-500/20 text-zinc-300'
                                }`}>
                                  {asset.type}
                                </span>
                                {asset.aiGenerated && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-300">AI</span>
                                )}
                                {asset.duration && (
                                  <span className="text-[10px] text-zinc-500">{asset.duration.toFixed(1)}s</span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
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
              disabled={!prompt.trim() || isGenerating || !sessionId}
              className="w-8 h-8 bg-gradient-to-r from-zinc-500 to-slate-500 disabled:from-zinc-700 disabled:to-zinc-700 rounded-lg flex items-center justify-center transition-all hover:shadow-lg hover:shadow-zinc-500/50 disabled:shadow-none"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
