import { Upload, Video, FileVideo } from 'lucide-react';
import { useRef } from 'react';

interface VideoUploadProps {
  onVideoSelect: (file: File) => void;
}

export default function VideoUpload({ onVideoSelect }: VideoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      onVideoSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      onVideoSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative w-full max-w-4xl aspect-video bg-gradient-to-br from-zinc-900 to-zinc-950 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer group hover:ring-zinc-500/50 transition-all"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center p-8 group-hover:bg-white/5 transition-colors">
        <div className="relative mb-6">
          {/* Animated circles */}
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-500/20 to-zinc-500/20 rounded-full animate-pulse" />
          <div className="relative w-24 h-24 bg-gradient-to-br from-zinc-500 to-zinc-500 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
            <Upload className="w-12 h-12 text-white" />
          </div>
        </div>

        <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-zinc-400 to-zinc-400 bg-clip-text text-transparent">
          Upload Your Video
        </h3>
        <p className="text-zinc-400 text-sm mb-6 text-center max-w-md">
          Drag and drop a video file here, or click to browse
        </p>

        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <Video className="w-4 h-4" />
            <span>MP4, MOV, AVI</span>
          </div>
          <div className="w-1 h-1 bg-zinc-700 rounded-full" />
          <div className="flex items-center gap-1">
            <FileVideo className="w-4 h-4" />
            <span>Max 500MB</span>
          </div>
        </div>
      </div>

      {/* Glow effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-500/10 to-zinc-500/10" />
      </div>
    </div>
  );
}