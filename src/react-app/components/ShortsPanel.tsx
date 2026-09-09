import { useEffect, useMemo, useRef, useState } from 'react';
import { Scissors, Loader2, CheckCircle2, XCircle, Circle, Plus, Download, Flame, Clock } from 'lucide-react';
import type { Asset, ShortMeta } from '@/react-app/hooks/useProject';

// Shorts generator panel. Picks a long talking video from the library, asks
// the FFmpeg server to transcribe it, rank the most viral moments with
// Claude, and cut them into vertical shorts. Results land in the asset
// library (with `shortMeta`) so they survive reloads; this panel just
// drives the job and renders the results with one-click timeline add.

interface Step {
  label: string;
  status: 'running' | 'done' | 'error';
}

interface ShortClip {
  id: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  streamUrl: string;
  thumbnailUrl: string | null;
  shortMeta: ShortMeta;
}

interface ShortsJob {
  status: 'running' | 'complete' | 'error';
  stage: string;
  message: string;
  steps: Step[];
  clips: ShortClip[];
  contentType?: string;
  pacing?: string;
  error?: string;
}

interface ShortsPanelProps {
  sessionId: string | null;
  assets: Asset[];
  onAddToTimeline: (assetId: string) => void;
  onRefreshAssets: () => Promise<unknown>;
}

const SERVER = 'http://localhost:3333';

const RATIOS: { value: string; label: string; hint: string }[] = [
  { value: '9:16', label: '9:16', hint: 'TikTok / Reels / Shorts' },
  { value: '4:5', label: '4:5', hint: 'Instagram feed' },
  { value: '1:1', label: '1:1', hint: 'Square' },
];

const LENGTHS: { value: string; label: string; min: number; max: number }[] = [
  { value: 'punchy', label: '15–30s', min: 15, max: 30 },
  { value: 'standard', label: '20–60s', min: 20, max: 60 },
  { value: 'long', label: '45–90s', min: 45, max: 90 },
];

function StepIcon({ status }: { status: Step['status'] }) {
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-zinc-300 animate-spin flex-shrink-0 mt-0.5" />;
  if (status === 'done') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />;
  return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />;
}

