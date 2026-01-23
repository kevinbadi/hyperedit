import http from 'http';
import { spawn, execSync } from 'child_process';
import { createWriteStream, createReadStream, unlinkSync, mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import formidable from 'formidable';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .dev.vars
function loadEnvVars() {
  try {
    const envPath = join(process.cwd(), '.dev.vars');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  } catch (e) {
    console.warn('Could not load .dev.vars:', e.message);
  }
}
loadEnvVars();

const PORT = 3333;
const TEMP_DIR = join(tmpdir(), 'hyperedit-ffmpeg');
const SESSIONS_DIR = join(TEMP_DIR, 'sessions');

// Active video sessions - keeps videos on disk between edits
const sessions = new Map();

// Ensure temp directories exist
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}
if (!existsSync(SESSIONS_DIR)) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Restore sessions from disk on server start
function restoreSessionsFromDisk() {
  console.log('[Server] Restoring sessions from disk...');
  const sessionDirs = readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const sessionId of sessionDirs) {
    const sessionDir = join(SESSIONS_DIR, sessionId);
    const assetsDir = join(sessionDir, 'assets');
    const rendersDir = join(sessionDir, 'renders');

    // Skip if assets directory doesn't exist
    if (!existsSync(assetsDir)) {
      console.log(`[Session] Skipping ${sessionId} - no assets directory`);
      continue;
    }

    // Restore project state from disk if it exists
    const projectPath = join(sessionDir, 'project.json');
    let projectState = {
      tracks: [
        { id: 'T1', type: 'text', name: 'T1', order: 0 },
        { id: 'V3', type: 'video', name: 'V3', order: 1 },
        { id: 'V2', type: 'video', name: 'V2', order: 2 },
        { id: 'V1', type: 'video', name: 'V1', order: 3 },
        { id: 'A1', type: 'audio', name: 'A1', order: 4 },
        { id: 'A2', type: 'audio', name: 'A2', order: 5 },
      ],
      clips: [],
      settings: { width: 1920, height: 1080, fps: 30 },
    };

    if (existsSync(projectPath)) {
      try {
        projectState = JSON.parse(readFileSync(projectPath, 'utf-8'));
      } catch (e) {
        console.log(`[Session] Could not read project.json for ${sessionId}`);
      }
    }

    // Restore assets from disk
    const assets = new Map();
    const assetFiles = readdirSync(assetsDir, { withFileTypes: true })
      .filter(dirent => dirent.isFile() && !dirent.name.includes('_thumb'));

    for (const assetFile of assetFiles) {
      const assetPath = join(assetsDir, assetFile.name);
      const assetId = assetFile.name.replace(/\.[^/.]+$/, ''); // Remove extension
      const ext = assetFile.name.split('.').pop().toLowerCase();

      // Determine asset type from extension
      let type = 'video';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        type = 'image';
      } else if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) {
        type = 'audio';
      }

      try {
        const stats = statSync(assetPath);
        const thumbPath = join(assetsDir, `${assetId}_thumb.jpg`);

        assets.set(assetId, {
          id: assetId,
          type,
          filename: assetFile.name,
          path: assetPath,
          thumbPath: existsSync(thumbPath) ? thumbPath : null,
          size: stats.size,
          createdAt: stats.mtimeMs,
          // Duration will be fetched on demand for videos
        });
      } catch (e) {
        console.log(`[Session] Could not stat asset ${assetFile.name}`);
      }
    }

    if (assets.size === 0) {
      console.log(`[Session] Skipping ${sessionId} - no assets found`);
      continue;
    }

    const session = {
      id: sessionId,
      dir: sessionDir,
      assetsDir,
      rendersDir,
      currentVideo: join(sessionDir, 'current.mp4'), // Legacy
      originalName: 'Restored Project',
      createdAt: Date.now(),
      editCount: 0,
      assets,
      project: projectState,
    };

    sessions.set(sessionId, session);
    console.log(`[Session] Restored: ${sessionId} (${assets.size} assets)`);
  }

  console.log(`[Server] Restored ${sessions.size} sessions from disk`);
}

// Run restoration on module load
restoreSessionsFromDisk();

// Session management
function createSession(originalName) {
  const sessionId = randomUUID();
  const sessionDir = join(SESSIONS_DIR, sessionId);
  const assetsDir = join(sessionDir, 'assets');
  const rendersDir = join(sessionDir, 'renders');

  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(rendersDir, { recursive: true });

  // Initialize project state with all 6 tracks
  const projectState = {
    tracks: [
      { id: 'T1', type: 'text', name: 'T1', order: 0 },    // Captions/text track (top)
      { id: 'V3', type: 'video', name: 'V3', order: 1 },   // Top overlay (B-roll)
      { id: 'V2', type: 'video', name: 'V2', order: 2 },   // Overlay (GIFs)
      { id: 'V1', type: 'video', name: 'V1', order: 3 },   // Base video track
      { id: 'A1', type: 'audio', name: 'A1', order: 4 },   // Audio track 1
      { id: 'A2', type: 'audio', name: 'A2', order: 5 },   // Audio track 2
    ],
    clips: [],
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
    },
  };

  const session = {
    id: sessionId,
    dir: sessionDir,
    assetsDir,
    rendersDir,
    currentVideo: join(sessionDir, 'current.mp4'), // Legacy support
    originalName,
    createdAt: Date.now(),
    editCount: 0,
    assets: new Map(), // assetId -> asset info
    project: projectState,
  };
  sessions.set(sessionId, session);
  console.log(`[Session] Created: ${sessionId}`);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function cleanupSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      const { rmSync } = require('fs');
      rmSync(session.dir, { recursive: true, force: true });
      sessions.delete(sessionId);
      console.log(`[Session] Cleaned up: ${sessionId}`);
    } catch (e) {
      console.error(`[Session] Cleanup error for ${sessionId}:`, e.message);
    }
  }
}

// Clean up old sessions (older than 2 hours)
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  for (const [id, session] of sessions) {
    if (session.createdAt < twoHoursAgo) {
      console.log(`[Session] Auto-cleaning old session: ${id}`);
      cleanupSession(id);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// Run FFmpeg command and return a promise
function runFFmpeg(args, jobId) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('time=') || line.includes('frame=')) {
          process.stdout.write(`\r[${jobId}] ${line.trim()}`);
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    ffmpeg.on('error', reject);
  });
}

// Run FFprobe command and return stdout
function runFFmpegProbe(args, jobId) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`FFprobe failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    ffprobe.on('error', reject);
  });
}

// Detect silence in video and return silence periods
async function detectSilence(inputPath, jobId, options = {}) {
  const {
    silenceThreshold = -40, // dB
    minSilenceDuration = 0.5, // seconds
  } = options;

  console.log(`[${jobId}] Detecting silence (threshold: ${silenceThreshold}dB, min duration: ${minSilenceDuration}s)...`);

  const args = [
    '-i', inputPath,
    '-af', `silencedetect=noise=${silenceThreshold}dB:d=${minSilenceDuration}`,
    '-f', 'null',
    '-'
  ];

  const stderr = await runFFmpeg(args, jobId);

  // Parse silence detection output
  const silencePeriods = [];
  const lines = stderr.split('\n');

  let currentStart = null;
  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    const endMatch = line.match(/silence_end:\s*([\d.]+)/);

    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
    }
    if (endMatch && currentStart !== null) {
      silencePeriods.push({
        start: currentStart,
        end: parseFloat(endMatch[1])
      });
      currentStart = null;
    }
  }

  console.log(`\n[${jobId}] Found ${silencePeriods.length} silence periods`);
  return silencePeriods;
}

// Get video/audio duration (returns 0 for images)
async function getVideoDuration(inputPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf-8' }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : duration;
  } catch {
    return 0;
  }
}

// Calculate segments to keep (inverse of silence periods)
function calculateKeepSegments(silencePeriods, totalDuration, minSegmentDuration = 0.1) {
  if (silencePeriods.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  const keepSegments = [];
  let lastEnd = 0;

  for (const silence of silencePeriods) {
    if (silence.start > lastEnd + minSegmentDuration) {
      keepSegments.push({
        start: lastEnd,
        end: silence.start
      });
    }
    lastEnd = silence.end;
  }

  // Add final segment if there's content after last silence
  if (lastEnd < totalDuration - minSegmentDuration) {
    keepSegments.push({
      start: lastEnd,
      end: totalDuration
    });
  }

  return keepSegments;
}

// Remove dead air from video
async function handleRemoveDeadAir(req, res) {
  const jobId = randomUUID();
  const inputPath = join(TEMP_DIR, `${jobId}-input.mp4`);
  const outputPath = join(TEMP_DIR, `${jobId}-output.mp4`);
  const concatListPath = join(TEMP_DIR, `${jobId}-concat.txt`);
  const segmentPaths = [];

  try {
    // Parse the multipart form
    const form = formidable({
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      uploadDir: TEMP_DIR,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const videoFile = files.video?.[0];
    // More aggressive defaults for "magical" dead air removal
    // -30dB catches more pauses, 0.3s cuts shorter gaps
    const silenceThreshold = parseFloat(fields.silenceThreshold?.[0] || '-30');
    const minSilenceDuration = parseFloat(fields.minSilenceDuration?.[0] || '0.3');

    if (!videoFile) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing video file' }));
      return;
    }

    // Rename uploaded file to our input path
    const { rename, stat } = await import('fs/promises');
    await rename(videoFile.filepath, inputPath);

    console.log(`\n[${jobId}] === DEAD AIR REMOVAL ===`);
    console.log(`[${jobId}] Input file size: ${(videoFile.size / 1024 / 1024).toFixed(1)} MB`);

    // Step 1: Get video duration
    const totalDuration = await getVideoDuration(inputPath);
    console.log(`[${jobId}] Video duration: ${totalDuration.toFixed(2)}s`);

    // Step 2: Detect silence
    const silencePeriods = await detectSilence(inputPath, jobId, {
      silenceThreshold,
      minSilenceDuration,
    });

    if (silencePeriods.length === 0) {
      console.log(`[${jobId}] No silence detected, returning original video`);
      // Return original video
      const outputStats = await stat(inputPath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': outputStats.size,
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(inputPath).pipe(res);
      return;
    }

    // Step 3: Calculate segments to keep
    const keepSegments = calculateKeepSegments(silencePeriods, totalDuration);
    console.log(`[${jobId}] Keeping ${keepSegments.length} segments:`);
    keepSegments.forEach((seg, i) => {
      console.log(`[${jobId}]   Segment ${i + 1}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s (${(seg.end - seg.start).toFixed(2)}s)`);
    });

    const totalKeptDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const removedDuration = totalDuration - totalKeptDuration;
    console.log(`[${jobId}] Removing ${removedDuration.toFixed(2)}s of dead air (${((removedDuration / totalDuration) * 100).toFixed(1)}%)`);

    // Step 4: Extract each segment (re-encode for accuracy)
    console.log(`[${jobId}] Extracting segments (re-encoding for frame accuracy)...`);
    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i];
      const segmentPath = join(TEMP_DIR, `${jobId}-segment-${i}.mp4`);
      segmentPaths.push(segmentPath);

      // Use -ss after -i for accurate seeking, re-encode to ensure all frames included
      const args = [
        '-y',
        '-i', inputPath,
        '-ss', seg.start.toString(),
        '-t', (seg.end - seg.start).toString(),
        '-c:v', 'libx264',
        '-preset', 'ultrafast', // Fast encoding for segments
        '-crf', '18',
        '-c:a', 'aac',
        '-b:a', '192k',
        segmentPath
      ];

      await runFFmpeg(args, jobId);
      console.log(`\n[${jobId}] Extracted segment ${i + 1}/${keepSegments.length}`);
    }

    // Step 5: Create concat list file
    const concatList = segmentPaths.map(p => `file '${p}'`).join('\n');
    writeFileSync(concatListPath, concatList);

    // Step 6: Concatenate all segments (just copy since they're already encoded)
    console.log(`[${jobId}] Concatenating ${keepSegments.length} segments...`);
    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath
    ];

    await runFFmpeg(concatArgs, jobId);
    console.log(`\n[${jobId}] Concatenation complete`);

    // Read output file and send it back
    const outputStats = await stat(outputPath);
    console.log(`[${jobId}] Output file size: ${(outputStats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[${jobId}] === DEAD AIR REMOVAL COMPLETE ===\n`);

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': outputStats.size,
      'Access-Control-Allow-Origin': '*',
      'X-Removed-Duration': removedDuration.toFixed(2),
      'X-Original-Duration': totalDuration.toFixed(2),
      'X-New-Duration': totalKeptDuration.toFixed(2),
    });

    const readStream = createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on('close', () => {
      // Cleanup temp files
      try {
        unlinkSync(inputPath);
        unlinkSync(outputPath);
        unlinkSync(concatListPath);
        segmentPaths.forEach(p => { try { unlinkSync(p); } catch {} });
        console.log(`[${jobId}] Cleaned up temp files`);
      } catch (e) {
        console.error(`[${jobId}] Cleanup error:`, e.message);
      }
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);

    // Cleanup on error
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
    try { unlinkSync(concatListPath); } catch {}
    segmentPaths.forEach(p => { try { unlinkSync(p); } catch {} });

    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function parseFFmpegArgs(command) {
  const args = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  // Remove 'ffmpeg' prefix if present
  command = command.replace(/^ffmpeg\s+/, '');

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

async function handleProcess(req, res) {
  const jobId = randomUUID();
  const inputPath = join(TEMP_DIR, `${jobId}-input.mp4`);
  const outputPath = join(TEMP_DIR, `${jobId}-output.mp4`);

  try {
    // Parse the multipart form
    const form = formidable({
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      uploadDir: TEMP_DIR,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const videoFile = files.video?.[0];
    const command = fields.command?.[0];

    if (!videoFile || !command) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing video or command' }));
      return;
    }

    // Rename uploaded file to our input path
    const { rename } = await import('fs/promises');
    await rename(videoFile.filepath, inputPath);

    console.log(`[${jobId}] Processing video with command: ${command}`);
    console.log(`[${jobId}] Input file size: ${(videoFile.size / 1024 / 1024).toFixed(1)} MB`);

    // Parse the FFmpeg command and replace input/output placeholders
    let args = parseFFmpegArgs(command);
    args = args.map(arg => {
      if (arg.match(/input\.[a-z0-9]+/i)) return inputPath;
      if (arg.match(/output\.[a-z0-9]+/i)) return outputPath;
      return arg;
    });

    // Add -y flag to overwrite output if not present
    if (!args.includes('-y')) {
      args.unshift('-y');
    }

    console.log(`[${jobId}] FFmpeg args:`, args);

    // Run FFmpeg
    const ffmpeg = spawn('ffmpeg', args);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log progress lines
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('time=') || line.includes('frame=')) {
          process.stdout.write(`\r[${jobId}] ${line.trim()}`);
        }
      }
    });

    await new Promise((resolve, reject) => {
      ffmpeg.on('close', (code) => {
        console.log(`\n[${jobId}] FFmpeg exited with code ${code}`);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr.slice(-500)}`));
        }
      });
      ffmpeg.on('error', reject);
    });

    // Read output file and send it back
    const { stat } = await import('fs/promises');
    const outputStats = await stat(outputPath);
    console.log(`[${jobId}] Output file size: ${(outputStats.size / 1024 / 1024).toFixed(1)} MB`);

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': outputStats.size,
      'Access-Control-Allow-Origin': '*',
    });

    const readStream = createReadStream(outputPath);
    readStream.pipe(res);

    readStream.on('close', () => {
      // Cleanup temp files
      try {
        unlinkSync(inputPath);
        unlinkSync(outputPath);
        console.log(`[${jobId}] Cleaned up temp files`);
      } catch (e) {
        console.error(`[${jobId}] Cleanup error:`, e.message);
      }
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);

    // Cleanup on error
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}

    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Format seconds to YouTube timestamp format (MM:SS or HH:MM:SS)
