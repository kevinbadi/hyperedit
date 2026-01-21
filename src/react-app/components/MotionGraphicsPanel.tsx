import { useState } from 'react';
import { Player } from '@remotion/player';
import { Wand2, Type, User, Bell, ChevronRight } from 'lucide-react';
import { AnimatedText, LowerThird, CallToAction, MOTION_TEMPLATES, type TemplateId } from '@/remotion/templates';

interface MotionGraphicsPanelProps {
  onAddToTimeline?: (templateId: TemplateId, props: Record<string, unknown>, duration: number) => void;
}

const templateIcons = {
  'animated-text': Type,
  'lower-third': User,
  'call-to-action': Bell,
};

export default function MotionGraphicsPanel({ onAddToTimeline }: MotionGraphicsPanelProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [templateProps, setTemplateProps] = useState<Record<string, unknown>>({});
  const [duration, setDuration] = useState(3); // seconds

  const handleSelectTemplate = (id: TemplateId) => {
    setSelectedTemplate(id);
    setTemplateProps({ ...MOTION_TEMPLATES[id].defaultProps });
  };

  const handleUpdateProp = (key: string, value: unknown) => {
    setTemplateProps(prev => ({ ...prev, [key]: value }));
  };

  const handleAddToTimeline = () => {
    if (selectedTemplate && onAddToTimeline) {
      onAddToTimeline(selectedTemplate, templateProps, duration);
    }
  };

  // Render the selected template component
  const renderPreview = () => {
    if (!selectedTemplate) return null;

    const fps = 30;
    const durationInFrames = duration * fps;

    const componentMap = {
      'animated-text': AnimatedText,
      'lower-third': LowerThird,
      'call-to-action': CallToAction,
    };

    const Component = componentMap[selectedTemplate];
    if (!Component) return null;

    return (
      <Player
        component={Component}
        inputProps={templateProps}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#18181b',
        }}
        controls
        loop
        autoPlay
      />
    );
  };

  // Render property editors based on template
  const renderPropertyEditors = () => {
    if (!selectedTemplate) return null;

    const template = MOTION_TEMPLATES[selectedTemplate];

    return (
      <div className="space-y-3">
        {/* Text input for templates that have text */}
        {('text' in template.defaultProps || 'name' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">
              {'text' in template.defaultProps ? 'Text' : 'Name'}
            </label>
            <input
              type="text"
              value={(templateProps.text || templateProps.name || '') as string}
              onChange={(e) => handleUpdateProp('text' in template.defaultProps ? 'text' : 'name', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {/* Title input for lower third */}
        {selectedTemplate === 'lower-third' && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Title</label>
            <input
              type="text"
              value={(templateProps.title || '') as string}
              onChange={(e) => handleUpdateProp('title', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {/* Style selector */}
        {'styles' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Style</label>
            <div className="grid grid-cols-2 gap-1.5">
              {template.styles.map((style) => (
                <button
                  key={style}
                  onClick={() => handleUpdateProp('style', style)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    templateProps.style === style
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Type selector for CTA */}
        {selectedTemplate === 'call-to-action' && 'types' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {template.types.map((type) => (
                <button
                  key={type}
                  onClick={() => handleUpdateProp('type', type)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    templateProps.type === type
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color picker */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Color</label>
          <div className="flex gap-2">
            {['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff'].map((color) => (
              <button
                key={color}
                onClick={() => handleUpdateProp('primaryColor' in templateProps ? 'primaryColor' : 'color', color)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  (templateProps.primaryColor || templateProps.color) === color
                    ? 'border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Duration: {duration}s</label>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full bg-zinc-900/80 border-l border-zinc-800/50 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Wand2 className="w-4 h-4" />
          </div>
          <h2 className="font-semibold">Motion Graphics</h2>
        </div>
        <p className="text-xs text-zinc-400">
          Add animated overlays to your video
        </p>
      </div>

      {/* Template selector */}
      {!selectedTemplate && (
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          <p className="text-xs text-zinc-500 font-medium mb-3">Choose a template</p>
          {(Object.keys(MOTION_TEMPLATES) as TemplateId[]).map((id) => {
            const template = MOTION_TEMPLATES[id];
            const Icon = templateIcons[id];
            return (
              <button
                key={id}
                onClick={() => handleSelectTemplate(id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-left transition-colors group"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-purple-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{template.name}</div>
                  <div className="text-xs text-zinc-500">{template.description}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
              </button>
            );
          })}
        </div>
      )}

      {/* Template editor */}
      {selectedTemplate && (
        <>
          {/* Back button */}
          <button
            onClick={() => setSelectedTemplate(null)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors border-b border-zinc-800/50"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to templates
          </button>

          {/* Preview */}
          <div className="p-4 border-b border-zinc-800/50">
            {renderPreview()}
          </div>

          {/* Properties */}
          <div className="flex-1 p-4 overflow-y-auto">
            {renderPropertyEditors()}
          </div>

          {/* Add button */}
          <div className="p-4 border-t border-zinc-800/50">
            <button
              onClick={handleAddToTimeline}
              className="w-full px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg text-sm font-medium transition-all"
            >
              Add to Timeline
            </button>
          </div>
        </>
      )}
    </div>
  );
}
