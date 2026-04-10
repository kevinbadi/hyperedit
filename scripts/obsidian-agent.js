// Obsidian agent: queries the CPI Content Engine database for video matches
// and downloads selected videos from Dropbox into a hyperedit session.
//
// Reuses CPI's .env (DATABASE_URL, DROPBOX_ACCESS_TOKEN, OBSIDIAN_VAULT_PATH)
// by reading CPI_ENGINE_PATH/.env on startup.

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { Dropbox } from 'dropbox';

const { Pool } = pg;

let pool = null;
let dbx = null;
let cpiEnv = null;

function loadCpiEnv() {
  if (cpiEnv) return cpiEnv;

  const cpiPath = process.env.CPI_ENGINE_PATH;
  if (!cpiPath) {
    throw new Error('CPI_ENGINE_PATH not set in .dev.vars');
  }

  const envPath = join(cpiPath, '.env');
  if (!existsSync(envPath)) {
    throw new Error(`CPI .env not found at ${envPath}`);
  }

  const parsed = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  cpiEnv = parsed;
  return cpiEnv;
}

function getPool() {
  if (pool) return pool;
  const env = loadCpiEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL not set in CPI .env');
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  return pool;
}

function getDropboxClient() {
  if (dbx) return dbx;
  const env = loadCpiEnv();
  if (!env.DROPBOX_ACCESS_TOKEN) throw new Error('DROPBOX_ACCESS_TOKEN not set in CPI .env');
  dbx = new Dropbox({ accessToken: env.DROPBOX_ACCESS_TOKEN });
  return dbx;
}

function getVaultPath() {
  const env = loadCpiEnv();
  return env.OBSIDIAN_VAULT_PATH || '/Users/kevinbahrabadi/Library/Mobile Documents/iCloud~md~obsidian/Documents/CPI-content-vault';
}

// Reproduces the slug logic from CPI Content Engine/src/markdown/writer.js
// so we can look up the thumbnail file name from a video's summary.
export function slugFromSummary(summary, fileName) {
  const title = summary || (fileName || '').replace(/\.[^.]+$/, '');
  return title
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 80);
}

export function getThumbnailPath(slug) {
  return join(getVaultPath(), 'attachments', `${slug}-thumb.jpg`);
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'i', 'me', 'my', 'we', 'you', 'your', 'this', 'these',
  'those', 'some', 'any', 'all', 'find', 'show', 'get', 'give', 'want',
  'need', 'can', 'could', 'would', 'should', 'please', 'video', 'videos',
  'clip', 'clips', 'footage',
]);

function extractKeywords(query) {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Search videos ranked by keyword matches across summary, transcripts,
 * content_type, treatment_areas, influencer_mentions, and people_appearances.
 */
export async function searchVideos(query, limit = 10) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return [];
  }

  const client = getPool();

  // Build a CTE that scores each video by number of keyword hits across fields.
  // Weights: summary=3, treatment_areas=3, content_type=2, people=2,
  // influencer_mentions=2, transcript=1.
  const patterns = keywords.map((k) => `%${k}%`);

  // One ILIKE-count expression per field, summed.
  const summaryScore = patterns.map((_, i) => `(CASE WHEN v.summary ILIKE $${i + 1} THEN 3 ELSE 0 END)`).join(' + ');
  const contentScore = patterns.map((_, i) => `(CASE WHEN v.content_type ILIKE $${i + 1} THEN 2 ELSE 0 END)`).join(' + ');
  const tagScore = patterns.map((_, i) => `(CASE WHEN array_to_string(v.treatment_areas, ' ') ILIKE $${i + 1} THEN 3 ELSE 0 END)`).join(' + ');
  const mentionScore = patterns.map((_, i) => `(CASE WHEN array_to_string(v.influencer_mentions, ' ') ILIKE $${i + 1} THEN 2 ELSE 0 END)`).join(' + ');
  const transcriptScore = patterns.map((_, i) => `(CASE WHEN t.full_text ILIKE $${i + 1} THEN 1 ELSE 0 END)`).join(' + ');

  const sql = `
    SELECT
      v.id,
      v.drive_id,
      v.drive_link,
      v.file_name,
      v.content_type,
      v.treatment_areas,
      v.influencer_mentions,
      v.gender,
      v.location,
      v.tone,
      v.summary,
      v.duration,
      v.confidence,
      (${summaryScore}) + (${contentScore}) + (${tagScore}) + (${mentionScore}) + (COALESCE(${transcriptScore}, 0)) AS score
    FROM videos v
    LEFT JOIN transcripts t ON t.video_id = v.id
    WHERE v.drive_id LIKE 'id:%'
      AND (
        ${patterns.map((_, i) => `v.summary ILIKE $${i + 1}`).join(' OR ')}
        OR ${patterns.map((_, i) => `v.content_type ILIKE $${i + 1}`).join(' OR ')}
        OR ${patterns.map((_, i) => `array_to_string(v.treatment_areas, ' ') ILIKE $${i + 1}`).join(' OR ')}
        OR ${patterns.map((_, i) => `array_to_string(v.influencer_mentions, ' ') ILIKE $${i + 1}`).join(' OR ')}
        OR ${patterns.map((_, i) => `t.full_text ILIKE $${i + 1}`).join(' OR ')}
      )
    ORDER BY score DESC, v.confidence DESC NULLS LAST
    LIMIT ${Math.max(1, Math.min(50, Number(limit) || 10))}
  `;

  const result = await client.query(sql, patterns);

  return result.rows.map((row) => {
    const slug = slugFromSummary(row.summary, row.file_name);
    const thumbPath = getThumbnailPath(slug);
    return {
      videoId: row.id,
      dropboxId: row.drive_id,
      dropboxLink: row.drive_link,
      fileName: row.file_name,
      contentType: row.content_type,
      treatmentAreas: row.treatment_areas || [],
      influencerMentions: row.influencer_mentions || [],
      gender: row.gender,
      location: row.location,
      tone: row.tone,
      summary: row.summary,
      duration: row.duration ? Number(row.duration) : 0,
      confidence: row.confidence ? Number(row.confidence) : 0,
      score: Number(row.score) || 0,
      thumbnailSlug: slug,
      hasLocalThumbnail: existsSync(thumbPath),
    };
  });
}

/**
 * Fetch a single video row by DB id (used by import flow).
 */
export async function getVideoById(videoId) {
  const client = getPool();
  const res = await client.query(
    'SELECT id, drive_id, drive_link, file_name, summary FROM videos WHERE id = $1',
    [videoId],
  );
  return res.rows[0] || null;
}

/**
 * Download a file from Dropbox by its Dropbox file ID.
 * The Dropbox SDK accepts the `id:xxxxx` prefix as a valid `path` argument
 * for filesDownload, so we pass it directly.
 */
export async function downloadFromDropbox(dropboxId, destPath) {
  const client = getDropboxClient();

  const res = await client.filesDownload({ path: dropboxId });
  const buffer = res.result.fileBinary;

  if (!buffer) {
    throw new Error('Dropbox returned empty file binary');
  }

  writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}
