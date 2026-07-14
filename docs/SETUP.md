# Setup Guide

Complete step-by-step guide to set up TEVI Autopilot.

## Prerequisites

- VPS with Linux (Ubuntu 20.04+ recommended)
- N8N instance (self-hosted or cloud)
- Google Cloud project with Drive API enabled
- TEVI.com account

## Step 1: VPS Setup

### 1.1 — Connect to VPS

```bash
ssh vps-user@your-vps-ip
```

### 1.2 — Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should be v18.x.x or higher
```

### 1.3 — Install Playwright + Chromium

```bash
# Install Playwright globally
npm install -g playwright

# Install Chromium browser
npx playwright install chromium

# Verify Chromium
npx playwright install-deps chromium
```

### 1.4 — Create directories

```bash
mkdir -p /home/vps-devata/tevi-uploads
mkdir -p /home/vps-devata/tevi-uploads/archive
chmod 755 /home/vps-devata/tevi-uploads
chmod 755 /home/vps-devata/tevi-uploads/archive
```

### 1.5 — Install PM2

```bash
npm install -g pm2
```

## Step 2: Deploy server.js

### 2.1 — Copy files to VPS

```bash
# From your local machine:
scp server.js ecosystem.json vps-user@your-vps-ip:/home/vps-user/tevi-upload/
```

### 2.2 — Install dependencies on VPS

```bash
cd /home/vps-user/tevi-upload
npm init -y
npm install express playwright cors
```

### 2.3 — Start with PM2

```bash
pm2 start ecosystem.json
pm2 save
pm2 startup  # Auto-start on reboot
```

### 2.4 — Verify server is running

```bash
curl http://localhost:3004/health
# Should return: {"status":"ok","uptime":...}
```

## Step 3: Expose VPS to N8N

### Option A: Direct IP (not recommended for production)

```bash
# Ensure port 3004 is open in firewall
sudo ufw allow 3004/tcp
```

Update `VPS_UPLOAD_URL` in N8N to: `http://YOUR_VPS_IP:3004`

### Option B: Cloudflare Tunnel (recommended)

```bash
# Install cloudflared on VPS
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Create tunnel (one-time)
cloudflared tunnel create tevi-upload

# Get tunnel URL from output: xxx.trycloudflare.com
# Point DNS in Cloudflare dashboard:
#   Type: CNAME
#   Name: tevi-upload
#   Target: xxx.trycloudflare.com
#   Proxy: false

# Run tunnel
cloudflared tunnel run --name tevi-upload
```

## Step 4: N8N Setup

### 4.1 — Import Workflow

1. Open N8N
2. Click "Import from File"
3. Select `tevi-autopilot.json`

### 4.2 — Create Credentials

#### Google Drive OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project or select existing
3. Enable "Google Drive API"
4. APIs & Services → Credentials → Create Credentials → OAuth client ID
5. Application type: Web application
6. Add Authorized redirect URI: `https://YOUR_N8N_URL/rest/oauth2-credential/callback`
7. Copy Client ID and Client Secret
8. N8N → Credentials → Google Drive OAuth2 API
9. Paste Client ID, Client Secret, redirect URI

#### SSH/SFTP

1. N8N → Credentials → SSH
2. Host: your VPS IP
3. Port: 22
4. Username: your VPS username
5. Password: your VPS password (or use key)

#### Email (SMTP)

1. N8N → Credentials → Email (SMTP)
2. Host: smtp.your-provider.com
3. Port: 587
4. User: your@email.com
5. Password: your email password

#### TEVI Account (Custom)

1. N8N → Credentials → Create New → Custom
2. Name: `TEVI Account`
3. Fields:
   - `email`: your-tevi@email.com
   - `password`: your_tevi_password
   - `channelSlug`: your_channel

### 4.3 — Update Workflow Config

1. Open "Photo Config" node → Replace folder ID with your photo GDrive folder ID
2. Open "Video Config" node → Replace folder IDs with your video GDrive folder IDs
3. Open "Porn Config" node → Replace folder IDs with your porn GDrive folder IDs

### 4.4 — Set Environment Variables

N8N → Settings → Variables:

| Name | Value |
|------|-------|
| `VPS_UPLOAD_DIR` | `/home/vps-user/tevi-uploads` |
| `VPS_ARCHIVE_DIR` | `/home/vps-user/tevi-uploads/archive` |
| `VPS_UPLOAD_URL` | `https://your-tunnel-url.trycloudflare.com` |
| `NOTIFY_EMAIL` | `your@email.com` |

### 4.5 — Activate Workflow

Toggle the workflow to "Active"

## Step 5: Test

### 5.1 — Manual test

Click "Test Workflow" in N8N. Check:
- GDrive listing works
- File downloads
- SFTP upload succeeds
- TEVI upload completes

### 5.2 — Check logs

```bash
# VPS logs
pm2 logs tevi-upload

# N8N logs
# Check in N8N UI → Executions
```

### 5.3 — Check email

Should receive success/failure email after each run.

## Troubleshooting

See [TROUBLESHOOT.md](./TROUBLESHOOT.md) for common issues.
