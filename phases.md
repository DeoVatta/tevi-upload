# IMPLEMENTATION PHASES — TEVI Upload System v3

> Detailed implementation guide for building the complete TEVI Upload System.
> Follow phases in order. Each phase is independent and testable.

---

## Phase Overview

| Phase | Name | Deliverable | Est. Time |
|-------|------|-------------|-----------|
| 0 | Prerequisites | VPS ready, N8N ready | 1-2 hours |
| 1 | VPS Executor | server.js running | 2-3 hours |
| 2 | Config System | config.json + state.json + Config Workflow | 3-4 hours |
| 3 | N8N Main Workflow | Full automation | 4-6 hours |
| 4 | AI Caption | 5-layer translation pipeline | 2-3 hours |
| 5 | Testing | End-to-end test | 2-3 hours |
| 6 | Documentation | Setup docs, AI docs | 2 hours |
| 7 | Cleanup & Deploy | Production ready | 1-2 hours |

**Total estimated**: 17-25 hours

---

## PHASE 0: Prerequisites

### 0.1 VPS Setup

```bash
# SSH to VPS
ssh vps-devata@13.75.2.24

# Create directories
mkdir -p /home/vps-devata/tevi-uploads
mkdir -p /home/vps-devata/tevi-uploads/archive
mkdir -p /home/vps-devata/logs

# Install Node.js 18+ (if not installed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Create upload directory structure
mkdir -p /home/vps-devata/tevi-uploads
```

### 0.2 N8N Setup

**Option A: N8N Cloud**
- Create account at n8n.io
- Create new workflow workspace
- Note workspace URL for OAuth2 redirect

**Option B: Self-hosted N8N**
```bash
# Install N8N
npm install -g n8n
n8n start

# Or with Docker
docker run -d --name n8n -p 5678:5678 n8nio/n8n
```

### 0.3 Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Create project: `tevi-autopilot`
3. Enable APIs:
   - Google Drive API
4. Create OAuth2 credentials:
   - Application type: Web application
   - Name: `tevi-autopilot-n8n`
   - Redirect URI: `https://YOUR_N8N_URL/rest/oauth2-credential/callback`
5. Note: Client ID, Client Secret

### 0.4 Deliverables Check

- [ ] VPS accessible via SSH
- [ ] Node.js 18+ installed
- [ ] PM2 installed
- [ ] N8N running
- [ ] Google Cloud project created
- [ ] OAuth2 credentials created

---

## PHASE 1: VPS Executor (server.js)

### 1.1 Create project structure

On VPS:
```bash
mkdir -p /home/vps-devata/tevi-upload
cd /home/vps-devata/tevi-upload
npm init -y
npm install express playwright cors
npx playwright install chromium
```

### 1.2 Create server.js

Write complete server.js implementing the 23-step upload flow from PRD.

**Key sections:**

