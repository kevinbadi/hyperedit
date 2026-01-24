import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import VideoPreview, { VideoPreviewHandle } from '@/react-app/components/VideoPreview';
import Timeline from '@/react-app/components/Timeline';
import AssetLibrary from '@/react-app/components/AssetLibrary';
import ClipPropertiesPanel from '@/react-app/components/ClipPropertiesPanel';
import CaptionPropertiesPanel from '@/react-app/components/CaptionPropertiesPanel';
import AIPromptPanel from '@/react-app/components/AIPromptPanel';
import PicassoPanel from '@/react-app/components/PicassoPanel';
import ResizablePanel from '@/react-app/components/ResizablePanel';
import ResizableVerticalPanel from '@/react-app/components/ResizableVerticalPanel';
import TimelineTabs from '@/react-app/components/TimelineTabs';
import { useProject, Asset, TimelineClip, CaptionStyle } from '@/react-app/hooks/useProject';
import { useVideoSession } from '@/react-app/hooks/useVideoSession';
import { Sparkles, ListOrdered, Copy, Check, X, Download, Play, Palette } from 'lucide-react';
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
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [autoSnap, setAutoSnap] = useState(true); // Ripple delete mode - shift clips when deleting
  const [activeAgent, setActiveAgent] = useState<'director' | 'picasso'>('director');

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
    refreshAssets,
    addClip,
    updateClip,
    deleteClip,
    moveClip,
    splitClip,
    saveProject,
    loadProject,
    renderProject,
    getDuration,
    // Captions
    addCaptionClipsBatch,
    updateCaptionStyle,
    getCaptionData,
    // Timeline tabs
    timelineTabs,
    activeTabId,
    createTimelineTab,
    switchTimelineTab,
    closeTimelineTab,
    updateTabClips,
    updateTabAsset,
    // Settings
    setSettings,
  } = useProject();

  // Compute the active clips based on which tab is selected
  const activeClips = useMemo(() => {
    if (activeTabId === 'main') {
      return clips;
    }
    const activeTab = timelineTabs.find(tab => tab.id === activeTabId);
    return activeTab?.clips || [];
  }, [activeTabId, clips, timelineTabs]);

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

  // Load project from server when session becomes available
  useEffect(() => {
    if (session) {
      console.log('Session available, loading project...');
      loadProject();
    }
  }, [session, loadProject]);

  // Get all clips at the current playhead position as layers
  const getPreviewLayers = useCallback(() => {
    // If a specific asset is selected for preview (from library), show only that
    if (previewAssetId) {
      const asset = assets.find(a => a.id === previewAssetId);
      // Use asset.streamUrl which has cache-busting timestamp
      const url = asset?.streamUrl || (asset ? getAssetStreamUrl(previewAssetId) : null);
      if (asset && url) {
        return [{
          id: 'preview-' + previewAssetId,
          url,
          type: asset.type,
          trackId: 'V1',
          clipTime: 0,
          clipStart: 0,
        }];
      }
      return [];
    }

    // Find ALL clips at the current playhead position
    const layers: Array<{
      id: string;
      url: string;
      type: 'video' | 'image' | 'audio' | 'caption';
      trackId: string;
      clipTime: number;
      clipStart: number;
      transform?: TimelineClip['transform'];
      captionWords?: Array<{ text: string; start: number; end: number }>;
      captionStyle?: CaptionStyle;
    }> = [];

    // Check video tracks (V1, V2, V3...)
    const videoTracks = ['V1', 'V2', 'V3'];

    for (const trackId of videoTracks) {
      const clipsOnTrack = activeClips.filter(c =>
        c.trackId === trackId &&
        currentTime >= c.start &&
        currentTime < c.start + c.duration
      );

      for (const clip of clipsOnTrack) {
        const asset = assets.find(a => a.id === clip.assetId);
        // Use asset.streamUrl which has cache-busting timestamp from refreshAssets
        const url = asset?.streamUrl || (asset ? getAssetStreamUrl(asset.id) : null);
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

    // Check caption track (T1)
    const captionClips = activeClips.filter(c =>
      c.trackId === 'T1' &&
      currentTime >= c.start &&
      currentTime < c.start + c.duration
    );

    for (const clip of captionClips) {
      const caption = getCaptionData(clip.id);
      if (caption) {
        const clipTime = currentTime - clip.start;
        layers.push({
          id: clip.id,
          url: '',
          type: 'caption',
          trackId: clip.trackId,
          clipTime,
          clipStart: clip.start,
          captionWords: caption.words,
          captionStyle: caption.style,
        });
      }
    }

    return layers;
  }, [previewAssetId, assets, activeClips, currentTime, getAssetStreamUrl, getCaptionData]);

  const previewLayers = getPreviewLayers();
  const hasPreviewContent = previewLayers.length > 0;

  // Get duration based on active tab's clips
  const duration = useMemo(() => {
    if (activeClips.length === 0) return 0;
    return Math.max(...activeClips.map(c => c.start + c.duration));
  }, [activeClips]);

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
        const newAsset = await uploadAsset(file);

        // Auto-detect aspect ratio from video dimensions
        if (newAsset && newAsset.type === 'video' && newAsset.width && newAsset.height) {
          const isPortrait = newAsset.height > newAsset.width;
          setAspectRatio(isPortrait ? '9:16' : '16:9');
          console.log(`Auto-detected aspect ratio: ${isPortrait ? '9:16 (portrait)' : '16:9 (landscape)'} from ${newAsset.width}x${newAsset.height}`);
        }
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
    const clipDuration = asset.type === 'image' ? 5 : asset.duration;

    // Check if we're on an edit tab (not main)
    if (activeTabId !== 'main') {
      // Add clip to the edit tab's clips array
      const activeTab = timelineTabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        const newClip: TimelineClip = {
          id: crypto.randomUUID(),
          assetId: asset.id,
          trackId: targetTrackId,
          start: time,
          duration: clipDuration || 5,
          inPoint: 0,
          outPoint: clipDuration || 5,
        };
        updateTabClips(activeTabId, [...activeTab.clips, newClip]);
        console.log('Added clip to edit tab:', activeTabId, newClip);
      }
    } else {
      // Add clip to main timeline
      addClip(asset.id, targetTrackId, time, clipDuration);
    }
    saveProject();
  }, [addClip, saveProject, activeTabId, timelineTabs, updateTabClips]);

  // Handle moving clip
  const handleMoveClip = useCallback((clipId: string, newStart: number, newTrackId?: string) => {
    // Check if we're on an edit tab
    if (activeTabId !== 'main') {
      const activeTab = timelineTabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        const updatedClips = activeTab.clips.map(clip => {
          if (clip.id === clipId) {
            return {
              ...clip,
              start: newStart,
              trackId: newTrackId || clip.trackId,
            };
          }
          return clip;
        });
        updateTabClips(activeTabId, updatedClips);
      }
    } else {
      moveClip(clipId, newStart, newTrackId);
    }
  }, [moveClip, activeTabId, timelineTabs, updateTabClips]);

  // Handle resizing clip
  const handleResizeClip = useCallback((clipId: string, newInPoint: number, newOutPoint: number, newStart?: number) => {
    const newDuration = newOutPoint - newInPoint;

    // Check if we're on an edit tab
    if (activeTabId !== 'main') {
      const activeTab = timelineTabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        const clip = activeTab.clips.find(c => c.id === clipId);
        if (!clip) return;

        const updatedClips = activeTab.clips.map(c => {
          if (c.id === clipId) {
            return {
              ...c,
              inPoint: newInPoint,
              outPoint: newOutPoint,
              duration: newDuration,
              start: newStart ?? c.start,
            };
          }
          return c;
        });
        updateTabClips(activeTabId, updatedClips);
      }
    } else {
      const clip = clips.find(c => c.id === clipId);
      if (!clip) return;

      updateClip(clipId, {
        inPoint: newInPoint,
        outPoint: newOutPoint,
        duration: newDuration,
        start: newStart ?? clip.start,
      });
    }
  }, [clips, updateClip, activeTabId, timelineTabs, updateTabClips]);

  // Handle deleting clip from timeline (with autoSnap/ripple support)
  const handleDeleteClip = useCallback((clipId: string) => {
    // Check if we're on an edit tab
    if (activeTabId !== 'main') {
      const activeTab = timelineTabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        const updatedClips = activeTab.clips.filter(c => c.id !== clipId);
        updateTabClips(activeTabId, updatedClips);
      }
    } else {
      deleteClip(clipId, autoSnap);
    }

    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
  }, [deleteClip, selectedClipId, autoSnap, activeTabId, timelineTabs, updateTabClips]);

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

  // Handle adding text overlay
  const handleAddText = useCallback(() => {
    // Create a text clip on T1 track at current playhead
    // TODO: Open text editor modal or add default text
    console.log('Add text overlay at', currentTime);
  }, [currentTime]);

  // Handle toggling aspect ratio
  const handleToggleAspectRatio = useCallback(() => {
    setAspectRatio(prev => {
      const newRatio = prev === '16:9' ? '9:16' : '16:9';
      // Update project settings with new dimensions
      if (newRatio === '9:16') {
        setSettings(s => ({ ...s, width: 1080, height: 1920 }));
      } else {
        setSettings(s => ({ ...s, width: 1920, height: 1080 }));
      }
      return newRatio;
    });
  }, [setSettings]);

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

  // Check if selected clip is a caption
  const selectedCaptionData = useMemo(() =>
    selectedClip && selectedClip.trackId === 'T1' ? getCaptionData(selectedClip.id) : null,
    [selectedClip, getCaptionData]
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

  // Handle AI edit (using FFmpeg on video assets)
  const handleApplyEdit = useCallback(async (command: string) => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first');
    }

    // Find the video asset to edit - prioritize selected clip's asset, otherwise first video
    let targetAssetId: string | null = null;

    if (selectedClipId) {
      const selectedClip = clips.find(c => c.id === selectedClipId);
      if (selectedClip) {
        const asset = assets.find(a => a.id === selectedClip.assetId);
        if (asset?.type === 'video') {
          targetAssetId = asset.id;
        }
      }
    }

    if (!targetAssetId) {
      const videoAsset = assets.find(a => a.type === 'video');
      if (!videoAsset) {
        throw new Error('Please upload a video first');
      }
      targetAssetId = videoAsset.id;
    }

    console.log('Applying FFmpeg edit to asset:', targetAssetId);
    console.log('Command:', command);

    // Call the server to process the video with FFmpeg
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/process-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: targetAssetId,
        command,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to apply edit');
    }

    const result = await response.json();
    console.log('Edit applied, new asset:', result.assetId);

    // Refresh assets to get the new processed asset
    await refreshAssets();

    // Optionally replace clips using the old asset with the new one
    if (result.assetId && result.assetId !== targetAssetId) {
      // Find clips using the old asset and update them to use the new one
      const clipsToUpdate = clips.filter(c => c.assetId === targetAssetId);
      for (const clip of clipsToUpdate) {
        updateClip(clip.id, { assetId: result.assetId });
      }
      await saveProject();
    }
  }, [session, assets, clips, selectedClipId, refreshAssets, updateClip, saveProject]);

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

  // Generate chapters and make cuts at each chapter point
  const handleChapterCuts = useCallback(async (): Promise<{
    chapters: Array<{ start: number; title: string }>;
    cutsApplied: number;
    youtubeFormat: string;
  }> => {
    if (!session) {
      throw new Error('No session available');
    }

    // Check if we have a video asset on V1
    const v1Clip = clips.find(c => c.trackId === 'V1');
    if (!v1Clip) {
      throw new Error('No video clip on V1 track. Please add a video to the timeline first.');
    }

    console.log('Generating chapters and making cuts...');

    // Generate chapters using the session API
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/chapters`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate chapters');
    }

    const result = await response.json();
    const chapters: Array<{ start: number; title: string }> = result.chapters || [];

    if (chapters.length === 0) {
      throw new Error('No chapters were detected in the video');
    }

    console.log(`Generated ${chapters.length} chapters:`, chapters);

    // Store chapter data for the modal
    setChapterData(result);

    // Get chapter timestamps to cut at (skip first chapter at 0:00)
    const cutTimestamps = chapters
      .filter(ch => ch.start >= 0.5)
      .map(ch => ch.start)
      .sort((a, b) => a - b);

    console.log('Cut timestamps:', cutTimestamps);

    // Get current project state from server
    const projectResponse = await fetch(`http://localhost:3333/session/${session.sessionId}/project`);
    const projectData = await projectResponse.json();
    let currentClips: TimelineClip[] = projectData.clips || [];

    // Process all cuts by directly manipulating the clips array
    // This avoids React state batching issues
    let cutsApplied = 0;

    for (const timestamp of cutTimestamps) {
      // Find clip that spans this timestamp on V1
      const clipIndex = currentClips.findIndex((clip: TimelineClip) =>
        clip.trackId === 'V1' &&
        timestamp > clip.start &&
        timestamp < clip.start + clip.duration
      );

      if (clipIndex === -1) continue;

      const clip = currentClips[clipIndex];
      const timeInClip = timestamp - clip.start;

      // Skip if too close to edges
      if (timeInClip <= 0.05 || timeInClip >= clip.duration - 0.05) continue;

      const splitInPoint = clip.inPoint + timeInClip;

      // Create the second clip (after the split)
      const secondClip: TimelineClip = {
        id: crypto.randomUUID(),
        assetId: clip.assetId,
        trackId: clip.trackId,
        start: timestamp,
        duration: clip.duration - timeInClip,
        inPoint: splitInPoint,
        outPoint: clip.outPoint,
        transform: clip.transform ? { ...clip.transform } : undefined,
      };

      // Update the first clip (shorten it)
      currentClips[clipIndex] = {
        ...clip,
        duration: timeInClip,
        outPoint: splitInPoint,
      };

      // Add the second clip
      currentClips.push(secondClip);
      cutsApplied++;

      console.log(`Cut at ${timestamp}s: clip ${clip.id} -> new clip ${secondClip.id}`);
    }

    // Save the modified clips directly to server
    if (cutsApplied > 0) {
      await fetch(`http://localhost:3333/session/${session.sessionId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...projectData, clips: currentClips }),
      });

      // Reload to sync local state
      await loadProject();
    }

    return {
      chapters,
      cutsApplied,
      youtubeFormat: result.youtubeFormat || '',
    };
  }, [session, clips, loadProject]);

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
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/transcribe-and-extract`, {
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

  // Handle generating B-roll images and adding to timeline
  const handleGenerateBroll = useCallback(async () => {
    if (!session) {
      throw new Error('No session available');
    }

    // Check if we have a video asset
    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    // Call the generate-broll endpoint
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/generate-broll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate B-roll');
    }

    const data = await response.json();
    console.log('B-roll generation result:', data);
    console.log('B-roll assets to add:', data.brollAssets);

    if (!data.brollAssets || data.brollAssets.length === 0) {
      console.warn('No B-roll assets returned from server');
      return data;
    }

    // Refresh assets from server to get the newly generated B-roll images
    console.log('Refreshing assets from server...');
    await refreshAssets();

    // Default B-roll transform: 1/5 screen width, lower-middle position
    // With new rendering: scale = width percentage, x = horizontal offset, y = vertical offset (positive = up)
    const DEFAULT_BROLL_TRANSFORM = {
      scale: 0.2,   // 1/5th of screen width (20%)
      x: 0,         // Centered horizontally
      y: 0,         // No vertical offset (stays at bottom 10% default position)
    };

    // Create clips directly (bypassing addClip to avoid stale closure issue)
    const newClips: TimelineClip[] = data.brollAssets.map((brollInfo: { assetId: string; keyword: string; timestamp: number }) => ({
      id: crypto.randomUUID(),
      assetId: brollInfo.assetId,
      trackId: 'V3',
      start: brollInfo.timestamp,
      duration: 3,
      inPoint: 0,
      outPoint: 3,
      transform: DEFAULT_BROLL_TRANSFORM,
    }));

    console.log(`Created ${newClips.length} B-roll clips:`, newClips);

    // Add clips to state using the setter directly via a custom approach
    // We need to update clips state - let's use updateClip for each after adding via addClip workaround
    // Actually, let's just save directly to server and reload

    // Save clips directly to server
    const projectResponse = await fetch(`http://localhost:3333/session/${session.sessionId}/project`);
    const projectData = await projectResponse.json();

    const updatedClips = [...(projectData.clips || []), ...newClips];

    await fetch(`http://localhost:3333/session/${session.sessionId}/project`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...projectData,
        clips: updatedClips,
      }),
    });

    // Reload project to sync frontend state
    await loadProject();

    console.log('B-roll clips added successfully!');

    return data;
  }, [session, assets, refreshAssets, loadProject]);

  // Handle removing dead air / silence from the video
  const handleRemoveDeadAir = useCallback(async (): Promise<{ duration: number; removedDuration: number }> => {
    if (!session) {
      throw new Error('No session available');
    }

    // Check if we have a video asset
    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    console.log('Removing dead air from video...');

    // Call the remove-dead-air endpoint
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/remove-dead-air`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        silenceThreshold: -30, // dB threshold
        minSilenceDuration: 0.3, // minimum silence duration in seconds
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove dead air');
    }

    const result = await response.json();
    console.log('Dead air removal result:', result);

    // Refresh assets to get the updated video
    await refreshAssets();

    // Update the video clip duration if needed
    if (result.duration) {
      const v1Clip = clips.find(c => c.trackId === 'V1' && c.assetId === videoAsset.id);
      if (v1Clip) {
        updateClip(v1Clip.id, {
          duration: result.duration,
          outPoint: result.duration,
        });
        await saveProject();
      }
    }

    return {
      duration: result.duration,
      removedDuration: result.removedDuration,
    };
  }, [session, assets, clips, refreshAssets, updateClip, saveProject]);

  // Handle transcribing video and adding captions
  const handleTranscribeAndAddCaptions = useCallback(async (options?: { highlightColor?: string; fontFamily?: string }) => {
    if (!session) {
      throw new Error('No session available');
    }

    // Find the video asset to transcribe
    const videoAsset = assets.find(a => a.type === 'video');

    if (!videoAsset || videoAsset.type !== 'video') {
      throw new Error('Please upload a video first');
    }

    // Call the transcribe endpoint
    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: videoAsset.id }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to transcribe video');
    }

    const data = await response.json();
    console.log('Transcription result:', data);

    if (data.words && data.words.length > 0) {
      // Split words into chunks based on natural speech pauses
      // A pause of 0.7+ seconds indicates a new caption segment
      const PAUSE_THRESHOLD = 0.7; // seconds
      const MAX_WORDS_PER_CHUNK = 5; // Cap at 5 words max
      const chunks: Array<{ words: typeof data.words; start: number; end: number }> = [];

      let currentChunk: typeof data.words = [];

      for (let i = 0; i < data.words.length; i++) {
        const word = data.words[i];
        const prevWord = data.words[i - 1];

        // Start a new chunk if:
        // 1. There's a significant pause between words
        // 2. Current chunk has reached max words
        const hasSignificantPause = prevWord && (word.start - prevWord.end) >= PAUSE_THRESHOLD;
        const chunkIsFull = currentChunk.length >= MAX_WORDS_PER_CHUNK;

        if (currentChunk.length > 0 && (hasSignificantPause || chunkIsFull)) {
          // Save current chunk
          chunks.push({
            words: currentChunk,
            start: currentChunk[0].start,
            end: currentChunk[currentChunk.length - 1].end,
          });
          currentChunk = [];
        }

        currentChunk.push(word);
      }

      // Don't forget the last chunk
      if (currentChunk.length > 0) {
        chunks.push({
          words: currentChunk,
          start: currentChunk[0].start,
          end: currentChunk[currentChunk.length - 1].end,
        });
      }

      // Create all caption clips at once (batched for performance)
      const captionsToAdd = chunks.map(chunk => {
        const duration = chunk.end - chunk.start;
        // Adjust word timestamps to be relative to chunk start
        const relativeWords = chunk.words.map((w: { text: string; start: number; end: number }) => ({
          ...w,
          start: w.start - chunk.start,
          end: w.end - chunk.start,
        }));
        return {
          words: relativeWords,
          start: chunk.start,
          duration,
          style: {
            ...(options?.highlightColor && { highlightColor: options.highlightColor }),
            ...(options?.fontFamily && { fontFamily: options.fontFamily }),
          },
        };
      });

      addCaptionClipsBatch(captionsToAdd);
      await saveProject();
      console.log(`Created ${chunks.length} caption clips`);
    } else {
      throw new Error('No speech detected in video. Make sure your video has audible speech.');
    }

    return data;
  }, [session, assets, addCaptionClipsBatch, saveProject]);

  // Handle updating caption style
  const handleUpdateCaptionStyle = useCallback((clipId: string, styleUpdates: Partial<CaptionStyle>) => {
    updateCaptionStyle(clipId, styleUpdates);
    saveProject();
  }, [updateCaptionStyle, saveProject]);

  // Wrapper for AI prompt panel motion graphics (takes config object)
  const handleAddMotionGraphicFromPrompt = useCallback(async (config: {
    templateId: TemplateId;
    props: Record<string, unknown>;
    duration: number;
    startTime?: number;
  }) => {
    // Use startTime from config, or fall back to currentTime
    const startAt = config.startTime ?? currentTime;

    if (!session) {
      alert('Please upload a video first to start a session');
      return;
    }

    try {
      // Call the server to render the motion graphic
      const response = await fetch(`http://localhost:3333/session/${session.sessionId}/render-motion-graphic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: config.templateId,
          props: config.props,
          duration: config.duration,
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

      // Refresh assets to sync with server (motion graphic was just created)
      await refreshAssets();

      // Add the rendered motion graphic to the timeline at specified position
      addClip(data.assetId, 'V2', startAt, config.duration);

      // Switch to Main tab so user can see the added animation
      switchTimelineTab('main');

      await saveProject();

      console.log('Motion graphic added from prompt:', data);
    } catch (error) {
      console.error('Failed to add motion graphic:', error);
      throw error; // Re-throw so AIPromptPanel can show error
    }
  }, [session, currentTime, addClip, saveProject, refreshAssets, switchTimelineTab]);

  // Handle custom AI-generated animation creation
  const handleCreateCustomAnimation = useCallback(async (description: string, startTime?: number, endTime?: number, attachedAssetIds?: string[]) => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first to start a session');
    }

    try {
      // Find the primary video asset to use as context for the animation
      // First check V1 clips, then fall back to first video asset
      const v1Clips = clips.filter(c => c.trackId === 'V1');
      let videoAssetId: string | undefined;

      if (v1Clips.length > 0) {
        const v1Asset = assets.find(a => a.id === v1Clips[0].assetId && a.type === 'video');
        if (v1Asset) {
          videoAssetId = v1Asset.id;
        }
      }

      if (!videoAssetId) {
        const firstVideo = assets.find(a => a.type === 'video' && !a.aiGenerated);
        if (firstVideo) {
          videoAssetId = firstVideo.id;
        }
      }

      console.log(`[Animation] Creating with video context: ${videoAssetId || 'none'}, time range: ${startTime !== undefined ? `${startTime}s` : 'auto'}${endTime !== undefined ? ` - ${endTime}s` : ''}${attachedAssetIds?.length ? `, attached assets: ${attachedAssetIds.length}` : ''}`);

      // Call the server to generate AI animation with video context
      const response = await fetch(`http://localhost:3333/session/${session.sessionId}/generate-animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          videoAssetId, // Pass video for transcript context
          startTime,    // Optional: specific time range
          endTime,      // Optional: specific time range
          attachedAssetIds, // Optional: images/videos to include in animation
          fps: 30,
          width: 1920,
          height: 1080,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate animation');
      }

      const data = await response.json();

      // Refresh assets to sync with server (animation was just created)
      await refreshAssets();

      const animationDuration = data.duration;

      // If startTime is provided (from time selection tool), use that
      // Otherwise, detect animation type from description for placement
      let insertTime: number;
      if (startTime !== undefined) {
        insertTime = startTime;
        console.log(`Animation added at specified time: ${startTime}s`);
      } else {
        // Detect animation type from description for auto-placement
        const lower = description.toLowerCase();
        const isIntro = lower.includes('intro') || lower.includes('opening') || lower.includes('start');
        const isOutro = lower.includes('outro') || lower.includes('ending') || lower.includes('conclusion') || lower.includes('close');
        const videoDuration = getDuration();

        if (isIntro) {
          insertTime = 0;
          console.log('Intro animation added as overlay at beginning');
        } else if (isOutro) {
          insertTime = videoDuration;
          console.log('Outro animation added as overlay at end');
        } else {
          insertTime = currentTime;
          console.log('Animation added as overlay at playhead position');
        }
      }

      // Always add animations as overlays on V2
      addClip(data.assetId, 'V2', insertTime, animationDuration);

      // Switch to Main tab so user can see the added animation
      switchTimelineTab('main');

      await saveProject();

      console.log('Custom animation generated:', data, { insertTime });

      return {
        assetId: data.assetId,
        duration: data.duration,
      };
    } catch (error) {
      console.error('Failed to create custom animation:', error);
      throw error;
    }
  }, [session, currentTime, addClip, saveProject, refreshAssets, getDuration, switchTimelineTab, clips, assets]);

  // Handle analyzing video for animation (returns concept for approval)
  const handleAnalyzeForAnimation = useCallback(async (request: {
    type: 'intro' | 'outro' | 'transition' | 'highlight';
    description?: string;
    timeRange?: { start: number; end: number };
  }) => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first to start a session');
    }

    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    // Debug: log the time range being sent to server
    console.log('[DEBUG] Sending analyze-for-animation with timeRange:', JSON.stringify(request.timeRange));

    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/analyze-for-animation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: videoAsset.id,
        type: request.type,
        description: request.description,
        // Pass time range so server only analyzes that segment
        startTime: request.timeRange?.start,
        endTime: request.timeRange?.end,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to analyze video');
    }

    return await response.json();
  }, [session, assets]);

  // Handle rendering from pre-approved concept (skips analysis, uses provided scenes)
  const handleRenderFromConcept = useCallback(async (concept: {
    type: 'intro' | 'outro' | 'transition' | 'highlight';
    scenes: Array<{
      id: string;
      type: string;
      duration: number;
      content: Record<string, unknown>;
    }>;
    totalDuration: number;
    durationInSeconds: number;
    backgroundColor: string;
    contentSummary: string;
    startTime?: number; // Optional: explicit placement time
  }) => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first to start a session');
    }

    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/render-from-concept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept,
        fps: 30,
        width: 1920,
        height: 1080,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to render animation');
    }

    const data = await response.json();

    // Refresh assets to get the newly rendered animation
    await refreshAssets();

    const animationDuration = data.duration;
    const videoDuration = getDuration();

    // Determine placement: use explicit startTime if provided, otherwise use type-based logic
    let insertTime: number;
    if (concept.startTime !== undefined) {
      // Explicit time provided (from time selection tool)
      insertTime = concept.startTime;
      console.log(`Animation placed at specified time: ${insertTime}s`);
    } else if (concept.type === 'intro') {
      insertTime = 0;
      console.log('Intro animation added at beginning');
    } else if (concept.type === 'outro') {
      insertTime = videoDuration;
      console.log('Outro animation added at end');
    } else {
      insertTime = currentTime;
      console.log('Animation added at current playhead');
    }

    // Always add as overlay on V2 - never shift the original video
    addClip(data.assetId, 'V2', insertTime, animationDuration);

    // Switch to Main tab so user can see the animation
    switchTimelineTab('main');

    await saveProject();

    console.log('Animation rendered from concept:', data, { type: concept.type, insertTime });

    return {
      assetId: data.assetId,
      duration: data.duration,
    };
  }, [session, currentTime, refreshAssets, addClip, saveProject, getDuration, switchTimelineTab]);

  // Handle generating transcript animation (kinetic typography from speech)
  const handleGenerateTranscriptAnimation = useCallback(async () => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first to start a session');
    }

    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/generate-transcript-animation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fps: 30,
        width: 1920,
        height: 1080,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate transcript animation');
    }

    const data = await response.json();

    // Refresh assets to get the newly generated animation
    await refreshAssets();

    // Add the animation as an overlay on V2 at the current playhead
    addClip(data.assetId, 'V2', currentTime, data.duration);

    await saveProject();

    console.log('Transcript animation generated:', data);

    return {
      assetId: data.assetId,
      duration: data.duration,
    };
  }, [session, currentTime, refreshAssets, addClip, saveProject]);

  // Handle contextual animation creation (uses video content to inform the animation)
  const handleCreateContextualAnimation = useCallback(async (request: {
    type: 'intro' | 'outro' | 'transition' | 'highlight';
    description?: string;
  }) => {
    if (!session?.sessionId) {
      throw new Error('Please upload a video first to start a session');
    }

    // Find the main video asset to analyze
    const videoAsset = assets.find(a => a.type === 'video');
    if (!videoAsset) {
      throw new Error('Please upload a video first');
    }

    try {
      // Call the server to generate contextual animation
      // This endpoint will:
      // 1. Transcribe the video (if not already done)
      // 2. Analyze the content with AI
      // 3. Generate Remotion code based on the content
      // 4. Render the animation
      const response = await fetch(`http://localhost:3333/session/${session.sessionId}/generate-contextual-animation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: videoAsset.id,
          type: request.type,
          description: request.description,
          fps: 30,
          width: 1920,
          height: 1080,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate animation');
      }

      const data = await response.json();

      // Refresh assets to get the newly generated animation
      await refreshAssets();

      // Add the generated animation to the timeline
      // Intro goes at the beginning, outro at the end
      const insertTime = request.type === 'outro' ? getDuration() : 0;
      addClip(data.assetId, 'V2', insertTime, data.duration);
      await saveProject();

      console.log('Contextual animation generated:', data);

      return {
        assetId: data.assetId,
        duration: data.duration,
        contentSummary: data.contentSummary,
        sceneCount: data.sceneCount,
      };
    } catch (error) {
      console.error('Failed to create contextual animation:', error);
      throw error;
    }
  }, [session, assets, addClip, saveProject, getDuration, refreshAssets]);

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

  // Edit an existing animation with a new prompt
  const handleEditAnimation = useCallback(async (
    assetId: string,
    editPrompt: string,
    v1Context?: { assetId: string; filename: string; type: string; duration?: number },
    tabIdToUpdate?: string
  ) => {
    if (!session?.sessionId) {
      throw new Error('No active session');
    }

    // Get available assets to pass to the AI
    const availableAssets = assets
      .filter(a => a.type === 'image' || a.type === 'video')
      .map(a => ({
        id: a.id,
        type: a.type,
        filename: a.filename,
        duration: a.duration,
      }));

    const response = await fetch(`http://localhost:3333/session/${session.sessionId}/edit-animation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId,
        editPrompt,
        assets: availableAssets,
        v1Context, // Pass V1 clip context for hybrid approach
        fps: 30,
        width: 1920,
        height: 1080,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to edit animation');
    }

    const data = await response.json();

    console.log('[handleEditAnimation] ===== STEP 1: Server response =====');
    console.log('[handleEditAnimation] Server response:', {
      assetId: data.assetId,
      originalAssetId: assetId,
      isSameAsset: data.assetId === assetId,
      duration: data.duration,
      editCount: data.editCount,
    });

    console.log('[handleEditAnimation] ===== STEP 2: About to call refreshAssets =====');
    console.log('[handleEditAnimation] Tab to update:', tabIdToUpdate);

    // Refresh assets to sync with server (same asset ID, but updated duration/thumbnail)
    await refreshAssets();

    console.log('[handleEditAnimation] ===== STEP 3: refreshAssets complete =====');

    // Update the edit tab's clip duration if it changed (asset ID stays the same)
    if (tabIdToUpdate && tabIdToUpdate !== 'main' && data.duration) {
      console.log('[handleEditAnimation] ===== STEP 4: Updating edit tab =====');
      console.log('[handleEditAnimation] Updating edit tab clip duration:', {
        tabId: tabIdToUpdate,
        assetId: data.assetId,
        duration: data.duration,
      });
      // Update the V1 clip's duration to match the new animation duration
      updateTabAsset(tabIdToUpdate, data.assetId, data.duration);
    }

    console.log('[handleEditAnimation] ===== STEP 5: Complete =====');

    return {
      assetId: data.assetId,
      duration: data.duration,
      sceneCount: data.sceneCount,
      editCount: data.editCount,
    };
  }, [session, assets, refreshAssets, updateTabAsset]);

  // Open an animation in a new timeline tab for isolated editing
  const handleOpenAnimationInTab = useCallback((assetId: string, animationName: string) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    // Create initial clip for the tab's timeline
    const initialClip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: assetId,
      trackId: 'V1',
      start: 0,
      duration: asset.duration || 10,
      inPoint: 0,
      outPoint: asset.duration || 10,
    };

    const tabId = createTimelineTab(animationName, assetId, [initialClip]);
    console.log('Created timeline tab for animation:', tabId, animationName);

    return tabId;
  }, [assets, createTimelineTab]);

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

      {/* Timeline Tabs */}
      <TimelineTabs
        tabs={timelineTabs}
        activeTabId={activeTabId}
        onSwitchTab={switchTimelineTab}
        onCloseTab={closeTimelineTab}
        onAddTab={() => {
          // Count existing "Edit Tab" tabs to generate the next number
          const editTabCount = timelineTabs.filter(t => t.name.startsWith('Edit Tab')).length;
          const tabName = editTabCount === 0 ? 'Edit Tab' : `Edit Tab ${editTabCount + 1}`;
          createTimelineTab(tabName, `edit-${Date.now()}`, []); // Empty clips array for brand new tab
        }}
        show={assets.some(a => a.type === 'video')}
      />

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

            {/* Clip/Caption Properties Panel (shown when clip is selected) */}
            {selectedClipId && (
              <div className="h-1/2 border-t border-zinc-800/50 bg-zinc-900/50 overflow-hidden">
                {selectedCaptionData ? (
                  <CaptionPropertiesPanel
                    captionData={selectedCaptionData}
                    onUpdateStyle={(styleUpdates) => handleUpdateCaptionStyle(selectedClipId, styleUpdates)}
                    onClose={() => setSelectedClipId(null)}
                  />
                ) : (
                  <ClipPropertiesPanel
                    clip={selectedClip}
                    asset={selectedClipAsset}
                    onUpdateTransform={handleUpdateClipTransform}
                    onClose={() => setSelectedClipId(null)}
                  />
                )}
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
                aspectRatio={aspectRatio}
                onLayerMove={handleLayerMove}
                onLayerSelect={handleLayerSelect}
                selectedLayerId={selectedClipId}
              />
            ) : clips.length > 0 ? (
              // Assets exist but playhead is not over any clip
              <div className={`relative ${aspectRatio === '9:16' ? 'h-[65vh] w-auto aspect-[9/16]' : 'w-full max-w-4xl aspect-video'} bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center`}>
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
              clips={activeClips}
              assets={assets}
              selectedClipId={selectedClipId}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              aspectRatio={aspectRatio}
              onSelectClip={handleSelectClip}
              onTimeChange={handleTimelineSeek}
              onPlayPause={handlePlayPause}
              onStop={handleStop}
              onMoveClip={handleMoveClip}
              onResizeClip={handleResizeClip}
              onDeleteClip={handleDeleteClip}
              onCutAtPlayhead={handleCutAtPlayhead}
              onAddText={handleAddText}
              onToggleAspectRatio={handleToggleAspectRatio}
              autoSnap={autoSnap}
              onToggleAutoSnap={() => setAutoSnap(prev => !prev)}
              onDropAsset={handleDropAsset}
              onSave={saveProject}
              getCaptionData={getCaptionData}
            />
          </ResizableVerticalPanel>
        </div>

        {/* Right Panel - AI Agents */}
        <ResizablePanel
          defaultWidth={320}
          minWidth={280}
          maxWidth={500}
          side="right"
        >
          <div className="h-full flex flex-col bg-zinc-900/80 backdrop-blur-sm">
            {/* Agent Tabs */}
            <div className="flex border-b border-zinc-800/50">
              <button
                onClick={() => setActiveAgent('director')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeAgent === 'director'
                    ? 'text-purple-400 border-b-2 border-purple-400 bg-zinc-800/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Director
              </button>
              <button
                onClick={() => setActiveAgent('picasso')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeAgent === 'picasso'
                    ? 'text-pink-400 border-b-2 border-pink-400 bg-zinc-800/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/20'
                }`}
              >
                <Palette className="w-4 h-4" />
                Picasso
              </button>
            </div>

            {/* AI Chat Panels - both mounted to preserve state, hidden via CSS */}
            <div className="flex-1 overflow-hidden relative">
              <div className={`absolute inset-0 ${activeAgent === 'director' ? '' : 'hidden'}`}>
                <AIPromptPanel
                  onApplyEdit={handleApplyEdit}
                  onExtractKeywordsAndAddGifs={handleExtractKeywordsAndAddGifs}
                  onTranscribeAndAddCaptions={handleTranscribeAndAddCaptions}
                  onGenerateBroll={handleGenerateBroll}
                  onRemoveDeadAir={handleRemoveDeadAir}
                  onChapterCuts={handleChapterCuts}
                  onAddMotionGraphic={handleAddMotionGraphicFromPrompt}
                  onCreateCustomAnimation={handleCreateCustomAnimation}
                  onUploadAttachment={uploadAsset}
                  onAnalyzeForAnimation={handleAnalyzeForAnimation}
                  onRenderFromConcept={handleRenderFromConcept}
                  onGenerateTranscriptAnimation={handleGenerateTranscriptAnimation}
                  onCreateContextualAnimation={handleCreateContextualAnimation}
                  onOpenAnimationInTab={handleOpenAnimationInTab}
                  onEditAnimation={handleEditAnimation}
                  isApplying={isProcessing}
                  applyProgress={0}
                  applyStatus={currentStatus}
                  hasVideo={assets.some(a => a.type === 'video')}
                  clips={clips}
                  tracks={tracks}
                  assets={assets}
                  currentTime={currentTime}
                  selectedClipId={selectedClipId}
                  activeTabId={activeTabId}
                  editTabAssetId={activeTabId !== 'main' ? timelineTabs.find(t => t.id === activeTabId)?.assetId : undefined}
                  editTabClips={activeTabId !== 'main' ? timelineTabs.find(t => t.id === activeTabId)?.clips : undefined}
                />
              </div>
              <div className={`absolute inset-0 ${activeAgent === 'picasso' ? '' : 'hidden'}`}>
                <PicassoPanel
                  sessionId={session?.sessionId ?? null}
                  onImageGenerated={(assetId) => {
                    console.log('Image generated:', assetId);
                  }}
                  onRefreshAssets={refreshAssets}
                />
              </div>
            </div>
          </div>
        </ResizablePanel>
      </div>
    </div>
  );
}
