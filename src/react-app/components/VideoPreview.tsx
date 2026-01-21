import { Play, Image as ImageIcon, Layers } from 'lucide-react';
import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';

interface ClipLayer {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio';
  trackId: string;
  clipTime: number; // Time within the clip to seek to
  transform?: {
    x?: number;
    y?: number;
    scale?: number;
    opacity?: number;
  };
}

interface VideoPreviewProps {
  // Legacy single-asset mode
  videoUrl?: string;
  mediaType?: 'video' | 'image' | 'audio';
  clipTime?: number;
  // New multi-layer mode
  layers?: ClipLayer[];
  isPlaying?: boolean;
  onTimeUpdate?: (time: number) => void;
}

export interface VideoPreviewHandle {
  seekTo: (time: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
}

const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(({
  videoUrl,
  mediaType = 'video',
  clipTime = 0,
  layers = [],
  isPlaying = false,
  onTimeUpdate
}, ref) => {
  const [hasError, setHasError] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const lastSeekTime = useRef<number>(0);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if we're in multi-layer mode
  const isMultiLayerMode = layers.length > 0;

  // Get layers sorted by track (V1 first, then V2, V3, etc.)
  const sortedLayers = useMemo(() =>
    [...layers].sort((a, b) => {
      const orderA = a.trackId === 'V1' ? 0 : a.trackId === 'V2' ? 1 : 2;
      const orderB = b.trackId === 'V1' ? 0 : b.trackId === 'V2' ? 1 : 2;
      return orderA - orderB;
    }), [layers]);

  // Base layer is V1, overlays are V2+
  const baseLayer = sortedLayers.find(l => l.trackId === 'V1');
  const overlayLayers = sortedLayers.filter(l => l.trackId !== 'V1');

  // For legacy single-asset mode
  const effectiveUrl = isMultiLayerMode ? baseLayer?.url : videoUrl;
  const effectiveType = isMultiLayerMode ? (baseLayer?.type || 'video') : mediaType;
  const effectiveClipTime = isMultiLayerMode ? (baseLayer?.clipTime || 0) : clipTime;

  // Track the current video URL to detect actual source changes
  const currentUrlRef = useRef<string | null | undefined>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current && !videoRef.current.seeking) {
        videoRef.current.currentTime = time;
      }
    },
    getVideoElement: () => videoRef.current,
  }));

  // Reset error state when URL actually changes
  useEffect(() => {
    if (effectiveUrl !== currentUrlRef.current) {
      currentUrlRef.current = effectiveUrl;
      setHasError(false);
      setIsVideoReady(false);
    }
  }, [effectiveUrl]);

  // Handle play/pause for base video
  useEffect(() => {
    if (!videoRef.current || effectiveType !== 'video' || !isVideoReady) return;

    if (isPlaying) {
      videoRef.current.play().catch(err => {
        console.error('Failed to play video:', err);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, effectiveType, isVideoReady]);

  // Handle play/pause for overlay videos
  useEffect(() => {
    overlayVideoRefs.current.forEach((video, layerId) => {
      const layer = overlayLayers.find(l => l.id === layerId);
      if (!layer || layer.type !== 'video') return;

      if (isPlaying) {
        video.play().catch(err => {
          console.error('Failed to play overlay video:', err);
        });
      } else {
        video.pause();
      }
    });
  }, [isPlaying, overlayLayers]);

  // Sync base video position with timeline - debounced to prevent rapid seeking
  useEffect(() => {
    if (!videoRef.current || effectiveType !== 'video' || !isVideoReady) return;

    const video = videoRef.current;

    // Clear any pending seek
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    // Debounce seeks to prevent overwhelming the video element during clip dragging
    seekTimeoutRef.current = setTimeout(() => {
      if (!video || video.seeking) return;

      const timeDiff = Math.abs(video.currentTime - effectiveClipTime);

      if (!isPlaying) {
        // When paused, seek if time difference is significant
        if (timeDiff > 0.1) {
          video.currentTime = effectiveClipTime;
          lastSeekTime.current = effectiveClipTime;
        }
      } else {
        // When playing, only correct significant drift
        if (timeDiff > 0.5) {
          video.currentTime = effectiveClipTime;
          lastSeekTime.current = effectiveClipTime;
        }
      }
    }, 50); // 50ms debounce

    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [effectiveClipTime, effectiveType, isVideoReady, isPlaying]);

  // Sync overlay video positions
  useEffect(() => {
    overlayLayers.forEach(layer => {
      if (layer.type !== 'video') return;
      const video = overlayVideoRefs.current.get(layer.id);
      if (!video || video.seeking) return;

      const timeDiff = Math.abs(video.currentTime - layer.clipTime);
      if (!isPlaying) {
        if (timeDiff > 0.1) {
          video.currentTime = layer.clipTime;
        }
      } else {
        if (timeDiff > 0.5) {
          video.currentTime = layer.clipTime;
        }
      }
    });
  }, [overlayLayers, isPlaying]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      onTimeUpdate?.(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    setIsVideoReady(true);
    // Seek to initial clip time when video loads
    if (videoRef.current && effectiveClipTime > 0) {
      videoRef.current.currentTime = effectiveClipTime;
    }
  };

  // Render overlay layer
  const renderOverlay = (layer: ClipLayer) => {
    const transform = layer.transform || {};
    const scale = transform.scale || 1;
    const opacity = transform.opacity ?? 1;
    const x = transform.x ?? 0;
    const y = transform.y ?? 0;

    const style: React.CSSProperties = {
      position: 'absolute',
      opacity,
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
      // Position overlays in bottom-right corner by default for GIFs
      right: layer.type === 'image' ? '20px' : undefined,
      bottom: layer.type === 'image' ? '60px' : undefined,
      maxWidth: layer.type === 'image' ? '200px' : '100%',
      maxHeight: layer.type === 'image' ? '200px' : '100%',
      zIndex: layer.trackId === 'V2' ? 10 : 20,
    };

    if (layer.type === 'image') {
      return (
        <img
          key={layer.id}
          src={layer.url}
          alt="Overlay"
          style={style}
          className="rounded-lg shadow-lg"
          onError={() => console.error('Failed to load overlay image:', layer.url)}
        />
      );
    }

    if (layer.type === 'video') {
      return (
        <video
          key={layer.id}
          ref={(el) => {
            if (el) {
              overlayVideoRefs.current.set(layer.id, el);
            } else {
              overlayVideoRefs.current.delete(layer.id);
            }
          }}
          src={layer.url}
          style={{ ...style, objectFit: 'contain' }}
          className="rounded-lg shadow-lg"
          muted
          loop
          playsInline
          onLoadedMetadata={() => {
            const video = overlayVideoRefs.current.get(layer.id);
            if (video && layer.clipTime > 0) {
              video.currentTime = layer.clipTime;
            }
          }}
        />
      );
    }

    return null;
  };

  // No content to display
  if (!effectiveUrl && !isMultiLayerMode) {
    return (
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
        <div className="text-center text-zinc-600">
          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No media to display</p>
        </div>
      </div>
    );
  }

  // Image-only mode (no base video, just showing an image)
  if (effectiveType === 'image' && !overlayLayers.length) {
    return (
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
        <img
          src={effectiveUrl}
          alt="Preview"
          className="w-full h-full object-contain"
          onError={() => setHasError(true)}
        />
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center p-4">
              <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-2" />
              <p className="text-red-400 mb-2">Failed to load image</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
          <ImageIcon className="w-3 h-3" />
          <span>Image</span>
        </div>
      </div>
    );
  }

  // Main render with video base and overlays
  return (
    <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
      {/* Base layer - video or image on V1 */}
      {effectiveUrl && effectiveType === 'video' && (
        <video
          ref={videoRef}
          src={effectiveUrl}
          className="w-full h-full object-contain"
          controls={false}
          playsInline
          preload="auto"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onError={(e) => {
            console.error('Video load error:', e);
            setHasError(true);
          }}
          onSeeking={() => {
            // Video is seeking - this is normal during scrubbing
          }}
          onSeeked={() => {
            // Seek complete
          }}
        />
      )}

      {effectiveUrl && effectiveType === 'image' && (
        <img
          src={effectiveUrl}
          alt="Base layer"
          className="w-full h-full object-contain"
          onError={() => setHasError(true)}
        />
      )}

      {/* Overlay layers from V2+ */}
      {overlayLayers.map(renderOverlay)}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center p-4">
            <p className="text-red-400 mb-2">Failed to load media</p>
            <p className="text-xs text-zinc-500">Check that the file exists and is accessible</p>
          </div>
        </div>
      )}

      {/* Layer indicator */}
      {overlayLayers.length > 0 && (
        <div className="absolute top-3 left-3 flex items-center gap-1 text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
          <Layers className="w-3 h-3" />
          <span>{overlayLayers.length + 1} layers</span>
        </div>
      )}

      {/* Media type indicator */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 text-xs text-white/60 bg-black/50 px-2 py-1 rounded">
        {effectiveType === 'video' ? <Play className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
        <span>{effectiveType === 'video' ? 'Video' : 'Image'}</span>
      </div>
    </div>
  );
});

export default VideoPreview;
