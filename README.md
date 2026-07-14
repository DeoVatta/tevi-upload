# TEVI Upload System

> Automated content uploader for TEVI.com using N8N + VPS + Playwright.

## Status

**PRD v2 is complete.** Implementation pending.

See [PRD.md](PRD.md) for the complete technical specification.

## What's Here

```
tevi-upload/
├── PRD.md      ← Complete technical specification (v2)
├── README.md   ← This file
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
