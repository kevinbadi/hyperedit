import { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableVerticalPanelProps {
  children: React.ReactNode;
  defaultHeight: number;
  minHeight: number;
  maxHeight: number;
  position: 'top' | 'bottom';
  className?: string;
}

export default function ResizableVerticalPanel({
  children,
  defaultHeight,
  minHeight,
  maxHeight,
  position,
  className = '',
}: ResizableVerticalPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
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
      let newHeight: number;

      if (position === 'bottom') {
        newHeight = panelRect.bottom - e.clientY;
      } else {
        newHeight = e.clientY - panelRect.top;
      }

      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      setHeight(newHeight);
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
  }, [isResizing, minHeight, maxHeight, position]);

  return (
    <div
      ref={panelRef}
      className={`relative flex-shrink-0 ${className}`}
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        className={`absolute left-0 right-0 h-1 cursor-ns-resize hover:bg-zinc-500/50 transition-colors z-50 ${
          position === 'bottom' ? 'top-0' : 'bottom-0'
        } ${isResizing ? 'bg-zinc-500' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
      />

      {children}
    </div>
  );
}
