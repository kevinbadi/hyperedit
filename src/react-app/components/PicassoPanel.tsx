import { useState, useRef, useEffect } from 'react';
import { Palette, Send, Loader2, Sparkles, X, Zap, Image, Square, RectangleVertical } from 'lucide-react';

interface ChatMessage {
  type: 'user' | 'assistant';
  text: string;
  images?: Array<{
    id: string;
    filename: string;
    thumbnailUrl: string;
    streamUrl: string;
    width: number;
    height: number;
  }>;
  error?: string;
  // For dimension selection flow
  awaitingDimension?: boolean;
  pendingPrompt?: string;
}

interface PicassoPanelProps {
  sessionId: string | null;
  onImageGenerated?: (assetId: string) => void;
  onRefreshAssets?: () => void;
}

const QUICK_ACTIONS = [
  { icon: Image, text: 'Generate a landscape background' },
  { icon: Square, text: 'Create a square thumbnail' },
  { icon: RectangleVertical, text: 'Design a vertical poster' },
  { icon: Sparkles, text: 'Create an abstract pattern' },
];

export default function PicassoPanel({
  sessionId,
  onImageGenerated,
  onRefreshAssets,
}: PicassoPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio] = useState('16:9');
  const [showQuickActions, setShowQuickActions] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close quick actions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setShowQuickActions(false);
      }
    };
    if (showQuickActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showQuickActions]);

  // Check if prompt contains dimension/orientation keywords
  const hasDimensionKeywords = (text: string): boolean => {
    const lower = text.toLowerCase();
    const dimensionWords = [
      'square', 'horizontal', 'vertical', 'portrait', 'landscape',
      'wide', 'tall', 'widescreen', 'ultrawide', '16:9', '9:16', '1:1',
      '4:3', '3:2', '21:9', 'aspect ratio', 'dimensions'
    ];
    return dimensionWords.some(word => lower.includes(word));
  };

  // Map user choice to aspect ratio
  const getDimensionAspectRatio = (choice: 'horizontal' | 'vertical' | 'square'): string => {
    switch (choice) {
      case 'horizontal': return '16:9';
      case 'vertical': return '9:16';
      case 'square': return '1:1';
    }
  };

  // Generate image with given prompt and aspect ratio
  const generateImage = async (imagePrompt: string, ratio: string) => {
    setIsGenerating(true);

    try {
      const response = await fetch(`http://localhost:3333/session/${sessionId}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          aspectRatio: ratio,
          resolution: '1K',
          numImages: 1,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate image');
      }

      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          text: `Here's your generated image! It's been added to your asset library.`,
          images: data.images,
        },
      ]);

      // Notify parent to refresh assets
      onRefreshAssets?.();

      // Notify parent of the generated image
      if (data.images?.[0]?.id) {
        onImageGenerated?.(data.images[0].id);
      }
    } catch (error) {
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          text: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle dimension selection from buttons
  const handleDimensionSelect = (choice: 'horizontal' | 'vertical' | 'square') => {
    // Find the pending prompt from the last awaiting message
    const lastAwaitingMessage = [...messages].reverse().find(m => m.awaitingDimension);
    if (!lastAwaitingMessage?.pendingPrompt) return;

    const ratio = getDimensionAspectRatio(choice);

    // Update the awaiting message to show selection
    setMessages(prev => prev.map(m =>
      m.awaitingDimension
        ? { ...m, awaitingDimension: false, text: `Got it! Creating a ${choice} image...` }
        : m
    ));

    // Generate with selected ratio
    generateImage(lastAwaitingMessage.pendingPrompt, ratio);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating || !sessionId) return;

    const userMessage = prompt.trim();
    setPrompt('');
    setMessages(prev => [...prev, { type: 'user', text: userMessage }]);

    // Check if user specified dimensions
    if (!hasDimensionKeywords(userMessage)) {
      // Ask for dimensions
      setMessages(prev => [
        ...prev,
        {
          type: 'assistant',
          text: 'What dimensions would you like?',
          awaitingDimension: true,
          pendingPrompt: userMessage,
        },
      ]);
      return;
    }

    // Determine aspect ratio from keywords
    const lower = userMessage.toLowerCase();
    let detectedRatio = aspectRatio;
    if (lower.includes('square') || lower.includes('1:1')) {
      detectedRatio = '1:1';
    } else if (lower.includes('vertical') || lower.includes('portrait') || lower.includes('tall') || lower.includes('9:16')) {
      detectedRatio = '9:16';
    } else if (lower.includes('horizontal') || lower.includes('landscape') || lower.includes('wide') || lower.includes('16:9')) {
      detectedRatio = '16:9';
    } else if (lower.includes('ultrawide') || lower.includes('21:9')) {
      detectedRatio = '21:9';
    }

    // Generate directly
    await generateImage(userMessage, detectedRatio);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-zinc-400 to-zinc-300 rounded-lg flex items-center justify-center">
            <Palette className="w-4 h-4" />
          </div>
          <h2 className="font-semibold">Picasso</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Describe the image you want to create
        </p>
      </div>

      {/* Processing overlay */}
      {isGenerating && (
        <div className="p-4 bg-zinc-400/10 border-b border-zinc-400/20">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-zinc-300 animate-spin" />
            <div className="flex-1">
              <p className="text-sm text-zinc-200 font-medium">
                Generating image...
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
              ? "No images yet. Use Quick Actions below to get started!"
              : 'Upload a video first to start generating images'}
          </div>
        ) : (
          messages.map((message, idx) => (
            <div key={idx} className="space-y-2">
              {message.type === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-zinc-400 to-zinc-300 rounded-lg px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-white">{message.text}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className={`bg-zinc-800 rounded-lg p-3 space-y-2 ${message.error ? 'border border-red-500/30' : ''}`}>
                    <p className={`text-sm whitespace-pre-wrap ${message.error ? 'text-red-200' : 'text-zinc-200'}`}>{message.text}</p>

                    {/* Dimension Selection Buttons */}
                    {message.awaitingDimension && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleDimensionSelect('horizontal')}
                          disabled={isGenerating}
                          className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          <div className="w-8 h-5 border-2 border-zinc-300 rounded" />
                          <span className="text-xs text-zinc-300">Horizontal</span>
                        </button>
                        <button
                          onClick={() => handleDimensionSelect('vertical')}
                          disabled={isGenerating}
                          className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          <div className="w-5 h-8 border-2 border-zinc-300 rounded" />
                          <span className="text-xs text-zinc-300">Vertical</span>
                        </button>
                        <button
                          onClick={() => handleDimensionSelect('square')}
                          disabled={isGenerating}
                          className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          <div className="w-6 h-6 border-2 border-zinc-300 rounded" />
                          <span className="text-xs text-zinc-300">Square</span>
                        </button>
                      </div>
                    )}

                    {/* Generated Images */}
                    {message.images && message.images.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {message.images.map((image) => (
                          <div
                            key={image.id}
                            className="relative rounded-lg overflow-hidden bg-zinc-900"
                          >
                            <img
                              src={`http://localhost:3333${image.streamUrl}`}
                              alt={image.filename}
                              className="w-full h-auto"
                              loading="lazy"
                            />
                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 backdrop-blur-sm">
                              <p className="text-xs text-zinc-300 truncate">{image.filename}</p>
                              <p className="text-xs text-zinc-500">
                                {image.width} x {image.height}
                              </p>
                            </div>
                          </div>
                        ))}
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
        {/* Quick Actions Popover */}
        <div className="relative mb-3" ref={quickActionsRef}>
          <button
            type="button"
            onClick={() => setShowQuickActions(!showQuickActions)}
            disabled={!sessionId || isGenerating}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              showQuickActions
                ? 'bg-zinc-400/20 text-zinc-300 ring-1 ring-zinc-400/50'
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
                    <action.icon className="w-4 h-4 text-zinc-400 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
                    <span className="text-zinc-300 leading-tight">{action.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Unified Input Container */}
        <div className="bg-zinc-800 rounded-xl border border-zinc-700/50 focus-within:ring-2 focus-within:ring-zinc-400/50 transition-all">
          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={sessionId ? "Describe your image..." : "Upload a video first..."}
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
              <div className="w-px h-4 bg-zinc-700 mx-1" />
              <span className="text-[10px] text-zinc-500">Enter to send</span>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating || !sessionId}
              className="w-8 h-8 bg-gradient-to-r from-zinc-400 to-zinc-300 disabled:from-zinc-700 disabled:to-zinc-700 rounded-lg flex items-center justify-center transition-all hover:shadow-lg hover:shadow-zinc-400/50 disabled:shadow-none"
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
