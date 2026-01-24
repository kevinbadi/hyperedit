import { Play, Image as ImageIcon, Layers, Move } from 'lucide-react';
import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useState, useCallback } from 'react';
import CaptionRenderer from './CaptionRenderer';
import type { CaptionWord, CaptionStyle } from '@/react-app/hooks/useProject';

interface ClipTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  cropTop?: number;
  cropBottom?: number;
  cropLeft?: number;
  cropRight?: number;
}

interface ClipLayer {
  id: string;
  url: string;
  type: 'video' | 'image' | 'audio' | 'caption';
  trackId: string;
  clipTime: number;
  transform?: ClipTransform;
  // Caption-specific data
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
}

interface VideoPreviewProps {
  layers?: ClipLayer[];
  isPlaying?: boolean;
  aspectRatio?: '16:9' | '9:16';
  onLayerMove?: (layerId: string, x: number, y: number) => void;
  onLayerSelect?: (layerId: string) => void;
  selectedLayerId?: string | null;
}

export interface VideoPreviewHandle {
  seekTo: (time: number) => void;
  getVideoElement: () => HTMLVideoElement | null;
}

// Helper to build CSS styles from transform
function getTransformStyles(transform?: ClipTransform, zIndex: number = 0, isDragging?: boolean): React.CSSProperties {
  const t = transform || {};

  const transforms: string[] = [];

  // Position (translate)
  if (t.x || t.y) {
    transforms.push(`translate(${t.x || 0}px, ${t.y || 0}px)`);
  }

  // Scale
  if (t.scale && t.scale !== 1) {
    transforms.push(`scale(${t.scale})`);
  }

  // Rotation
  if (t.rotation) {
    transforms.push(`rotate(${t.rotation}deg)`);
  }

  // Crop using clip-path
  const cropTop = t.cropTop || 0;
  const cropBottom = t.cropBottom || 0;
  const cropLeft = t.cropLeft || 0;
  const cropRight = t.cropRight || 0;
  const hasClip = cropTop || cropBottom || cropLeft || cropRight;

  return {
    zIndex,
    transform: transforms.length > 0 ? transforms.join(' ') : undefined,
    opacity: t.opacity ?? 1,
    clipPath: hasClip
      ? `inset(${cropTop}% ${cropRight}% ${cropBottom}% ${cropLeft}%)`
      : undefined,
    cursor: isDragging ? 'grabbing' : undefined,
  };
}

