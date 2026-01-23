import { X, Film, Layers, Plus } from 'lucide-react';
import type { TimelineTab } from '@/react-app/hooks/useProject';

interface TimelineTabsProps {
  tabs: TimelineTab[];
  activeTabId: string;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab?: () => void;
  show?: boolean;
}

export default function TimelineTabs({
  tabs,
  activeTabId,
  onSwitchTab,
  onCloseTab,
  onAddTab,
  show = false,
}: TimelineTabsProps) {
  // Only show if explicitly enabled or if there are multiple tabs
  if (!show && tabs.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-1 py-2 px-4 bg-zinc-900/80 border-b border-zinc-800/50">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isMain = tab.type === 'main';

        return (
          <button
            key={tab.id}
            onClick={() => onSwitchTab(tab.id)}
            className={`
              group flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${isActive
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-transparent'
              }
            `}
          >
            {isMain ? (
              <Layers className="w-3.5 h-3.5" />
            ) : (
              <Film className="w-3.5 h-3.5" />
            )}
            <span className="max-w-[120px] truncate">{tab.name}</span>

            {/* Close button for non-main tabs */}
            {!isMain && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className={`
                  ml-1 p-0.5 rounded transition-colors
                  ${isActive
                    ? 'hover:bg-orange-500/30 text-orange-300'
                    : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-600 text-zinc-400'
                  }
                `}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </button>
        );
      })}

      {/* Add new tab button */}
      {onAddTab && (
        <button
          onClick={onAddTab}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-transparent hover:border-zinc-600 transition-all"
          title="New timeline tab"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