```javascript
// server.js — Complete implementation

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const cors = require('cors');

// ── CONFIG ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3004;
const LOG_FILE = process.env.LOG_FILE || '/home/vps-devata/logs/tevi-upload.log';

// ── HELPERS ──────────────────────────────────────────────────
function log(msg, level) { ... }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function isVideo(p) { return ['.mp4','.mkv','.avi','.mov','.webm','.m4v'].includes(path.extname(p).toLowerCase()); }
function isPhoto(p) { return ['.jpg','.jpeg','.png','.gif','.webp'].includes(path.extname(p).toLowerCase()); }

// ── LOGIN FLOW ───────────────────────────────────────────────
async function login(page, email, password) {
  await page.goto('https://tevi.com/', { waitUntil: 'domcontentloaded' });
  await sleep(13000); // Wait for page load

  // Click login banner if visible
  const bannerBtn = await page.$('#nav-login-banner-btn');
  if (bannerBtn) {
    await bannerBtn.click();
    await sleep(2000);
  }

  // Click "with email"
  const emailBtn = await page.locator('button', { hasText: /with\s+email/i }).first();
  await emailBtn.click();
  await sleep(3000);

  // Fill credentials
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit
  await page.locator('button[type="submit"]').first().click();
  await sleep(8000);

  // Poll for UID (login success)
  const uidFound = await page.waitForFunction(
    () => !!document.querySelector('#nav-profile-btn, a[href*="/@"]'),
    { timeout: 60000, polling: 1000 }
  ).then(() => true).catch(() => false);

  if (!uidFound) {
    return { success: false, reason: 'login_failed', step: 'login',
             detail: 'UID not found after 60s poll' };
  }

  await page.keyboard.press('Escape');
  await sleep(3000);
  return { success: true };
}

// ── UPLOAD FLOW ──────────────────────────────────────────────
async function uploadContent(page, body) {
  const { filePath, caption, collection, audienceFree, audiencePaid,
          audiencePrice, audienceMembership, alwaysMembers, nsfw, type } = body;

  // 1. Verify file exists
  if (!fs.existsSync(filePath)) {
    return { success: false, reason: 'file_not_found', step: 'upload',
             detail: `File not found: ${filePath}` };
  }

  const isVideoFile = isVideo(filePath);

  // 2. Homepage setup — scroll to init lazy load
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(2500);
  }
  await sleep(1000);

  // 3. Modal cleanup loop (5x)
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.evaluate(() => {
      const selectors = [
        '.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root',
        '[role="presentation"]'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const s = getComputedStyle(el);
          if (s.position === 'fixed' || parseInt(s.zIndex) > 1000) el.remove();
        });
      });
    });
    await sleep(300);
  }
  await sleep(1000);

  // 4. Inject mutation observer to auto-remove modals
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      ['.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root']
        .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // 5. Click #nav-create-btn
  let createClicked = false;
  const createBtn = await page.$('#nav-create-btn');
  if (createBtn) {
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click({ force: true });
    createClicked = true;
    await sleep(2000);
  }

  if (!createClicked) {
    return { success: false, reason: 'create_btn_not_clicked', step: 'create',
             detail: '#nav-create-btn not found' };
  }

  await sleep(8000);

  // 6. Poll for post form
  const formVisible = await page.waitForFunction(
    () => !!document.querySelector('#post-form-upload-media-btn, #post-form-root'),
    { timeout: 45000, polling: 1000 }
  ).then(() => true).catch(() => false);

  if (!formVisible) {
    return { success: false, reason: 'post_form_not_visible', step: 'create',
             detail: 'Post form not visible after 45s' };
  }

  // 7. File select
  let fileSelected = false;
  try {
    const fc = await page.waitForEvent('filechooser', { timeout: 15000 });
    await fc.setFiles(filePath);
    fileSelected = true;
  } catch {
    const uploadBtn = await page.$('#post-form-upload-media-icon, #post-form-upload-media-btn');
    if (uploadBtn) {
      await uploadBtn.click();
      await sleep(500);
      const fc2 = await page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
      if (fc2) { await fc2.setFiles(filePath); fileSelected = true; }
    }
  }

  if (!fileSelected) {
    return { success: false, reason: 'file_not_selected', step: 'upload',
             detail: 'File chooser not opened' };
  }

  // 8. Wait for preview
  const previewSelector = isVideoFile
    ? '#post-form-video-preview, video'
    : '#post-form-photo-preview, img[src*="preview"]';

  for (let i = 0; i < 120; i++) {
    // Check for unsupported format error
    const errText = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="error"], [class*="unsupported"]');
      for (const el of els) {
        const t = el.textContent.toLowerCase();
        if (t.includes('unsupported') || t.includes('format')) return t;
      }
      return null;
    });
    if (errText) {
      return { success: false, reason: 'unsupported_format', step: 'upload',
               detail: errText };
    }

    const preview = await page.$(previewSelector);
    if (preview) break;
    await sleep(3000);

    if (i === 119) {
      return { success: false, reason: 'upload_error', step: 'upload',
               detail: 'Preview not loaded after 6 minutes' };
    }
  }

  // 9. Caption
  const captionInput = await page.$('#post-form-caption-input');
  if (captionInput) await captionInput.fill(caption || '');

  // 10. Collection
  if (collection) {
    const colBtn = await page.$('#post-form-collection-open-btn');
    if (colBtn) {
      await colBtn.click();
      await sleep(2000);
      for (let attempt = 0; attempt < 10; attempt++) {
        const dialog = await page.$('#post-form-collection-dialog');
        if (dialog) {
          const items = await page.$$('[class*="collection-item"]');
          for (const item of items) {
            const text = await item.textContent();
            if (text.includes(collection)) {
              await item.click();
              await sleep(500);
              await page.keyboard.press('Escape');
              break;
            }
          }
        }
        await sleep(1000);
      }
    }
  }

  // 11. Audience
  if (audiencePaid) {
    const audienceBtn = await page.$('#post-form-audience-btn');
    if (audienceBtn) {
      await audienceBtn.click();
      await sleep(2000);

      // Uncheck FREE
      const freeSwitch = await page.$('#post-form-audience-free-switch');
      if (freeSwitch && await freeSwitch.isChecked()) await freeSwitch.click();

      // Check PAID
      const paidSwitch = await page.$('#post-form-audience-paid-switch');
      if (paidSwitch && !(await paidSwitch.isChecked())) await paidSwitch.click();

      // Fill price
      const priceInput = await page.$('#post-form-audience-star-price-input');
      if (priceInput) await priceInput.fill(String(audiencePrice || 10));

      // Members switch
      const needMembers = audienceMembership || alwaysMembers || nsfw;
      if (needMembers) {
        const memberSwitch = await page.$('#post-form-audience-members-switch');
        if (memberSwitch && !(await memberSwitch.isChecked())) await memberSwitch.click();
      }

      await page.keyboard.press('Escape');
      await sleep(500);
    }
  }

  // 12. Submit
  const submitBtn = await page.$('#post-form-submit-btn');
  if (submitBtn) await submitBtn.click();
  await sleep(3000);

  // 13. Guidelines confirm
  const guidelinesBtn = await page.$('#post-form-guidelines-confirm-btn');
  if (guidelinesBtn) await guidelinesBtn.click();
  await sleep(2000);

  // 14. Agree dialog
  const isAdult = nsfw || audienceMembership || alwaysMembers;
  const agreePatterns = isAdult
    ? ['community', 'guideline', 'agree', 'adult', 'confirm', 'satisfied',
       'konten dewasa', 'nsfw', 'age', '18+', 'years old', 'persetujuan']
    : ['community', 'guideline', 'agree', 'adult', 'confirm', 'satisfied'];

  const maxPoll = isAdult ? 400 : 50; // adult: 2min, normal: 15s
  const pollInterval = 300;

  for (let i = 0; i < maxPoll; i++) {
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = (await btn.textContent()).toLowerCase().trim();
      if (agreePatterns.some(p => text.includes(p))) {
        await btn.click();
        await sleep(2000);
        break;
      }
    }
    await sleep(pollInterval);
  }

  // 15. Verify post (dialog closed = success)
  const maxVerify = isAdult ? 600 : 80; // adult: 30min max
  let postVerified = false;
  let postError = null;

  for (let i = 0; i < maxVerify; i++) {
    const dialog = await page.$('#post-form-dialog');
    if (!dialog) { postVerified = true; break; }

    const errorText = await page.evaluate(() => {
      const d = document.querySelector('#post-form-dialog');
      if (!d) return null;
      const errorEls = d.querySelectorAll('[class*="error"], [class*="failed"]');
      return errorEls.length > 0 ? errorEls[0].textContent : null;
    });
    if (errorText) { postError = errorText; break; }

    // Video stuck detection
    if (isVideoFile) {
      const currentTime = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      });
      if (currentTime > 0 && currentTime < 4) {
        // Check if stuck
        const stuck = await page.evaluate(() => {
          window._teviStuckCount = (window._teviStuckCount || 0) + 1;
          return window._teviStuckCount;
        });
        if (stuck >= 8) {
          await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) v.play().catch(() => {});
          });
          await page.evaluate(() => { window._teviStuckCount = 0; });
        }
      } else {
        await page.evaluate(() => { window._teviStuckCount = 0; });
      }
    }

    await sleep(3000);
    if (i === maxVerify - 1) {
      return { success: false, reason: 'post_unverified', step: 'verify',
               detail: 'Post dialog not closed after maximum timeout' };
    }
  }

  if (postError) {
    return { success: false, reason: 'post_unverified', step: 'verify',
             detail: `Post error: ${postError}` };
  }

  // 16. Get post URL
  let postUrl = null;
  for (let i = 0; i < 30; i++) {
    postUrl = await page.evaluate(() => {
      if (window.location.href.includes('/post/')) return window.location.href;
      return null;
    });
    if (postUrl) break;
    await sleep(3000);
  }

  return { success: true, url: postUrl };
}

// ── HTTP SERVER ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  cors()(req, res, () => {});

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // GET /health
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      browser: 'chromium',
      version: '3.0'
    }));
    return;
  }

  // POST /upload
  if (req.url === '/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let data;
      try { data = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'invalid_body',
                                  step: 'parse', detail: 'Invalid JSON' }));
        return;
      }

      if (!data.email || !data.password || !data.filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'missing_fields',
                                  step: 'validate',
                                  detail: 'email, password, filePath required' }));
        return;
      }

      try {
        const result = await withBrowser(async (browser) => {
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          });
          const page = await context.newPage();

          const loginResult = await login(page, data.email, data.password);
          if (!loginResult.success) {
            await context.close();
            return loginResult;
          }

          return await uploadContent(page, data);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.success
          ? { success: true, uploaded: true, file: path.basename(data.filePath), url: result.url }
          : result));
      } catch (err) {
        log(`Server error: ${err.message}`, 'ERROR');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'upload_error',
                                  step: 'server', detail: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, reason: 'not_found' }));
});

// ── withBrowser helper ───────────────────────────────────────
async function withBrowser(fn) {
  let browser;
  const CHROMIUM_PATH = process.env.CHROMIUM_PATH || (
    '/home/vps-devata/.cache/ms-playwright/' +
    'chromium_headless_shell-1228/' +
    'chrome-headless-shell-linux64/' +
    'chrome-headless-shell'
  );

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu', '--disable-dev-shm-usage',
        '--disable-gpu-rasterization', '--disable-gpu-compositing',
        '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
        '--enable-accelerated-video-decode',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ]
    });
    return await fn(browser);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── START ───────────────────────────────────────────────────
ensureDir(path.dirname(LOG_FILE));

server.listen(PORT, () => {
  log(`TEVI Upload Server v3 started on port ${PORT}`);
});

process.on('SIGTERM', () => {
  log('SIGTERM — graceful shutdown');
  server.close(() => process.exit(0));
});
```

