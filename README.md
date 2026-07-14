# TEVI Autopilot

> Automated content uploader for TEVI.com using N8N + VPS + Playwright

**Schedule-based automation**: Upload photos and videos to TEVI.com on a configurable schedule. N8N handles scheduling, file selection, and notifications. VPS runs Playwright browser automation. Zero credentials stored in code — everything secured in N8N.

## Features

- **Auto-upload**: Schedule content upload every hour (or custom cron)
- **Content rotation**: Photo → Video → Porn, rotating every hour
- **Sub-type rotation**: Short/Medium/Dance (video), Hentai/Japanese/Amerika (porn), rotating every 20 minutes
- **Random pick**: Selects one random file from your Google Drive each run
- **Caption generation**: Random caption from customizable pool
- **Audience control**: Free, paid, or members-only posts
- **Retry logic**: Network errors retry 3x automatically
- **Concurrency protection**: Lock file prevents overlapping runs
- **Archive management**: Moves uploaded files to archive, auto-cleanup oldest when >10 files
- **Email notifications**: Success, failure, or skip notifications
- **Zero hardcoded credentials**: All secrets in N8N

## Architecture

```
┌─────────────────────────────────────────────────┐
│  N8N (Brain)                                    │
│  Schedule → GDrive → SFTP Upload → HTTP Upload │
│  → Archive → Notify                             │
└──────────────────────────┬──────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────┐
│  VPS (Dumb Executor)                            │
│  Browser automation: login → upload → post       │
└─────────────────────────────────────────────────┘
```

N8N is the brain — all logic, scheduling, GDrive, SFTP, retry, and notifications live there.
VPS server.js only runs Playwright browser automation. It receives credentials and file path from N8N via POST body.

## Prerequisites

- **VPS**: Linux, 2GB+ RAM, SSH access
- **N8N**: v1.0+ (self-hosted or cloud)
- **Google Drive**: Drive API enabled
- **TEVI.com**: Active creator account

## Quick Start

### 1. Deploy server.js to VPS

```bash
# SSH to VPS
ssh user@your-vps-ip

# Install dependencies
mkdir -p tevi-autopilot && cd tevi-autopilot
npm init -y && npm install express playwright cors

# Install Chromium
npx playwright install chromium

# Start with PM2
npm install -g pm2
pm2 start ecosystem.json
```

### 2. Setup N8N

1. Import `n8n-workflow/tevi-autopilot-v5.json`
2. Create credentials:
   - Google Drive OAuth2 API
   - SSH/SFTP
   - SMTP Email
   - TEVI Account (Custom) — `email`, `password`, `channelSlug`
3. Set N8N environment variables:
   - `VPS_UPLOAD_DIR` — Upload directory on VPS
   - `VPS_ARCHIVE_DIR` — Archive directory on VPS
   - `VPS_UPLOAD_URL` — Your VPS URL (e.g., `http://YOUR_VPS_IP:3004`)
   - `VPS_LOCK_FILE` — Lock file path (e.g., `/home/user/tevi-uploads/.tevi-upload.lock`)
   - `NOTIFY_EMAIL` — Notification email
4. Update folder IDs in Code nodes (Photo Config, Video Config, Porn Config)
5. Activate workflow

### 3. Configure

See [.env.example](.env.example) for all variables.

## Repository Structure

```
tevi-upload/
├── server.js             # VPS Playwright executor (only /upload + /health)
├── ecosystem.json        # PM2 process manager config
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── LICENSE               # MIT License
├── README.md             # This file
├── PRD.md                # Complete technical specification
├── n8n-workflow/
│   └── tevi-autopilot-v5.json   # N8N workflow (import this)
└── docs/
    ├── SETUP.md          # Step-by-step VPS + N8N setup
    ├── TEVISETUP.md      # TEVI account setup guide
    ├── GDRIVESETUP.md    # Google Drive setup guide
    └── TROUBLESHOOT.md   # Common issues & solutions
```

## Environment Variables

### VPS (server.js) — set in PM2/ecosystem.json

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3004` | Server port |
| `CHROMIUM_PATH` | auto-detected | Path to chromium executable |
| `UPLOAD_DIR` | `/home/user/tevi-uploads` | Upload directory |
| `ARCHIVE_DIR` | `{UPLOAD_DIR}/archive` | Archive directory |
| `LOG_LEVEL` | `info` | Log level: debug/info/warn/error |

### N8N Variables — set in N8N → Settings → Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `VPS_UPLOAD_DIR` | `/home/user/tevi-uploads` | VPS upload directory |
| `VPS_ARCHIVE_DIR` | `/home/user/tevi-uploads/archive` | VPS archive directory |
| `VPS_UPLOAD_URL` | `http://13.75.2.24:3004` | VPS upload endpoint |
| `VPS_LOCK_FILE` | `/home/user/tevi-uploads/.tevi-upload.lock` | Lock file path |
| `NOTIFY_EMAIL` | `you@email.com` | Notification email |

## Security

- All credentials stored in N8N (encrypted)
- No secrets in server.js or workflow JSON
- TEVI credentials passed via POST body from N8N only
- VPS endpoints should be firewalled to N8N VPS IP only
- OAuth2 tokens refresh automatically
- TEVI credentials never leave N8N

## Documentation

| Doc | Description |
|-----|-------------|
| [PRD.md](PRD.md) | Complete technical specification |
| [docs/SETUP.md](docs/SETUP.md) | Step-by-step setup guide |
| [docs/TEVISETUP.md](docs/TEVISETUP.md) | TEVI account setup |
| [docs/GDRIVESETUP.md](docs/GDRIVESETUP.md) | Google Drive setup |
| [docs/TROUBLESHOOT.md](docs/TROUBLESHOOT.md) | Common issues & solutions |

## License

MIT License — see [LICENSE](LICENSE)

## Disclaimer

This project is for educational and personal use. Ensure compliance with TEVI.com's Terms of Service when using automation.
