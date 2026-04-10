import { useState, useCallback, useRef, useEffect } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  side: 'left' | 'right';
  className?: string;
}

export default function ResizablePanel({
  children,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
  className = '',
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;

      const panelRect = panelRef.current.getBoundingClientRect();
      let newWidth: number;

      if (side === 'left') {
        newWidth = e.clientX - panelRect.left;
      } else {
        newWidth = panelRect.right - e.clientX;
      }

      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, side]);

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 ${className}`}
      style={{ width }}
    >
      {children}

      {/* Resize handle */}
      <div
        className={`absolute top-0 bottom-0 w-1 cursor-ew-resize hover:bg-zinc-500/50 transition-colors z-50 ${
          side === 'left' ? 'right-0' : 'left-0'
        } ${isResizing ? 'bg-zinc-500' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
      >
        {/* Visual indicator on hover */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${
            side === 'left' ? '-right-0.5' : '-left-0.5'
          } w-1 h-12 bg-zinc-600 rounded opacity-0 group-hover:opacity-100 pointer-events-none`}
        />
      </div>
    </div>
  );
}
