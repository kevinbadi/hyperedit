import { useState, useCallback, useRef, useEffect } from 'react';

const LOCAL_FFMPEG_URL = 'http://localhost:3333';
const SESSION_STORAGE_KEY = 'clipwise-session';

// Asset - source file in library
export interface Asset {
  id: string;
  type: 'video' | 'image' | 'audio';
  filename: string;
  duration: number;
  size: number;
  width?: number;
  height?: number;
  thumbnailUrl: string | null;
  streamUrl?: string; // URL with cache-busting timestamp
}

// TimelineClip - instance on timeline
export interface TimelineClip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  duration: number;
  inPoint: number;
  outPoint: number;
  transform?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    cropTop?: number;
    cropBottom?: number;
    cropLeft?: number;
    cropRight?: number;
  };
}

// Track
export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  name: string;
  order: number;
}

// Caption word with timing
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

// Caption styling options
export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'black';
  color: string;
  backgroundColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  position: 'bottom' | 'center' | 'top';
  animation: 'none' | 'karaoke' | 'fade' | 'pop' | 'bounce' | 'typewriter';
  highlightColor?: string;
  timeOffset?: number; // Offset in seconds to adjust sync (negative = earlier, positive = later)
}

// Caption clip data (stored alongside TimelineClip)
export interface CaptionData {
  words: CaptionWord[];
  style: CaptionStyle;
}

// Project settings
export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
}

// Project state
export interface ProjectState {
  tracks: Track[];
  clips: TimelineClip[];
  settings: ProjectSettings;
}

// Timeline tab for editing clips in isolation
export interface TimelineTab {
  id: string;
  name: string;
  type: 'main' | 'clip';
  assetId?: string; // For clip tabs, the asset being edited
  clips: TimelineClip[];
}

// Session info
export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}

// Helper to load session from localStorage
function loadSessionFromStorage(): SessionInfo | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load session from storage:', e);
  }
  return null;
}

