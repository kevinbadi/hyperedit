# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClipWise (formerly HyperEdit) is an AI-powered video editor built with React 19, Remotion for motion graphics, and Cloudflare Workers for the backend. It's a Mocha platform app.

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server
npm run ffmpeg-server    # Start local FFmpeg server (port 3333) - run in separate terminal
npm run build            # TypeScript + Vite production build
npm run lint             # ESLint
npm run check            # Full validation: type check + build + deploy dry-run
npm run knip             # Check for unused dependencies
npm run cf-typegen       # Generate Cloudflare worker types
```

**Local development** requires both `npm run dev` and `npm run ffmpeg-server` running simultaneously.

## Architecture

```
src/
├── react-app/           # Frontend React SPA
│   ├── components/      # UI: Timeline, VideoPreview, AssetLibrary, AIPromptPanel, MotionGraphicsPanel
│   ├── hooks/           # useProject (main state), useFFmpeg, useVideoSession
│   └── pages/Home.tsx   # Main editor layout
├── worker/index.ts      # Hono backend API (AI editing via Gemini, asset management)
├── remotion/templates/  # Motion graphics: AnimatedText, LowerThird, CallToAction
└── shared/types.ts      # Zod schemas shared between client/server
```

**Key patterns:**
- Multi-track timeline with V1 (base video) and V2 (overlay) tracks
- `useProject()` hook manages all project state: assets, clips, playback, rendering
- Cloudflare Worker with D1 database and R2 bucket (configured in wrangler.json)
- FFmpeg runs client-side via @ffmpeg/ffmpeg, with local server fallback for dev

## TypeScript Configuration

Three separate tsconfig files:
- `tsconfig.app.json` - React app (ES2020, strict)
- `tsconfig.worker.json` - Cloudflare Worker
- `tsconfig.node.json` - Build tools

Path alias: `@/` → `./src/`

## Remotion Integration

Motion graphics use Remotion 4.x. When working on templates in `src/remotion/`:
- Use the `/remotion-best-practices` skill for domain-specific guidance
- Templates are in `src/remotion/templates/` (AnimatedText, LowerThird, CallToAction)
- Compositions integrate with the main timeline via `@remotion/player`

## Environment Variables

Required in `.dev.vars` for local development:
- `GEMINI_API_KEY` - Google AI for editing commands
- `GIPHY_API_KEY` - GIF search
- `OPENAI_API_KEY` - Additional AI features
