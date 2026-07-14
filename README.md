# TEVI Upload System

> Automated content uploader for TEVI.com using N8N + VPS + Playwright.

**Version**: 3.1 — Ready to Use

---

## Status

All files are complete and ready to deploy.

| File | Status |
|------|--------|
| `server.js` | ✅ Complete (23-step upload flow) |
| `tevi-upload-main.json` | ✅ Complete (31 nodes) |
| `tevi-upload-config.json` | ✅ Complete (14 nodes) |
| `package.json` | ✅ Complete |
| `ecosystem.json` | ✅ Complete |
| `.env.example` | ✅ Complete |
| `docs/SETUP.md` | ✅ Complete |
| `docs/TEVISETUP.md` | ✅ Complete |
| `docs/GDRIVESETUP.md` | ✅ Complete |
| `docs/CONFIG.md` | ✅ Complete |
| `docs/AI.md` | ✅ Complete |
| `docs/TROUBLESHOOT.md` | ✅ Complete |

---

## Quick Start

### 1. Deploy server.js to VPS

```bash
ssh vps-devata@13.75.2.24
mkdir -p ~/tevi-upload ~/tevi-uploads ~/logs
# Upload server.js, package.json, ecosystem.json
cd ~/tevi-upload && npm install
pm2 start ecosystem.json
```

### 2. Setup N8N

1. Import `n8n-workflow/tevi-upload-main.json`
2. Import `n8n-workflow/tevi-upload-config.json`
3. Create 5 credentials (see SETUP.md)
4. Set 10 N8N Variables (see SETUP.md)
5. Activate workflows

### 3. Add categories via Config Workflow

Open Config Editor in N8N → Add Category → Fill form → Save

---

## Architecture

```
┌────────────────────────────────────────────┐
│  N8N Main Workflow                         │
│  Schedule → Config → Lock → GDrive →       │
│  File → AI Caption → Upload → Archive      │
└──────────────────────────┬─────────────────┘
                           ▼
┌────────────────────────────────────────────┐
│  VPS (server.js + Playwright)              │
│  POST /upload — login → upload → verify    │
│  GET  /health                              │
└────────────────────────────────────────────┘
```

---

## Features

- **Flexible categories**: Add/edit/disable/delete via Config Workflow form
- **Rotation**: Round-robin across enabled categories (state persisted)
- **Multi-folder**: Each category supports multiple GDrive folders
- **Adult sub-rotation**: Hentai/Japanese/Amerika rotate within adult category
- **Skip threshold**: Auto-deprioritizes empty folders after 3 skips
- **Atomic locking**: SFTP rename prevents concurrent runs
- **AI captions**: 5-layer Indonesian translation pipeline
- **Caption caching**: 24h TTL, no repeat API calls
- **Email notifications**: Success / Failure / Skip alerts
- **FIFO archive**: Keeps 10 newest files, auto-deletes oldest
- **Config via UI**: No JSON editing required

---

## Credentials (N8N Encrypted)

| Credential | Fields |
|-----------|--------|
| TEVI Account | email, password |
| VPS SSH/SFTP | host, port, username, password |
| Google Drive | OAuth2 (Client ID + Secret) |
| Email SMTP | host, port, user, password |
| AI Service | keys (API key array) |

**Zero credentials in code or workflow JSON exports.**

---

## N8N Variables

| Variable | Default |
|----------|---------|
| `VPS_UPLOAD_DIR` | `/home/vps-devata/tevi-uploads` |
| `VPS_ARCHIVE_DIR` | `/home/vps-devata/tevi-uploads/archive` |
| `VPS_UPLOAD_URL` | `http://13.75.2.24:3004` |
| `VPS_LOCK_FILE` | `/home/vps-devata/tevi-uploads/state.json.lock` |
| `NOTIFY_EMAIL` | `your@email.com` |
| `CRON_SCHEDULE` | `0 * * * *` |
| `AI_ENDPOINT` | `https://gateway.olagon.site/anthropic/v1/messages` |
| `AI_MODEL` | `claude-sonnet-4-6` |
| `AI_MAX_TOKENS` | `200` |
| `AI_RETRY_ATTEMPTS` | `3` |
| `AI_CACHE_TTL_HOURS` | `24` |

---

## File Structure

```
tevi-upload/
├── server.js
├── ecosystem.json
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
├── PRD.md                    ← Technical specification
├── phases.md                ← Implementation guide
├── n8n-workflow/
│   ├── tevi-upload-main.json     ← Main automation
│   └── tevi-upload-config.json  ← Config editor
└── docs/
    ├── SETUP.md              ← Complete setup guide
    ├── TEVISETUP.md         ← TEVI account setup
    ├── GDRIVESETUP.md       ← Google Drive setup
    ├── CONFIG.md            ← Config Workflow guide
    ├── AI.md                ← AI caption system
    └── TROUBLESHOOT.md     ← Issues & solutions
```

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [SETUP.md](docs/SETUP.md) | Complete VPS + N8N + GDrive setup |
| [TEVISETUP.md](docs/TEVISETUP.md) | TEVI account, collections, login |
| [GDRIVESETUP.md](docs/GDRIVESETUP.md) | GDrive API, folder structure, sharing |
| [CONFIG.md](docs/CONFIG.md) | Config Workflow usage |
| [AI.md](docs/AI.md) | AI caption system, word maps, caching |
| [TROUBLESHOOT.md](docs/TROUBLESHOOT.md) | Common issues and fixes |
| [PRD.md](PRD.md) | Full technical specification |
| [phases.md](phases.md) | Implementation phases |

---

## AI Caption Example

```
Input filename:  "JAV College Girl Massage Oil HD.mp4"

Indonesian map:  mastrubate→colmek, breasts→dada, sex→seks
  → "JAV College Girl Massage Oil"

AI translate:    → "Pijat Oil Mahasiswi Glamour"

Adult inject:     restores Indonesian adult terms

Final caption:
(JAV) Pijat Oil Mahasiswi Glamour

Topup Star Tevi di babyval.com
```

---

## Rollback

| Issue | Fix |
|-------|-----|
| Workflow stuck | `pm2 restart tevi-upload`, deactivate N8N workflow |
| Lock stuck | `ssh` to VPS: `rm ~/tevi-uploads/state.json.lock` |
| Config corrupted | Re-save via Config Workflow |
| AI bad output | Set `aiTranslate: false` in Config Workflow |
| TEVI rate limited | Increase `CRON_SCHEDULE` interval |
