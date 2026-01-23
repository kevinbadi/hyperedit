import { useState } from 'react';
import { Player } from '@remotion/player';
import {
  Wand2, Type, User, Bell, ChevronRight, Hash, Sparkles,
  Monitor, MessageSquare, TrendingUp, GitCompare, Move, PieChart
} from 'lucide-react';
import {
  AnimatedText,
  LowerThird,
  CallToAction,
  Counter,
  LogoReveal,
  ScreenFrame,
  SocialProof,
  ProgressBar,
  Comparison,
  ZoomPan,
  DataChart,
  MOTION_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type TemplateId,
} from '@/remotion/templates';

interface MotionGraphicsPanelProps {
  onAddToTimeline?: (templateId: TemplateId, props: Record<string, unknown>, duration: number) => void;
}

const templateIcons: Record<TemplateId, React.ComponentType<{ className?: string }>> = {
  'animated-text': Type,
  'lower-third': User,
  'call-to-action': Bell,
  'counter': Hash,
  'logo-reveal': Sparkles,
  'screen-frame': Monitor,
  'social-proof': MessageSquare,
  'progress-bar': TrendingUp,
  'comparison': GitCompare,
  'zoom-pan': Move,
  'data-chart': PieChart,
};

const componentMap: Record<TemplateId, React.ComponentType<Record<string, unknown>>> = {
  'animated-text': AnimatedText as unknown as React.ComponentType<Record<string, unknown>>,
  'lower-third': LowerThird as unknown as React.ComponentType<Record<string, unknown>>,
  'call-to-action': CallToAction as unknown as React.ComponentType<Record<string, unknown>>,
  'counter': Counter as unknown as React.ComponentType<Record<string, unknown>>,
  'logo-reveal': LogoReveal as unknown as React.ComponentType<Record<string, unknown>>,
  'screen-frame': ScreenFrame as unknown as React.ComponentType<Record<string, unknown>>,
  'social-proof': SocialProof as unknown as React.ComponentType<Record<string, unknown>>,
  'progress-bar': ProgressBar as unknown as React.ComponentType<Record<string, unknown>>,
  'comparison': Comparison as unknown as React.ComponentType<Record<string, unknown>>,
  'zoom-pan': ZoomPan as unknown as React.ComponentType<Record<string, unknown>>,
  'data-chart': DataChart as unknown as React.ComponentType<Record<string, unknown>>,
};