export function useProject() {
  // Initialize session from localStorage if available
  const [session, setSessionInternal] = useState<SessionInfo | null>(loadSessionFromStorage);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tracks, setTracks] = useState<Track[]>([
    { id: 'T1', type: 'text', name: 'T1', order: 0 },   // Captions/text track (top)
    { id: 'V3', type: 'video', name: 'V3', order: 1 },  // Top overlay
    { id: 'V2', type: 'video', name: 'V2', order: 2 },  // Overlay
    { id: 'V1', type: 'video', name: 'V1', order: 3 },  // Base video track
    { id: 'A1', type: 'audio', name: 'A1', order: 4 },  // Audio track 1
    { id: 'A2', type: 'audio', name: 'A2', order: 5 },  // Audio track 2
  ]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [captionData, setCaptionData] = useState<Record<string, CaptionData>>({});

  // Timeline tabs for editing clips in isolation
  const [timelineTabs, setTimelineTabs] = useState<TimelineTab[]>([
    { id: 'main', name: 'Main', type: 'main', clips: [] }
  ]);
  const [activeTabId, setActiveTabId] = useState('main');

  const [settings, setSettings] = useState<ProjectSettings>({
    width: 1920,
    height: 1080,
    fps: 30,
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to track latest state values for saveProject (avoids stale closure issues)
  const tracksRef = useRef(tracks);
  const clipsRef = useRef(clips);
  const settingsRef = useRef(settings);

  // Keep refs in sync with state
  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Wrapper to persist session to localStorage
  const setSession = useCallback((sessionOrUpdater: SessionInfo | null | ((prev: SessionInfo | null) => SessionInfo | null)) => {
    setSessionInternal(prev => {
      const newSession = typeof sessionOrUpdater === 'function' ? sessionOrUpdater(prev) : sessionOrUpdater;
      if (newSession) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return newSession;
    });
  }, []);

  // Check if local server is available
  const checkServer = useCallback(async (): Promise<boolean> => {
    if (serverAvailable !== null) return serverAvailable;

    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      const data = await response.json();
      const available = data.status === 'ok';
      setServerAvailable(available);
      return available;
    } catch {
      setServerAvailable(false);
      return false;
    }
  }, [serverAvailable]);

  // Validate stored session on mount - clear if server doesn't recognize it
  useEffect(() => {
    const validateSession = async () => {
      if (!session) return;

      try {
        const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });

        if (response.status === 404) {
          // Session no longer exists on server - clear it
          console.log('Stored session is invalid, clearing...');
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setSessionInternal(null);
          setAssets([]);
          setClips([]);
          setCaptionData({});
        }
      } catch (error) {
        // Server might be down - don't clear session yet
        console.log('Could not validate session:', error);
      }
    };

    validateSession();
  }, []); // Only run once on mount

  // Create a new session
  const createSession = useCallback(async (): Promise<SessionInfo> => {
    // We'll create a session by uploading the first asset
    // For now, just generate a client-side session ID that will be
    // confirmed when we upload the first file
    const tempId = crypto.randomUUID();
    const sessionInfo: SessionInfo = {
      sessionId: tempId,
      createdAt: Date.now(),
    };
    return sessionInfo;
  }, []);

  // Upload asset
  const uploadAsset = useCallback(async (file: File): Promise<Asset> => {
    setLoading(true);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    setStatus(`Uploading ${file.name} (${fileSizeMB} MB)...`);

    try {
      let currentSession = session;

      // If no session yet, create one first
      if (!currentSession) {
        const createResponse = await fetch(`${LOCAL_FFMPEG_URL}/session/create`, {
          method: 'POST',
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to create session');
        }

        const createResult = await createResponse.json();
        currentSession = {
          sessionId: createResult.sessionId,
          createdAt: Date.now(),
        };
        setSession(currentSession);
      }

      // Upload the asset
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${currentSession.sessionId}/assets`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      const asset: Asset = {
        id: result.asset.id,
        type: result.asset.type,
        filename: result.asset.filename,
        duration: result.asset.duration,
        size: result.asset.size,
        width: result.asset.width,
        height: result.asset.height,
        thumbnailUrl: result.asset.thumbnailUrl
          ? `${LOCAL_FFMPEG_URL}${result.asset.thumbnailUrl}`
          : null,
      };

      setAssets(prev => [...prev, asset]);
      setStatus('');
      return asset;
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Delete asset
  const deleteAsset = useCallback(async (assetId: string): Promise<void> => {
    if (!session) return;

    await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${assetId}`, {
      method: 'DELETE',
    });

    setAssets(prev => prev.filter(a => a.id !== assetId));
    setClips(prev => prev.filter(c => c.assetId !== assetId));
  }, [session]);

  // Get asset stream URL
  const getAssetStreamUrl = useCallback((assetId: string): string | null => {
    if (!session) return null;
    return `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${assetId}/stream`;
  }, [session]);

  // Refresh assets from server (useful after server-side asset generation)
  const refreshAssets = useCallback(async (): Promise<Asset[]> => {
    if (!session) return [];

    const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets`);
    if (!response.ok) {
      throw new Error('Failed to fetch assets');
    }

    const data = await response.json();
    const serverAssets: Asset[] = (data.assets || []).map((a: {
      id: string;
      type: 'video' | 'image' | 'audio';
      filename: string;
      duration: number;
      size: number;
      width?: number;
      height?: number;
      thumbnailUrl?: string | null;
    }) => ({
      id: a.id,
      type: a.type,
      filename: a.filename,
      duration: a.duration,
      size: a.size,
      width: a.width,
      height: a.height,
      thumbnailUrl: a.thumbnailUrl
        ? `${LOCAL_FFMPEG_URL}${a.thumbnailUrl}`
        : null,
      // Add cache-busting timestamp to force reload after file changes (e.g., dead air removal)
      streamUrl: `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${a.id}/stream?v=${Date.now()}`,
    }));

    setAssets(serverAssets);
    return serverAssets;
  }, [session]);

  // Add clip to timeline
  const addClip = useCallback((
    assetId: string,
    trackId: string,
    start: number,
    duration?: number,
    inPoint?: number,
    outPoint?: number
  ): TimelineClip => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) throw new Error('Asset not found');

    // For images, use provided duration or default to 5 seconds
    // For video/audio, use asset duration
    const clipDuration = duration ?? (asset.type === 'image' ? 5 : asset.duration);
    const clip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId,
      trackId,
      start,
      duration: clipDuration,
      inPoint: inPoint ?? 0,
      outPoint: outPoint ?? clipDuration,
    };

    setClips(prev => [...prev, clip]);
    return clip;
  }, [assets]);

  // Update clip
  const updateClip = useCallback((clipId: string, updates: Partial<TimelineClip>): void => {
    setClips(prev => prev.map(c =>
      c.id === clipId ? { ...c, ...updates } : c
    ));
  }, []);

  // Delete clip (with optional ripple/autosnap to shift subsequent clips)
  const deleteClip = useCallback((clipId: string, ripple: boolean = false): void => {
    setClips(prev => {
      const clipToDelete = prev.find(c => c.id === clipId);
      if (!clipToDelete) return prev.filter(c => c.id !== clipId);

      // Remove the clip
      const filtered = prev.filter(c => c.id !== clipId);

      if (!ripple) return filtered;

      // Ripple mode: shift subsequent clips on the same track backward
      const deletedEnd = clipToDelete.start + clipToDelete.duration;
      const gapDuration = clipToDelete.duration;

      return filtered.map(c => {
        // Only shift clips on the same track that start at or after the deleted clip's end
        if (c.trackId === clipToDelete.trackId && c.start >= deletedEnd) {
          return {
            ...c,
            start: Math.max(0, c.start - gapDuration),
          };
        }
        return c;
      });
    });
  }, []);

  // Move clip
  const moveClip = useCallback((clipId: string, newStart: number, newTrackId?: string): void => {
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      return {
        ...c,
        start: Math.max(0, newStart),
        trackId: newTrackId ?? c.trackId,
      };
    }));
  }, []);

  // Resize clip (change in/out points or duration)
  const resizeClip = useCallback((clipId: string, newInPoint: number, newOutPoint: number): void => {
    setClips(prev => prev.map(c => {
      if (c.id !== clipId) return c;
      const newDuration = newOutPoint - newInPoint;
      return {
        ...c,
        inPoint: newInPoint,
        outPoint: newOutPoint,
        duration: newDuration,
      };
    }));
  }, []);

  // Split clip at a specific time, creating two clips
  const splitClip = useCallback((clipId: string, splitTime: number): string | null => {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return null;

    // Calculate the time within the clip where the split occurs
    const timeInClip = splitTime - clip.start;

    // Validate: split must be within the clip's duration (with small buffer)
    if (timeInClip <= 0.05 || timeInClip >= clip.duration - 0.05) {
      return null; // Split too close to edge
    }

    // Calculate the in-point offset for the split
    const splitInPoint = clip.inPoint + timeInClip;

    // Create the second clip (after the split)
    const secondClip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: clip.assetId,
      trackId: clip.trackId,
      start: splitTime,
      duration: clip.duration - timeInClip,
      inPoint: splitInPoint,
      outPoint: clip.outPoint,
      transform: clip.transform ? { ...clip.transform } : undefined,
    };

    // Update the first clip (before the split) and add the second clip
    setClips(prev => [
      ...prev.map(c => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          duration: timeInClip,
          outPoint: splitInPoint,
        };
      }),
      secondClip,
    ]);

    return secondClip.id;
  }, [clips]);

  // Create a new timeline tab for editing a clip/animation in isolation
  const createTimelineTab = useCallback((name: string, assetId: string, initialClips?: TimelineClip[]): string => {
    const tabId = crypto.randomUUID();
    const newTab: TimelineTab = {
      id: tabId,
      name,
      type: 'clip',
      assetId,
      clips: initialClips || [],
    };

    setTimelineTabs(prev => [...prev, newTab]);
    setActiveTabId(tabId);

    return tabId;
  }, []);

  // Switch to a different timeline tab
  const switchTimelineTab = useCallback((tabId: string): void => {
    setActiveTabId(tabId);
  }, []);

  // Close a timeline tab (cannot close main)
  const closeTimelineTab = useCallback((tabId: string): void => {
    if (tabId === 'main') return; // Cannot close main tab

    setTimelineTabs(prev => prev.filter(tab => tab.id !== tabId));

    // If closing the active tab, switch to main
    setActiveTabId(currentId => currentId === tabId ? 'main' : currentId);
  }, []);

  // Update clips in a specific tab
  const updateTabClips = useCallback((tabId: string, clips: TimelineClip[]): void => {
    setTimelineTabs(prev => prev.map(tab =>
      tab.id === tabId ? { ...tab, clips } : tab
    ));
  }, []);

  // Get the active timeline tab
  const getActiveTab = useCallback((): TimelineTab | undefined => {
    return timelineTabs.find(tab => tab.id === activeTabId);
  }, [timelineTabs, activeTabId]);

  // Default caption style
  const defaultCaptionStyle: CaptionStyle = {
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 2,
    position: 'bottom',
    animation: 'karaoke',
    highlightColor: '#FFD700',
  };

  // Add caption clip to timeline
  const addCaptionClip = useCallback((
    words: CaptionWord[],
    start: number,
    duration: number,
    style?: Partial<CaptionStyle>
  ): TimelineClip => {
    const clipId = crypto.randomUUID();

    // Create the timeline clip
    const clip: TimelineClip = {
      id: clipId,
      assetId: '', // No asset for captions
      trackId: 'T1',
      start,
      duration,
      inPoint: 0,
      outPoint: duration,
    };

    // Store caption data separately
    const captionInfo: CaptionData = {
      words,
      style: { ...defaultCaptionStyle, ...style },
    };

    setClips(prev => [...prev, clip]);
    setCaptionData(prev => ({ ...prev, [clipId]: captionInfo }));

    return clip;
  }, []);

  // Add multiple caption clips at once (batched for performance)
  const addCaptionClipsBatch = useCallback((
    captions: Array<{
      words: CaptionWord[];
      start: number;
      duration: number;
      style?: Partial<CaptionStyle>;
    }>
  ): TimelineClip[] => {
    const newClips: TimelineClip[] = [];
    const newCaptionData: Record<string, CaptionData> = {};

    for (const caption of captions) {
      const clipId = crypto.randomUUID();

      newClips.push({
        id: clipId,
        assetId: '',
        trackId: 'T1',
        start: caption.start,
        duration: caption.duration,
        inPoint: 0,
        outPoint: caption.duration,
      });

      newCaptionData[clipId] = {
        words: caption.words,
        style: { ...defaultCaptionStyle, ...caption.style },
      };
    }

    // Single state update for all clips
    setClips(prev => [...prev, ...newClips]);
    setCaptionData(prev => ({ ...prev, ...newCaptionData }));

    return newClips;
  }, []);

  // Update caption style
  const updateCaptionStyle = useCallback((clipId: string, styleUpdates: Partial<CaptionStyle>): void => {
    setCaptionData(prev => {
      const existing = prev[clipId];
      if (!existing) return prev;
      return {
        ...prev,
        [clipId]: {
          ...existing,
          style: { ...existing.style, ...styleUpdates },
        },
      };
    });
  }, []);

  // Get caption data for a clip
  const getCaptionData = useCallback((clipId: string): CaptionData | null => {
    return captionData[clipId] || null;
  }, [captionData]);

  // Save project to server (debounced)
  // Uses refs to always get latest state, avoiding stale closure issues
  const saveProject = useCallback(async (): Promise<void> => {
    if (!session) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saves - use refs to get latest state values
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracks: tracksRef.current,
            clips: clipsRef.current,
            settings: settingsRef.current,
          }),
        });
        console.log('[Project] Saved');
      } catch (error) {
        console.error('[Project] Save failed:', error);
      }
    }, 500);
  }, [session]);

  // Load project from server (including assets)
  const loadProject = useCallback(async (): Promise<void> => {
    if (!session) return;

    try {
      // Fetch assets first
      const assetsResponse = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets`);
      if (assetsResponse.ok) {
        const assetsData = await assetsResponse.json();
        const serverAssets: Asset[] = (assetsData.assets || []).map((a: {
          id: string;
          type: 'video' | 'image' | 'audio';
          filename: string;
          duration: number;
          size: number;
          width?: number;
          height?: number;
          thumbnailUrl?: string | null;
        }) => ({
          id: a.id,
          type: a.type,
          filename: a.filename,
          duration: a.duration,
          size: a.size,
          width: a.width,
          height: a.height,
          thumbnailUrl: a.thumbnailUrl
            ? `${LOCAL_FFMPEG_URL}${a.thumbnailUrl}`
            : null,
          // Add cache-busting timestamp to force reload after file changes
          streamUrl: `${LOCAL_FFMPEG_URL}/session/${session.sessionId}/assets/${a.id}/stream?v=${Date.now()}`,
        }));
        setAssets(serverAssets);
      }

      // Then fetch project
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`);
      if (response.ok) {
        const data = await response.json();
        // Don't load tracks from server - always use client's default tracks
        // Server tracks may be outdated (e.g., missing T1, V3, A2)
        if (data.clips) setClips(data.clips);
        if (data.settings) setSettings(data.settings);
      }
    } catch (error) {
      console.error('[Project] Load failed:', error);
    }
  }, [session]);

  // Render project
  // Uses refs to always get latest state
  const renderProject = useCallback(async (preview = false): Promise<string> => {
    if (!session) throw new Error('No session');

    setLoading(true);
    setStatus(preview ? 'Rendering preview...' : 'Rendering export...');

    try {
      // Save project first - use refs to get latest state
      await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: tracksRef.current,
          clips: clipsRef.current,
          settings: settingsRef.current,
        }),
      });

      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Render failed');
      }

      const result = await response.json();
      setStatus('Render complete!');

      // Return download URL
      return `${LOCAL_FFMPEG_URL}${result.downloadUrl}`;
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }, [session]);

  // Get total project duration
  const getDuration = useCallback((): number => {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.start + c.duration));
  }, [clips]);

  // Create animated GIF from an image asset
  const createGif = useCallback(async (
    sourceAssetId: string,
    options: {
      effect?: 'pulse' | 'zoom' | 'rotate' | 'bounce' | 'fade' | 'shake';
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
    } = {}
  ): Promise<Asset> => {
    if (!session) throw new Error('No session');

    setLoading(true);
    setStatus('Creating animated GIF...');

    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/create-gif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAssetId,
          ...options,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'GIF creation failed');
      }

      const result = await response.json();
      const asset: Asset = {
        id: result.asset.id,
        type: result.asset.type,
        filename: result.asset.filename,
        duration: result.asset.duration,
        size: result.asset.size,
        width: result.asset.width,
        height: result.asset.height,
        thumbnailUrl: result.asset.thumbnailUrl
          ? `${LOCAL_FFMPEG_URL}${result.asset.thumbnailUrl}`
          : null,
      };

      setAssets(prev => [...prev, asset]);
      setStatus('GIF created!');
      return asset;
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 2000);
    }
  }, [session]);

  // Close session
  const closeSession = useCallback(async (): Promise<void> => {
    if (session) {
      try {
        await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}`, {
          method: 'DELETE',
        });
      } catch {}
    }
    setSession(null);
    setAssets([]);
    setClips([]);
  }, [session]);

  // Auto-save when clips change
  // Note: This is commented out to prevent excessive saves during drag operations
  // useEffect(() => {
  //   if (session && clips.length > 0) {
  //     saveProject();
  //   }
  // }, [clips, session, saveProject]);

  return {
    // State
    session,
    assets,
    tracks,
    clips,
    settings,
    loading,
    status,
    serverAvailable,

    // Session
    checkServer,
    createSession,
    closeSession,

    // Assets
    uploadAsset,
    deleteAsset,
    getAssetStreamUrl,
    refreshAssets,
    createGif,

    // Clips
    addClip,
    updateClip,
    deleteClip,
    moveClip,
    resizeClip,
    splitClip,

    // Captions
    captionData,
    addCaptionClip,
    addCaptionClipsBatch,
    updateCaptionStyle,
    getCaptionData,

    // Project
    saveProject,
    loadProject,
    renderProject,
    getDuration,

    // Setters for direct state manipulation
    setTracks,
    setClips,
    setSettings,

    // Timeline tabs
    timelineTabs,
    activeTabId,
    createTimelineTab,
    switchTimelineTab,
    closeTimelineTab,
    updateTabClips,
    getActiveTab,
  };
}
