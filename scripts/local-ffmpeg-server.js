import http from 'http';
import { spawn, execSync } from 'child_process';
import { createWriteStream, createReadStream, unlinkSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
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

// Session management
function createSession(originalName) {
  const sessionId = randomUUID();
  const sessionDir = join(SESSIONS_DIR, sessionId);
  const assetsDir = join(sessionDir, 'assets');
  const rendersDir = join(sessionDir, 'renders');

  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(rendersDir, { recursive: true });

  // Initialize project state
  const projectState = {
    tracks: [
      { id: 'V1', type: 'video', name: 'V1', order: 0 },
      { id: 'V2', type: 'video', name: 'V2', order: 1 },
      { id: 'A1', type: 'audio', name: 'A1', order: 2 },
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

    const totalDuration = await getVideoDuration(session.currentVideo);
    console.log(`[${jobId}] Video duration: ${totalDuration.toFixed(2)}s`);

    const silencePeriods = await detectSilence(session.currentVideo, jobId, {
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
        '-y', '-i', session.currentVideo,
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

    // Replace current video
    const { rename, stat } = await import('fs/promises');
    unlinkSync(session.currentVideo);
    await rename(outputPath, session.currentVideo);

    // Cleanup segments
    segmentPaths.forEach(p => { try { unlinkSync(p); } catch {} });
    try { unlinkSync(concatListPath); } catch {}

    const newStats = await stat(session.currentVideo);
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

    const totalDuration = await getVideoDuration(session.currentVideo);

    // Extract audio
    console.log(`[${jobId}] Extracting audio...`);
    await runFFmpeg(['-y', '-i', session.currentVideo, '-vn', '-acodec', 'libmp3lame', '-ab', '64k', '-ar', '16000', '-ac', '1', audioPath], jobId);

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

    let result;
    try {
      result = JSON.parse(response.text || '{}');
    } catch {
      const match = (response.text || '').match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { chapters: [], summary: '' };
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
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
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

// ============== SERVER ==============

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
    // Transcription and keyword extraction
    else if (req.method === 'POST' && action === 'transcribe-and-extract') {
      await handleTranscribeAndExtract(req, res, sessionId);
    }
    // Motion graphics rendering (placeholder - creates solid color video for now)
    else if (req.method === 'POST' && action === 'render-motion-graphic') {
      await handleRenderMotionGraphic(req, res, sessionId);
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
  console.log(`\n   GET /health - Health check\n`);
});