### 1.3 Create ecosystem.json

```json
{
  "apps": [{
    "name": "tevi-upload",
    "script": "server.js",
    "cwd": "/home/vps-devata/tevi-upload",
    "instances": 1,
    "exec_mode": "fork",
    "autorestart": true,
    "max_restarts": 10,
    "min_uptime": "10s",
    "exp_backoff_restart_delay": 1000,
    "watch": false,
    "kill_timeout": 60000,
    "env": {
      "NODE_ENV": "production",
      "PORT": "3004",
      "LOG_LEVEL": "info",
      "LOG_FILE": "/home/vps-devata/logs/tevi-upload.log"
    }
  }]
}
```

### 1.4 Deploy and start

On VPS:
```bash
cd /home/vps-devata/tevi-upload
pm2 start ecosystem.json
pm2 save
pm2 startup  # Enable auto-restart on boot
```

### 1.5 Test health endpoint

```bash
curl http://localhost:3004/health
# Expected: {"status":"ok","uptime":...,"browser":"chromium","version":"3.0"}
```

### 1.6 Phase 1 Checklist

- [ ] server.js created
- [ ] ecosystem.json created
- [ ] PM2 started
- [ ] Health endpoint returns 200
- [ ] Logs writing to /home/vps-devata/logs/tevi-upload.log

---

## PHASE 2: Config System

### 2.1 Create Initial config.json

Upload to VPS at `/home/vps-devata/tevi-uploads/config.json`:

```json
{
  "version": 3,
  "rotation": {
    "enabled": true,
    "order": [],
    "adultSubRotation": ["hentai", "japanese", "amerika"]
  },
  "categories": [],
  "ai": {
    "enabled": false,
    "endpoint": "https://gateway.olagon.site/anthropic/v1/messages",
    "model": "claude-sonnet-4-6",
    "maxTokens": 200,
    "retryAttempts": 3,
    "cacheTTLHours": 24
  }
}
```

### 2.2 Create Initial state.json

Upload to VPS at `/home/vps-devata/tevi-uploads/state.json`:

```json
{
  "cycleIndex": 0,
  "adultSubCycleIndex": 0,
  "categorySkipCount": {},
  "lastRun": null
}
```

### 2.3 Create N8N AI Service Credential

In N8N UI:
1. Settings → Credentials → Add Credential
2. Type: Custom (or HTTP Query if available)
3. Name: `AI Service`
4. Fields:
   - `keys`: Array of API keys (one per line or JSON array)