function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Generate chapters from video using AI
async function handleGenerateChapters(req, res) {
  const jobId = randomUUID();
  const inputPath = join(TEMP_DIR, `${jobId}-input.mp4`);
  const audioPath = join(TEMP_DIR, `${jobId}-audio.mp3`);

  try {
    // Check for API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured in .dev.vars' }));
      return;
    }

    // Parse the multipart form
    const form = formidable({
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      uploadDir: TEMP_DIR,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);

    const videoFile = files.video?.[0];
    if (!videoFile) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing video file' }));
      return;
    }

    // Rename uploaded file to our input path
    const { rename, stat } = await import('fs/promises');
    await rename(videoFile.filepath, inputPath);

    console.log(`\n[${jobId}] === CHAPTER GENERATION ===`);
    console.log(`[${jobId}] Input file size: ${(videoFile.size / 1024 / 1024).toFixed(1)} MB`);

    // Step 1: Get video duration
    const totalDuration = await getVideoDuration(inputPath);
    console.log(`[${jobId}] Video duration: ${totalDuration.toFixed(2)}s`);

    // Step 2: Extract audio as MP3 (compressed for faster upload to Gemini)
    console.log(`[${jobId}] Extracting audio...`);
    const extractArgs = [
      '-y',
      '-i', inputPath,
      '-vn',                    // No video
      '-acodec', 'libmp3lame',  // MP3 codec
      '-ab', '64k',             // Lower bitrate for smaller file (speech doesn't need high quality)
      '-ar', '16000',           // 16kHz sample rate (good for speech)
      '-ac', '1',               // Mono
      audioPath
    ];
    await runFFmpeg(extractArgs, jobId);

    const audioStats = await stat(audioPath);
    console.log(`\n[${jobId}] Audio extracted: ${(audioStats.size / 1024 / 1024).toFixed(1)} MB`);

    // Step 3: Read audio file as base64
    console.log(`[${jobId}] Sending to Gemini for analysis...`);
    const audioBuffer = readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString('base64');

    // Step 4: Send to Gemini for transcription and chapter analysis
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: audioBase64
              }
            },
            {
              text: `Analyze this audio from a video that is ${totalDuration.toFixed(1)} seconds long.

Your task is to identify logical chapter breaks based on topic changes, new sections, or natural transitions in the content.

For each chapter:
1. Identify the START timestamp (in seconds from the beginning)
2. Create a concise, descriptive title (2-6 words)

Guidelines:
- First chapter should always start at 0 seconds
- Aim for 3-8 chapters depending on content length and topic diversity
- Chapters should be at least 30 seconds apart
- Titles should be engaging and descriptive (good for YouTube)
- If the content is a tutorial, use action-oriented titles
- If it's a discussion, summarize the main topic of each section

Return your response as valid JSON with exactly this structure:
{
  "chapters": [
    { "start": 0, "title": "Introduction" },
    { "start": 45.5, "title": "Getting Started" },
    { "start": 120, "title": "Main Topic" }
  ],
  "summary": "Brief 1-2 sentence summary of the video content"
}

Only return the JSON, no other text.`
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const responseText = response.text || '{}';
    console.log(`[${jobId}] Gemini response received`);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { chapters: [], summary: 'Failed to parse response' };
    }

    // Format chapters for YouTube
    const youtubeChapters = (result.chapters || [])
      .sort((a, b) => a.start - b.start)
      .map(ch => `${formatTimestamp(ch.start)} ${ch.title}`)
      .join('\n');

    console.log(`[${jobId}] Generated ${result.chapters?.length || 0} chapters`);
    console.log(`[${jobId}] === CHAPTER GENERATION COMPLETE ===\n`);

    // Return the chapters
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      success: true,
      chapters: result.chapters || [],
      youtubeFormat: youtubeChapters,
      summary: result.summary || '',
      videoDuration: totalDuration,
    }));

    // Cleanup
    try {
      unlinkSync(inputPath);
      unlinkSync(audioPath);
      console.log(`[${jobId}] Cleaned up temp files`);
    } catch (e) {
      console.error(`[${jobId}] Cleanup error:`, e.message);
    }

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);

    // Cleanup on error
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(audioPath); } catch {}

    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============== SESSION-BASED HANDLERS ==============
// These keep videos on disk between edits for efficient large file handling

// Create a new empty session (for multi-asset workflow)
async function handleSessionCreate(req, res) {
  try {
    const session = createSession('Untitled Project');

    console.log(`[${session.id}] Empty session created`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      sessionId: session.id,
    }));

  } catch (error) {
    console.error('[Create] Error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Upload video and create a session
async function handleSessionUpload(req, res) {
  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB limit
      uploadDir: TEMP_DIR,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const videoFile = files.video?.[0];

    if (!videoFile) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing video file' }));
      return;
    }

    // Create session and move file
    const session = createSession(videoFile.originalFilename || 'video.mp4');
    const { rename, stat } = await import('fs/promises');
    await rename(videoFile.filepath, session.currentVideo);

    const duration = await getVideoDuration(session.currentVideo);
    const stats = await stat(session.currentVideo);

    console.log(`[${session.id}] Video uploaded: ${(stats.size / 1024 / 1024).toFixed(1)} MB, ${duration.toFixed(2)}s`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      sessionId: session.id,
      duration,
      size: stats.size,
      name: session.originalName,
    }));

  } catch (error) {
    console.error('[Upload] Error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Stream video for preview (supports range requests for seeking)
async function handleSessionStream(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(session.currentVideo);
    const fileSize = stats.size;

    const range = req.headers.range;

    if (range) {
      // Handle range request for video seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      });

      createReadStream(session.currentVideo, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Access-Control-Allow-Origin': '*',
      });
      createReadStream(session.currentVideo).pipe(res);
    }
  } catch (error) {
    console.error(`[${sessionId}] Stream error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Get session info
async function handleSessionInfo(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(session.currentVideo);
    const duration = await getVideoDuration(session.currentVideo);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      sessionId: session.id,
      duration,
      size: stats.size,
      name: session.originalName,
      editCount: session.editCount,
      createdAt: session.createdAt,
    }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Process video within a session (edit in place)
async function handleSessionProcess(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    // Parse JSON body
    let body = '';
    for await (const chunk of req) body += chunk;
    const { command } = JSON.parse(body);

    if (!command) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing command' }));
      return;
    }

    const outputPath = join(session.dir, `output-${Date.now()}.mp4`);

    console.log(`\n[${sessionId}] Processing: ${command}`);

    // Parse and prepare FFmpeg command
    let args = parseFFmpegArgs(command);
    args = args.map(arg => {
      if (arg.match(/input\.[a-z0-9]+/i)) return session.currentVideo;
      if (arg.match(/output\.[a-z0-9]+/i)) return outputPath;
      return arg;
    });

    if (!args.includes('-y')) args.unshift('-y');

    console.log(`[${sessionId}] FFmpeg args:`, args.slice(0, 10).join(' '), '...');

    await runFFmpeg(args, sessionId);

    // Replace current video with output
    const { rename, stat } = await import('fs/promises');
    unlinkSync(session.currentVideo);
    await rename(outputPath, session.currentVideo);

    const newStats = await stat(session.currentVideo);
    const newDuration = await getVideoDuration(session.currentVideo);
    session.editCount++;

    console.log(`\n[${sessionId}] Edit complete. New duration: ${newDuration.toFixed(2)}s, Size: ${(newStats.size / 1024 / 1024).toFixed(1)} MB`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      duration: newDuration,
      size: newStats.size,
      editCount: session.editCount,
    }));

  } catch (error) {
    console.error(`[${sessionId}] Process error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Remove dead air within a session
async function handleSessionRemoveDeadAir(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const jobId = sessionId;
  const outputPath = join(session.dir, `deadair-output-${Date.now()}.mp4`);
  const concatListPath = join(session.dir, `concat-${Date.now()}.txt`);
  const segmentPaths = [];

  try {
    // Parse options from body
    let body = '';
    for await (const chunk of req) body += chunk;
    const options = body ? JSON.parse(body) : {};

    const silenceThreshold = options.silenceThreshold || -30;
    const minSilenceDuration = options.minSilenceDuration || 0.3;

    console.log(`\n[${jobId}] === DEAD AIR REMOVAL (Session) ===`);

    // Find the video asset (use new multi-asset system instead of legacy currentVideo)
    let videoAsset = null;
    for (const [assetId, asset] of session.assets) {
      if (asset.type === 'video') {
        videoAsset = asset;
        break;
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found in session. Please upload a video first.' }));
      return;
    }

    // Verify the video file exists on disk
    if (!existsSync(videoAsset.path)) {
      console.error(`[${jobId}] Video file missing: ${videoAsset.path}`);
      res.writeHead(410, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        error: 'Video file no longer exists. Your session may have expired. Please re-upload your video.',
        code: 'VIDEO_FILE_MISSING'
      }));
      return;
    }

    console.log(`[${jobId}] Using video asset: ${videoAsset.filename} (${videoAsset.path})`);

    const totalDuration = await getVideoDuration(videoAsset.path);
    console.log(`[${jobId}] Video duration: ${totalDuration.toFixed(2)}s`);

    const silencePeriods = await detectSilence(videoAsset.path, jobId, {
      silenceThreshold,
      minSilenceDuration,
    });

    if (silencePeriods.length === 0) {
      console.log(`[${jobId}] No silence detected`);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        success: true,
        duration: totalDuration,
        removedDuration: 0,
        message: 'No silence detected',
      }));
      return;
    }

    const keepSegments = calculateKeepSegments(silencePeriods, totalDuration);
    console.log(`[${jobId}] Keeping ${keepSegments.length} segments`);

    const totalKeptDuration = keepSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    const removedDuration = totalDuration - totalKeptDuration;
    console.log(`[${jobId}] Removing ${removedDuration.toFixed(2)}s of dead air (${((removedDuration / totalDuration) * 100).toFixed(1)}%)`);

    // Extract segments
    console.log(`[${jobId}] Extracting segments...`);
    for (let i = 0; i < keepSegments.length; i++) {
      const seg = keepSegments[i];
      const segmentPath = join(session.dir, `segment-${Date.now()}-${i}.mp4`);
      segmentPaths.push(segmentPath);

      const args = [
        '-y', '-i', videoAsset.path,
        '-ss', seg.start.toString(),
        '-t', (seg.end - seg.start).toString(),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        segmentPath
      ];

      await runFFmpeg(args, jobId);
      console.log(`\n[${jobId}] Segment ${i + 1}/${keepSegments.length}`);
    }

    // Concatenate
    const concatList = segmentPaths.map(p => `file '${p}'`).join('\n');
    writeFileSync(concatListPath, concatList);

    console.log(`[${jobId}] Concatenating...`);
    await runFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', '-movflags', '+faststart', outputPath], jobId);

    // Replace the video asset file
    const { rename, stat } = await import('fs/promises');
    unlinkSync(videoAsset.path);
    await rename(outputPath, videoAsset.path);

    // Cleanup segments
    segmentPaths.forEach(p => { try { unlinkSync(p); } catch {} });
    try { unlinkSync(concatListPath); } catch {}

    const newStats = await stat(videoAsset.path);

    // Update the video asset metadata
    videoAsset.duration = totalKeptDuration;
    videoAsset.size = newStats.size;

    session.editCount++;

    console.log(`\n[${jobId}] === DEAD AIR REMOVAL COMPLETE ===`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      duration: totalKeptDuration,
      originalDuration: totalDuration,
      removedDuration,
      size: newStats.size,
      editCount: session.editCount,
    }));

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    segmentPaths.forEach(p => { try { unlinkSync(p); } catch {} });
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Generate chapters for a session
async function handleSessionChapters(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const jobId = sessionId;
  const audioPath = join(session.dir, `audio-${Date.now()}.mp3`);

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
      return;
    }

    console.log(`\n[${jobId}] === CHAPTER GENERATION (Session) ===`);

    // Find video path - check both legacy currentVideo and new assets system
    let videoPath = session.currentVideo;
    if (!videoPath || !existsSync(videoPath)) {
      // Try to find video from assets
      if (session.assets && session.assets.size > 0) {
        for (const [, asset] of session.assets) {
          if (asset.type === 'video' && existsSync(asset.path)) {
            videoPath = asset.path;
            console.log(`[${jobId}] Using video asset: ${asset.filename}`);
            break;
          }
        }
      }
    }

    if (!videoPath || !existsSync(videoPath)) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video found in session. Please upload a video first.' }));
      return;
    }

    const totalDuration = await getVideoDuration(videoPath);

    // Extract audio
    console.log(`[${jobId}] Extracting audio from: ${videoPath}`);
    await runFFmpeg(['-y', '-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-ab', '64k', '-ar', '16000', '-ac', '1', audioPath], jobId);

    const { stat } = await import('fs/promises');
    const audioStats = await stat(audioPath);
    console.log(`\n[${jobId}] Audio: ${(audioStats.size / 1024 / 1024).toFixed(1)} MB`);

    // Send to Gemini
    console.log(`[${jobId}] Analyzing with Gemini...`);
    const audioBuffer = readFileSync(audioPath);
    const audioBase64 = audioBuffer.toString('base64');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
          { text: `Analyze this audio from a video that is ${totalDuration.toFixed(1)} seconds long.

Identify logical chapter breaks based on topic changes or natural transitions.

For each chapter:
1. START timestamp (seconds from beginning)
2. Concise, descriptive title (2-6 words)

Guidelines:
- First chapter starts at 0
- Aim for 3-8 chapters
- At least 30 seconds apart
- Engaging titles for YouTube

Return JSON: {"chapters": [{"start": 0, "title": "Introduction"}], "summary": "Brief summary"}` }
        ]
      }],
      config: { responseMimeType: 'application/json' }
    });

    // Get the response text - handle different SDK versions
    let responseText = '';
    if (typeof response.text === 'function') {
      responseText = await response.text();
    } else if (response.text) {
      responseText = response.text;
    } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
      responseText = response.candidates[0].content.parts[0].text;
    }

    console.log(`[${jobId}] Gemini response:`, responseText.substring(0, 500));

    let result;
    try {
      result = JSON.parse(responseText || '{}');
    } catch {
      const match = (responseText || '').match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { chapters: [], summary: '' };
    }

    // If no chapters detected, create automatic chapters based on duration
    if (!result.chapters || result.chapters.length === 0) {
      console.log(`[${jobId}] No chapters from AI, creating automatic chapters...`);

      // Create chapters every ~60 seconds, or split into 4-6 sections
      const chapterInterval = Math.max(30, Math.min(90, totalDuration / 5));
      const autoChapters = [];

      for (let time = 0; time < totalDuration - 10; time += chapterInterval) {
        const chapterNum = autoChapters.length + 1;
        autoChapters.push({
          start: Math.round(time * 10) / 10,
          title: time === 0 ? 'Introduction' : `Part ${chapterNum}`
        });
      }

      result.chapters = autoChapters;
      result.summary = 'Auto-generated chapters based on video duration';
      console.log(`[${jobId}] Created ${autoChapters.length} automatic chapters`);
    }

    const youtubeChapters = (result.chapters || [])
      .sort((a, b) => a.start - b.start)
      .map(ch => `${formatTimestamp(ch.start)} ${ch.title}`)
      .join('\n');

    // Cleanup
    try { unlinkSync(audioPath); } catch {}

    console.log(`[${jobId}] Generated ${result.chapters?.length || 0} chapters`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      chapters: result.chapters || [],
      youtubeFormat: youtubeChapters,
      summary: result.summary || '',
      videoDuration: totalDuration,
    }));

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    try { unlinkSync(audioPath); } catch {}
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Download final video
async function handleSessionDownload(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(session.currentVideo);

    const filename = session.originalName.replace(/\.[^.]+$/, '-edited.mp4');

    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
    });

    createReadStream(session.currentVideo).pipe(res);
    console.log(`[${sessionId}] Downloading: ${filename}`);

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Delete session
function handleSessionDelete(req, res, sessionId) {
  cleanupSession(sessionId);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ success: true }));
}