function scoreColor(score: number) {
  if (score >= 85) return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
  if (score >= 70) return 'text-lime-300 border-lime-300/40 bg-lime-300/10';
  return 'text-zinc-300 border-zinc-500/40 bg-zinc-500/10';
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ShortsPanel({ sessionId, assets, onAddToTimeline, onRefreshAssets }: ShortsPanelProps) {
  const sourceVideos = useMemo(
    () => assets.filter(a => a.type === 'video' && !a.aiGenerated && !a.shortMeta),
    [assets]
  );
  const existingShorts = useMemo(
    () => assets.filter(a => a.shortMeta).sort((a, b) => (b.shortMeta?.score ?? 0) - (a.shortMeta?.score ?? 0)),
    [assets]
  );

  const [sourceId, setSourceId] = useState<string>('');
  const [count, setCount] = useState(3);
  const [ratio, setRatio] = useState('9:16');
  const [length, setLength] = useState('standard');
  const [hook, setHook] = useState(true);
  const [cropPosition, setCropPosition] = useState<'left' | 'center' | 'right'>('center');

  const [job, setJob] = useState<ShortsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // Default the source to the first real video in the library.
  useEffect(() => {
    if (!sourceId && sourceVideos.length > 0) setSourceId(sourceVideos[0].id);
    if (sourceId && !sourceVideos.some(v => v.id === sourceId)) setSourceId(sourceVideos[0]?.id ?? '');
  }, [sourceVideos, sourceId]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  const isRunning = job?.status === 'running';

  const startJob = async () => {
    if (!sessionId || !sourceId) return;
    setError(null);
    const len = LENGTHS.find(l => l.value === length) ?? LENGTHS[1];

    try {
      const res = await fetch(`${SERVER}/session/${sessionId}/shorts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: sourceId,
          count,
          ratio,
          minDuration: len.min,
          maxDuration: len.max,
          hook,
          cropPosition,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start shorts job');

      setJob({ status: 'running', stage: 'transcribe', message: 'Starting…', steps: [], clips: [] });

      let seenClips = 0;
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`${SERVER}/session/${sessionId}/shorts/status/${data.jobId}`);
          if (!r.ok) {
            if (r.status === 404) throw new Error('Job disappeared (server restarted?)');
            return;
          }
          const status: ShortsJob = await r.json();
          setJob(status);
          // Pull new clips into the asset library as they finish rendering.
          if (status.clips.length > seenClips) {
            seenClips = status.clips.length;
            onRefreshAssets().catch(() => {});
          }
          if (status.status !== 'running') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            if (status.status === 'error') setError(status.error || 'Shorts job failed');
          }
        } catch (e) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setError(e instanceof Error ? e.message : 'Polling failed');
          setJob(prev => (prev ? { ...prev, status: 'error' } : prev));
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start shorts job');
    }
  };

  const canStart = !!sessionId && !!sourceId && !isRunning;
  const sourceAsset = sourceVideos.find(v => v.id === sourceId);

  return (
    <div className="flex flex-col h-full bg-zinc-900/80">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-zinc-400 to-zinc-300 rounded-lg flex items-center justify-center">
            <Scissors className="w-4 h-4" />
          </div>
          <h2 className="font-semibold">Shorts</h2>
          {job?.contentType && (
            <span className="ml-auto text-[10px] text-zinc-500 capitalize">{job.contentType} · {job.pacing}</span>
          )}
        </div>
        <p className="text-xs text-zinc-400">Find the most viral moments in a long video and cut them into ready-to-post shorts</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Controls */}
        <div className="p-4 space-y-3 border-b border-zinc-800/50">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Source video</span>
            <select
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              disabled={isRunning || sourceVideos.length === 0}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400/50"
            >
              {sourceVideos.length === 0 && <option value="">Upload a video first</option>}
              {sourceVideos.map(v => (
                <option key={v.id} value={v.id}>
                  {v.filename} ({fmtTime(v.duration || 0)})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Clips</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="range" min={1} max={6} value={count}
                  onChange={e => setCount(parseInt(e.target.value))}
                  disabled={isRunning}
                  className="flex-1 accent-zinc-300"
                />
                <span className="text-xs text-zinc-200 w-4 text-right">{count}</span>
              </div>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Length</span>
              <select
                value={length}
                onChange={e => setLength(e.target.value)}
                disabled={isRunning}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                {LENGTHS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </label>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">Aspect ratio</span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {RATIOS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  disabled={isRunning}
                  onClick={() => setRatio(r.value)}
                  title={r.hint}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                    ratio === r.value
                      ? 'bg-zinc-300 text-zinc-900 border-zinc-300 font-medium'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">Keep</span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {(['left', 'center', 'right'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setCropPosition(p)}
                    title={`Keep the ${p} of the frame when cropping`}
                    className={`py-1.5 rounded-lg text-[10px] border transition-colors ${
                      cropPosition === p
                        ? 'bg-zinc-300 text-zinc-900 border-zinc-300 font-medium'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700'
                    }`}
                  >
                    {p === 'center' ? 'Mid' : p === 'left' ? 'Left' : 'Right'}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-end gap-2 pb-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hook}
                onChange={e => setHook(e.target.checked)}
                disabled={isRunning}
                className="accent-zinc-300"
              />
              <span className="text-xs text-zinc-300">AI hook title</span>
            </label>
          </div>

          <button
            type="button"
            onClick={startJob}
            disabled={!canStart}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-zinc-400 to-zinc-300 text-zinc-900 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400 transition-all hover:shadow-lg hover:shadow-zinc-400/40 disabled:shadow-none"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            {isRunning ? job?.message || 'Working…' : `Generate ${count} short${count === 1 ? '' : 's'}`}
          </button>
          {sourceAsset && !isRunning && (sourceAsset.duration || 0) > 1800 && (
            <p className="text-[10px] text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Long video: transcription runs on CPU and may take several minutes.
            </p>
          )}
        </div>

        {/* Progress */}
        {job && (job.status === 'running' || job.steps.length > 0) && (
          <div className="px-4 py-3 border-b border-zinc-800/50 space-y-1.5">
            {job.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <StepIcon status={step.status} />
                <span className={`text-xs leading-relaxed ${step.status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>{step.label}</span>
              </div>
            ))}
            {job.status === 'running' && job.steps.every(s => s.status !== 'running') && (
              <div className="flex items-start gap-2">
                <Loader2 className="w-3.5 h-3.5 text-zinc-300 animate-spin flex-shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-400">{job.message}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mx-4 my-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200 whitespace-pre-wrap">{error}</div>
        )}

        {/* Results (from library so they persist across reloads) */}
        <div className="p-4 space-y-3">
          {existingShorts.length === 0 && !isRunning && (
            <div className="text-xs text-zinc-500 space-y-2">
              <p>No shorts yet. Pick a talking video, hit Generate, and the best moments show up here and in your asset library.</p>
              <p className="flex items-center gap-1"><Circle className="w-2 h-2 fill-current text-zinc-600" /> Needs a speaking video. Transcription and ranking work off the words.</p>
            </div>
          )}
          {existingShorts.map((asset, idx) => {
            const meta = asset.shortMeta!;
            return (
              <div key={asset.id} className="bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700/40">
                <div className="flex gap-3 p-3">
                  <div className="w-14 h-24 bg-zinc-950 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {asset.thumbnailUrl ? (
                      <img src={asset.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Scissors className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${scoreColor(meta.score)}`}>{meta.score}</span>
                      <span className="text-[10px] text-zinc-500">#{idx + 1} · {fmtTime(asset.duration || 0)} · {meta.ratio}</span>
                    </div>
                    <p className="text-sm text-zinc-100 font-medium mt-1 truncate" title={meta.title}>{meta.title}</p>
                    {meta.hook && (
                      <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2" title={meta.hookBurnedIn ? 'Burned into the first 3s' : 'Suggested hook (not burned in)'}>
                        “{meta.hook}”
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2">{meta.reason}</p>
                    <p className="text-[10px] text-zinc-600 mt-1">from {fmtTime(meta.sourceStart)} → {fmtTime(meta.sourceEnd)}</p>
                  </div>
                </div>
                <div className="flex border-t border-zinc-700/40">
                  <button
                    type="button"
                    onClick={() => onAddToTimeline(asset.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-200 hover:bg-zinc-700/60 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add to timeline
                  </button>
                  <a
                    href={asset.streamUrl?.split('?')[0]}
                    download={asset.filename}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-300 hover:bg-zinc-700/60 border-l border-zinc-700/40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