### 2.4 Create N8N Config Workflow

Import `tevi-upload-config.json` to N8N.

Key nodes to implement:
- Manual Trigger
- SFTP Download (download config.json)
- Form Node (custom HTML form)
- Code nodes (validation, migration, CRUD)
- SFTP Upload (upload config.json)

### 2.5 Test Config Workflow

1. Open Config Workflow in N8N
2. Click "Test Step"
3. Form should load (or error if no config yet)
4. Fill form with test data
5. Save → config.json should upload to VPS
6. Download config.json from VPS → verify content

### 2.6 Phase 2 Checklist

- [ ] config.json uploaded to VPS
- [ ] state.json uploaded to VPS
- [ ] AI Service credential created in N8N
- [ ] Config Workflow imported to N8N
- [ ] Config Workflow form loads
- [ ] Config save works (upload to VPS)
- [ ] Config validation works (duplicate ID, empty folder, etc.)
- [ ] Config migration (v2 → v3) works

---

## PHASE 3: N8N Main Workflow

### 3.1 Create Credentials in N8N

Create these credentials before building the workflow:

| Credential | Type | Fields |
|-----------|------|---------|
| `TEVI Account` | Custom | `email`, `password` |
| `SSH SFTP` | SFTP | `host`, `port`, `username`, `password` |
| `Google Drive OAuth2 API` | Google Drive | OAuth2 Client ID + Secret |
| `Email SMTP` | SMTP | `host`, `port`, `user`, `password` |
| `AI Service` | Custom | `keys` (array of API keys) |

### 3.2 Set N8N Variables

Settings → Variables:
```
VPS_UPLOAD_DIR = /home/vps-devata/tevi-uploads
VPS_ARCHIVE_DIR = /home/vps-devata/tevi-uploads/archive
VPS_UPLOAD_URL = http://13.75.2.24:3004
VPS_LOCK_FILE = /home/vps-devata/tevi-uploads/state.json.lock
NOTIFY_EMAIL = your@email.com
```

### 3.3 Build Main Workflow

Implement `tevi-upload-main.json` following the node list in PRD Phase 3.

**Critical implementations:**

#### Calculate Rotation Node

```javascript
// Input: config.json
// Output: { selectedCategory, selectedSubType, stateUpdates }

const config = $input.first().json;
const state = $('Download State').first().json;

const enabledCategories = config.rotation.order
  .map(id => config.categories.find(c => c.id === id))
  .filter(c => c && c.enabled);

if (enabledCategories.length === 0) {
  throw new Error('NO_CATEGORY_ENABLED');
}

// Get next category
const nextIndex = (state.cycleIndex + 1) % enabledCategories.length;
const category = enabledCategories[nextIndex];

const result = {
  selectedCategoryId: category.id,
  selectedCategory: category,
  cycleIndex: nextIndex,
  stateUpdates: {
    cycleIndex: nextIndex,
    lastRun: new Date().toISOString()
  }
};

// Handle adult sub-rotation
if (category.type === 'adult') {
  const enabledSubTypes = category.subTypes.filter(st => st.enabled);
  if (enabledSubTypes.length === 0) {
    // No active sub-types, treat as standard
    result.selectedSubType = null;
    return result;
  }

  const subIndex = state.adultSubCycleIndex % enabledSubTypes.length;
  const subType = enabledSubTypes[subIndex];

  result.selectedSubType = subType;
  result.stateUpdates.adultSubCycleIndex = (state.adultSubCycleIndex + 1) % enabledSubTypes.length;
}

// Skip check
const skipCount = state.categorySkipCount?.[category.id] || 0;
if (skipCount >= 3) {
  // Deprioritize this category
  result.skipped = true;
  result.skipReason = 'SKIP_THRESHOLD';
  result.stateUpdates.categorySkipCount = {
    ...(state.categorySkipCount || {}),
    [category.id]: 0,
    [enabledCategories[nextIndex]?.id]: skipCount
  };
}

return result;
```

#### Acquire Lock Node (Atomic SFTP Rename)

```javascript
// Operation: Execute Command
// Command: mv state.json state.json.lock (on VPS via SFTP)
// If rename succeeds → lock acquired
// If rename fails (file exists) → another workflow running

// Use SFTP Execute Command:
const result = await this.helpers.sshConnect({
  host: '13.75.2.24',
  port: 22,
  username: 'vps-devata',
  password: '...'
});

// Try atomic rename
const { exec } = require('ssh2').Client;
const conn = new exec();
conn.on('ready', () => {
  conn.exec('mv /home/vps-devata/tevi-uploads/state.json /home/vps-devata/tevi-uploads/state.json.lock', (err, stream) => {
    if (err) {
      // Lock failed — another workflow is running
      throw new Error('LOCK_FAILED');
    }
    stream.on('close', () => {
      conn.end();
      // Lock acquired
    });
  });
});
conn.connect({ ... });

// Alternative: Use SFTP node with rename operation
// SFTP node → operation: rename
// from: state.json
// to: state.json.lock
// If already exists → error → stop
```

Actually, use the SFTP node's `rename` operation directly:
```
SFTP Rename:
  fromPath: {{ $vars.VPS_UPLOAD_DIR }}/state.json
  toPath: {{ $vars.VPS_UPLOAD_DIR }}/state.json.lock
```
If `state.json.lock` already exists, rename fails → workflow stops.

#### Save State Node

```javascript
// After lock acquired, save updated state
const state = $('Download State').first().json;
const rotation = $('Calculate Rotation').first().json;

const newState = {
  ...state,
  cycleIndex: rotation.stateUpdates.cycleIndex,
  adultSubCycleIndex: rotation.stateUpdates.adultSubCycleIndex || state.adultSubCycleIndex,
  categorySkipCount: rotation.stateUpdates.categorySkipCount || state.categorySkipCount || {},
  lastRun: new Date().toISOString()
};

return { json: newState };
```