// ============== MULTI-ASSET HANDLERS ==============

// Generate thumbnail for video/image asset
async function generateThumbnail(inputPath, outputPath, isImage = false) {
  if (isImage) {
    // For images, just resize
    const args = [
      '-y', '-i', inputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      outputPath
    ];
    await runFFmpeg(args, 'thumb');
  } else {
    // For videos, extract frame at 1 second or 10% of duration
    const duration = await getVideoDuration(inputPath);
    const seekTime = Math.min(1, duration * 0.1);
    const args = [
      '-y', '-ss', seekTime.toString(),
      '-i', inputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      outputPath
    ];
    await runFFmpeg(args, 'thumb');
  }
}

// Get video/image dimensions
async function getMediaInfo(inputPath) {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "${inputPath}"`,
      { encoding: 'utf-8' }
    );
    const info = JSON.parse(result);
    const stream = info.streams?.[0] || {};
    return {
      width: stream.width || 0,
      height: stream.height || 0,
      duration: parseFloat(stream.duration) || 0,
    };
  } catch {
    return { width: 0, height: 0, duration: 0 };
  }
}

// Upload asset to session
async function handleAssetUpload(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
      uploadDir: session.assetsDir,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const uploadedFile = files.file?.[0] || files.video?.[0];

    if (!uploadedFile) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Missing file' }));
      return;
    }

    const assetId = randomUUID();
    const originalName = uploadedFile.originalFilename || 'file';
    const ext = originalName.split('.').pop()?.toLowerCase() || 'mp4';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    const isAudio = ['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(ext);
    const type = isImage ? 'image' : isAudio ? 'audio' : 'video';

    // Move file to proper location
    const assetPath = join(session.assetsDir, `${assetId}.${ext}`);
    const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);

    const { rename, stat } = await import('fs/promises');
    await rename(uploadedFile.filepath, assetPath);

    // Get media info
    let duration = 0;
    let width = 0;
    let height = 0;

    if (!isAudio) {
      const info = await getMediaInfo(assetPath);
      duration = info.duration;
      width = info.width;
      height = info.height;
    } else {
      duration = await getVideoDuration(assetPath);
    }

    // Generate thumbnail (for video/image)
    if (!isAudio) {
      try {
        await generateThumbnail(assetPath, thumbPath, isImage);
      } catch (e) {
        console.warn(`[${sessionId}] Thumbnail generation failed:`, e.message);
      }
    }

    const stats = await stat(assetPath);

    const asset = {
      id: assetId,
      type,
      filename: originalName,
      path: assetPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: isImage ? 5 : duration, // Default 5s for images
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
    };

    session.assets.set(assetId, asset);

    console.log(`[${sessionId}] Asset uploaded: ${assetId} (${type}, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      asset: {
        id: asset.id,
        type: asset.type,
        filename: asset.filename,
        duration: asset.duration,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        thumbnailUrl: asset.thumbPath ? `/session/${sessionId}/assets/${assetId}/thumbnail` : null,
      },
    }));

  } catch (error) {
    console.error(`[${sessionId}] Asset upload error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// List all assets in session
function handleAssetList(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const assets = Array.from(session.assets.values()).map(asset => ({
    id: asset.id,
    type: asset.type,
    filename: asset.filename,
    duration: asset.duration,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    thumbnailUrl: asset.thumbPath ? `/session/${sessionId}/assets/${asset.id}/thumbnail` : null,
  }));

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ assets }));
}

// Delete asset
function handleAssetDelete(req, res, sessionId, assetId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const asset = session.assets.get(assetId);
  if (!asset) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Asset not found' }));
    return;
  }

  // Remove files
  try {
    if (existsSync(asset.path)) unlinkSync(asset.path);
    if (asset.thumbPath && existsSync(asset.thumbPath)) unlinkSync(asset.thumbPath);
  } catch (e) {
    console.warn(`[${sessionId}] Asset file cleanup failed:`, e.message);
  }

  // Remove from session
  session.assets.delete(assetId);

  // Remove any clips using this asset
  session.project.clips = session.project.clips.filter(clip => clip.assetId !== assetId);

  console.log(`[${sessionId}] Asset deleted: ${assetId}`);

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ success: true }));
}

// Get asset thumbnail
async function handleAssetThumbnail(req, res, sessionId, assetId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const asset = session.assets.get(assetId);
  if (!asset || !asset.thumbPath || !existsSync(asset.thumbPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Thumbnail not found' }));
    return;
  }

  const { stat } = await import('fs/promises');
  const stats = await stat(asset.thumbPath);

  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': stats.size,
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });

  createReadStream(asset.thumbPath).pipe(res);
}

// Stream asset
async function handleAssetStream(req, res, sessionId, assetId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const asset = session.assets.get(assetId);
  if (!asset || !existsSync(asset.path)) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Asset not found' }));
    return;
  }

  const { stat } = await import('fs/promises');
  const stats = await stat(asset.path);
  const fileSize = stats.size;

  // Get proper MIME type for the asset
  const getContentType = () => {
    if (asset.type === 'image') {
      const ext = asset.path.split('.').pop()?.toLowerCase();
      const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
      };
      return mimeTypes[ext] || 'image/jpeg';
    }
    if (asset.type === 'audio') {
      const ext = asset.path.split('.').pop()?.toLowerCase();
      const mimeTypes = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
      };
      return mimeTypes[ext] || 'audio/mpeg';
    }
    return 'video/mp4';
  };
  const contentType = getContentType();

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Clamp values to valid range (prevents crash if file size changed)
    if (start >= fileSize) {
      // Requested range is completely outside file - return 416
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }
    if (end >= fileSize) {
      end = fileSize - 1;
    }
    if (start > end) {
      start = end;
    }

    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });

    createReadStream(asset.path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    createReadStream(asset.path).pipe(res);
  }
}

// Get project state
function handleProjectGet(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // Verify the session directory still exists on disk
  if (!existsSync(session.dir)) {
    console.log(`[Session] Directory missing for ${sessionId}, cleaning up`);
    sessions.delete(sessionId);
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session files no longer exist' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({
    tracks: session.project.tracks,
    clips: session.project.clips,
    settings: session.project.settings,
  }));
}

// Save project state
async function handleProjectSave(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);

    if (data.tracks) session.project.tracks = data.tracks;
    if (data.clips) session.project.clips = data.clips;
    if (data.settings) session.project.settings = { ...session.project.settings, ...data.settings };

    // Save to disk for persistence
    const projectPath = join(session.dir, 'project.json');
    writeFileSync(projectPath, JSON.stringify(session.project, null, 2));

    console.log(`[${sessionId}] Project saved: ${session.project.clips.length} clips`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ success: true }));

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Render project to video
async function handleProjectRender(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const options = body ? JSON.parse(body) : {};
    const isPreview = options.preview === true;

    const clips = session.project.clips;
    const settings = session.project.settings;

    if (clips.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No clips in timeline' }));
      return;
    }

    console.log(`\n[${sessionId}] === RENDER ${isPreview ? 'PREVIEW' : 'EXPORT'} ===`);
    console.log(`[${sessionId}] ${clips.length} clips, ${settings.width}x${settings.height}`);

    // Sort clips by track for layering (V1 first, then V2, etc.)
    const videoClips = clips
      .filter(c => session.assets.get(c.assetId)?.type !== 'audio')
      .sort((a, b) => {
        const trackOrder = { 'V1': 0, 'V2': 1, 'V3': 2 };
        return (trackOrder[a.trackId] || 0) - (trackOrder[b.trackId] || 0);
      });

    const audioClips = clips
      .filter(c => session.assets.get(c.assetId)?.type === 'audio');

    // Calculate total duration from all clips
    const totalDuration = Math.max(
      ...clips.map(c => c.start + c.duration),
      0.1
    );

    // Build FFmpeg filter_complex
    const inputs = [];
    const filterParts = [];
    let inputIndex = 0;

    // Create black background
    filterParts.push(`color=black:s=${settings.width}x${settings.height}:d=${totalDuration}:r=${settings.fps}[base]`);
    let lastVideo = 'base';

    // Process video clips
    for (const clip of videoClips) {
      const asset = session.assets.get(clip.assetId);
      if (!asset) continue;

      inputs.push('-i', asset.path);
      const idx = inputIndex++;

      // Apply trim and scale
      const inPoint = clip.inPoint || 0;
      const outPoint = clip.outPoint || asset.duration;
      const trimDuration = outPoint - inPoint;

      let clipFilter = `[${idx}:v]`;

      // Trim
      clipFilter += `trim=${inPoint}:${outPoint},setpts=PTS-STARTPTS,`;

      // Scale/fit to canvas
      clipFilter += `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,`;
      clipFilter += `pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2`;

      // Apply transform if present
      if (clip.transform) {
        const { x = 0, y = 0, scale = 1, opacity = 1 } = clip.transform;
        if (scale !== 1) {
          clipFilter += `,scale=iw*${scale}:ih*${scale}`;
        }
        // Opacity is handled in overlay
      }

      clipFilter += `[v${idx}]`;
      filterParts.push(clipFilter);

      // Overlay onto base
      const overlayX = clip.transform?.x || `(W-w)/2`;
      const overlayY = clip.transform?.y || `(H-h)/2`;
      const enable = `between(t,${clip.start},${clip.start + trimDuration})`;

      filterParts.push(`[${lastVideo}][v${idx}]overlay=x=${overlayX}:y=${overlayY}:enable='${enable}'[out${idx}]`);
      lastVideo = `out${idx}`;
    }

    // Rename final output
    filterParts.push(`[${lastVideo}]copy[vout]`);

    // Audio mixing
    let audioFilter = '';
    if (audioClips.length > 0) {
      const audioInputs = [];
      for (const clip of audioClips) {
        const asset = session.assets.get(clip.assetId);
        if (!asset) continue;

        inputs.push('-i', asset.path);
        const idx = inputIndex++;
        const inPoint = clip.inPoint || 0;
        const outPoint = clip.outPoint || asset.duration;

        audioInputs.push(`[${idx}:a]atrim=${inPoint}:${outPoint},asetpts=PTS-STARTPTS,adelay=${Math.floor(clip.start * 1000)}|${Math.floor(clip.start * 1000)}[a${idx}]`);
      }

      if (audioInputs.length > 0) {
        filterParts.push(...audioInputs);
        const audioMix = audioInputs.map((_, i) => `[a${clips.indexOf(audioClips[i]) + videoClips.length}]`).join('');
        filterParts.push(`${audioMix}amix=inputs=${audioInputs.length}[aout]`);
        audioFilter = '-map [aout]';
      }
    }

    // Build final command
    const outputPath = join(session.rendersDir, isPreview ? 'preview.mp4' : `export-${Date.now()}.mp4`);

    const ffmpegArgs = [
      '-y',
      ...inputs,
      '-filter_complex', filterParts.join(';'),
      '-map', '[vout]',
    ];

    if (audioFilter) {
      ffmpegArgs.push('-map', '[aout]');
    }

    // Encoding settings
    if (isPreview) {
      ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28');
    } else {
      ffmpegArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18');
    }

    ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
    ffmpegArgs.push('-movflags', '+faststart');
    ffmpegArgs.push('-t', totalDuration.toString());
    ffmpegArgs.push(outputPath);

    console.log(`[${sessionId}] FFmpeg render command prepared`);

    await runFFmpeg(ffmpegArgs, sessionId);

    const { stat } = await import('fs/promises');
    const outputStats = await stat(outputPath);

    console.log(`[${sessionId}] Render complete: ${(outputStats.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[${sessionId}] === RENDER COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      path: outputPath,
      size: outputStats.size,
      duration: totalDuration,
      downloadUrl: `/session/${sessionId}/renders/${isPreview ? 'preview' : 'export'}`,
    }));

  } catch (error) {
    console.error(`[${sessionId}] Render error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Download rendered video
async function handleRenderDownload(req, res, sessionId, renderType) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  // Find the render file
  const { readdirSync } = require('fs');
  const files = readdirSync(session.rendersDir);

  let renderFile;
  if (renderType === 'preview') {
    renderFile = files.find(f => f === 'preview.mp4');
  } else {
    // Get most recent export
    renderFile = files
      .filter(f => f.startsWith('export-'))
      .sort()
      .pop();
  }

  if (!renderFile) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Render not found' }));
    return;
  }

  const renderPath = join(session.rendersDir, renderFile);
  const { stat } = await import('fs/promises');
  const stats = await stat(renderPath);

  const filename = renderType === 'preview' ? 'preview.mp4' : `${session.originalName.replace(/\.[^.]+$/, '')}-export.mp4`;

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': stats.size,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Access-Control-Allow-Origin': '*',
  });

  createReadStream(renderPath).pipe(res);
}

// Create animated GIF from an image
async function handleCreateGif(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const options = body ? JSON.parse(body) : {};

    const {
      sourceAssetId,
      effect = 'pulse', // pulse, zoom, rotate, bounce, fade
      duration = 2,      // seconds
      fps = 15,
      width = 400,
      height = 400,
    } = options;

    const sourceAsset = session.assets.get(sourceAssetId);
    if (!sourceAsset) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Source asset not found' }));
      return;
    }

    if (sourceAsset.type !== 'image') {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Source must be an image' }));
      return;
    }

    const jobId = randomUUID();
    console.log(`\n[${jobId}] === CREATE ANIMATED GIF ===`);
    console.log(`[${jobId}] Source: ${sourceAsset.filename}, Effect: ${effect}, Duration: ${duration}s`);

    // Generate GIF output path
    const gifId = randomUUID();
    const gifPath = join(session.assetsDir, `${gifId}.gif`);
    const thumbPath = join(session.assetsDir, `${gifId}_thumb.jpg`);

    // Build FFmpeg filter based on effect
    let filter;
    const totalFrames = duration * fps;

    switch (effect) {
      case 'pulse':
        // Pulsing scale effect (breathe in/out)
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
          `zoompan=z='1+0.1*sin(on*PI*2/${totalFrames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
        break;

      case 'zoom':
        // Ken Burns zoom in effect
        filter = `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=decrease,` +
          `zoompan=z='min(zoom+0.002,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${width}x${height}:fps=${fps}`;
        break;

      case 'rotate':
        // Gentle rotation effect
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
          `rotate=t*PI/8:c=none:ow=${width}:oh=${height},fps=${fps}`;
        break;

      case 'bounce':
        // Bouncing effect (up and down)
        filter = `scale=${width}:${height - 40}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:'(oh-ih)/2+20*sin(t*PI*2)':color=transparent,fps=${fps}`;
        break;

      case 'fade':
        // Fade in and out
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
          `fade=t=in:st=0:d=${duration / 4},fade=t=out:st=${duration * 3 / 4}:d=${duration / 4},fps=${fps}`;
        break;

      case 'shake':
        // Shake/vibrate effect
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width + 20}:${height + 20}:(ow-iw)/2:(oh-ih)/2,` +
          `crop=${width}:${height}:'10+5*sin(t*30)':'10+5*cos(t*25)',fps=${fps}`;
        break;

      default:
        // Simple loop with no animation
        filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`;
    }

    // FFmpeg command to create animated GIF
    const ffmpegArgs = [
      '-y',
      '-loop', '1',
      '-i', sourceAsset.path,
      '-t', duration.toString(),
      '-vf', filter,
      '-gifflags', '+transdiff',
      gifPath
    ];

    console.log(`[${jobId}] Running FFmpeg...`);
    await runFFmpeg(ffmpegArgs, jobId);

    // Generate thumbnail from first frame
    try {
      await runFFmpeg([
        '-y',
        '-i', gifPath,
        '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
        '-frames:v', '1',
        thumbPath
      ], jobId);
    } catch (e) {
      console.warn(`[${jobId}] Thumbnail generation failed:`, e.message);
    }

    const { stat } = await import('fs/promises');
    const stats = await stat(gifPath);

    // Create asset entry
    const gifAsset = {
      id: gifId,
      type: 'image',
      filename: `${sourceAsset.filename.replace(/\.[^.]+$/, '')}-${effect}.gif`,
      path: gifPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: duration, // GIFs have duration
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
    };

    session.assets.set(gifId, gifAsset);

    console.log(`[${jobId}] GIF created: ${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`[${jobId}] === GIF CREATION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      asset: {
        id: gifAsset.id,
        type: gifAsset.type,
        filename: gifAsset.filename,
        duration: gifAsset.duration,
        size: gifAsset.size,
        width: gifAsset.width,
        height: gifAsset.height,
        thumbnailUrl: gifAsset.thumbPath ? `/session/${sessionId}/assets/${gifId}/thumbnail` : null,
      },
    }));

  } catch (error) {
    console.error(`[${sessionId}] GIF creation error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============== TRANSCRIPTION & KEYWORD EXTRACTION ==============

// Known keywords/brands to detect in transcripts
const KNOWN_KEYWORDS = [
  // Tech companies
  'anthropic', 'claude', 'openai', 'chatgpt', 'gpt', 'google', 'gemini', 'bard',
  'microsoft', 'copilot', 'meta', 'llama', 'apple', 'siri', 'amazon', 'alexa',
  'nvidia', 'tesla', 'spacex', 'neuralink', 'twitter', 'x',
  // Social media
  'youtube', 'tiktok', 'instagram', 'facebook', 'snapchat', 'linkedin', 'reddit',
  'discord', 'twitch', 'spotify',
  // People
  'elon musk', 'sam altman', 'mark zuckerberg', 'sundar pichai', 'satya nadella',
  'tim cook', 'jensen huang', 'dario amodei', 'trump', 'biden',
  // General tech terms
  'artificial intelligence', 'machine learning', 'neural network', 'blockchain',
  'cryptocurrency', 'bitcoin', 'ethereum', 'nft', 'metaverse', 'virtual reality',
  'augmented reality', 'robotics', 'automation',
  // Products
  'iphone', 'android', 'windows', 'macbook', 'playstation', 'xbox', 'nintendo',
  'airpods', 'vision pro',
];

// Extract keywords from transcript with timestamps
function extractKeywordsFromTranscript(transcript, words) {
  const foundKeywords = [];
  const lowerTranscript = transcript.toLowerCase();

  for (const keyword of KNOWN_KEYWORDS) {
    const lowerKeyword = keyword.toLowerCase();
    let searchIndex = 0;

    while (true) {
      const index = lowerTranscript.indexOf(lowerKeyword, searchIndex);
      if (index === -1) break;

      // Find the timestamp for this occurrence
      // We need to count characters to find which word this belongs to
      let charCount = 0;
      let timestamp = 0;
      let confidence = 0.9;

      for (const word of words) {
        const wordEnd = charCount + word.word.length + 1; // +1 for space
        if (index >= charCount && index < wordEnd) {
          timestamp = word.start;
          confidence = word.confidence || 0.9;
          break;
        }
        charCount = wordEnd;
      }

      // Avoid duplicates within 5 seconds
      const isDuplicate = foundKeywords.some(
        k => k.keyword === keyword && Math.abs(k.timestamp - timestamp) < 5
      );

      if (!isDuplicate) {
        foundKeywords.push({
          keyword,
          timestamp,
          confidence,
        });
      }

      searchIndex = index + keyword.length;
    }
  }

  // Sort by timestamp
  foundKeywords.sort((a, b) => a.timestamp - b.timestamp);

  return foundKeywords;
}

// Transcribe video using OpenAI Whisper API
async function transcribeVideo(videoPath, jobId) {
  const audioPath = join(TEMP_DIR, `${jobId}-audio-whisper.mp3`);

  try {
    // Extract audio
    console.log(`[${jobId}] Extracting audio for transcription...`);
    await runFFmpeg([
      '-y', '-i', videoPath,
      '-vn', '-acodec', 'libmp3lame',
      '-ab', '64k', '-ar', '16000', '-ac', '1',
      audioPath
    ], jobId);

    const { stat } = await import('fs/promises');
    const audioStats = await stat(audioPath);
    console.log(`\n[${jobId}] Audio extracted: ${(audioStats.size / 1024 / 1024).toFixed(1)} MB`);

    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured in .dev.vars');
    }

    // Send to Whisper API
    console.log(`[${jobId}] Sending to Whisper API...`);
    const audioBuffer = readFileSync(audioPath);
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' });

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[${jobId}] Transcription complete: ${result.text?.length || 0} characters`);

    // Cleanup
    try { unlinkSync(audioPath); } catch {}

    return {
      text: result.text || '',
      words: result.words || [],
      duration: result.duration || 0,
    };

  } catch (error) {
    try { unlinkSync(audioPath); } catch {}
    throw error;
  }
}

