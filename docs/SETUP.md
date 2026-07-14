# SETUP.md — Complete Setup Guide

> How to set up the complete TEVI Upload System from scratch.

---

## Prerequisites

You need:
- A Linux VPS (2GB+ RAM)
- N8N (cloud or self-hosted)
- Google Cloud project with Drive API
- TEVI.com account

---

## Step 1: VPS Setup

### 1.1 Connect to VPS

```bash
ssh vps-devata@13.75.2.24
```

### 1.2 Create directories

```bash
mkdir -p ~/tevi-uploads
mkdir -p ~/tevi-uploads/archive
mkdir -p ~/logs
```

### 1.3 Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should be v18+
```

### 1.4 Install PM2

```bash
npm install -g pm2
pm2 --version
```

### 1.5 Install Playwright + Chromium

```bash
npm install -g playwright
npx playwright install chromium
```

### 1.6 Deploy server.js

```bash
# Create project directory
mkdir -p ~/tevi-upload
cd ~/tevi-upload

# Upload server.js, package.json, ecosystem.json from this repo
# Or clone the repo:
git clone https://github.com/DeoVatta/tevi-upload.git
cd tevi-upload

# Install dependencies
npm install

# Edit ecosystem.json — replace REPLACE_WITH_YOUR_PATH with your paths
nano ecosystem.json

# Start with PM2
pm2 start ecosystem.json

# Enable auto-restart on boot
pm2 save
pm2 startup
```

### 1.7 Update ecosystem.json

Edit these values in `ecosystem.json`:

```json
{
  "cwd": "/home/vps-devata/tevi-upload",
  "env": {
    "LOG_FILE": "/home/vps-devata/logs/tevi-upload.log"
  }
}
```

### 1.8 Test server

```bash
# Check if running
curl http://localhost:3004/health

# Expected:
# {"status":"ok","uptime":123,"browser":"chromium","version":"3.1"}

# View logs
pm2 logs tevi-upload --lines 50
```

### 1.9 Firewall

Open port 3004 for N8N:

```bash
sudo ufw allow 3004/tcp
# Or if using cloud firewall (AWS/DO/Vultr):
# Add rule in cloud console
```

---

## Step 2: N8N Setup

### 2.1 Option A: N8N Cloud

1. Go to https://n8n.io
2. Create account
3. Create new workflow workspace
4. Note your workspace URL for OAuth2 redirect URI

### 2.2 Option B: Self-hosted N8N

```bash
npm install -g n8n
n8n start
# Or with Docker:
docker run -d --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
```

### 2.3 Create N8N Credentials

Go to Settings → Credentials → Add Credential.

| Credential | Type | Fields |
|-----------|------|--------|
| `TEVI Account` | Custom | `email`, `password` |
| `VPS SSH/SFTP` | SSH/SFTP | `host`, `port`, `username`, `password` |
| `Google Drive` | Google Drive OAuth2 | Client ID, Client Secret |
| `Email SMTP` | SMTP | `host`, `port`, `user`, `password` |
| `AI Service` | Custom | `keys` (JSON array: `["key1","key2"]`) |

### 2.4 Set N8N Variables

Go to Settings → Variables → Add Variable.

| Name | Value | Description |
|------|-------|-------------|
| `VPS_UPLOAD_DIR` | `/home/vps-devata/tevi-uploads` | Upload queue path |
| `VPS_ARCHIVE_DIR` | `/home/vps-devata/tevi-uploads/archive` | Archive path |
| `VPS_UPLOAD_URL` | `http://13.75.2.24:3004` | VPS server URL |
| `VPS_LOCK_FILE` | `/home/vps-devata/tevi-uploads/state.json.lock` | Lock file path |
| `NOTIFY_EMAIL` | `your@email.com` | Your email |
| `CRON_SCHEDULE` | `0 * * * *` | Every hour |
| `AI_ENDPOINT` | `https://gateway.olagon.site/anthropic/v1/messages` | AI API |
| `AI_MODEL` | `claude-sonnet-4-6` | AI model |
| `AI_MAX_TOKENS` | `200` | Max tokens |
| `AI_RETRY_ATTEMPTS` | `3` | Retries |
| `AI_CACHE_TTL_HOURS` | `24` | Cache TTL |

### 2.5 Import Workflows

1. In N8N, click "Import from File"
2. Select `n8n-workflow/tevi-upload-main.json`
3. Select `n8n-workflow/tevi-upload-config.json`
4. Assign credentials to each node
5. Activate the main workflow

---

## Step 3: Google Cloud Setup

### 3.1 Create Project

1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Name: `tevi-autopilot`
4. Click "Create"

### 3.2 Enable Drive API

1. In the sidebar: "APIs & Services" → "Library"
2. Search: "Google Drive API"
3. Click "Enable"

### 3.3 Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `tevi-autopilot-n8n`
5. Authorized redirect URIs:
   - N8N Cloud: `https://YOUR-N8N-INSTANCE/rest/oauth2-credential/callback`
   - Self-hosted: `http://YOUR-N8N-URL:5678/rest/oauth2-credential/callback`
6. Click "Create"
7. Copy **Client ID** and **Client Secret**

### 3.4 Share GDrive Folders

Share each content folder with the Google account used in the N8N OAuth2 credential.

Right-click folder → Share → Add email → Editor.

---

## Step 4: Upload Initial Config

### 4.1 Create config.json on VPS

```bash
nano ~/tevi-uploads/config.json
```

```json
{
  "version": 3,
  "rotation": {
    "enabled": true,
    "order": [],
    "adultSubRotation": ["hentai", "japanese", "amerika"]
  },
  "categories": []
}
```

### 4.2 Create state.json on VPS

```bash
nano ~/tevi-uploads/state.json
```

```json
{
  "cycleIndex": 0,
  "adultSubCycleIndex": 0,
  "categorySkipCount": {},
  "lastRun": null
}
```

---

## Step 5: Test

### 5.1 Test Config Workflow

1. Open "TEVI Upload — Config Editor" in N8N
2. Click "Test Step"
3. Select "View Config" action
4. Verify config.json is loaded

### 5.2 Add First Category

1. In Config Workflow form, select "Add Category"
2. Fill:
   - Category ID: `photo`
   - Category Name: `📷 Photo`
   - Category Type: Standard
   - GDrive Folder ID: (your folder ID)
   - Collection: `My Photos`
   - Audience: Paid
   - Price: `10`
3. Set "Confirm Action" to "Yes"
4. Submit

### 5.3 Test Main Workflow

1. Open "TEVI Upload — Main" in N8N
2. Click "Test Step" (manual trigger)
3. Workflow should pick a file and attempt upload
4. Check logs: `pm2 logs tevi-upload`

---

## Maintenance

### Restart server after reboot

```bash
pm2 start ecosystem.json
```

### Update server.js

```bash
cd ~/tevi-upload
git pull
pm2 restart tevi-upload
```

### Check logs

```bash
pm2 logs tevi-upload --lines 100
```

### Monitor

```bash
pm2 monit
```