#### Release Lock Node

```
SFTP Delete:
  filePath: {{ $vars.VPS_UPLOAD_DIR }}/state.json.lock
```

This always runs — even on error. Use Error Trigger node connected to Release Lock.

### 3.4 Build GDrive List Node

Use N8N Google Drive node. For multiple folders:

**Option A**: Use single node with parent folder ID parameter from config.

**Option B**: Use Code node to generate multiple folder IDs, then use sub-nodes.

For simplicity, use single node with the first folder ID. Add multiple nodes for multiple folders:

```
For each folder in selectedCategory.gdriveFolders[]:
  ├── Google Drive node: List files, parent = folder.id
  └── Code node: Combine results
```

### 3.5 Build Random Pick Node

```javascript
const files = $input.all();
if (!files || files.length === 0) {
  throw new Error('NO_FILES');
}

// Pick random file
const randomIndex = Math.floor(Math.random() * files.length);
const selected = files[randomIndex].json;

// Track which folder it came from
const folderId = selected.parentFolderId || selected.parents?.[0];

return {
  json: {
    ...selected,
    selectedFolderId: folderId,
    fileName: selected.name,
    gdriveFileId: selected.id,
    gdriveMimeType: selected.mimeType,
    gdriveSize: selected.size
  }
};
```

### 3.6 Build Payload Node

```javascript
const item = $input.first().json;
const category = $('Get Category Config').first().json;
const subType = $('Get Category Config').first().json.selectedSubType;
const tevi = $credentials.tevi;
const caption = $('Caption Result').first().json.caption;

// Determine effective config (sub-type overrides parent)
const effective = {
  collection: subType?.collection || category.collection,
  audiencePaid: category.audience === 'paid',
  audienceFree: category.audience === 'free',
  audiencePrice: subType?.price || category.price,
  audienceMembership: category.type === 'adult',
  alwaysMembers: category.type === 'adult',
  nsfw: category.type === 'adult',
  type: category.id,
  sourceFolderId: item.selectedFolderId
};

return {
  json: {
    email: tevi.email,
    password: tevi.password,
    filePath: $vars.VPS_UPLOAD_DIR + '/' + item.fileName,
    caption,
    collection: effective.collection,
    audienceFree: effective.audienceFree,
    audiencePaid: effective.audiencePaid,
    audiencePrice: effective.audiencePrice,
    audienceMembership: effective.audienceMembership,
    alwaysMembers: effective.alwaysMembers,
    nsfw: effective.nsfw,
    type: effective.type,
    sourceFolderId: effective.sourceFolderId,
    fileName: item.fileName,
    archiveName: buildArchiveName(item.fileName, effective.type),
    gdriveFileId: item.gdriveFileId
  }
};

function buildArchiveName(fileName, type) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = fileName.replace(/\.[^.]+$/, '');
  const ext = fileName.split('.').pop();
  return `${base}_${type}_${ts}.${ext}`;
}
```

### 3.7 SFTP Upload Node (Binary)

```
operation: upload
fileName: {{ $json.fileName }}
path: {{ $vars.VPS_UPLOAD_DIR }}
options:
  appendFile: false
binaryData: true
inputBinaryFieldName: data
```

### 3.8 HTTP Request Node

```
url: {{ $vars.VPS_UPLOAD_URL }}/upload
method: POST
sendBody: true
bodyParameters:
  - name: email
    value: {{ $json.email }}
  - name: password
    value: {{ $json.password }}
  ... (all fields)
options:
  timeout: 600000
  maxRetries: 3
  retryWaitMillis: 5000
```

### 3.9 Archive Node

```
operation: rename
fromPath: {{ $vars.VPS_UPLOAD_DIR }}/{{ $json.fileName }}
toPath: {{ $vars.VPS_ARCHIVE_DIR }}/{{ $json.archiveName }}
```

### 3.10 FIFO Cleanup Node

```
operation: executeCommand
command: |
  cd {{ $vars.VPS_ARCHIVE_DIR }} && \
  ls -t | grep -v '^\.' | tail -n +11 | xargs -d '\n' rm -f 2>/dev/null || true
```

### 3.11 Error Trigger

Connect error output of all critical nodes to Error Trigger, which connects to Release Lock + Notify Failure.

### 3.12 Phase 3 Checklist

- [ ] All credentials created in N8N
- [ ] All N8N variables set
- [ ] Schedule trigger working
- [ ] Config download + validation working
- [ ] Rotation calculation working (test with 3 categories)
- [ ] Lock acquisition working (atomic rename)
- [ ] GDrive listing working
- [ ] Random pick working
- [ ] File download + SFTP upload working
- [ ] HTTP /upload request working (test with dummy file)
- [ ] Archive + FIFO working
- [ ] Lock release working
- [ ] Error trigger + lock release on error working
- [ ] Email notifications working
- [ ] Skip threshold working (test with empty folder)

---

## PHASE 4: AI Caption System

### 4.1 Implement AI Caption Code Node

Create a dedicated Code node after "Random Pick" that generates captions.

