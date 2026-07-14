# TEVI Upload System

> Automated content uploader for TEVI.com using N8N + VPS + Playwright.

## Status

**Version**: 3.1 — Audit Fixes

- [x] PRD v3.1 — Complete technical specification (audit fixes applied)
- [x] phases.md — Implementation guide (7 phases, ~17-25 hours)
- [ ] Phase 0 — Prerequisites (VPS, N8N, GDrive setup)
- [ ] Phase 1 — VPS Executor (server.js + PM2)
- [ ] Phase 2 — Config System (config.json + state.json + Config Workflow)
- [ ] Phase 3 — N8N Main Workflow (31 nodes)
- [ ] Phase 4 — AI Caption System (5-layer pipeline)
- [ ] Phase 5 — Testing (integration tests)
- [ ] Phase 6 — Documentation (setup docs)
- [ ] Phase 7 — Cleanup & Deploy (production ready)

## Security

All credentials stored in **N8N Credentials** (encrypted at rest):
- TEVI Account, VPS SSH/SFTP, Google Drive OAuth2, Email SMTP, AI Service
- Zero credentials in workflow JSON exports
- Zero credentials in config.json (safe to commit to git)
- Zero credentials in server.js

All paths and AI settings stored in **N8N Variables** (editable in UI).

See [phases.md](phases.md) Phase 7 for the full security audit checklist.

## What's Here

```
tevi-upload/
├── PRD.md      ← Complete technical specification (v3)
├── README.md   ← This file
├── phases.md   ← Implementation phases guide
├── LICENSE     ← MIT License
└── .gitignore
```

## Architecture Preview

```
┌──────────────────────────────────────────────────────────────┐
│  N8N (Brain)                                                │
│  Schedule → Download config.json → GDrive → SFTP Upload     │
│  → HTTP /upload → Archive → Notify                          │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  VPS (Executor)                                              │
│  POST /upload — Playwright browser automation               │
│  GET  /health — health check                              │
└──────────────────────────────────────────────────────────────┘
```

## Key Features (PRD v2)

- [x] PRD complete — all bugs audited and fixed
- [ ] Config system — JSON on VPS + N8N Config Workflow
- [ ] Multiple GDrive folders per content type
- [ ] Per-folder pricing, captions, upload index
- [ ] AI caption translation (adult content)
- [ ] Lock file + stale lock auto-delete
- [ ] FIFO archive (max 10 files)
- [ ] Email notifications
- [ ] N8N Main Workflow
- [ ] N8N Config Workflow

## Next Steps

1. Implement `server.js` (VPS executor)
2. Implement N8N Main Workflow (`tevi-upload-main.json`)
3. Implement N8N Config Workflow (`tevi-upload-config.json`)
4. Create setup docs

## Documentation

All documentation will be added after implementation. See [PRD.md](PRD.md) for the complete specification.