// Search GIPHY for a keyword
async function searchGiphy(keyword, limit = 1) {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    throw new Error('GIPHY_API_KEY not configured in .dev.vars');
  }

  const url = `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(keyword)}&limit=${limit}&rating=g&lang=en`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GIPHY API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

// Download GIF and save as asset
async function downloadGifAsAsset(session, gifUrl, keyword, timestamp) {
  const jobId = randomUUID();
  const gifId = randomUUID();
  const gifPath = join(session.assetsDir, `${gifId}.gif`);
  const thumbPath = join(session.assetsDir, `${gifId}_thumb.jpg`);

  try {
    console.log(`[${jobId}] Downloading GIF for "${keyword}"...`);

    const response = await fetch(gifUrl);
    if (!response.ok) {
      throw new Error(`Failed to download GIF: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(gifPath, Buffer.from(buffer));

    // Generate thumbnail
    try {
      await runFFmpeg([
        '-y', '-i', gifPath,
        '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
        '-frames:v', '1',
        thumbPath
      ], jobId);
    } catch (e) {
      console.warn(`[${jobId}] Thumbnail generation failed:`, e.message);
    }

    const { stat } = await import('fs/promises');
    const stats = await stat(gifPath);

    // Get GIF dimensions
    const info = await getMediaInfo(gifPath);

    const asset = {
      id: gifId,
      type: 'image',
      filename: `${keyword.replace(/\s+/g, '-')}.gif`,
      path: gifPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: 3, // Default 3 seconds for GIFs
      size: stats.size,
      width: info.width || 200,
      height: info.height || 200,
      createdAt: Date.now(),
      // Extra metadata for auto-placement
      keyword,
      timestamp,
    };

    session.assets.set(gifId, asset);

    console.log(`[${jobId}] GIF saved: ${(stats.size / 1024).toFixed(1)} KB`);

    return asset;

  } catch (error) {
    try { unlinkSync(gifPath); } catch {}
    try { unlinkSync(thumbPath); } catch {}
    throw error;
  }
}

// Handle simple transcription for captions using Gemini (returns word-level timestamps)
// Check if local Whisper is available
async function checkLocalWhisper() {
  return new Promise((resolve) => {
    const check = spawn('python3', ['-c', 'import whisper; print("ok")']);
    let output = '';
    check.stdout.on('data', (data) => { output += data.toString(); });
    check.on('close', (code) => {
      resolve(code === 0 && output.includes('ok'));
    });
    check.on('error', () => resolve(false));
  });
}

// Run local Whisper transcription
async function runLocalWhisper(audioPath, jobId) {
  const scriptPath = join(process.cwd(), 'scripts', 'whisper-transcribe.py');

  return new Promise((resolve, reject) => {
    console.log(`[${jobId}] Running local Whisper...`);
    const whisperProcess = spawn('python3', [scriptPath, audioPath, 'base']);

    let stdout = '';
    let stderr = '';

    whisperProcess.stdout.on('data', (data) => { stdout += data.toString(); });
    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log progress messages
      const lines = data.toString().split('\n').filter(l => l.trim());
      lines.forEach(line => console.log(`[${jobId}] Whisper: ${line}`));
    });

    whisperProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Whisper failed: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse Whisper output: ${stdout}`));
      }
    });

    whisperProcess.on('error', (err) => reject(err));
  });
}