```javascript
// Node: AI Caption Generator
const item = $input.first().json;
const category = $('Get Category Config').first().json;
const subType = category.selectedSubType;
const config = $('Read Config').first().json;

// Determine if AI should be used
const aiEnabled = config.ai?.enabled && (
  category.aiTranslate ||
  (subType?.aiTranslate) ||
  (category.type === 'adult')
);

if (!aiEnabled) {
  // Random caption from pool
  const captions = category.captions || ['Content'];
  const randomCaption = captions[Math.floor(Math.random() * captions.length)];
  const suffix = category.captionSuffix || '';
  return {
    json: {
      caption: `${randomCaption}\n\n${suffix}`.trim(),
      usedAi: false,
      usedCache: false
    }
  };
}

// AI Caption Generation
const filename = item.fileName;
const folderId = item.selectedFolderId;
const type = category.id;
const subTypeId = subType?.id;
const captionSuffix = category.captionSuffix || '';
const prompt = subType?.aiPrompt || category.aiPrompt || config.ai?.aiPrompt || 'Translate to Bahasa Indonesia. Short, natural, max 10 words. No emojis.';

// Check cache
const cache = await checkCaptionCache(filename, folderId);
if (cache) {
  return {
    json: {
      caption: buildFinalCaption(cache, type, subTypeId, captionSuffix),
      usedAi: true,
      usedCache: true
    }
  };
}

// Layer 1: Indonesian word replacement
const cleaned = cleanFilename(filename);
const indoVersion = replaceIndonesian(cleaned);

// Layer 2: AI Translation
let translated = await aiTranslate(indoVersion, config.ai, prompt);
if (!translated || translated === '__FAILED__') {
  translated = await aiTranslate(cleaned, config.ai, prompt);
}

// Layer 3: Fallback
if (!translated || translated === '__FAILED__') {
  translated = `${subTypeId || type} Content ${indoVersion}`;
}

// Layer 4: Adult word injection
translated = injectAdultWords(translated, cleaned);

// Layer 5: Build final caption
const finalCaption = buildFinalCaption(translated, type, subTypeId, captionSuffix);

// Cache
await setCaptionCache(filename, folderId, translated);

return {
  json: {
    caption: finalCaption,
    usedAi: true,
    usedCache: false
  }
};

// ── Helpers ──────────────────────────────────────────────────

function cleanFilename(name) {
  return (name || '')
    .replace(/\.\w+$/, '')
    .replace(/[\[\]]/g, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b(uncen|nekop|\.care|xnxx|xvideos|hd|sd|720p|1080p|480p|360p|mp4|mkv|avi|mov|webm|m4v|bluray|discontinued|censored)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDONESIAN_MAP = {
  'masturbate': 'colmek', 'masturbates': 'colmek', 'masturbation': 'colmek',
  'breasts': 'dada', 'breast': 'dada', 'tits': 'dada', 'tit': 'dada', 'titties': 'dada',
  'sex': 'seks', 'sexual': 'seks',
  'dick': 'kontol', 'dicks': 'kontol', 'penis': 'kontol',
  'fuck': 'main', 'fucked': 'main', 'fucking': 'main',
  'teen': 'remaja', 'teens': 'remaja', 'teenage': 'remaja',
  'naked': 'telanjang', 'nude': 'telanjang',
  'big': 'besar', 'huge': 'besar',
  'ass': 'bokong', 'asses': 'bokong',
  'rough': 'main', 'hardcore': 'main', 'extreme': 'main',
  'group': 'grup',
  'outdoor': 'luar ruangan', 'public': 'publik',
  'stepmom': 'ibu tiri', 'stepmother': 'ibu tiri', 'stepson': 'anak tiri',
  'pussy': 'memek',
  'cheating': 'selingkuh', 'married': 'menikah',
  'doctor': 'dokter', 'nurse': 'perawat', 'maid': 'pramugari',
  'idol': 'idol', 'cosplay': 'cosplay', 'cosplayer': 'cosplayer',
  'jav': 'jav',
};

function replaceIndonesian(text) {
  for (const [eng, indo] of Object.entries(INDONESIAN_MAP)) {
    const re = new RegExp(`\\b${eng}\\b`, 'gi');
    text = text.replace(re, indo);
  }
  return text;
}

const ADULT_INJECTION = [
  [/\bmasturbat\w*/gi, 'colmek'],
  [/\btits?\b/gi, 'dada'],
  [/\bbreasts?\b/gi, 'dada'],
  [/\bass(es)?\b/gi, 'bokong'],
  [/\bsex\b/gi, 'seks'],
  [/\bdick\b/gi, 'kontol'],
  [/\bpussy\b/gi, 'memek'],
  [/\bteen\b/gi, 'remaja'],
  [/\bnaked\b/gi, 'telanjang'],
  [/\bbig\b/gi, 'besar'],
  [/\bhuge\b/gi, 'besar'],
  [/\brough\b/gi, 'main'],
  [/\bhardcore\b/gi, 'main'],
  [/\bgroup\b/gi, 'grup'],
];

function injectAdultWords(translated, original) {
  let result = translated;
  for (const [pattern, replacement] of ADULT_INJECTION) {
    if (pattern.test(original) && !pattern.test(result)) {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

async function aiTranslate(text, aiConfig, prompt) {
  const keys = $credentials.aiService?.keys || [];
  if (!keys || keys.length === 0) return '__FAILED__';

  const endpoint = aiConfig?.endpoint || 'https://gateway.olagon.site/anthropic/v1/messages';
  const model = aiConfig?.model || 'claude-sonnet-4-6';
  const maxTokens = aiConfig?.maxTokens || 200;
  const retries = aiConfig?.retryAttempts || 3;

  let keyIdx = 0;

  for (let attempt = 0; attempt < retries; attempt++) {
    const apiKey = keys[keyIdx % keys.length];
    keyIdx++;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: `${prompt}\n"${text}"`
          }]
        })
      });

      if (!response.ok) continue;

      const json = await response.json();
      const blocks = json.content || [];
      const textBlock = blocks.find(b => b.type === 'text')?.text || '';

      if (textBlock) {
        const extracted = extractTranslation(textBlock);
        if (extracted) return extracted;
      }

      // Also check thinking block
      const thinking = blocks.find(b => b.type === 'thinking')?.thinking || '';
      if (thinking) {
        const extracted = extractTranslation(thinking);
        if (extracted) return extracted;
      }
    } catch (e) {
      // Continue to next retry
    }
  }

  return '__FAILED__';
}

function extractTranslation(text) {
  if (!text) return null;
  const clean = text.replace(/[*_`#]/g, '').trim();

  // Strategy 1: Quoted string
  const quotes = [...clean.matchAll(/"([A-Za-z0-9\sÀ-ɏḀ-ỿÀ-ÿ一-鿿]{3,65})"/g)];
  if (quotes.length > 0) {
    const last = quotes[quotes.length - 1][1].trim();
    if (!/translate|should|short|natural|under|within|max|word|keep|help|adult|declin|legitimate|request/i.test(last)) {
      return last;
    }
  }

  // Strategy 2: Bullet points
  const bullets = [...clean.matchAll(/^[\-\*]\s+(.+)$/gm)];
  if (bullets.length > 0) {
    const last = bullets[bullets.length - 1][1].trim();
    if (!/^the|^and|^jav\s*=|means|translate|refer|adult|porn|genre|search|term|acronym/i.test(last)) {
      return last;
    }
  }

  // Strategy 3: Final answer
  const final = clean.match(/(?:final answer|translation is|here(?:'s| is) the)[\s:]+"?(.+?)"?\s*$/im);
  if (final) {
    const c = final[1].trim();
    if (!/translate|should|declin/i.test(c) && c.length > 3) return c;
  }

  // Strategy 4: Indonesian sentences
  const sentences = clean.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 4 && s.length < 70);
  const ID_KNOWN = /^(javan|idol|jav|cosplay|maid|onsen|kompilasi|video|dewasa|cewek|gadis|perawat|seksi|seragam|bokong|pantat|dada|kontol|alat|vital|colmek|masturbasi|anal|seks|main|grup|publik|remaja|muda|telanjang|intim|vaginal|orgasme|memek|besar|kecil|luar|dalam|ranjang|kamar|pakai|sendiri|seksi|pantai|liburan|ibu|tiri|anak|hukuman|disiplin|terlarang|daging|wanita|menikah|selingkuh|koleksi|adegan|dokter|medis|konten|bugil|porno|oil|massage|hot)$/i;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    if (/^(the|and|but|so|however|actually|let me|this|user|looking|need|for translation|keeping|short|natural|under|within|max|word|keep|help|legitimate|abbreviation|genre|type|category|search|term|adult|explicit|pornograph)/i.test(s)) continue;
    const words = s.split(/\s+/);
    const englishOnly = words.filter(w => /^[A-Za-z]{4,}$/.test(w) && !ID_KNOWN.test(w));
    if (englishOnly.length > words.length * 0.6) continue;
    const c = s.replace(/^["'\-*>\s]+/, '').replace(/["'\s]+$/, '').trim();
    if (c.length > 3) return c;
  }

  return null;
}

function buildFinalCaption(translated, type, subTypeId, suffix) {
  const formattedSuffix = suffix ? `\n\n${suffix}` : '';

  if (type === 'adult') {
    switch (subTypeId) {
      case 'japanese':
        return `(JAV) ${translated}${formattedSuffix}`;
      case 'amerika':
        return `[Amerika] ${translated}${formattedSuffix}`;
      case 'hentai':
      default:
        return `${translated}${formattedSuffix}`;
    }
  }

  return `${translated}${formattedSuffix}`;
}

// ── Cache helpers (SFTP) ─────────────────────────────────────

async function checkCaptionCache(filename, folderId) {
  // Read .caption_cache.json from VPS
  const { Client } = require('ssh2');
  const conn = new Client();

  try {
    const cachePath = `${$vars.VPS_ARCHIVE_DIR}/.caption_cache.json`;
    const cacheContent = await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        sftp.readFile(cachePath, 'utf8', (err, data) => {
          if (err) { resolve(null); return; }
          resolve(data);
        });
      });
    });

    if (!cacheContent) return null;

    const cache = JSON.parse(cacheContent);
    const key = `${filename}_${folderId}`;
    const entry = cache[key];

    if (!entry) return null;

    const ttlMs = ($('Read Config').first().json.ai?.cacheTTLHours || 24) * 3600000;
    if (Date.now() - new Date(entry.cachedAt).getTime() > ttlMs) {
      return null;
    }

    return entry.caption;
  } catch {
    return null;
  } finally {
    conn.end();
  }
}

