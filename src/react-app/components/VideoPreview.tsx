import { Play, Image as ImageIcon, Layers, Move } from 'lucide-react';
import { useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useState, useCallback } from 'react';

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
  type: 'video' | 'image' | 'audio';
  trackId: string;
  clipTime: number;
  transform?: ClipTransform;
}

interface VideoPreviewProps {
  layers?: ClipLayer[];
  isPlaying?: boolean;
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
  onLayerMove,
  onLayerSelect,
  selectedLayerId,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingLayer, setDraggingLayer] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX: number; layerY: number } | null>(null);

  // Find the base video layer (V1) for audio/playback control
  const baseVideoLayer = layers.find(l => l.trackId === 'V1' && l.type === 'video');

  // Get all layers sorted by track (V1 first, then V2, etc.) for rendering
  const sortedLayers = useMemo(() =>
    [...layers].sort((a, b) => a.trackId.localeCompare(b.trackId)),
    [layers]
  );

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) videoRef.current.currentTime = time;
    },
    getVideoElement: () => videoRef.current,
  }));

  // Seek control for base video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !baseVideoLayer) return;
    if (isPlaying) return;

    const target = baseVideoLayer.clipTime;
    if (Math.abs(video.currentTime - target) > 0.1) {
      video.currentTime = target;
    }
  }, [baseVideoLayer?.clipTime, isPlaying]);

  // Play/pause control for base video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !baseVideoLayer) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, baseVideoLayer]);

  // Seek on load
  const handleLoaded = () => {
    if (videoRef.current && baseVideoLayer) {
      videoRef.current.currentTime = baseVideoLayer.clipTime;
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

  if (layers.length === 0) {
    return (
      <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
        <div className="text-center text-zinc-600">
          <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No media to display</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10"
    >
      {/* Render all layers in order (V1 at bottom, V2+ on top) */}
      {sortedLayers.map((layer, index) => {
        const isBaseVideo = layer.trackId === 'V1' && layer.type === 'video';
        const isOverlay = layer.trackId !== 'V1';
        const isDragging = draggingLayer === layer.id;
        const isSelected = selectedLayerId === layer.id;
        const styles = getTransformStyles(layer.transform, index + 1, isDragging);

        if (layer.type === 'video') {
          return (
            <video
              key={layer.id}
              ref={isBaseVideo ? videoRef : undefined}
              src={layer.url}
              className={`absolute inset-0 w-full h-full object-contain ${
                isOverlay ? 'cursor-grab active:cursor-grabbing' : ''
              } ${isSelected && isOverlay ? 'ring-2 ring-orange-500 ring-offset-2 ring-offset-black' : ''}`}
              style={styles}
              playsInline
              preload="auto"
              onLoadedData={isBaseVideo ? handleLoaded : undefined}
              muted={!isBaseVideo}
              onMouseDown={isOverlay ? (e) => handleLayerMouseDown(e, layer) : undefined}
            />
          );
        }

        if (layer.type === 'image') {
          return (
            <div
              key={layer.id}
              className={`absolute inset-0 w-full h-full ${
                isOverlay ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
              style={{ ...styles, pointerEvents: isOverlay ? 'auto' : 'none' }}
              onMouseDown={isOverlay ? (e) => handleLayerMouseDown(e, layer) : undefined}
            >
              <img
                src={layer.url}
                alt="Layer"
                className="w-full h-full object-contain pointer-events-none"
                draggable={false}
              />
              {/* Selection indicator for overlay images */}
              {isSelected && isOverlay && (
                <div className="absolute inset-0 ring-2 ring-orange-500 pointer-events-none" />
              )}
              {/* Drag handle indicator */}
              {isOverlay && !isDragging && (
                <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded text-white/70 pointer-events-none">
                  <Move className="w-3 h-3" />
                </div>
              )}
            </div>
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