const VideoPreview = forwardRef<VideoPreviewHandle, VideoPreviewProps>(({
  layers = [],
  isPlaying = false,
  aspectRatio = '16:9',
  onLayerMove,
  onLayerSelect,
  selectedLayerId,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingLayer, setDraggingLayer] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX: number; layerY: number } | null>(null);

  // Find the base video layer (V1) for audio/playback control
  const foundBaseLayer = layers.find(l => l.trackId === 'V1' && l.type === 'video');
  const baseLayerId = foundBaseLayer?.id;
  const baseLayerUrl = foundBaseLayer?.url;
  const baseLayerClipTime = foundBaseLayer?.clipTime;

  // Memoize to prevent effect triggers when only caption layers change
  const baseVideoLayer = useMemo(() => {
    return foundBaseLayer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayerId, baseLayerUrl]);

  // Get all layers sorted by track for rendering (V1 at bottom, then V2/V3, then T1 captions on top)
  const sortedLayers = useMemo(() => {
    const getTrackOrder = (trackId: string) => {
      if (trackId === 'V1') return 0;
      if (trackId === 'V2') return 1;
      if (trackId === 'V3') return 2;
      if (trackId.startsWith('T')) return 10; // Text/caption tracks on top
      return 5; // Other tracks in between
    };
    return [...layers].sort((a, b) => getTrackOrder(a.trackId) - getTrackOrder(b.trackId));
  }, [layers]);

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
    getVideoElement: () => videoRef.current,
  }));

  // Seek control for base video (only when paused/scrubbing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || baseLayerClipTime === undefined) return;
    if (isPlaying) return;

    if (Math.abs(video.currentTime - baseLayerClipTime) > 0.1) {
      video.currentTime = baseLayerClipTime;
    }
  }, [baseLayerClipTime, isPlaying]);

  // Play/pause control for base video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Play/pause control for overlay videos (V2, V3, etc.)
  useEffect(() => {
    overlayVideoRefs.current.forEach((video) => {
      if (isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [isPlaying]);

  // Sync overlay video seeking when scrubbing
  useEffect(() => {
    if (isPlaying) return; // Don't interfere during playback

    // Find overlay video layers and sync their time
    const overlayVideoLayers = layers.filter(
      l => l.type === 'video' && l.trackId !== 'V1'
    );

    overlayVideoLayers.forEach((layer) => {
      const video = overlayVideoRefs.current.get(layer.id);
      if (video && layer.clipTime !== undefined) {
        if (Math.abs(video.currentTime - layer.clipTime) > 0.1) {
          video.currentTime = layer.clipTime;
        }
      }
    });
  }, [layers, isPlaying]);

  // Seek on load
  const handleLoaded = () => {
    if (videoRef.current && baseLayerClipTime !== undefined) {
      videoRef.current.currentTime = baseLayerClipTime;
    }
  };

  // Handle mouse down on draggable layer
  const handleLayerMouseDown = useCallback((e: React.MouseEvent, layer: ClipLayer) => {
    // Only allow dragging non-V1 layers (overlays)
    if (layer.trackId === 'V1') return;
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    setDraggingLayer(layer.id);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      layerX: layer.transform?.x || 0,
      layerY: layer.transform?.y || 0,
    });

    // Select this layer
    onLayerSelect?.(layer.id);
  }, [onLayerSelect]);

  // Handle mouse move for dragging
  useEffect(() => {
    if (!draggingLayer || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      const newX = dragStart.layerX + deltaX;
      const newY = dragStart.layerY + deltaY;

      onLayerMove?.(draggingLayer, newX, newY);
    };

    const handleMouseUp = () => {
      setDraggingLayer(null);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingLayer, dragStart, onLayerMove]);

  // Aspect ratio styles
  const isVertical = aspectRatio === '9:16';
  // Use object-contain to show full video without cropping
  const videoFitClass = 'object-contain';

  // Container classes based on aspect ratio
  const containerClass = isVertical
    ? 'h-[65vh] w-auto aspect-[9/16]'  // Vertical: fixed height, width from aspect ratio
    : 'w-full max-w-4xl aspect-video';  // Horizontal: constrain width, height follows

  if (layers.length === 0) {
    return (
      <div className={`relative ${containerClass} bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center`}>
        <div className="text-center text-zinc-600">
          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No media to display</p>
        </div>
      </div>
    );
  }

  // Separate base video from overlay layers to prevent re-render issues
  const overlayLayers = useMemo(() =>
    sortedLayers.filter(l => !(l.trackId === 'V1' && l.type === 'video')),
    [sortedLayers]
  );

  return (
    <div
      ref={containerRef}
      className={`relative ${containerClass} bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10`}
    >
      {/* Base video layer (V1) - rendered separately for stability */}
      {foundBaseLayer && (
        <video
          key="base-video"
          ref={videoRef}
          src={foundBaseLayer.url}
          className={`absolute inset-0 w-full h-full ${videoFitClass}`}
          style={{ zIndex: 1 }}
          playsInline
          preload="auto"
          onLoadedData={handleLoaded}
        />
      )}

      {/* Render overlay layers (V2+, images, captions) */}
      {overlayLayers.map((layer, index) => {
        const isOverlay = layer.trackId !== 'V1';
        const isDragging = draggingLayer === layer.id;
        const isSelected = selectedLayerId === layer.id;
        const styles = getTransformStyles(layer.transform, index + 2, isDragging);

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
              className={`absolute inset-0 w-full h-full ${videoFitClass} cursor-grab active:cursor-grabbing ${
                isSelected ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black' : ''
              }`}
              style={styles}
              playsInline
              preload="auto"
              muted
              onLoadedData={(e) => {
                // Seek to correct time when loaded
                const video = e.currentTarget;
                if (layer.clipTime !== undefined) {
                  video.currentTime = layer.clipTime;
                }
                // Auto-play if timeline is playing
                if (isPlaying) {
                  video.play().catch(() => {});
                }
              }}
              onMouseDown={(e) => handleLayerMouseDown(e, layer)}
            />
          );
        }

        if (layer.type === 'image') {
          // For overlay images (V2, V3), use explicit sizing instead of fill-then-scale
          if (isOverlay) {
            const scale = layer.transform?.scale || 0.2;
            const xOffset = layer.transform?.x || 0;
            const yOffset = layer.transform?.y || 0;
            const baseZIndex = (styles.zIndex as number) || 0;

            return (
              <div
                key={layer.id}
                className="absolute cursor-grab active:cursor-grabbing"
                style={{
                  width: `${scale * 100}%`,
                  bottom: `calc(10% + ${yOffset}px)`,
                  left: `calc(50% + ${xOffset}px)`,
                  transform: 'translateX(-50%)',
                  zIndex: baseZIndex + 100,
                  opacity: layer.transform?.opacity ?? 1,
                }}
                onMouseDown={(e) => handleLayerMouseDown(e, layer)}
              >
                <img
                  src={layer.url}
                  alt="Layer"
                  className="w-full h-auto rounded-lg shadow-lg pointer-events-none"
                  draggable={false}
                />
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute inset-0 ring-2 ring-orange-500 rounded-lg pointer-events-none" />
                )}
                {/* Drag handle indicator */}
                {!isDragging && (
                  <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded text-white/70 pointer-events-none">
                    <Move className="w-3 h-3" />
                  </div>
                )}
              </div>
            );
          }

          // For V1 images (full background), use the original fill approach
          return (
            <div
              key={layer.id}
              className="absolute inset-0 w-full h-full"
              style={{ ...styles, pointerEvents: 'none' }}
            >
              <img
                src={layer.url}
                alt="Layer"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
            </div>
          );
        }

        if (layer.type === 'caption' && layer.captionWords && layer.captionStyle) {
          return (
            <CaptionRenderer
              key={layer.id}
              words={layer.captionWords}
              style={layer.captionStyle}
              currentTime={layer.clipTime}
            />
          );
        }

        return null;
      })}

      {/* Layer count indicator */}
      {layers.length > 1 && (
        <div className="absolute top-3 left-3 text-xs text-white/60 bg-black/50 px-2 py-1 rounded flex items-center gap-1 z-50">
          <Layers className="w-3 h-3" />
          <span>{layers.length} layers</span>
        </div>
      )}

      {/* Type indicator */}
      <div className="absolute bottom-3 right-3 text-xs text-white/60 bg-black/50 px-2 py-1 rounded flex items-center gap-1 z-50">
        {baseVideoLayer ? <Play className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
        <span>{baseVideoLayer ? 'video' : layers[0]?.type}</span>
      </div>

      {/* Dragging indicator */}
      {draggingLayer && (
        <div className="absolute bottom-3 left-3 text-xs text-orange-400 bg-black/70 px-2 py-1 rounded z-50">
          Dragging...
        </div>
      )}
    </div>
  );
});

export default VideoPreview;
