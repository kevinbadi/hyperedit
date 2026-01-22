import { useState, useCallback, useRef } from 'react';

const LOCAL_FFMPEG_URL = 'http://localhost:3333';

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
  type: 'video' | 'audio';
  name: string;
  order: number;
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

// Session info
export interface SessionInfo {
  sessionId: string;
  createdAt: number;
}

export function useProject() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tracks, setTracks] = useState<Track[]>([
    { id: 'V2', type: 'video', name: 'V2', order: 0 },  // Overlay track (top)
    { id: 'V1', type: 'video', name: 'V1', order: 1 },  // Base track (below overlay)
    { id: 'A1', type: 'audio', name: 'A1', order: 2 },  // Audio track (bottom)
  ]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [settings, setSettings] = useState<ProjectSettings>({
    width: 1920,
    height: 1080,
    fps: 30,
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [serverAvailable, setServerAvailable] = useState<boolean | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Delete clip
  const deleteClip = useCallback((clipId: string): void => {
    setClips(prev => prev.filter(c => c.id !== clipId));
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

  // Save project to server (debounced)
  const saveProject = useCallback(async (): Promise<void> => {
    if (!session) return;

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saves
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks, clips, settings }),
        });
        console.log('[Project] Saved');
      } catch (error) {
        console.error('[Project] Save failed:', error);
      }
    }, 500);
  }, [session, tracks, clips, settings]);

  // Load project from server
  const loadProject = useCallback(async (): Promise<void> => {
    if (!session) return;

    try {
      const response = await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`);
      if (response.ok) {
        const data = await response.json();
        if (data.tracks) setTracks(data.tracks);
        if (data.clips) setClips(data.clips);
        if (data.settings) setSettings(data.settings);
      }
    } catch (error) {
      console.error('[Project] Load failed:', error);
    }
  }, [session]);

  // Render project
  const renderProject = useCallback(async (preview = false): Promise<string> => {
    if (!session) throw new Error('No session');

    setLoading(true);
    setStatus(preview ? 'Rendering preview...' : 'Rendering export...');

    try {
      // Save project first
      await fetch(`${LOCAL_FFMPEG_URL}/session/${session.sessionId}/project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks, clips, settings }),
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
  }, [session, tracks, clips, settings]);

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
    createGif,

    // Clips
    addClip,
    updateClip,
    deleteClip,
    moveClip,
    resizeClip,
    splitClip,

    // Project
    saveProject,
    loadProject,
    renderProject,
    getDuration,

    // Setters for direct state manipulation
    setTracks,
    setClips,
    setSettings,
  };
}
