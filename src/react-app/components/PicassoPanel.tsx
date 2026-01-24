import { useState, useRef, useEffect } from 'react';
import { Palette, Send, Loader2, ImageIcon, Sparkles, X } from 'lucide-react';

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

const ASPECT_RATIOS = [
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '9:16', label: '9:16 (Portrait)' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9 (Ultrawide)' },
];

export default function PicassoPanel({
  sessionId,
  onImageGenerated,
  onRefreshAssets,
}: PicassoPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      type: 'assistant',
      text: "Hi! I'm Picasso, your creative image generation assistant. Just describe what you want — even a simple idea like 'a cat on a windowsill' — and I'll enhance your prompt with professional lighting, composition, and style details to create stunning visuals. Try me!",
    },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [showSettings, setShowSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleSubmit = async () => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg">
            <Palette className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-100">Picasso</h3>
            <p className="text-xs text-zinc-500">Image Generation</p>
          </div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1.5 rounded-lg transition-colors ${
            showSettings ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-800/30">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-zinc-400">Aspect Ratio</label>
            <button
              onClick={() => setShowSettings(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-purple-500"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                message.type === 'user'
                  ? 'bg-purple-600 text-white'
                  : message.error
                  ? 'bg-red-500/20 text-red-200 border border-red-500/30'
                  : 'bg-zinc-800 text-zinc-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.text}</p>

              {/* Dimension Selection Buttons */}
              {message.awaitingDimension && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleDimensionSelect('horizontal')}
                    disabled={isGenerating}
                    className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-5 border-2 border-purple-400 rounded" />
                    <span className="text-xs text-zinc-300">Horizontal</span>
                  </button>
                  <button
                    onClick={() => handleDimensionSelect('vertical')}
                    disabled={isGenerating}
                    className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <div className="w-5 h-8 border-2 border-purple-400 rounded" />
                    <span className="text-xs text-zinc-300">Vertical</span>
                  </button>
                  <button
                    onClick={() => handleDimensionSelect('square')}
                    disabled={isGenerating}
                    className="flex-1 flex flex-col items-center gap-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <div className="w-6 h-6 border-2 border-purple-400 rounded" />
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
        ))}

        {/* Loading indicator */}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-100 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span className="text-sm text-zinc-400">Generating image...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-zinc-800/50">
        {!sessionId ? (
          <div className="text-center text-zinc-500 text-sm py-2">
            <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-50" />
            Upload a video to start generating images
          </div>
        ) : (
          <div className="relative">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the image you want to create..."
              className="w-full px-4 py-3 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-purple-500 transition-colors"
              rows={2}
              disabled={isGenerating}
            />
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className="absolute right-2 bottom-2 p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
