import { useState, useRef, useEffect } from 'react';
import { Database, Send, Loader2, Plus, Check, Clock, Tag, Film } from 'lucide-react';

interface ObsidianResult {
  videoId: number;
  dropboxId: string;
  dropboxLink: string;
  fileName: string;
  contentType: string;
  treatmentAreas: string[];
  influencerMentions: string[];
  gender: string;
  location: string;
  tone: string;
  summary: string;
  duration: number;
  confidence: number;
  score: number;
  thumbnailSlug: string;
  hasLocalThumbnail: boolean;
  thumbnailUrl: string | null;
}

interface ChatMessage {
  type: 'user' | 'assistant';
  text: string;
  results?: ObsidianResult[];
  error?: string;
}

interface ObsidianPanelProps {
  ensureSession: () => Promise<string>;
  onRefreshAssets?: () => void;
}

export default function ObsidianPanel({
  ensureSession,
  onRefreshAssets,
}: ObsidianPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [importingIds, setImportingIds] = useState<Set<number>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '–';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSearching) return;

    const query = prompt.trim();
    setPrompt('');
    setMessages((prev) => [...prev, { type: 'user', text: query }]);
    setIsSearching(true);

    try {
      const activeSessionId = await ensureSession();
      const response = await fetch(`http://localhost:3333/session/${activeSessionId}/obsidian/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 8 }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      const results: ObsidianResult[] = data.results || [];

      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          text:
            results.length === 0
              ? "I couldn't find anything in the CPI vault that matches. Try different keywords."
              : `Found ${results.length} match${results.length === 1 ? '' : 'es'}. Click Import to pull any of these into your editor.`,
          results,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImport = async (videoId: number) => {
    if (importingIds.has(videoId)) return;

    setImportingIds((prev) => new Set(prev).add(videoId));

    try {
      const activeSessionId = await ensureSession();
      const response = await fetch(`http://localhost:3333/session/${activeSessionId}/obsidian/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: [videoId] }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      if (data.imported?.length > 0) {
        setImportedIds((prev) => new Set(prev).add(videoId));
        onRefreshAssets?.();
      } else if (data.failed?.length > 0) {
        throw new Error(data.failed[0].error || 'Import failed');
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          text: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ]);
    } finally {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(videoId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/80">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-zinc-300 via-zinc-400 to-zinc-600 rounded-lg flex items-center justify-center shadow-[0_0_12px_rgba(57,255,20,0.25)] ring-1 ring-[#39FF14]/40">
            <Database className="w-4 h-4 text-[#39FF14]" />
          </div>
          <h2 className="font-semibold bg-gradient-to-r from-zinc-200 to-zinc-400 bg-clip-text text-transparent">Obsidian</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Search the CPI knowledge vault and import videos from Dropbox
        </p>
      </div>

      {/* Searching overlay */}
      {isSearching && (
        <div className="p-4 bg-[#39FF14]/5 border-b border-[#39FF14]/20">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-[#39FF14] animate-spin" />
            <p className="text-sm text-zinc-200 font-medium">Searching the vault...</p>
          </div>
        </div>
      )}

      {/* Chat history */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-8 px-4">
            <Database className="w-8 h-8 mx-auto mb-3 text-zinc-600" />
            <p className="mb-1">Ask Obsidian to find videos.</p>
            <p className="text-xs text-zinc-600">
              Try: "MRI scans of knees", "red light therapy facial", "shoulder treatment b-roll"
            </p>
          </div>
        ) : (
          messages.map((message, idx) => (
            <div key={idx} className="space-y-2">
              {message.type === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-gradient-to-r from-zinc-300 via-zinc-400 to-zinc-500 rounded-lg px-3 py-2 max-w-[85%] shadow-[0_0_8px_rgba(57,255,20,0.2)] ring-1 ring-[#39FF14]/30">
                    <p className="text-sm text-zinc-900 font-medium">{message.text}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`bg-zinc-800 rounded-lg p-3 space-y-2 ${
                      message.error ? 'border border-red-500/30' : ''
                    }`}
                  >
                    <p
                      className={`text-sm whitespace-pre-wrap ${
                        message.error ? 'text-red-200' : 'text-zinc-200'
                      }`}
                    >
                      {message.text}
                    </p>
                  </div>

                  {/* Result cards */}
                  {message.results && message.results.length > 0 && (
                    <div className="space-y-2">
                      {message.results.map((r) => {
                        const isImporting = importingIds.has(r.videoId);
                        const isImported = importedIds.has(r.videoId);
                        return (
                          <div
                            key={r.videoId}
                            className="bg-zinc-800/70 border border-zinc-700/50 rounded-lg overflow-hidden flex gap-3 p-2 hover:border-[#39FF14]/50 hover:shadow-[0_0_10px_rgba(57,255,20,0.15)] transition-all"
                          >
                            {/* Thumbnail */}
                            <div className="flex-shrink-0 w-24 h-16 bg-zinc-900 rounded overflow-hidden flex items-center justify-center">
                              {r.thumbnailUrl ? (
                                <img
                                  src={`http://localhost:3333${r.thumbnailUrl}`}
                                  alt={r.fileName}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <Film className="w-6 h-6 text-zinc-600" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between gap-1">
                              <div>
                                <p className="text-xs text-zinc-100 line-clamp-2 leading-snug">
                                  {r.summary || r.fileName}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-500">
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" />
                                    {formatDuration(r.duration)}
                                  </span>
                                  {r.contentType && (
                                    <span className="flex items-center gap-0.5">
                                      <Tag className="w-2.5 h-2.5" />
                                      {r.contentType}
                                    </span>
                                  )}
                                  {r.treatmentAreas && r.treatmentAreas.length > 0 && (
                                    <span className="truncate">
                                      {r.treatmentAreas.slice(0, 2).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => handleImport(r.videoId)}
                                disabled={isImporting || isImported}
                                className={`self-start flex items-center gap-1 text-xs px-2 py-1 rounded transition-all ${
                                  isImported
                                    ? 'bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14]/40 cursor-default'
                                    : isImporting
                                    ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                                    : 'bg-zinc-700/60 text-zinc-200 border border-zinc-600 hover:bg-[#39FF14]/15 hover:text-[#39FF14] hover:border-[#39FF14]/50 hover:shadow-[0_0_8px_rgba(57,255,20,0.35)]'
                                }`}
                              >
                                {isImported ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    Imported
                                  </>
                                ) : isImporting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Downloading...
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    Import
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800/50">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Find videos in the CPI vault..."
            disabled={isSearching}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/40 focus:border-[#39FF14]/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSearching || !prompt.trim()}
            className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-zinc-200 via-zinc-400 to-zinc-600 rounded-lg text-zinc-900 ring-1 ring-[#39FF14]/40 hover:ring-[#39FF14]/80 hover:shadow-[0_0_14px_rgba(57,255,20,0.5)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
