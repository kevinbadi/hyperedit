import { useState, useEffect, useCallback } from 'react';
import { X, Check, Loader2, Key } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onSave: (settings: Record<string, string>) => Promise<void>;
  initialSettingsPromise: Promise<Record<string, boolean>>;
}

export default function SettingsModal({ onClose, onSave, initialSettingsPromise }: SettingsModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    GIPHY_API_KEY: '',
    FAL_KEY: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initialSettingsPromise
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load settings');
        setLoading(false);
      });
  }, [initialSettingsPromise]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Filter out empty values so we don't accidentally unset keys if user didn't type anything
    // Input = Update. Empty = No Change.
    const updates: Record<string, string> = {};
    Object.entries(values).forEach(([key, val]) => {
      if (val.trim()) updates[key] = val.trim();
    });

    if (Object.keys(updates).length === 0) {
        setSaving(false);
        onClose();
        return;
    }

    try {
      await onSave(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [values, onSave, onClose]);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-orange-500" />
            <span className="text-lg font-semibold text-white">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            </div>
          ) : (
            <form id="settings-form" onSubmit={handleSave} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <ApiKeyInput
                  label="OpenAI API Key"
                  description="Required for Whisper transcription (best quality)"
                  id="OPENAI_API_KEY"
                  isSet={status.OPENAI_API_KEY}
                  value={values.OPENAI_API_KEY}
                  onChange={(v) => handleChange('OPENAI_API_KEY', v)}
                />

                <ApiKeyInput
                  label="Gemini API Key"
                  description="Required for AI editing, animations, and image generation"
                  id="GEMINI_API_KEY"
                  isSet={status.GEMINI_API_KEY}
                  value={values.GEMINI_API_KEY}
                  onChange={(v) => handleChange('GEMINI_API_KEY', v)}
                />

                <ApiKeyInput
                  label="Fal.ai Key"
                  description="Required for video/image generation (DiCaprio & Picasso)"
                  id="FAL_KEY"
                  isSet={status.FAL_KEY}
                  value={values.FAL_KEY}
                  onChange={(v) => handleChange('FAL_KEY', v)}
                />

                <ApiKeyInput
                  label="GIPHY API Key"
                  description="Required for GIF search"
                  id="GIPHY_API_KEY"
                  isSet={status.GIPHY_API_KEY}
                  value={values.GIPHY_API_KEY}
                  onChange={(v) => handleChange('GIPHY_API_KEY', v)}
                />
              </div>

              <div className="text-xs text-zinc-500 pt-2">
                Keys are stored locally in <code className="bg-zinc-800 px-1 py-0.5 rounded">.dev.vars</code> and are never shared.
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="settings-form"
            disabled={saving || loading}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function ApiKeyInput({
  label,
  description,
  id,
  isSet,
  value,
  onChange
}: {
  label: string;
  description: string;
  id: string;
  isSet: boolean;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">
          {label}
        </label>
        {isSet ? (
          <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Configured
          </span>
        ) : (
          <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700">
            Not Set
          </span>
        )}
      </div>
      <input
        type="password"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet ? '••••••••••••••••••••••••' : 'Enter API Key starting with...'}
        className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all text-sm font-mono"
      />
      <p className="text-xs text-zinc-500">
        {description}
      </p>
    </div>
  );
}
