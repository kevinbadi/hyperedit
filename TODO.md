# HyperEdit - Product Roadmap

## Current State (What's Built)
- [x] Multi-track timeline (V1 base, V2 overlays)
- [x] Asset library with drag-and-drop
- [x] Video preview with layered compositing
- [x] AI auto-GIF workflow (transcribe → extract keywords → fetch GIFs → auto-place)
- [x] FFmpeg video processing
- [x] Dead air/silence removal
- [x] Chapter generation
- [x] Clip move, resize, delete
- [x] Basic export functionality
- [x] **Motion Graphics (Remotion)** - Animated text, lower thirds, CTAs

## Ship Now (MVP) - Do These First
These are blockers for getting real users:

- [ ] **Add API key setup UI** - Users need to add OPENAI_API_KEY and GIPHY_API_KEY
  - Either: settings modal, or .env file instructions, or proxy through your backend
- [ ] **Test the full export flow** - Ensure rendered video actually works
- [ ] **Add a landing page** - Even a simple one explaining what it does
- [ ] **Deploy somewhere** - Vercel/Railway for frontend, need solution for FFmpeg backend

## Nice-to-Have (Post-Launch)
Don't build these until you have users asking for them:

- [ ] Undo/redo
- [ ] More AI edit commands (speed up, add music, auto-captions)
- [ ] Custom keyword lists for GIF extraction
- [ ] GIF position/size controls in preview
- [ ] Audio track visualization
- [ ] Keyboard shortcuts
- [ ] Project save/load to cloud
- [ ] User accounts
- [ ] More export formats/quality options

## Known Issues
- [ ] Moving clips can cause preview to briefly show wrong content
- [ ] No undo after clip operations
- [ ] Large videos may be slow to process

## Future Ideas (Parking Lot)
- Auto-captions with styling
- B-roll suggestion and insertion
- Music matching to video mood
- Social media format presets (9:16, 1:1)
- Direct publish to YouTube/TikTok
- Collaboration features