async function handleTranscribe(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const jobId = sessionId.substring(0, 8);
  const audioPath = join(TEMP_DIR, `${jobId}-caption-audio.mp3`);

  try {
    // Check for transcription options in order of preference:
    // 1. Local Whisper (free, accurate)
    // 2. OpenAI Whisper API (paid, accurate)
    // 3. Gemini (paid, less accurate timestamps)
    const hasLocalWhisper = await checkLocalWhisper();
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!hasLocalWhisper && !openaiKey && !geminiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No transcription method available. Install local Whisper (pip3 install openai-whisper) or set GEMINI_API_KEY in .dev.vars' }));
      return;
    }

    // Parse request body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    const { assetId } = JSON.parse(body || '{}');

    // Determine which method to use
    const useLocalWhisper = hasLocalWhisper;
    const useOpenAIWhisper = !hasLocalWhisper && !!openaiKey;
    const useGemini = !hasLocalWhisper && !openaiKey && !!geminiKey;

    const method = useLocalWhisper ? 'Local Whisper' : useOpenAIWhisper ? 'OpenAI Whisper' : 'Gemini';
    console.log(`\n[${jobId}] === TRANSCRIBE FOR CAPTIONS (${method}) ===`);

    if (useLocalWhisper) {
      console.log(`[${jobId}] Using local Whisper for accurate word-level timestamps (free)`);
    } else if (useOpenAIWhisper) {
      console.log(`[${jobId}] Using OpenAI Whisper API for accurate word-level timestamps`);
    } else {
      console.log(`[${jobId}] Using Gemini (timestamps may drift - install local Whisper for accurate sync)`);
    }

    // Find the video asset
    let videoAsset = null;
    if (assetId) {
      videoAsset = session.assets.get(assetId);
    } else {
      // If no assetId, find the first video asset
      for (const asset of session.assets.values()) {
        if (asset.type === 'video') {
          videoAsset = asset;
          break;
        }
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found' }));
      return;
    }

    console.log(`[${jobId}] Transcribing: ${videoAsset.filename}`);

    // Get video duration
    const totalDuration = await getVideoDuration(videoAsset.path);
    console.log(`[${jobId}] Video duration: ${totalDuration.toFixed(2)}s`);

    // Extract audio as MP3
    console.log(`[${jobId}] Extracting audio...`);
    await runFFmpeg([
      '-y', '-i', videoAsset.path,
      '-vn', '-acodec', 'libmp3lame',
      '-ab', '64k', '-ar', '16000', '-ac', '1',
      audioPath
    ], jobId);

    const { stat } = await import('fs/promises');
    const audioStats = await stat(audioPath);
    console.log(`[${jobId}] Audio extracted: ${(audioStats.size / 1024 / 1024).toFixed(1)} MB`);

    // Transcribe using the available method
    let transcription;

    if (useLocalWhisper) {
      // === Local Whisper - Free and accurate word-level timestamps ===
      transcription = await runLocalWhisper(audioPath, jobId);
      console.log(`[${jobId}] Local Whisper complete: ${transcription.words?.length || 0} words`);

    } else if (useOpenAIWhisper) {
      // === OpenAI Whisper API - Accurate word-level timestamps ===
      console.log(`[${jobId}] Sending to OpenAI Whisper for transcription...`);
      const audioBuffer = readFileSync(audioPath);

      // Create FormData for multipart upload
      const FormData = (await import('formdata-node')).FormData;
      const { Blob } = await import('buffer');

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/mp3' }), 'audio.mp3');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: formData,
      });

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text();
        console.error(`[${jobId}] Whisper API error:`, errorText);
        throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`);
      }

      const whisperResult = await whisperResponse.json();
      console.log(`[${jobId}] Whisper transcription complete: ${whisperResult.words?.length || 0} words`);

      transcription = {
        text: whisperResult.text || '',
        words: (whisperResult.words || []).map(w => ({
          text: w.word || '',
          start: w.start || 0,
          end: w.end || 0,
        }))
      };

    } else if (useGemini) {
      // === Gemini - Estimated timestamps (less accurate) ===
      console.log(`[${jobId}] Sending to Gemini for transcription...`);
      const audioBuffer = readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/mp3',
                  data: audioBase64
                }
              },
              {
                text: `Transcribe this audio with word-level timestamps. The audio is ${totalDuration.toFixed(1)} seconds long.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation. The response must be parseable JSON.

Return this exact JSON structure:
{
  "text": "full transcript text here",
  "words": [
    {"text": "word1", "start": 0.0, "end": 0.5},
    {"text": "word2", "start": 0.5, "end": 1.0}
  ]
}

Guidelines:
- Include every spoken word
- Timestamps should be in seconds (decimals allowed)
- "start" is when the word begins, "end" is when it ends
- Words should be in order
- Estimate timing based on natural speech patterns if exact timing is unclear
- Do not include filler sounds like "um" or "uh" unless they're clearly intentional`
              }
            ]
          }
        ]
      });

      const responseText = response.text || '';
      console.log(`[${jobId}] Gemini response length: ${responseText.length} chars`);
      console.log(`[${jobId}] Gemini raw response:`, responseText.substring(0, 1000));

      // Parse the JSON response
      try {
        // First try direct parse
        transcription = JSON.parse(responseText);
      } catch (e1) {
        try {
          // Try to extract JSON from markdown code blocks
          const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            transcription = JSON.parse(codeBlockMatch[1].trim());
          } else {
            // Try to extract any JSON object
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              transcription = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('No JSON found in response');
            }
          }
        } catch (e2) {
          console.error(`[${jobId}] Failed to parse Gemini response:`, responseText);

          // Last resort: try to create a simple transcription from the text
          // If Gemini just returned plain text, use that as the transcript
          if (responseText && responseText.length > 10 && !responseText.startsWith('{')) {
            console.log(`[${jobId}] Falling back to plain text transcription`);
            const plainText = responseText.replace(/```[\s\S]*?```/g, '').trim();
            const wordsArray = plainText.split(/\s+/).filter(w => w.length > 0);
            const avgWordDuration = totalDuration / wordsArray.length;

            transcription = {
              text: plainText,
              words: wordsArray.map((word, i) => ({
                text: word.replace(/[.,!?;:'"]/g, ''),
                start: i * avgWordDuration,
                end: (i + 1) * avgWordDuration,
              }))
            };
          } else {
            throw new Error('Failed to parse transcription response from Gemini');
          }
        }
      }
    }

    // Cleanup
    try { unlinkSync(audioPath); } catch {}

    const words = (transcription.words || []).map(w => ({
      text: w.text || '',
      start: parseFloat(w.start) || 0,
      end: parseFloat(w.end) || 0,
    })).filter(w => w.text.trim().length > 0); // Filter out empty words

    console.log(`[${jobId}] Transcription complete: ${words.length} words`);
    console.log(`[${jobId}] Text: "${(transcription.text || '').substring(0, 200)}..."`);

    // Check if transcription is empty
    if (words.length === 0 && (!transcription.text || transcription.text.trim().length === 0)) {
      console.error(`[${jobId}] Empty transcription - Gemini returned no words`);
      console.error(`[${jobId}] This could mean: no speech in video, audio too quiet, or unsupported language`);

      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        error: 'No speech detected. Make sure the video has clear, audible speech.',
        debug: {
          rawResponseLength: responseText.length,
          rawResponsePreview: responseText.substring(0, 200)
        }
      }));
      return;
    }

    console.log(`[${jobId}] === TRANSCRIPTION DONE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      text: transcription.text || '',
      words: words,
      duration: totalDuration,
    }));

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    try { unlinkSync(audioPath); } catch {}
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Handle transcribe and extract keywords endpoint
async function handleTranscribeAndExtract(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const jobId = sessionId.substring(0, 8);

  try {
    console.log(`\n[${jobId}] === TRANSCRIBE & EXTRACT KEYWORDS ===`);

    // Find the first video asset in the session
    let videoAsset = null;
    for (const asset of session.assets.values()) {
      if (asset.type === 'video') {
        videoAsset = asset;
        break;
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found in session' }));
      return;
    }

    console.log(`[${jobId}] Using video: ${videoAsset.filename}`);

    // Step 1: Transcribe
    const transcription = await transcribeVideo(videoAsset.path, jobId);
    console.log(`[${jobId}] Transcript: "${transcription.text.substring(0, 100)}..."`);

    // Step 2: Extract keywords
    const keywords = extractKeywordsFromTranscript(transcription.text, transcription.words);
    console.log(`[${jobId}] Found ${keywords.length} keywords`);

    // Step 3: Fetch GIFs from GIPHY for each keyword
    const gifAssets = [];
    for (const kw of keywords) {
      try {
        console.log(`[${jobId}] Searching GIPHY for "${kw.keyword}"...`);
        const gifs = await searchGiphy(kw.keyword, 1);

        if (gifs.length > 0) {
          // Get the fixed height small GIF URL
          const gifUrl = gifs[0].images?.fixed_height?.url ||
                         gifs[0].images?.original?.url;

          if (gifUrl) {
            const asset = await downloadGifAsAsset(session, gifUrl, kw.keyword, kw.timestamp);
            gifAssets.push({
              assetId: asset.id,
              keyword: kw.keyword,
              timestamp: kw.timestamp,
              confidence: kw.confidence,
              filename: asset.filename,
              thumbnailUrl: `/session/${sessionId}/assets/${asset.id}/thumbnail`,
            });
          }
        }
      } catch (error) {
        console.warn(`[${jobId}] Failed to get GIF for "${kw.keyword}":`, error.message);
      }
    }

    console.log(`[${jobId}] Downloaded ${gifAssets.length} GIFs`);
    console.log(`[${jobId}] === TRANSCRIPTION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      transcript: transcription.text,
      keywords: keywords,
      gifAssets: gifAssets,
    }));

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============== B-ROLL IMAGE GENERATION ==============

// Helper to parse JSON body from request
async function parseBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

// Analyze transcript for B-roll opportunities using Gemini
async function analyzeBrollOpportunities(transcript, words, totalDuration, apiKey) {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      role: 'user',
      parts: [{
        text: `Analyze this video transcript and identify 3-5 key moments that would benefit from a visual B-roll image overlay. Consider:
- Keywords or products mentioned (e.g., "iPhone", "Claude AI", "Tesla")
- Funny or emphatic moments
- Important concepts being explained
- Brand names or people mentioned
- Abstract concepts that could use visual reinforcement

The video is ${totalDuration.toFixed(1)} seconds long.

Transcript: "${transcript}"

Word timings (for reference): ${JSON.stringify(words.slice(0, 50))}${words.length > 50 ? '...' : ''}

Return a JSON array with this exact structure:
[
  {
    "timestamp": 15.2,
    "prompt": "minimalist icon of iPhone floating on clean white background, simple flat design",
    "reason": "product mention",
    "keyword": "iPhone"
  }
]

Guidelines for prompts:
- Keep prompts concise (10-20 words)
- Request clean, iconic, simple images suitable for video overlay
- Use "minimalist", "icon", "simple", "flat design" style descriptors
- Avoid complex scenes - prefer single subjects with clean backgrounds
- Images will be 1:1 square format

IMPORTANT: Return ONLY valid JSON array, no markdown, no explanation.`
      }]
    }],
    config: { responseMimeType: 'application/json' }
  });

  const responseText = response.text || '[]';

  try {
    // Try to parse directly
    const parsed = JSON.parse(responseText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try to extract JSON from response
    const match = responseText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

// Generate image using Gemini Imagen (Nano Banana)
async function generateImageWithGemini(prompt, apiKey, outputPath) {
  const ai = new GoogleGenAI({ apiKey });

  console.log(`    Generating image: "${prompt.substring(0, 50)}..."`);

  try {
    // Use Gemini's image generation model
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: [{
        role: 'user',
        parts: [{
          text: `Generate a clean, simple image: ${prompt}.
Style: minimalist, iconic, suitable for video overlay.
Format: 1:1 square aspect ratio.
Background: clean, uncluttered.`
        }]
      }],
      config: {
        responseModalities: ['image', 'text'],
      }
    });

    // Extract image from response
    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        writeFileSync(outputPath, imageBuffer);
        console.log(`    Image saved: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
        return true;
      }
    }

    console.warn(`    No image in response, trying alternative prompt...`);
    return false;
  } catch (error) {
    console.error(`    Image generation failed: ${error.message}`);
    return false;
  }
}

// Handle B-roll generation endpoint
async function handleGenerateBroll(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const jobId = sessionId.substring(0, 8);

  try {
    console.log(`\n[${jobId}] === GENERATE B-ROLL IMAGES ===`);

    // Check for Gemini API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured in .dev.vars' }));
      return;
    }

    // Find the first video asset in the session
    let videoAsset = null;
    for (const asset of session.assets.values()) {
      if (asset.type === 'video') {
        videoAsset = asset;
        break;
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found in session' }));
      return;
    }

    console.log(`[${jobId}] Using video: ${videoAsset.filename}`);

    // Step 1: Transcribe the video
    console.log(`[${jobId}] Step 1: Transcribing video...`);
    const audioPath = join(TEMP_DIR, `${jobId}-broll-audio.mp3`);
    const totalDuration = await getVideoDuration(videoAsset.path);

    // Check for transcription method
    const hasLocalWhisper = await checkLocalWhisper();
    const openaiKey = process.env.OPENAI_API_KEY;

    // Extract audio
    await runFFmpeg([
      '-y', '-i', videoAsset.path,
      '-vn', '-acodec', 'libmp3lame',
      '-ab', '64k', '-ar', '16000', '-ac', '1',
      audioPath
    ], jobId);

    let transcription;
    if (hasLocalWhisper) {
      console.log(`[${jobId}]    Using local Whisper...`);
      transcription = await runLocalWhisper(audioPath, jobId);
    } else if (openaiKey) {
      console.log(`[${jobId}]    Using OpenAI Whisper API...`);
      const audioBuffer = readFileSync(audioPath);
      const FormData = (await import('formdata-node')).FormData;
      const { Blob } = await import('buffer');

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/mp3' }), 'audio.mp3');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        throw new Error(`Whisper API error: ${whisperResponse.status}`);
      }

      const whisperResult = await whisperResponse.json();
      transcription = {
        text: whisperResult.text || '',
        words: (whisperResult.words || []).map(w => ({
          text: w.word || '',
          start: w.start || 0,
          end: w.end || 0,
        }))
      };
    } else {
      // Use Gemini for transcription
      console.log(`[${jobId}]    Using Gemini for transcription...`);
      const audioBuffer = readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
            { text: `Transcribe this audio with word timestamps. Duration: ${totalDuration}s. Return JSON: {"text": "...", "words": [{"text": "word", "start": 0.0, "end": 0.5}]}` }
          ]
        }]
      });

      const respText = response.text || '';
      try {
        transcription = JSON.parse(respText);
      } catch {
        const match = respText.match(/\{[\s\S]*\}/);
        transcription = match ? JSON.parse(match[0]) : { text: respText, words: [] };
      }
    }

    try { unlinkSync(audioPath); } catch {}

    console.log(`[${jobId}]    Transcript: "${transcription.text.substring(0, 100)}..."`);
    console.log(`[${jobId}]    Words: ${transcription.words?.length || 0}`);

    // Step 2: Analyze transcript for B-roll opportunities
    console.log(`[${jobId}] Step 2: Analyzing for B-roll opportunities...`);
    const opportunities = await analyzeBrollOpportunities(
      transcription.text,
      transcription.words || [],
      totalDuration,
      apiKey
    );

    console.log(`[${jobId}]    Found ${opportunities.length} B-roll opportunities`);
    opportunities.forEach((opp, i) => {
      console.log(`[${jobId}]    ${i + 1}. @${opp.timestamp.toFixed(1)}s: "${opp.keyword}" - ${opp.reason}`);
    });

    // Step 3: Generate images for each opportunity
    console.log(`[${jobId}] Step 3: Generating B-roll images...`);
    const brollAssets = [];

    for (let i = 0; i < opportunities.length; i++) {
      const opp = opportunities[i];
      const assetId = randomUUID();
      const imagePath = join(session.assetsDir, `${assetId}.png`);
      const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);

      console.log(`[${jobId}]    [${i + 1}/${opportunities.length}] Generating for "${opp.keyword}"...`);

      const success = await generateImageWithGemini(opp.prompt, apiKey, imagePath);

      if (success && existsSync(imagePath)) {
        // Generate thumbnail
        try {
          await runFFmpeg([
            '-y', '-i', imagePath,
            '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
            '-frames:v', '1',
            thumbPath
          ], jobId);
        } catch (e) {
          console.warn(`[${jobId}]    Thumbnail generation failed:`, e.message);
        }

        const { stat } = await import('fs/promises');
        const stats = await stat(imagePath);
        const info = await getMediaInfo(imagePath);

        // Create asset entry
        const asset = {
          id: assetId,
          type: 'image',
          filename: `broll-${opp.keyword.replace(/\s+/g, '-')}.png`,
          path: imagePath,
          thumbPath: existsSync(thumbPath) ? thumbPath : null,
          duration: 3, // Default 3 seconds for B-roll images
          size: stats.size,
          width: info.width || 1024,
          height: info.height || 1024,
          createdAt: Date.now(),
          // B-roll metadata
          keyword: opp.keyword,
          timestamp: opp.timestamp,
          reason: opp.reason,
        };

        session.assets.set(assetId, asset);

        brollAssets.push({
          assetId: asset.id,
          keyword: opp.keyword,
          timestamp: opp.timestamp,
          reason: opp.reason,
          filename: asset.filename,
          thumbnailUrl: `/session/${sessionId}/assets/${asset.id}/thumbnail`,
        });

        console.log(`[${jobId}]    ✓ Generated: ${asset.filename}`);
      } else {
        console.log(`[${jobId}]    ✗ Failed to generate image for "${opp.keyword}"`);
      }
    }

    console.log(`[${jobId}] Generated ${brollAssets.length}/${opportunities.length} B-roll images`);
    console.log(`[${jobId}] === B-ROLL GENERATION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      transcript: transcription.text,
      opportunities: opportunities,
      brollAssets: brollAssets,
    }));

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============== MOTION GRAPHICS RENDERING ==============