async function setCaptionCache(filename, folderId, caption) {
  const { Client } = require('ssh2');
  const conn = new Client();

  try {
    const cachePath = `${$vars.VPS_ARCHIVE_DIR}/.caption_cache.json`;

    // Read existing cache
    let cache = {};
    try {
      cache = JSON.parse(await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) { resolve('{}'); return; }
          sftp.readFile(cachePath, 'utf8', (err, data) => {
            if (err) { resolve('{}'); return; }
            resolve(data);
          });
        });
      }));
    } catch {}

    const key = `${filename}_${folderId}`;
    cache[key] = {
      caption,
      cachedAt: new Date().toISOString()
    };

    // Write back
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        const content = JSON.stringify(cache, null, 2);
        const buffer = Buffer.from(content, 'utf8');
        const writeStream = sftp.createWriteStream(cachePath);
        writeStream.on('close', () => resolve());
        writeStream.on('error', reject);
        writeStream.write(buffer);
        writeStream.end();
      });
    });
  } catch {
    // Cache write failed — continue without caching
  } finally {
    conn.end();
  }
}
```

### 4.2 Test AI Caption

1. Create a test folder in GDrive with a JAV filename
2. Run workflow manually
3. Check:
   - AI was called (or cache hit)
   - Caption is in Indonesian
   - Caption has proper format: `(JAV) {translated}\n\n{suffix}`
   - Cache was saved to `.caption_cache.json`

### 4.3 Phase 4 Checklist

- [ ] Indonesian word map working
- [ ] AI translation working
- [ ] Adult word injection working
- [ ] Fallback working (test with bad API key)
- [ ] Cache working (re-upload same file → no API call)
- [ ] Per-type caption template working
- [ ] Per-subType AI prompt working
- [ ] Retry logic working

---

## PHASE 5: Testing

### 5.1 Unit Tests

Test each component independently:

**Config validation:**
- Empty categories array → should error
- Duplicate category ID → should error
- Category without folder → should error
- Adult with no active sub-types → should error
- v2 config → should migrate to v3

**Rotation:**
- 3 categories, 6 runs → each category twice
- 2 categories, 4 runs → each category twice
- 1 category, 5 runs → same category 5 times
- Disable middle category → should skip

**AI Caption:**
- Empty cache → AI call made
- Valid cache → no AI call
- Expired cache → AI call made
- API failure → fallback caption used
- Indonesian content policy bypass → works

### 5.2 Integration Tests

**Test flow:**
1. Upload a photo file to VPS manually
2. Run Config Workflow to set up 1 category (photo only)
3. Run Main Workflow manually
4. Check:
   - File uploaded to TEVI
   - Caption correct
   - Archive file created
   - State updated
   - Lock released

**Test with video:**
1. Upload a video file to VPS
2. Run workflow with video category
3. Check: video upload works

**Test with adult:**
1. Set up adult category
2. Run workflow with adult category
3. Check: AI caption generated, members-only enforced

### 5.3 Concurrency Tests

1. Start workflow (it will acquire lock)
2. Immediately trigger workflow again (should stop with "lock failed")
3. Wait for first workflow to complete
4. Trigger second workflow → should succeed

### 5.4 Phase 5 Checklist

- [ ] Config validation tests pass
- [ ] Rotation tests pass
- [ ] AI caption tests pass
- [ ] Integration: photo upload works
- [ ] Integration: video upload works
- [ ] Integration: adult upload + AI caption works
- [ ] Concurrency: lock prevents overlap
- [ ] Error handling: lock released on error
- [ ] Email notifications working

---

## PHASE 6: Documentation

### 6.1 Create docs/ folder

```
docs/
├── SETUP.md           — VPS + N8N + GDrive + TEVI setup
├── TEVISETUP.md       — TEVI account, collections, settings
├── GDRIVESETUP.md     — GDrive API, folder structure, sharing
├── CONFIG.md          — Config Workflow guide, form fields
├── AI.md             — AI caption system, word maps, caching
└── TROUBLESHOOT.md   — Common issues + solutions
```

### 6.2 README.md

Update README with:
- Current status
- Architecture diagram
- Quick start guide
- Documentation links
- Feature list

### 6.3 Phase 6 Checklist

- [ ] SETUP.md written
- [ ] TEVISETUP.md written
- [ ] GDRIVESETUP.md written
- [ ] CONFIG.md written
- [ ] AI.md written
- [ ] TROUBLESHOOT.md written
- [ ] README.md updated

---

## PHASE 7: Cleanup & Deploy

### 7.1 Code Cleanup

- Remove all `console.log` used for debugging
- Add proper logging throughout
- Remove commented-out code
- Ensure no hardcoded values (all from config)
- Check for secrets in code (none should exist)

### 7.2 Security Audit

- [ ] No credentials in server.js
- [ ] No credentials in workflow JSON
- [ ] No credentials in docs
- [ ] .env.example has placeholders only
- [ ] AI keys in N8N Credential only
- [ ] SSH credentials in N8N Credential only

### 7.3 Deploy to Production

```bash
# On VPS
cd /home/vps-devata/tevi-upload
git pull  # or upload new files
pm2 restart tevi-upload
pm2 save
```

### 7.4 N8N Production

- Export workflow JSON
- Import to production N8N
- Activate workflow
- Set credentials
- Set variables

### 7.5 Monitoring Setup

```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs tevi-upload --lines 100

