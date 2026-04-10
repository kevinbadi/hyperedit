import { useState, useCallback, useEffect } from 'react';
import { Search, TrendingUp, Plus, X, Loader2 } from 'lucide-react';

interface GifResult {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  source: string;
}

interface GifSearchPanelProps {
  sessionId: string;
  onClose: () => void;
  onGifAdded: (asset: {
    id: string;
    filename: string;
    type: string;
    thumbnailUrl: string;
    streamUrl: string;
  }) => void;
}

const LOCAL_FFMPEG_URL = 'http://localhost:3333';

export default function GifSearchPanel({ sessionId, onClose, onGifAdded }: GifSearchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingGifId, setAddingGifId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'trending' | 'search'>('trending');

  // Load trending GIFs on mount
  useEffect(() => {
    loadTrending();
  }, [sessionId]);

  const loadTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${sessionId}/giphy/trending?limit=24`);
      if (!response.ok) throw new Error('Failed to load trending GIFs');
      const data = await response.json();
      setGifs(data.gifs);
      setMode('trending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GIFs');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      loadTrending();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${LOCAL_FFMPEG_URL}/session/${sessionId}/giphy/search?q=${encodeURIComponent(searchQuery)}&limit=24`
      );
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      setGifs(data.gifs);
      setMode('search');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId, searchQuery, loadTrending]);

  const handleAddGif = useCallback(async (gif: GifResult) => {
    setAddingGifId(gif.id);
    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${sessionId}/giphy/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gifUrl: gif.url, title: gif.title }),
      });

      if (!response.ok) throw new Error('Failed to add GIF');
      const data = await response.json();

      if (data.asset) {
        onGifAdded(data.asset);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add GIF');
    } finally {
      setAddingGifId(null);
    }
  }, [sessionId, onGifAdded]);

  // Popular meme search suggestions
  const suggestions = [
    'reaction', 'funny', 'meme', 'celebration', 'thinking',
    'mind blown', 'shocked', 'laughing', 'applause', 'crying'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">GIF Search</span>
            <span className="text-xs text-zinc-500">powered by GIPHY</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 border-b border-zinc-800">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for memes, reactions, GIFs..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={loadTrending}
              disabled={loading}
              className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-lg transition-colors flex items-center gap-1.5"
              title="Show trending"
            >
              <TrendingUp className="w-4 h-4" />
            </button>
          </form>

          {/* Quick suggestions */}
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  setSearchQuery(suggestion);
                  // Trigger search
                  setTimeout(() => {
                    const form = document.querySelector('form');
                    form?.dispatchEvent(new Event('submit', { bubbles: true }));
                  }, 0);
                }}
                className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 mb-2">{error}</p>
              {error.includes('GIPHY_API_KEY') && (
                <div className="text-zinc-400 text-sm">
                  <p className="mb-2">To enable GIF search:</p>
                  <ol className="text-left inline-block">
                    <li>1. Get a free API key at <a href="https://developers.giphy.com/" target="_blank" rel="noopener" className="text-zinc-400 hover:underline">developers.giphy.com</a></li>
                    <li>2. Add it to <code className="bg-zinc-800 px-1 rounded">.dev.vars</code>: <code className="bg-zinc-800 px-1 rounded">GIPHY_API_KEY=your_key</code></li>
                    <li>3. Restart the FFmpeg server</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Mode indicator */}
              <div className="flex items-center gap-2 mb-4">
                {mode === 'trending' ? (
                  <>
                    <TrendingUp className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">Trending Now</span>
                  </>
                ) : (
                  <span className="text-sm text-zinc-400">
                    Results for "{searchQuery}"
                  </span>
                )}
              </div>

              {/* GIF Grid */}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {gifs.map((gif) => (
                  <div
                    key={gif.id}
                    className="group relative aspect-video bg-zinc-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-zinc-500 transition-all"
                    onClick={() => handleAddGif(gif)}
                  >
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {addingGifId === gif.id ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Plus className="w-6 h-6 text-white" />
                          <span className="text-xs text-white font-medium">Add to Assets</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {gifs.length === 0 && !loading && (
                <div className="text-center text-zinc-500 py-12">
                  No GIFs found. Try a different search term.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Click any GIF to add it to your assets
          </span>
          <span className="text-xs text-zinc-500">
            Powered by <span className="font-bold">GIPHY</span>
          </span>
        </div>
      </div>
    </div>
  );
}
