import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoPreview, { VideoPreviewHandle } from '@/react-app/components/VideoPreview';
import Timeline from '@/react-app/components/Timeline';
import AssetLibrary from '@/react-app/components/AssetLibrary';
import ClipPropertiesPanel from '@/react-app/components/ClipPropertiesPanel';
import AIPromptPanel from '@/react-app/components/AIPromptPanel';
import MotionGraphicsPanel from '@/react-app/components/MotionGraphicsPanel';
import ResizablePanel from '@/react-app/components/ResizablePanel';
import ResizableVerticalPanel from '@/react-app/components/ResizableVerticalPanel';
import { useProject, Asset, TimelineClip } from '@/react-app/hooks/useProject';
import { useVideoSession } from '@/react-app/hooks/useVideoSession';
import { Sparkles, Wand2, ListOrdered, Copy, Check, X, Download, Play } from 'lucide-react';
import type { TemplateId } from '@/remotion/templates';

interface ChapterData {
  chapters: Array<{ start: number; title: string }>;
  youtubeFormat: string;
  summary: string;
}

export default function Home() {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [chapterData, setChapterData] = useState<ChapterData | null>(null);
  const [showChapters, setShowChapters] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'ai' | 'motion'>('ai');

  const videoPreviewRef = useRef<VideoPreviewHandle>(null);
  const playbackRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Use the new project hook for multi-asset management
  const {
    session,
    assets,
    tracks,
    clips,
    loading,
    status,
    checkServer,
    uploadAsset,
    deleteAsset,
    getAssetStreamUrl,
    createGif,
    addClip,
    updateClip,
    deleteClip,
    moveClip,
    splitClip,
    saveProject,
    renderProject,
    getDuration,
  } = useProject();

  // Use the legacy session hook for AI editing (single video operations)
  const {
    session: legacySession,
    processing: legacyProcessing,
    status: legacyStatus,
    generateChapters: legacyGenerateChapters,
  } = useVideoSession();

  // Check server on mount
  useEffect(() => {
    checkServer();
  }, [checkServer]);

  // Get all clips at the current playhead position as layers
  const getPreviewLayers = useCallback(() => {
    // If a specific asset is selected for preview (from library), show only that
    if (previewAssetId) {
      const asset = assets.find(a => a.id === previewAssetId);
      if (asset) {
        return [{
          id: 'preview-' + previewAssetId,
          url: getAssetStreamUrl(previewAssetId),
          type: asset.type,
          trackId: 'V1',
          clipTime: 0,
        }];
      }
      return [];
    }

    // Find ALL clips at the current playhead position
    const layers: Array<{
      id: string;
      url: string;
      type: 'video' | 'image' | 'audio';
      trackId: string;
      clipTime: number;
      clipStart: number;
      transform?: TimelineClip['transform'];
    }> = [];

    // Check video tracks (V1, V2, V3...)
    const videoTracks = ['V1', 'V2', 'V3'];

    for (const trackId of videoTracks) {
      const clipsOnTrack = clips.filter(c =>
        c.trackId === trackId &&
        currentTime >= c.start &&
        currentTime < c.start + c.duration
      );

      for (const clip of clipsOnTrack) {
        const asset = assets.find(a => a.id === clip.assetId);
        const url = asset ? getAssetStreamUrl(asset.id) : null;
        if (asset && url) {
          // Calculate the time within the clip (accounting for in-point)
          const clipTime = (currentTime - clip.start) + (clip.inPoint || 0);
          layers.push({
            id: clip.id,
            url,
            type: asset.type,
            trackId: clip.trackId,
            clipTime,
            clipStart: clip.start,
            transform: clip.transform,
          });
        }
      }
    }

    return layers;
  }, [previewAssetId, assets, clips, currentTime, getAssetStreamUrl]);

  const previewLayers = getPreviewLayers();
  const hasPreviewContent = previewLayers.length > 0;

  // Get total project duration
  const duration = getDuration();

  // Timeline playback effect
  useEffect(() => {
    if (isPlaying && duration > 0) {
      lastTimeRef.current = performance.now();

      const animate = (now: number) => {
        const delta = (now - lastTimeRef.current) / 1000; // Convert to seconds
        lastTimeRef.current = now;

        setCurrentTime(prev => {
          const newTime = prev + delta;
          if (newTime >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return newTime;
        });

        playbackRef.current = requestAnimationFrame(animate);
      };

      playbackRef.current = requestAnimationFrame(animate);

      return () => {
        if (playbackRef.current) {
          cancelAnimationFrame(playbackRef.current);
        }
      };
    }
  }, [isPlaying, duration]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    if (currentTime >= duration && duration > 0) {
      // If at end, restart from beginning
      setCurrentTime(0);
    }
    setIsPlaying(prev => !prev);
  }, [currentTime, duration]);

  // Handle stop (go to beginning)
  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Handle timeline seeking
  const handleTimelineSeek = useCallback((time: number) => {
    setCurrentTime(time);
    // Don't seek the video directly - let the clipTime prop handle it
  }, []);


  // Handle asset upload
  const handleAssetUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        await uploadAsset(file);
      } catch (error) {
        console.error('Upload failed:', error);
        alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }, [uploadAsset]);

  // Handle drag start from asset library
  const handleAssetDragStart = useCallback((_asset: Asset) => {
    // Asset drag is handled by the browser's native drag-drop
  }, []);

  // Handle asset selection (from library)
  const handleAssetSelect = useCallback((assetId: string | null) => {
    setSelectedAssetId(assetId);
    // When selecting from library, preview that asset
    setPreviewAssetId(assetId);
    // Clear timeline clip selection
    setSelectedClipId(null);
  }, []);

  // Handle dropping asset onto timeline
  const handleDropAsset = useCallback((asset: Asset, trackId: string, time: number) => {
    // Determine which track to use based on asset type
    let targetTrackId = trackId;

    // If dropping audio on video track, redirect to audio track
    if (asset.type === 'audio' && trackId.startsWith('V')) {
      targetTrackId = 'A1';
    }
    // If dropping video/image on audio track, redirect to video track
    if (asset.type !== 'audio' && trackId.startsWith('A')) {
      targetTrackId = 'V1';
    }

    // Images need a default duration (5 seconds) since they don't have inherent duration
    const clipDuration = asset.type === 'image' ? 5 : undefined;
    addClip(asset.id, targetTrackId, time, clipDuration);
    saveProject();
  }, [addClip, saveProject]);

  // Handle moving clip
  const handleMoveClip = useCallback((clipId: string, newStart: number, newTrackId?: string) => {
    moveClip(clipId, newStart, newTrackId);
  }, [moveClip]);

  // Handle resizing clip
  const handleResizeClip = useCallback((clipId: string, newInPoint: number, newOutPoint: number, newStart?: number) => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    const newDuration = newOutPoint - newInPoint;
    updateClip(clipId, {
      inPoint: newInPoint,
      outPoint: newOutPoint,
      duration: newDuration,
      start: newStart ?? clip.start,
    });
  }, [clips, updateClip]);

  // Handle deleting clip from timeline
  const handleDeleteClip = useCallback((clipId: string) => {
    deleteClip(clipId);
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [deleteClip, selectedClipId]);

  // Handle cutting clips at the playhead position
  const handleCutAtPlayhead = useCallback(() => {
    // Find all clips that are under the playhead
    const clipsAtPlayhead = clips.filter(clip =>
      currentTime > clip.start && currentTime < clip.start + clip.duration
    );

    if (clipsAtPlayhead.length === 0) {
      return; // No clips to cut
    }

    // Split each clip at the playhead
    for (const clip of clipsAtPlayhead) {
      splitClip(clip.id, currentTime);
    }

    saveProject();
  }, [clips, currentTime, splitClip, saveProject]);

  // Handle selecting clip
  const handleSelectClip = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
    // Clear asset preview mode - let timeline-based preview take over
    setPreviewAssetId(null);

    // If a clip is selected, move playhead to clip start
    if (clipId) {
      const clip = clips.find(c => c.id === clipId);
      if (clip) {
        setCurrentTime(clip.start);
      }
    }
  }, [clips]);

  // Handle updating clip transform (scale, rotation, crop, etc.)
  const handleUpdateClipTransform = useCallback((clipId: string, transform: TimelineClip['transform']) => {
    updateClip(clipId, { transform });
    saveProject();
  }, [updateClip, saveProject]);

  // Get selected clip and its asset
  const selectedClip = useMemo(() =>
    clips.find(c => c.id === selectedClipId) || null,
    [clips, selectedClipId]
  );

  const selectedClipAsset = useMemo(() =>
    selectedClip ? assets.find(a => a.id === selectedClip.assetId) || null : null,
    [selectedClip, assets]
  );

  // Handle dragging overlay in video preview
  const handleLayerMove = useCallback((layerId: string, x: number, y: number) => {
    const clip = clips.find(c => c.id === layerId);
    if (!clip) return;

    const currentTransform = clip.transform || {};
    updateClip(layerId, {
      transform: { ...currentTransform, x, y }
    });
  }, [clips, updateClip]);

  // Handle selecting layer from video preview
  const handleLayerSelect = useCallback((layerId: string) => {
    setSelectedClipId(layerId);
    setPreviewAssetId(null);
  }, []);

  // Handle AI edit (using legacy single-video processing)
  const handleApplyEdit = useCallback(async (command: string) => {
    // For AI edits, we need a video to work with
    // Use the first video asset or require one to be selected
    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    // For now, AI edits work on the legacy session
    // This could be enhanced to work with the multi-asset project
    console.log('AI edit command:', command);
    throw new Error('AI editing requires uploading a video through the legacy flow. Multi-asset AI editing coming soon.');
  }, [assets]);

  // Handle chapter generation
  const handleGenerateChapters = useCallback(async () => {
    if (!legacySession) {
      alert('Please upload a video using the AI Edit panel first');
      return;
    }

    try {
      const result = await legacyGenerateChapters();
      setChapterData(result);
      setShowChapters(true);
    } catch (error) {
      console.error('Chapter generation failed:', error);
      alert(`Failed to generate chapters: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [legacySession, legacyGenerateChapters]);

  // Copy chapters to clipboard
  const handleCopyChapters = useCallback(() => {
    if (chapterData?.youtubeFormat) {
      navigator.clipboard.writeText(chapterData.youtubeFormat);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [chapterData]);

  // Handle auto-extract keywords and add GIFs
  const handleExtractKeywordsAndAddGifs = useCallback(async () => {
    if (!session) {
      throw new Error('No session available');
    }

    // Check if we have a video asset
    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    // Call the transcribe-and-extract endpoint
    const response = await fetch(`http://localhost:3333/session/${session}/transcribe-and-extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to extract keywords');
    }

    const data = await response.json();
    console.log('Transcription result:', data);

    // Add each GIF to the timeline at its timestamp on the V2 (overlay) track
    for (const gifInfo of data.gifAssets) {
      // Add clip to V2 track at the keyword's timestamp
      addClip(gifInfo.assetId, 'V2', gifInfo.timestamp, 3); // 3 second duration for GIFs
    }

    // Save the project with the new clips
    await saveProject();

    return data;
  }, [session, assets, addClip, saveProject]);

  // Handle adding motion graphic to timeline
  const handleAddMotionGraphic = useCallback(async (
    templateId: TemplateId,
    props: Record<string, unknown>,
    duration: number
  ) => {
    if (!session) {
      alert('Please upload a video first to start a session');
      return;
    }

    try {
      // For now, we'll call the server to render the motion graphic
      // The server will use Remotion to render it to MP4
      const response = await fetch(`http://localhost:3333/session/${session}/render-motion-graphic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          props,
          duration,
          fps: 30,
          width: 1920,
          height: 1080,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to render motion graphic');
      }

      const data = await response.json();

      // Add the rendered motion graphic to the timeline at the current playhead position
      addClip(data.assetId, 'V2', currentTime, duration);
      await saveProject();

      console.log('Motion graphic added:', data);
    } catch (error) {
      console.error('Failed to add motion graphic:', error);
      // Fallback: just show an alert for now
      alert(`Motion graphics rendering not yet available on server. Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }, [session, currentTime, addClip, saveProject]);

  // Handle render/export
  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert('Add some clips to the timeline first');
      return;
    }

    try {
      const downloadUrl = await renderProject(false);
      // Trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'export.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [clips.length, renderProject]);

  const isProcessing = loading || legacyProcessing;
  const currentStatus = status || legacyStatus;

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-zinc-900/50 border-b border-zinc-800/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              HyperEdit
            </h1>
          </div>
          {currentStatus && (
            <span className="text-xs text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
              {currentStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(session || legacySession) && (
            <>
              <button
                onClick={handleGenerateChapters}
                disabled={isProcessing || !legacySession}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <ListOrdered className="w-4 h-4" />
                Chapters
              </button>
              {clips.length > 0 && (
                <button
                  onClick={handleExport}
                  disabled={isProcessing}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export
                </button>
              )}
            </>
          )}
          <button className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-lg text-sm font-medium transition-all">
            AI Edit
          </button>
        </div>
      </header>

      {/* Chapters Modal */}
      {showChapters && chapterData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-orange-400" />
                YouTube Chapters
              </h2>
              <button
                onClick={() => setShowChapters(false)}
                className="p-1 hover:bg-zinc-700 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {chapterData.summary && (
                <p className="text-sm text-zinc-400 mb-4">{chapterData.summary}</p>
              )}

              <div className="bg-zinc-800 rounded-lg p-4 font-mono text-sm">
                <pre className="whitespace-pre-wrap text-zinc-200">{chapterData.youtubeFormat}</pre>
              </div>

              <div className="mt-4 space-y-2">
                {chapterData.chapters.map((ch, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      videoPreviewRef.current?.seekTo(ch.start);
                      setCurrentTime(ch.start);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors flex items-center justify-between"
                  >
                    <span className="text-zinc-200">{ch.title}</span>
                    <span className="text-zinc-500 text-sm">
                      {Math.floor(ch.start / 60)}:{Math.floor(ch.start % 60).toString().padStart(2, '0')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-zinc-700 flex gap-2">
              <button
                onClick={handleCopyChapters}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy for YouTube
                  </>
                )}
              </button>
              <button
                onClick={() => setShowChapters(false)}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Assets & Clip Properties */}
        <ResizablePanel
          defaultWidth={220}
          minWidth={180}
          maxWidth={400}
          side="left"
        >
          <div className="flex flex-col h-full">
            {/* Asset Library */}
            <div className={`${selectedClipId ? 'h-1/2' : 'h-full'} overflow-hidden`}>
              <AssetLibrary
                assets={assets}
                onUpload={handleAssetUpload}
                onDelete={deleteAsset}
                onDragStart={handleAssetDragStart}
                onSelect={handleAssetSelect}
                selectedAssetId={selectedAssetId}
                uploading={loading}
              />
            </div>

            {/* Clip Properties Panel (shown when clip is selected) */}
            {selectedClipId && (
              <div className="h-1/2 border-t border-zinc-800/50 bg-zinc-900/50 overflow-hidden">
                <ClipPropertiesPanel
                  clip={selectedClip}
                  asset={selectedClipAsset}
                  onUpdateTransform={handleUpdateClipTransform}
                  onClose={() => setSelectedClipId(null)}
                />
              </div>
            )}
          </div>
        </ResizablePanel>

        {/* Main Editor Area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center bg-zinc-900/30 p-4 min-h-0 overflow-hidden">
            {hasPreviewContent ? (
              <VideoPreview
                ref={videoPreviewRef}
                layers={previewLayers}
                isPlaying={isPlaying && !previewAssetId}
                onLayerMove={handleLayerMove}
                onLayerSelect={handleLayerSelect}
                selectedLayerId={selectedClipId}
              />
            ) : clips.length > 0 ? (
              // Assets exist but playhead is not over any clip
              <div className="relative w-full max-w-4xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center">
                <div className="text-center text-zinc-600">
                  <div className="text-sm">No clip at playhead</div>
                  <div className="text-xs mt-1">Move playhead over a clip to preview</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-500">
                <Play className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-sm">Upload assets from the left panel</p>
                <p className="text-xs text-zinc-600 mt-1">Drag them to the timeline below</p>
              </div>
            )}
          </div>

          {/* Timeline - Resizable height */}
          <ResizableVerticalPanel
            defaultHeight={224}
            minHeight={150}
            maxHeight={500}
            position="bottom"
            className="bg-zinc-900/50 border-t border-zinc-800/50 overflow-hidden"
          >
            <Timeline
              tracks={tracks}
              clips={clips}
              assets={assets}
              selectedClipId={selectedClipId}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onSelectClip={handleSelectClip}
              onTimeChange={handleTimelineSeek}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onMoveClip={handleMoveClip}
              onResizeClip={handleResizeClip}
              onDeleteClip={handleDeleteClip}
              onCutAtPlayhead={handleCutAtPlayhead}
              onDropAsset={handleDropAsset}
              onSave={saveProject}
            />
          </ResizableVerticalPanel>
        </div>

        {/* Right Panel - AI / Motion Graphics */}
        <ResizablePanel
          defaultWidth={320}
          minWidth={280}
          maxWidth={500}
          side="right"
        >
          <div className="h-full flex flex-col bg-zinc-900/80 backdrop-blur-sm">
            {/* Tab switcher */}
            <div className="flex border-b border-zinc-800/50">
              <button
                onClick={() => setRightPanelTab('ai')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === 'ai'
                    ? 'text-orange-400 border-b-2 border-orange-400 bg-orange-500/5'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                AI Edit
              </button>
              <button
                onClick={() => setRightPanelTab('motion')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  rightPanelTab === 'motion'
                    ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Wand2 className="w-4 h-4" />
                Motion
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-hidden">
              {rightPanelTab === 'ai' ? (
                <AIPromptPanel
                  onApplyEdit={handleApplyEdit}
                  onExtractKeywordsAndAddGifs={handleExtractKeywordsAndAddGifs}
                  isApplying={isProcessing}
                  applyProgress={0}
                  applyStatus={currentStatus}
                  hasVideo={assets.some(a => a.type === 'video')}
                />
              ) : (
                <MotionGraphicsPanel
                  onAddToTimeline={handleAddMotionGraphic}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
      </div>
    </div>
  );
}