export default function MotionGraphicsPanel({ onAddToTimeline }: MotionGraphicsPanelProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [templateProps, setTemplateProps] = useState<Record<string, unknown>>({});
  const [duration, setDuration] = useState(3);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  const handleBack = () => {
    if (selectedTemplate) {
      setSelectedTemplate(null);
    } else if (selectedCategory) {
      setSelectedCategory(null);
    }
  };

  // Render the selected template component
  const renderPreview = () => {
    if (!selectedTemplate) return null;

    const fps = 30;
    const durationInFrames = duration * fps;
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
        {/* Text inputs */}
        {('text' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Text</label>
            <input
              type="text"
              value={(templateProps.text || '') as string}
              onChange={(e) => handleUpdateProp('text', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {('name' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Name</label>
            <input
              type="text"
              value={(templateProps.name || '') as string}
              onChange={(e) => handleUpdateProp('name', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {('title' in template.defaultProps) && (
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

        {/* Counter-specific */}
        {('value' in template.defaultProps) && (
          <>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Value</label>
              <input
                type="number"
                value={(templateProps.value || 0) as number}
                onChange={(e) => handleUpdateProp('value', Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Prefix</label>
                <input
                  type="text"
                  value={(templateProps.prefix || '') as string}
                  onChange={(e) => handleUpdateProp('prefix', e.target.value)}
                  placeholder="$"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Suffix</label>
                <input
                  type="text"
                  value={(templateProps.suffix || '') as string}
                  onChange={(e) => handleUpdateProp('suffix', e.target.value)}
                  placeholder="+"
                  className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>
            </div>
          </>
        )}

        {/* Label input */}
        {('label' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Label</label>
            <input
              type="text"
              value={(templateProps.label || '') as string}
              onChange={(e) => handleUpdateProp('label', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {/* Logo specific */}
        {('logoText' in template.defaultProps) && (
          <>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Logo Text</label>
              <input
                type="text"
                value={(templateProps.logoText || '') as string}
                onChange={(e) => handleUpdateProp('logoText', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Tagline</label>
              <input
                type="text"
                value={(templateProps.tagline || '') as string}
                onChange={(e) => handleUpdateProp('tagline', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </>
        )}

        {/* Testimonial specific */}
        {('quote' in template.defaultProps) && (
          <>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Quote</label>
              <textarea
                value={(templateProps.quote || '') as string}
                onChange={(e) => handleUpdateProp('quote', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Author</label>
              <input
                type="text"
                value={(templateProps.author || '') as string}
                onChange={(e) => handleUpdateProp('author', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Role</label>
              <input
                type="text"
                value={(templateProps.role || '') as string}
                onChange={(e) => handleUpdateProp('role', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </>
        )}

        {/* Progress specific */}
        {('progress' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Progress: {templateProps.progress as number}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={(templateProps.progress || 0) as number}
              onChange={(e) => handleUpdateProp('progress', Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        )}

        {/* Comparison specific */}
        {('beforeLabel' in template.defaultProps) && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Before Label</label>
              <input
                type="text"
                value={(templateProps.beforeLabel || '') as string}
                onChange={(e) => handleUpdateProp('beforeLabel', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">After Label</label>
              <input
                type="text"
                value={(templateProps.afterLabel || '') as string}
                onChange={(e) => handleUpdateProp('afterLabel', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </div>
        )}

        {/* Zoom/Pan intensity */}
        {('intensity' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Intensity: {templateProps.intensity as number}</label>
            <input
              type="range"
              min={1}
              max={10}
              value={(templateProps.intensity || 5) as number}
              onChange={(e) => handleUpdateProp('intensity', Number(e.target.value))}
              className="w-full accent-orange-500"
            />
          </div>
        )}

        {/* URL input */}
        {('url' in template.defaultProps) && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">URL</label>
            <input
              type="text"
              value={(templateProps.url || '') as string}
              onChange={(e) => handleUpdateProp('url', e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>
        )}

        {/* Style selector */}
        {'styles' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Style</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(template.styles as readonly string[]).map((style) => (
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

        {/* Type selector */}
        {'types' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(template.types as readonly string[]).map((type) => (
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

        {/* Effects selector (for zoom-pan) */}
        {'effects' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Effect</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(template.effects as readonly string[]).map((effect) => (
                <button
                  key={effect}
                  onClick={() => handleUpdateProp('effect', effect)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    templateProps.effect === effect
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {effect}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Frame types (for screen-frame) */}
        {'frameTypes' in template && (
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Frame Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(template.frameTypes as readonly string[]).map((frameType) => (
                <button
                  key={frameType}
                  onClick={() => handleUpdateProp('frameType', frameType)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    templateProps.frameType === frameType
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {frameType}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Color picker */}
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Color</label>
          <div className="flex gap-2">
            {['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].map((c) => (
              <button
                key={c}
                onClick={() => handleUpdateProp('primaryColor' in templateProps ? 'primaryColor' : 'color', c)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  (templateProps.primaryColor || templateProps.color) === c
                    ? 'border-white scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
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
            max={15}
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
          {selectedTemplate
            ? 'Customize your animation'
            : selectedCategory
              ? 'Choose a template'
              : 'Add animated overlays to your video'}
        </p>
      </div>

      {/* Back button */}
      {(selectedTemplate || selectedCategory) && (
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors border-b border-zinc-800/50"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          {selectedTemplate ? 'Back to templates' : 'Back to categories'}
        </button>
      )}

      {/* Category selector */}
      {!selectedTemplate && !selectedCategory && (
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          <p className="text-xs text-zinc-500 font-medium mb-3">Choose a category</p>
          {Object.entries(TEMPLATE_CATEGORIES).map(([key, category]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg text-left transition-colors group"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{category.name}</div>
                <div className="text-xs text-zinc-500">{category.templates.length} templates</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* Template selector */}
      {!selectedTemplate && selectedCategory && (
        <div className="flex-1 p-4 space-y-2 overflow-y-auto">
          <p className="text-xs text-zinc-500 font-medium mb-3">
            {TEMPLATE_CATEGORIES[selectedCategory as keyof typeof TEMPLATE_CATEGORIES].name}
          </p>
          {TEMPLATE_CATEGORIES[selectedCategory as keyof typeof TEMPLATE_CATEGORIES].templates.map((id) => {
            const template = MOTION_TEMPLATES[id as TemplateId];
            const Icon = templateIcons[id as TemplateId];
            return (
              <button
                key={id}
                onClick={() => handleSelectTemplate(id as TemplateId)}
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