# N8N workflow executions
# Check N8N UI → Workflows → tevi-upload → Executions
```

### 7.6 Phase 7 Checklist

- [ ] Debug code removed
- [ ] No secrets in code
- [ ] Security audit passed
- [ ] server.js deployed to VPS
- [ ] N8N workflow activated
- [ ] Monitoring setup
- [ ] Initial test upload successful
- [ ] Documentation complete

---

## Implementation Order Summary

```
WEEK 1: Foundation
├── Day 1: Phase 0 — Prerequisites (VPS, N8N, GDrive)
├── Day 2: Phase 1 — server.js + PM2
├── Day 3: Phase 2 — Config system + Config Workflow
└── Day 4: Phase 3 — Main Workflow (basic path)

WEEK 2: Core Features
├── Day 5: Phase 3 — Lock, rotation, archive, notifications
├── Day 6: Phase 4 — AI Caption System
└── Day 7: Testing — Basic flow

WEEK 3: Polish
├── Day 8-9: Phase 5 — Integration testing
├── Day 10: Phase 6 — Documentation
└── Day 11-12: Phase 7 — Cleanup + Deploy

WEEK 4: Launch
├── Day 13-14: Production testing + monitoring
└── Day 15: Public release
```

---

## Rollback Plan

| Issue | Rollback Action |
|-------|-----------------|
| Workflow stuck in loop | PM2 restart server.js, deactivate N8N workflow |
| Lock not releasing | SSH to VPS, `rm state.json.lock` |
| Config corrupted | Restore from backup: `git checkout config.json` |
| AI caption generating bad content | Disable AI in config: `ai.enabled: false` |
| TEVI rate limited | Add delay between uploads: increase cron interval |
| All uploads failing | Check VPS logs: `pm2 logs tevi-upload` |
