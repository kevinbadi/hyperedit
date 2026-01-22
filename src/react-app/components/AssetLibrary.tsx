import { useRef, useCallback } from 'react';
import { Film, Image, Music, Upload, Trash2, Plus } from 'lucide-react';
import type { Asset } from '@/react-app/hooks/useProject';

interface AssetLibraryProps {
  assets: Asset[];
  onUpload: (files: FileList) => void;
  onDelete: (assetId: string) => void;
  onDragStart: (asset: Asset) => void;
  onSelect?: (assetId: string | null) => void;
  selectedAssetId?: string | null;
  uploading?: boolean;
}

const getAssetIcon = (type: Asset['type']) => {
  switch (type) {
    case 'video': return Film;
    case 'image': return Image;
    case 'audio': return Music;
    default: return Film;
  }
};

const getAssetColor = (type: Asset['type']) => {
  switch (type) {
    case 'video': return 'from-blue-500 to-cyan-500';
    case 'image': return 'from-amber-500 to-orange-500';
    case 'audio': return 'from-emerald-500 to-teal-500';
    default: return 'from-gray-500 to-gray-600';
  }
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssetLibrary({
  assets,
  onUpload,
  onDelete,
  onDragStart,
  onSelect,
  selectedAssetId,
  uploading = false,
}: AssetLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onUpload(files);
    }
  }, [onUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-900/50 border-r border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/50">
        <span className="text-xs font-medium text-zinc-400">Assets</span>
        <button
          onClick={handleFileSelect}
          disabled={uploading}
          className="p-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs transition-colors"
          title="Import files"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Asset grid */}
      <div
        className="flex-1 overflow-auto p-2"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {assets.length === 0 ? (
          <div
            onClick={handleFileSelect}
            className="flex flex-col items-center justify-center h-full p-4 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors"
          >
            <Upload className="w-8 h-8 text-zinc-500 mb-2" />
            <span className="text-xs text-zinc-500 text-center">
              Drop files here or click to upload
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map(asset => (
              <AssetCard
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                onSelect={() => onSelect?.(selectedAssetId === asset.id ? null : asset.id)}
                onDelete={() => onDelete(asset.id)}
                onDragStart={() => onDragStart(asset)}
              />
            ))}

            {/* Add more button */}
            <button
              onClick={handleFileSelect}
              disabled={uploading}
              className="aspect-video flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500/50 hover:bg-orange-500/5 transition-colors"
            >
              <Plus className="w-6 h-6 text-zinc-500" />
              <span className="text-[10px] text-zinc-500 mt-1">Add</span>
            </button>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}

interface AssetCardProps {
  asset: Asset;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete: () => void;
  onDragStart: () => void;
}

function AssetCard({ asset, isSelected, onSelect, onDelete, onDragStart }: AssetCardProps) {
  const Icon = getAssetIcon(asset.type);
  const colorClass = getAssetColor(asset.type);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-hyperedit-asset', JSON.stringify(asset));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart();
  }, [asset, onDragStart]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't select if clicking on buttons
    if ((e.target as HTMLElement).closest('button')) return;
    onSelect?.();
  }, [onSelect]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`group relative aspect-video bg-zinc-800 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing border transition-colors ${
        isSelected
          ? 'border-orange-500 ring-2 ring-orange-500/30'
          : 'border-zinc-700/50 hover:border-orange-500/50'
      }`}
    >
      {/* Thumbnail */}
      {asset.thumbnailUrl ? (
        <img
          src={asset.thumbnailUrl}
          alt={asset.filename}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
          <Icon className="w-8 h-8 text-white/80" />
        </div>
      )}

      {/* Type badge */}
      <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded bg-gradient-to-r ${colorClass} text-[9px] font-medium uppercase`}>
        {asset.type}
      </div>

      {/* Duration/info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
        <div className="text-[10px] text-white truncate">{asset.filename}</div>
        <div className="text-[9px] text-zinc-400">
          {asset.type !== 'image' && formatDuration(asset.duration)}
          {asset.type !== 'image' && ' • '}
          {formatSize(asset.size)}
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 bg-red-500/80 hover:bg-red-500 rounded"
          title="Delete asset"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