// Handle motion graphics rendering
// NOTE: This is a placeholder that creates a simple text overlay video using FFmpeg
// For proper Remotion rendering, you'd need to set up @remotion/renderer with bundling
async function handleRenderMotionGraphic(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { templateId, props, duration, fps = 30, width = 1920, height = 1080 } = body;

    const jobId = randomUUID();
    const assetId = randomUUID();
    const outputPath = join(session.assetsDir, `${assetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);

    console.log(`\n[${jobId}] === RENDER MOTION GRAPHIC ===`);
    console.log(`[${jobId}] Template: ${templateId}`);
    console.log(`[${jobId}] Duration: ${duration}s`);

    // Get text and styling from props
    const text = props.text || props.name || templateId;
    const color = (props.color || props.primaryColor || '#ffffff').replace('#', '');
    const bgColor = props.backgroundColor || '000000';
    const fontSize = props.fontSize || 64;

    // Create a video with text overlay using FFmpeg
    // This is a placeholder - proper Remotion rendering would generate much nicer animations
    const fontFile = '/System/Library/Fonts/Helvetica.ttc'; // macOS system font

    // FFmpeg command to create a video with text
    const ffmpegArgs = [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x${bgColor}:s=${width}x${height}:d=${duration}:r=${fps}`,
      '-vf', `drawtext=text='${text.replace(/'/g, "\\'")}':fontfile=${fontFile}:fontsize=${fontSize}:fontcolor=0x${color}:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      outputPath
    ];

    await runFFmpeg(ffmpegArgs, jobId);

    // Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Create asset entry
    const asset = {
      id: assetId,
      type: 'video',
      filename: `motion-${templateId}-${Date.now()}.mp4`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: duration,
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
      // Metadata
      templateId,
      props,
    };

    session.assets.set(assetId, asset);

    console.log(`[${jobId}] Motion graphic rendered: ${assetId}`);
    console.log(`[${jobId}] === RENDER COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId,
      filename: asset.filename,
      duration,
      thumbnailUrl: `/session/${sessionId}/assets/${assetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${assetId}/stream`,
    }));

  } catch (error) {
    console.error('Motion graphic render error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// AI-generated animation using Gemini + Remotion
async function handleGenerateAnimation(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { description, fps = 30, width = 1920, height = 1080 } = body;

    if (!description) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'description is required' }));
      return;
    }

    const jobId = randomUUID();
    const assetId = randomUUID();
    const outputPath = join(session.assetsDir, `${assetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);
    const propsPath = join(session.dir, `${jobId}-props.json`);

    console.log(`\n[${jobId}] === GENERATE AI ANIMATION ===`);
    console.log(`[${jobId}] Description: ${description}`);

    // Step 1: Use Gemini to generate scene data
    console.log(`[${jobId}] Generating scenes with Gemini...`);

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a motion graphics designer. Create a JSON scene structure for an animated video based on this description:

"${description}"

Return ONLY valid JSON (no markdown, no code blocks) with this structure:
{
  "scenes": [
    {
      "id": "unique-id",
      "type": "title" | "steps" | "features" | "stats" | "text" | "transition",
      "duration": <number of frames at 30fps, typically 60-150>,
      "content": {
        "title": "optional title text",
        "subtitle": "optional subtitle",
        "items": [{"icon": "emoji or number", "label": "text", "description": "optional"}],
        "stats": [{"value": "10K+", "label": "Users"}],
        "color": "#hex color for accent",
        "backgroundColor": "#hex for bg or null for transparent"
      }
    }
  ],
  "backgroundColor": "#0a0a0a",
  "totalDuration": <sum of all scene durations>
}

Scene types:
- "title": Big centered title with optional subtitle (for intros/outros)
- "steps": Numbered steps or process flow (1, 2, 3...)
- "features": Feature showcase with icons
- "stats": Animated statistics/numbers
- "text": Simple text message
- "transition": Brief transition between scenes

Guidelines:
- Keep it concise: 3-6 scenes max
- Total duration: 5-15 seconds (150-450 frames)
- Use vibrant colors: #f97316 (orange), #3b82f6 (blue), #22c55e (green), #8b5cf6 (purple)
- Make it visually engaging with good pacing`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    let sceneData;
    try {
      const responseText = result.candidates[0].content.parts[0].text;
      // Clean up response - remove markdown code blocks if present
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      sceneData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`[${jobId}] Failed to parse Gemini response:`, parseError);
      throw new Error('Failed to parse AI-generated scene data');
    }

    console.log(`[${jobId}] Generated ${sceneData.scenes.length} scenes`);

    const totalDuration = sceneData.totalDuration || sceneData.scenes.reduce((sum, s) => sum + s.duration, 0);
    const durationInSeconds = totalDuration / fps;

    // Step 2: Write props to JSON file for Remotion
    writeFileSync(propsPath, JSON.stringify(sceneData, null, 2));
    console.log(`[${jobId}] Props written to ${propsPath}`);

    // Step 3: Render with Remotion CLI
    console.log(`[${jobId}] Rendering with Remotion...`);

    const remotionArgs = [
      'remotion', 'render',
      'src/remotion/index.tsx',
      'DynamicAnimation',
      outputPath,
      '--props', propsPath,
      '--frames', `0-${totalDuration - 1}`,
      '--fps', String(fps),
      '--width', String(width),
      '--height', String(height),
      '--codec', 'h264',
      '--overwrite',
    ];

    await new Promise((resolve, reject) => {
      const proc = spawn('npx', remotionArgs, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        console.log(`[${jobId}] Remotion: ${data.toString().trim()}`);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Remotion render failed with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to start Remotion: ${err.message}`));
      });
    });

    // Step 4: Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    // Clean up props file
    try {
      unlinkSync(propsPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Create asset entry
    const asset = {
      id: assetId,
      type: 'video',
      filename: `animation-${Date.now()}.mp4`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: durationInSeconds,
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
      // Metadata
      aiGenerated: true,
      description,
      sceneCount: sceneData.scenes.length,
    };

    session.assets.set(assetId, asset);

    console.log(`[${jobId}] AI animation rendered: ${assetId} (${durationInSeconds}s)`);
    console.log(`[${jobId}] === GENERATION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId,
      filename: asset.filename,
      duration: durationInSeconds,
      sceneCount: sceneData.scenes.length,
      thumbnailUrl: `/session/${sessionId}/assets/${assetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${assetId}/stream`,
    }));

  } catch (error) {
    console.error('AI animation generation error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Analyze video for animation concept (no rendering - for approval workflow)
// Returns transcript and proposed animation scenes for user approval
async function handleAnalyzeForAnimation(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { assetId, type = 'intro', description } = body;

    // Get the video asset to analyze
    let videoAsset;
    if (assetId) {
      videoAsset = session.assets.get(assetId);
    } else {
      for (const [id, asset] of session.assets) {
        if (asset.type === 'video') {
          videoAsset = asset;
          break;
        }
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found to analyze' }));
      return;
    }

    const jobId = randomUUID();
    const audioPath = join(TEMP_DIR, `${jobId}-audio.mp3`);

    console.log(`\n[${jobId}] === ANALYZE VIDEO FOR ${type.toUpperCase()} ANIMATION ===`);
    console.log(`[${jobId}] Analyzing video: ${videoAsset.filename}`);

    // Step 1: Transcribe the video
    console.log(`[${jobId}] Step 1: Transcribing video...`);

    // Extract audio from video
    await runFFmpeg([
      '-y', '-i', videoAsset.path,
      '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-q:a', '9',
      audioPath
    ], jobId);

    // Get video duration
    const durationOutput = await runFFmpegProbe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoAsset.path
    ], jobId);
    const totalDuration = parseFloat(durationOutput.trim()) || 60;

    let transcription;
    const hasLocalWhisper = await checkLocalWhisper();
    const openaiKey = process.env.OPENAI_API_KEY;

    if (hasLocalWhisper) {
      console.log(`[${jobId}]    Using local Whisper...`);
      transcription = await runLocalWhisper(audioPath, jobId);
    } else if (openaiKey) {
      console.log(`[${jobId}]    Using OpenAI Whisper API...`);
      const FormData = (await import('node-fetch')).default.FormData || global.FormData;
      const formData = new FormData();
      formData.append('file', createReadStream(audioPath));
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        throw new Error(`Whisper API error: ${whisperResponse.status}`);
      }

      const whisperResult = await whisperResponse.json();
      transcription = {
        text: whisperResult.text || '',
        words: (whisperResult.words || []).map(w => ({
          text: w.word,
          start: w.start,
          end: w.end,
        })),
      };
    } else {
      // Use Gemini as fallback
      console.log(`[${jobId}]    Using Gemini for transcription...`);
      const ai = new GoogleGenAI({ apiKey });
      const audioBuffer = readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
            { text: `Transcribe this audio. Return ONLY the text content. Duration: ${totalDuration.toFixed(1)}s` }
          ]
        }],
      });

      transcription = {
        text: result.candidates[0].content.parts[0].text || '',
        words: [],
      };
    }

    console.log(`[${jobId}] Transcription complete: ${transcription.text.substring(0, 100)}...`);

    // Clean up audio file
    try { unlinkSync(audioPath); } catch (e) {}

    // Step 2: Generate animation concept (scenes) without rendering
    console.log(`[${jobId}] Step 2: Generating animation concept...`);

    const genAI = new GoogleGenAI({ apiKey });

    const typePrompts = {
      intro: `Create an engaging INTRO animation that hooks viewers and introduces the video topic.
The intro should:
- Start with an attention-grabbing title or hook
- Tease what viewers will learn/see
- Build excitement for the content
- Be 4-8 seconds (120-240 frames at 30fps)`,

      outro: `Create a compelling OUTRO animation that wraps up the video.
The outro should:
- Summarize key takeaways
- Include a call-to-action (subscribe, like, etc.)
- Thank viewers
- Be 5-10 seconds (150-300 frames at 30fps)`,

      transition: `Create a smooth TRANSITION animation between sections.
The transition should:
- Be brief and visually interesting
- Match the video's tone
- Be 2-4 seconds (60-120 frames at 30fps)`,

      highlight: `Create a HIGHLIGHT animation that emphasizes a key moment.
The highlight should:
- Draw attention to an important point
- Use dynamic motion and colors
- Be 3-6 seconds (90-180 frames at 30fps)`,
    };

    const scenePrompt = `You are a motion graphics designer. Analyze this video transcript and create a contextual ${type} animation concept.

VIDEO TRANSCRIPT:
"${transcription.text}"

${description ? `USER HINT: "${description}"` : ''}

${typePrompts[type] || typePrompts.intro}

Based on the video content above, return ONLY valid JSON (no markdown) with this structure:
{
  "scenes": [
    {
      "id": "unique-id",
      "type": "title" | "steps" | "features" | "stats" | "text" | "transition",
      "duration": <frames at 30fps>,
      "content": {
        "title": "text derived from video content",
        "subtitle": "optional",
        "items": [{"icon": "emoji", "label": "text", "description": "optional"}],
        "stats": [{"value": "number", "label": "text"}],
        "color": "#hex accent color",
        "backgroundColor": "#hex or null for transparent"
      }
    }
  ],
  "backgroundColor": "#0a0a0a",
  "totalDuration": <sum of scene durations>,
  "contentSummary": "brief description of what the video is about",
  "keyTopics": ["topic1", "topic2", "topic3"]
}

IMPORTANT: The animation content should directly relate to the video's actual topic and message.
Use specific terms, concepts, and themes from the transcript.`;

    const sceneResult = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: scenePrompt }] }],
    });

    let sceneData;
    try {
      const responseText = sceneResult.candidates[0].content.parts[0].text;
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      sceneData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`[${jobId}] Failed to parse Gemini response:`, parseError);
      throw new Error('Failed to parse AI-generated scene data');
    }

    const animationTotalDuration = sceneData.totalDuration || sceneData.scenes.reduce((sum, s) => sum + s.duration, 0);
    const durationInSeconds = animationTotalDuration / 30; // 30 fps

    console.log(`[${jobId}] Analysis complete: ${sceneData.scenes.length} scenes, ${durationInSeconds}s total`);
    console.log(`[${jobId}] === ANALYSIS COMPLETE (awaiting approval) ===\n`);

    // Return the concept for user approval (NOT rendered yet)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      concept: {
        type,
        transcript: transcription.text,
        transcriptPreview: transcription.text.substring(0, 500) + (transcription.text.length > 500 ? '...' : ''),
        contentSummary: sceneData.contentSummary,
        keyTopics: sceneData.keyTopics || [],
        scenes: sceneData.scenes,
        totalDuration: animationTotalDuration,
        durationInSeconds,
        backgroundColor: sceneData.backgroundColor,
      },
      videoInfo: {
        filename: videoAsset.filename,
        duration: totalDuration,
        assetId: videoAsset.id,
      },
    }));

  } catch (error) {
    console.error('Animation analysis error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Render animation from pre-approved concept (skips analysis, uses provided scenes)
async function handleRenderFromConcept(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { concept, fps = 30, width = 1920, height = 1080 } = body;

    if (!concept || !concept.scenes || concept.scenes.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'concept with scenes is required' }));
      return;
    }

    const jobId = randomUUID();
    const assetId = randomUUID();
    const outputPath = join(session.assetsDir, `${assetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);
    const propsPath = join(session.dir, `${jobId}-props.json`);

    console.log(`\n[${jobId}] === RENDER FROM APPROVED CONCEPT ===`);
    console.log(`[${jobId}] Type: ${concept.type}, Scenes: ${concept.scenes.length}`);

    const sceneData = {
      scenes: concept.scenes,
      backgroundColor: concept.backgroundColor || '#0a0a0a',
      totalDuration: concept.totalDuration,
    };

    const animationTotalDuration = sceneData.totalDuration || sceneData.scenes.reduce((sum, s) => sum + s.duration, 0);
    const durationInSeconds = animationTotalDuration / fps;

    // Write props to JSON file for Remotion
    writeFileSync(propsPath, JSON.stringify(sceneData, null, 2));
    console.log(`[${jobId}] Props written to ${propsPath}`);
    console.log(`[${jobId}] Scene data:`, JSON.stringify(sceneData, null, 2));

    // Render with Remotion CLI
    console.log(`[${jobId}] Rendering with Remotion...`);

    const remotionArgs = [
      'remotion', 'render',
      'src/remotion/index.tsx',
      'DynamicAnimation',
      outputPath,
      '--props', propsPath,
      '--frames', `0-${animationTotalDuration - 1}`,
      '--fps', String(fps),
      '--width', String(width),
      '--height', String(height),
      '--codec', 'h264',
      '--overwrite',
    ];

    console.log(`[${jobId}] Remotion command: npx ${remotionArgs.join(' ')}`);

    await new Promise((resolve, reject) => {
      const proc = spawn('npx', remotionArgs, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[${jobId}] Remotion stdout: ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          console.log(`[${jobId}] Remotion: ${line}`);
        });
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.error(`[${jobId}] Remotion failed. stderr: ${stderr.slice(-1000)}`);
          reject(new Error(`Remotion render failed with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => reject(new Error(`Failed to start Remotion: ${err.message}`)));
    });

    // Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    // Clean up props file
    try { unlinkSync(propsPath); } catch (e) {}

    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Create asset entry
    const asset = {
      id: assetId,
      type: 'video',
      filename: `${concept.type}-animation-${Date.now()}.mp4`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: durationInSeconds,
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
      aiGenerated: true,
      contextual: true,
      animationType: concept.type,
      contentSummary: concept.contentSummary,
      sceneCount: concept.scenes.length,
    };

    session.assets.set(assetId, asset);

    console.log(`[${jobId}] Animation rendered: ${assetId} (${durationInSeconds}s)`);
    console.log(`[${jobId}] === RENDER COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId,
      filename: asset.filename,
      duration: durationInSeconds,
      type: concept.type,
      sceneCount: concept.scenes.length,
      thumbnailUrl: `/session/${sessionId}/assets/${assetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${assetId}/stream`,
    }));

  } catch (error) {
    console.error('Render from concept error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Generate kinetic typography animation from video transcript
// Transcribes video, identifies key phrases, creates animated text scenes synced to audio
async function handleGenerateTranscriptAnimation(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { fps = 30, width = 1920, height = 1080 } = body;

    // Find the first video asset
    let videoAsset = null;
    for (const asset of session.assets.values()) {
      if (asset.type === 'video') {
        videoAsset = asset;
        break;
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found in session' }));
      return;
    }

    const jobId = sessionId.substring(0, 8);
    console.log(`\n[${jobId}] === GENERATE TRANSCRIPT ANIMATION ===`);
    console.log(`[${jobId}] Video: ${videoAsset.filename}`);

    // Step 1: Transcribe the video with word-level timestamps
    console.log(`[${jobId}] Step 1: Transcribing video...`);
    const audioPath = join(TEMP_DIR, `${jobId}-transcript-audio.mp3`);
    const totalDuration = await getVideoDuration(videoAsset.path);

    await runFFmpeg([
      '-y', '-i', videoAsset.path,
      '-vn', '-acodec', 'libmp3lame',
      '-ab', '64k', '-ar', '16000', '-ac', '1',
      audioPath
    ], jobId);

    // Check transcription method
    const hasLocalWhisper = await checkLocalWhisper();
    const openaiKey = process.env.OPENAI_API_KEY;

    let transcription;
    if (hasLocalWhisper) {
      console.log(`[${jobId}]    Using local Whisper...`);
      transcription = await runLocalWhisper(audioPath, jobId);
    } else if (openaiKey) {
      console.log(`[${jobId}]    Using OpenAI Whisper API...`);
      const audioBuffer = readFileSync(audioPath);
      const FormData = (await import('formdata-node')).FormData;
      const { Blob } = await import('buffer');

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer], { type: 'audio/mp3' }), 'audio.mp3');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        throw new Error(`Whisper API error: ${whisperResponse.status}`);
      }

      const whisperResult = await whisperResponse.json();
      transcription = {
        text: whisperResult.text || '',
        words: (whisperResult.words || []).map(w => ({
          text: w.word || '',
          start: w.start || 0,
          end: w.end || 0,
        }))
      };
    } else {
      // Use Gemini for transcription
      console.log(`[${jobId}]    Using Gemini for transcription...`);
      const audioBuffer = readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const ai = new GoogleGenAI({ apiKey });
      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
            { text: `Transcribe this audio with word timestamps. Duration: ${totalDuration}s. Return JSON: {"text": "...", "words": [{"text": "word", "start": 0.0, "end": 0.5}]}` }
          ]
        }]
      });

      const respText = geminiResponse.text || '';
      try {
        transcription = JSON.parse(respText);
      } catch {
        const match = respText.match(/\{[\s\S]*\}/);
        transcription = match ? JSON.parse(match[0]) : { text: respText, words: [] };
      }
    }

    try { unlinkSync(audioPath); } catch {}

    console.log(`[${jobId}]    Transcript: "${transcription.text.substring(0, 100)}..."`);
    console.log(`[${jobId}]    Words: ${transcription.words?.length || 0}`);

    // Step 2: Use Gemini to identify key phrases for animation
    console.log(`[${jobId}] Step 2: Identifying key phrases...`);
    const ai = new GoogleGenAI({ apiKey });

    const analysisPrompt = `Analyze this video transcript and identify 5-8 KEY PHRASES that would make great kinetic typography animations. These should be:
- Important or impactful statements
- Keywords or product names
- Emotional or emphatic moments
- Key points the speaker is making

Transcript: "${transcription.text}"

Word timestamps: ${JSON.stringify(transcription.words?.slice(0, 100) || [])}
(Total duration: ${totalDuration}s)

Return JSON array of phrases to animate:
[
  {
    "phrase": "the exact phrase from transcript",
    "startTime": 1.5,
    "endTime": 3.2,
    "emphasis": "high|medium|low",
    "style": "bold|explosive|subtle|typewriter",
    "reason": "why this phrase is important"
  }
]

Pick phrases that are spread throughout the video. Each phrase should be 2-6 words.`;

    const analysisResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: analysisPrompt }] }]
    });

    let keyPhrases = [];
    try {
      const respText = analysisResponse.text || '';
      const jsonMatch = respText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        keyPhrases = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error(`[${jobId}] Failed to parse key phrases:`, e.message);
    }

    if (keyPhrases.length === 0) {
      // Fallback: create basic phrases from transcript chunks
      const words = transcription.words || [];
      const chunkSize = Math.ceil(words.length / 6);
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize);
        if (chunk.length > 0) {
          keyPhrases.push({
            phrase: chunk.map(w => w.text).join(' ').trim(),
            startTime: chunk[0].start,
            endTime: chunk[chunk.length - 1].end,
            emphasis: 'medium',
            style: 'typewriter'
          });
        }
      }
    }

    console.log(`[${jobId}]    Found ${keyPhrases.length} key phrases`);

    // Step 3: Generate Remotion scenes for each phrase
    console.log(`[${jobId}] Step 3: Generating animation scenes...`);
    const scenes = keyPhrases.map((phrase, index) => {
      const duration = Math.max(60, Math.round((phrase.endTime - phrase.startTime + 1) * fps)); // At least 2 seconds

      // Map emphasis to visual style
      const colors = {
        high: '#f97316', // orange
        medium: '#3b82f6', // blue
        low: '#22c55e', // green
      };

      return {
        id: `text-${index}`,
        type: 'text',
        duration,
        content: {
          title: phrase.phrase.toUpperCase(),
          subtitle: null,
          color: colors[phrase.emphasis] || '#ffffff',
          backgroundColor: '#0a0a0a',
          style: phrase.style || 'typewriter',
        }
      };
    });

    // Calculate total animation duration
    const animationTotalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
    const durationInSeconds = animationTotalDuration / fps;

    console.log(`[${jobId}]    Total animation: ${animationTotalDuration} frames (${durationInSeconds}s)`);

    // Step 4: Render with Remotion
    console.log(`[${jobId}] Step 4: Rendering with Remotion...`);

    const assetId = randomUUID();
    const outputPath = join(session.assetsDir, `${assetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${assetId}_thumb.jpg`);
    const propsPath = join(session.dir, `${jobId}-transcript-props.json`);

    const sceneData = {
      scenes,
      backgroundColor: '#0a0a0a',
      totalDuration: animationTotalDuration,
    };

    writeFileSync(propsPath, JSON.stringify(sceneData, null, 2));

    const remotionArgs = [
      'remotion', 'render',
      'src/remotion/index.tsx',
      'DynamicAnimation',
      outputPath,
      '--props', propsPath,
      '--frames', `0-${animationTotalDuration - 1}`,
      '--fps', String(fps),
      '--width', String(width),
      '--height', String(height),
      '--codec', 'h264',
      '--overwrite',
    ];

    console.log(`[${jobId}] Remotion command: npx ${remotionArgs.join(' ')}`);

    await new Promise((resolve, reject) => {
      const proc = spawn('npx', remotionArgs, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', (data) => {
        console.log(`[${jobId}] Remotion: ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => console.log(`[${jobId}] Remotion: ${line}`));
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Remotion render failed with code ${code}`));
      });

      proc.on('error', (err) => reject(new Error(`Failed to start Remotion: ${err.message}`)));
    });

    // Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    try { unlinkSync(propsPath); } catch {}

    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Create asset entry
    const asset = {
      id: assetId,
      type: 'video',
      filename: `transcript-animation-${Date.now()}.mp4`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: durationInSeconds,
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
      aiGenerated: true,
      transcriptAnimation: true,
      phraseCount: keyPhrases.length,
    };

    session.assets.set(assetId, asset);

    console.log(`[${jobId}] Transcript animation created: ${assetId}`);
    console.log(`[${jobId}] === TRANSCRIPT ANIMATION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId,
      filename: asset.filename,
      duration: durationInSeconds,
      phraseCount: keyPhrases.length,
      phrases: keyPhrases.map(p => p.phrase),
      thumbnailUrl: `/session/${sessionId}/assets/${assetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${assetId}/stream`,
    }));

  } catch (error) {
    console.error('Transcript animation error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Generate contextual animation based on video content
// This transcribes the video first, understands what it's about, then generates relevant animation
async function handleGenerateContextualAnimation(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { assetId, type = 'intro', description, fps = 30, width = 1920, height = 1080 } = body;

    // Get the video asset to analyze
    let videoAsset;
    if (assetId) {
      videoAsset = session.assets.get(assetId);
    } else {
      // Find the first video asset
      for (const [id, asset] of session.assets) {
        if (asset.type === 'video') {
          videoAsset = asset;
          break;
        }
      }
    }

    if (!videoAsset) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'No video asset found to analyze' }));
      return;
    }

    const jobId = randomUUID();
    const outputAssetId = randomUUID();
    const outputPath = join(session.assetsDir, `${outputAssetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${outputAssetId}_thumb.jpg`);
    const propsPath = join(session.dir, `${jobId}-props.json`);
    const audioPath = join(TEMP_DIR, `${jobId}-audio.mp3`);

    console.log(`\n[${jobId}] === GENERATE CONTEXTUAL ${type.toUpperCase()} ANIMATION ===`);
    console.log(`[${jobId}] Analyzing video: ${videoAsset.filename}`);
    console.log(`[${jobId}] Type: ${type}, Description hint: ${description || 'none'}`);

    // Step 1: Transcribe the video to understand content
    console.log(`[${jobId}] Step 1: Transcribing video...`);

    // Extract audio from video
    await runFFmpeg([
      '-y', '-i', videoAsset.path,
      '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-q:a', '9',
      audioPath
    ], jobId);

    // Get video duration
    const durationOutput = await runFFmpegProbe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoAsset.path
    ], jobId);
    const totalDuration = parseFloat(durationOutput.trim()) || 60;

    let transcription;
    const hasLocalWhisper = await checkLocalWhisper();
    const openaiKey = process.env.OPENAI_API_KEY;

    if (hasLocalWhisper) {
      console.log(`[${jobId}]    Using local Whisper...`);
      transcription = await runLocalWhisper(audioPath, jobId);
    } else if (openaiKey) {
      console.log(`[${jobId}]    Using OpenAI Whisper API...`);
      const FormData = (await import('node-fetch')).default.FormData || global.FormData;
      const formData = new FormData();
      formData.append('file', createReadStream(audioPath));
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!whisperResponse.ok) {
        throw new Error(`Whisper API error: ${whisperResponse.status}`);
      }

      const whisperResult = await whisperResponse.json();
      transcription = {
        text: whisperResult.text || '',
        words: (whisperResult.words || []).map(w => ({
          text: w.word,
          start: w.start,
          end: w.end,
        })),
      };
    } else {
      // Use Gemini as fallback for transcription
      console.log(`[${jobId}]    Using Gemini for transcription...`);
      const ai = new GoogleGenAI({ apiKey });

      // Read audio file as base64
      const audioBuffer = readFileSync(audioPath);
      const audioBase64 = audioBuffer.toString('base64');

      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/mp3', data: audioBase64 } },
            { text: `Transcribe this audio. Return ONLY the text content, no timestamps needed. Duration: ${totalDuration.toFixed(1)}s` }
          ]
        }],
      });

      transcription = {
        text: result.candidates[0].content.parts[0].text || '',
        words: [],
      };
    }

    console.log(`[${jobId}] Transcription complete: ${transcription.text.substring(0, 100)}...`);

    // Clean up audio file
    try { unlinkSync(audioPath); } catch (e) {}

    // Step 2: Analyze content and generate contextual scene data
    console.log(`[${jobId}] Step 2: Analyzing content and generating scenes...`);

    const genAI = new GoogleGenAI({ apiKey });

    const typePrompts = {
      intro: `Create an engaging INTRO animation that hooks viewers and introduces the video topic.
The intro should:
- Start with an attention-grabbing title or hook
- Tease what viewers will learn/see
- Build excitement for the content
- Be 4-8 seconds (120-240 frames at 30fps)`,

      outro: `Create a compelling OUTRO animation that wraps up the video.
The outro should:
- Summarize key takeaways
- Include a call-to-action (subscribe, like, etc.)
- Thank viewers
- Be 5-10 seconds (150-300 frames at 30fps)`,

      transition: `Create a smooth TRANSITION animation between sections.
The transition should:
- Be brief and visually interesting
- Match the video's tone
- Be 2-4 seconds (60-120 frames at 30fps)`,

      highlight: `Create a HIGHLIGHT animation that emphasizes a key moment.
The highlight should:
- Draw attention to an important point
- Use dynamic motion and colors
- Be 3-6 seconds (90-180 frames at 30fps)`,
    };

    const scenePrompt = `You are a motion graphics designer. Analyze this video transcript and create a contextual ${type} animation.

VIDEO TRANSCRIPT:
"${transcription.text}"

${description ? `USER HINT: "${description}"` : ''}

${typePrompts[type] || typePrompts.intro}

Based on the video content above, return ONLY valid JSON (no markdown) with this structure:
{
  "scenes": [
    {
      "id": "unique-id",
      "type": "title" | "steps" | "features" | "stats" | "text" | "transition",
      "duration": <frames at 30fps>,
      "content": {
        "title": "text derived from video content",
        "subtitle": "optional",
        "items": [{"icon": "emoji", "label": "text", "description": "optional"}],
        "stats": [{"value": "number", "label": "text"}],
        "color": "#hex accent color",
        "backgroundColor": "#hex or null for transparent"
      }
    }
  ],
  "backgroundColor": "#0a0a0a",
  "totalDuration": <sum of scene durations>,
  "contentSummary": "brief description of what the video is about"
}

IMPORTANT: The animation content should directly relate to the video's actual topic and message.
Use specific terms, concepts, and themes from the transcript.`;

    const sceneResult = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: scenePrompt }] }],
    });

    let sceneData;
    try {
      const responseText = sceneResult.candidates[0].content.parts[0].text;
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      sceneData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error(`[${jobId}] Failed to parse Gemini response:`, parseError);
      throw new Error('Failed to parse AI-generated scene data');
    }

    console.log(`[${jobId}] Generated ${sceneData.scenes.length} scenes for ${type}`);
    console.log(`[${jobId}] Content summary: ${sceneData.contentSummary || 'N/A'}`);

    const animationTotalDuration = sceneData.totalDuration || sceneData.scenes.reduce((sum, s) => sum + s.duration, 0);
    const durationInSeconds = animationTotalDuration / fps;

    // Step 3: Write props and render with Remotion
    console.log(`[${jobId}] Step 3: Rendering with Remotion...`);

    writeFileSync(propsPath, JSON.stringify(sceneData, null, 2));

    const remotionArgs = [
      'remotion', 'render',
      'src/remotion/index.tsx',
      'DynamicAnimation',
      outputPath,
      '--props', propsPath,
      '--frames', `0-${animationTotalDuration - 1}`,
      '--fps', String(fps),
      '--width', String(width),
      '--height', String(height),
      '--codec', 'h264',
      '--overwrite',
    ];

    await new Promise((resolve, reject) => {
      const proc = spawn('npx', remotionArgs, {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[${jobId}] Remotion stdout: ${data.toString().trim()}`);
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          console.log(`[${jobId}] Remotion: ${line}`);
        });
      });

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.error(`[${jobId}] Remotion failed. stderr: ${stderr.slice(-1000)}`);
          reject(new Error(`Remotion render failed with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => reject(new Error(`Failed to start Remotion: ${err.message}`)));
    });

    // Step 4: Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    // Clean up
    try { unlinkSync(propsPath); } catch (e) {}

    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Create asset entry
    const asset = {
      id: outputAssetId,
      type: 'video',
      filename: `${type}-animation-${Date.now()}.mp4`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration: durationInSeconds,
      size: stats.size,
      width,
      height,
      createdAt: Date.now(),
      // Metadata
      aiGenerated: true,
      contextual: true,
      animationType: type,
      contentSummary: sceneData.contentSummary,
      sceneCount: sceneData.scenes.length,
      sourceAssetId: videoAsset.id,
    };

    session.assets.set(outputAssetId, asset);

    console.log(`[${jobId}] Contextual ${type} animation rendered: ${outputAssetId} (${durationInSeconds}s)`);
    console.log(`[${jobId}] === CONTEXTUAL ANIMATION COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId: outputAssetId,
      filename: asset.filename,
      duration: durationInSeconds,
      type,
      contentSummary: sceneData.contentSummary,
      sceneCount: sceneData.scenes.length,
      thumbnailUrl: `/session/${sessionId}/assets/${outputAssetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${outputAssetId}/stream`,
    }));

  } catch (error) {
    console.error('Contextual animation generation error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Process asset with FFmpeg command (for AI-suggested edits)
async function handleProcessAsset(req, res, sessionId) {
  const session = getSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Session not found' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const { assetId, command } = body;

    if (!assetId || !command) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'assetId and command are required' }));
      return;
    }

    const asset = session.assets.get(assetId);
    if (!asset) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Asset not found' }));
      return;
    }

    // Verify the asset file actually exists on disk
    if (!existsSync(asset.path)) {
      console.error(`[ProcessAsset] Asset file missing: ${asset.path}`);
      res.writeHead(410, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({
        error: 'Asset file no longer exists. The session may have expired. Please re-upload your video.',
        code: 'ASSET_FILE_MISSING'
      }));
      return;
    }

    const jobId = randomUUID();
    const newAssetId = randomUUID();
    const outputPath = join(session.assetsDir, `${newAssetId}.mp4`);
    const thumbPath = join(session.assetsDir, `${newAssetId}_thumb.jpg`);

    console.log(`\n[${jobId}] === PROCESS ASSET WITH FFMPEG ===`);
    console.log(`[${jobId}] Source: ${asset.filename}`);
    console.log(`[${jobId}] Command: ${command}`);

    // Parse the FFmpeg command and replace input/output placeholders
    // Expected format: "ffmpeg -i input.mp4 [options] output.mp4"
    // We'll replace input.mp4 with actual path and output.mp4 with new path
    let ffmpegArgs = command
      .replace(/^ffmpeg\s+/, '') // Remove 'ffmpeg' prefix
      .replace(/input\.mp4|"input\.mp4"/gi, `"${asset.path}"`)
      .replace(/output\.mp4|"output\.mp4"/gi, `"${outputPath}"`)
      .split(/\s+/)
      .filter(arg => arg.length > 0);

    // If the command doesn't have proper input/output, construct a basic one
    if (!ffmpegArgs.some(arg => arg.includes(asset.path))) {
      // Reconstruct with proper input
      ffmpegArgs = ['-y', '-i', asset.path, ...ffmpegArgs.filter(a => a !== '-i'), outputPath];
    }

    // Ensure -y flag for overwrite
    if (!ffmpegArgs.includes('-y')) {
      ffmpegArgs.unshift('-y');
    }

    console.log(`[${jobId}] FFmpeg args:`, ffmpegArgs);

    await runFFmpeg(ffmpegArgs, jobId);

    // Generate thumbnail
    await runFFmpeg([
      '-y', '-i', outputPath,
      '-vf', 'scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2',
      '-frames:v', '1',
      thumbPath
    ], jobId);

    // Get video info
    const { stat } = await import('fs/promises');
    const stats = await stat(outputPath);

    // Get duration with ffprobe
    let duration = asset.duration;
    try {
      const durationStr = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
        { encoding: 'utf-8' }
      ).trim();
      duration = parseFloat(durationStr) || asset.duration;
    } catch (e) {
      console.warn(`[${jobId}] Could not get duration:`, e.message);
    }

    // Create new asset entry
    const newAsset = {
      id: newAssetId,
      type: 'video',
      filename: `edited-${asset.filename}`,
      path: outputPath,
      thumbPath: existsSync(thumbPath) ? thumbPath : null,
      duration,
      size: stats.size,
      width: asset.width || 1920,
      height: asset.height || 1080,
      createdAt: Date.now(),
      // Metadata
      sourceAssetId: assetId,
      ffmpegCommand: command,
    };

    session.assets.set(newAssetId, newAsset);

    console.log(`[${jobId}] Asset processed: ${newAssetId} (${duration.toFixed(2)}s)`);
    console.log(`[${jobId}] === PROCESSING COMPLETE ===\n`);

    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      success: true,
      assetId: newAssetId,
      filename: newAsset.filename,
      duration,
      thumbnailUrl: `/session/${sessionId}/assets/${newAssetId}/thumbnail`,
      streamUrl: `/session/${sessionId}/assets/${newAssetId}/stream`,
    }));

  } catch (error) {
    console.error('Process asset error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ============== SERVER ==============

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Session-based routes (new efficient API)
  const sessionMatch = path.match(/^\/session\/([^/]+)(\/(.+))?$/);
  if (sessionMatch) {
    const sessionId = sessionMatch[1];
    const action = sessionMatch[3] || '';

    if (req.method === 'POST' && sessionId === 'create') {
      await handleSessionCreate(req, res);
    } else if (req.method === 'POST' && sessionId === 'upload') {
      await handleSessionUpload(req, res);
    } else if (req.method === 'GET' && action === 'stream') {
      await handleSessionStream(req, res, sessionId);
    } else if (req.method === 'GET' && action === 'info') {
      await handleSessionInfo(req, res, sessionId);
    } else if (req.method === 'GET' && action === 'download') {
      await handleSessionDownload(req, res, sessionId);
    } else if (req.method === 'POST' && action === 'process') {
      await handleSessionProcess(req, res, sessionId);
    } else if (req.method === 'POST' && action === 'remove-dead-air') {
      await handleSessionRemoveDeadAir(req, res, sessionId);
    } else if (req.method === 'POST' && action === 'chapters') {
      await handleSessionChapters(req, res, sessionId);
    } else if (req.method === 'DELETE' && !action) {
      handleSessionDelete(req, res, sessionId);
    }
    // Multi-asset endpoints
    else if (req.method === 'POST' && action === 'assets') {
      await handleAssetUpload(req, res, sessionId);
    } else if (req.method === 'GET' && action === 'assets') {
      handleAssetList(req, res, sessionId);
    } else if (action.startsWith('assets/')) {
      const assetPath = action.substring(7); // Remove 'assets/'
      const [assetId, subAction] = assetPath.split('/');

      if (req.method === 'DELETE' && !subAction) {
        handleAssetDelete(req, res, sessionId, assetId);
      } else if (req.method === 'GET' && subAction === 'thumbnail') {
        await handleAssetThumbnail(req, res, sessionId, assetId);
      } else if (req.method === 'GET' && subAction === 'stream') {
        await handleAssetStream(req, res, sessionId, assetId);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Asset endpoint not found' }));
      }
    }
    // Project state endpoints
    else if (req.method === 'GET' && action === 'project') {
      handleProjectGet(req, res, sessionId);
    } else if (req.method === 'PUT' && action === 'project') {
      await handleProjectSave(req, res, sessionId);
    }
    // Render endpoints
    else if (req.method === 'POST' && action === 'render') {
      await handleProjectRender(req, res, sessionId);
    }
    // GIF creation
    else if (req.method === 'POST' && action === 'create-gif') {
      await handleCreateGif(req, res, sessionId);
    }
    // Simple transcription (for captions)
    else if (req.method === 'POST' && action === 'transcribe') {
      await handleTranscribe(req, res, sessionId);
    }
    // Transcription and keyword extraction
    else if (req.method === 'POST' && action === 'transcribe-and-extract') {
      await handleTranscribeAndExtract(req, res, sessionId);
    }
    // B-roll image generation
    else if (req.method === 'POST' && action === 'generate-broll') {
      await handleGenerateBroll(req, res, sessionId);
    }
    // Motion graphics rendering (placeholder - creates solid color video for now)
    else if (req.method === 'POST' && action === 'render-motion-graphic') {
      await handleRenderMotionGraphic(req, res, sessionId);
    }
    // AI-generated custom animation (uses Gemini + Remotion)
    else if (req.method === 'POST' && action === 'generate-animation') {
      await handleGenerateAnimation(req, res, sessionId);
    }
    // Analyze video for animation (returns concept for approval, no rendering)
    else if (req.method === 'POST' && action === 'analyze-for-animation') {
      await handleAnalyzeForAnimation(req, res, sessionId);
    }
    // Render from pre-approved concept (skips analysis)
    else if (req.method === 'POST' && action === 'render-from-concept') {
      await handleRenderFromConcept(req, res, sessionId);
    }
    // Contextual animation - analyzes video content first, then generates relevant animation
    else if (req.method === 'POST' && action === 'generate-contextual-animation') {
      await handleGenerateContextualAnimation(req, res, sessionId);
    }
    // Transcript animation - kinetic typography from speech
    else if (req.method === 'POST' && action === 'generate-transcript-animation') {
      await handleGenerateTranscriptAnimation(req, res, sessionId);
    }
    // Process asset with FFmpeg command
    else if (req.method === 'POST' && action === 'process-asset') {
      await handleProcessAsset(req, res, sessionId);
    } else if (action.startsWith('renders/')) {
      const renderType = action.substring(8); // Remove 'renders/'
      if (req.method === 'GET') {
        await handleRenderDownload(req, res, sessionId, renderType);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Render endpoint not found' }));
      }
    }
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session endpoint not found' }));
    }
    return;
  }

  // Legacy routes (kept for backwards compatibility)
  if (req.method === 'POST' && path === '/process') {
    await handleProcess(req, res);
  } else if (req.method === 'POST' && path === '/remove-dead-air') {
    await handleRemoveDeadAir(req, res);
  } else if (req.method === 'POST' && path === '/generate-chapters') {
    await handleGenerateChapters(req, res);
  } else if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ffmpeg: 'native', sessions: sessions.size }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🎬 Local FFmpeg server running at http://localhost:${PORT}`);
  console.log(`\n   Session API:`);
  console.log(`   POST /session/upload - Upload video, get sessionId`);
  console.log(`   GET  /session/:id/stream - Stream video for preview`);
  console.log(`   GET  /session/:id/info - Get video info`);
  console.log(`   POST /session/:id/process - Apply FFmpeg edit`);
  console.log(`   POST /session/:id/remove-dead-air - Remove silence`);
  console.log(`   POST /session/:id/chapters - Generate chapters`);
  console.log(`   GET  /session/:id/download - Download final video`);
  console.log(`   DELETE /session/:id - Clean up session`);
  console.log(`\n   Multi-Asset API:`);
  console.log(`   POST /session/:id/assets - Upload asset (video/image/audio)`);
  console.log(`   GET  /session/:id/assets - List all assets`);
  console.log(`   DELETE /session/:id/assets/:assetId - Delete asset`);
  console.log(`   GET  /session/:id/assets/:assetId/thumbnail - Get thumbnail`);
  console.log(`   GET  /session/:id/assets/:assetId/stream - Stream asset`);
  console.log(`\n   Project API:`);
  console.log(`   GET  /session/:id/project - Get project state`);
  console.log(`   PUT  /session/:id/project - Save project state`);
  console.log(`   POST /session/:id/render - Render project to video`);
  console.log(`   GET  /session/:id/renders/preview - Download preview`);
  console.log(`   GET  /session/:id/renders/export - Download export`);
  console.log(`\n   AI/Auto GIF API:`);
  console.log(`   POST /session/:id/transcribe-and-extract - Transcribe video, extract keywords, fetch GIFs`);
  console.log(`   POST /session/:id/generate-broll - Generate AI B-roll images from transcript`);
  console.log(`   POST /session/:id/generate-animation - AI-generated custom animation (Gemini + Remotion)`);
  console.log(`   POST /session/:id/analyze-for-animation - Analyze video, return concept for approval`);
  console.log(`   POST /session/:id/generate-contextual-animation - Content-aware animation (transcribes video first)`);
  console.log(`   POST /session/:id/process-asset - Apply FFmpeg command to an asset`);
  console.log(`\n   GET /health - Health check\n`);
});
