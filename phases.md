# IMPLEMENTATION PHASES — TEVI Upload System v3.1

> Detailed implementation guide. Read this file when building the system.
> PRD.md is the technical specification. This file is the step-by-step execution plan.

---

## Audit Fixes Applied (v3.1)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | 🔴 CRITICAL | AI endpoint + model in config.json | Moved to N8N Variables |
| 2 | 🔴 CRITICAL | Hardcoded SFTP credentials in phases.md | Use `$credentials.VPS_SSH_SFTP` |
| 3 | 🟡 HIGH | phases.md had inline SSH credentials example | Use credential reference pattern |
| 4 | 🟡 MEDIUM | Config form complexity | Simplified with real-time validation feedback |
| 5 | 🟡 MEDIUM | Cron schedule not configurable | Added `CRON_SCHEDULE` N8N Variable |

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

# Install Node.js 18+
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
npm install -g n8n
n8n start
# Or with Docker
docker run -d --name n8n -p 5678:5678 n8nio/n8n
```

### 0.3 Google Cloud Console

1. Go to https://console.cloud.google.com/
2. Create project: `tevi-autopilot`
3. Enable APIs: **Google Drive API**
4. Create OAuth2 credentials:
   - Application type: Web application
   - Name: `tevi-autopilot-n8n`
   - Redirect URI: `https://YOUR_N8N_URL/rest/oauth2-credential/callback`
5. Note: **Client ID** and **Client Secret** (goes into N8N Credential)

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

Create `server.js` on VPS at `/home/vps-devata/tevi-upload/server.js`.

**Key points:**
- No credentials hardcoded
- All values come from request body
- Logs to `LOG_FILE` environment variable path
- Health endpoint at `GET /health`
- Upload endpoint at `POST /upload`

See the complete implementation in `server.js-reference.md` in this folder.

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
# Expected: {"status":"ok","uptime":...,"browser":"chromium","version":"3.1"}
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
  "categories": []
}
```

**Note**: AI settings are NOT in config.json. They are N8N Variables.

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

### 2.3 Create N8N Credentials

Create these **before** building workflows:

| Credential | Name in N8N | Fields |
|-----------|-------------|--------|
| Custom | `TEVI Account` | `email`, `password` |
| SSH/SFTP | `VPS SSH/SFTP` | `host`, `port`, `username`, `password` |
| Google Drive OAuth2 | `Google Drive` | OAuth2 Client ID + Secret |
| SMTP | `Email SMTP` | `host`, `port`, `user`, `password` |
| Custom | `AI Service` | `keys` (JSON array of API key strings) |

**How to create AI Service credential:**
1. Settings → Credentials → Add Credential
2. Type: Custom
3. Name: `AI Service`
4. Add field: `keys`
5. Value: `["rk_live_key1...", "rk_live_key2..."]` (JSON array)

### 2.4 Set N8N Variables

Settings → Variables → Add Variable:

| Name | Value | Description |
|------|-------|-------------|
| `VPS_UPLOAD_DIR` | `/home/vps-devata/tevi-uploads` | Upload queue path |
| `VPS_ARCHIVE_DIR` | `/home/vps-devata/tevi-uploads/archive` | Archive path |
| `VPS_UPLOAD_URL` | `http://13.75.2.24:3004` | VPS server URL |
| `VPS_LOCK_FILE` | `/home/vps-devata/tevi-uploads/state.json.lock` | Lock file path |
| `NOTIFY_EMAIL` | `your@email.com` | Notification email |
| `CRON_SCHEDULE` | `0 * * * *` | Cron expression (every hour) |
| `AI_ENDPOINT` | `https://gateway.olagon.site/anthropic/v1/messages` | AI API endpoint |
| `AI_MODEL` | `claude-sonnet-4-6` | AI model name |
| `AI_MAX_TOKENS` | `200` | Max tokens per request |
| `AI_RETRY_ATTEMPTS` | `3` | Number of retries |
| `AI_CACHE_TTL_HOURS` | `24` | Caption cache TTL |

### 2.5 Create N8N Config Workflow

Import `tevi-upload-config.json` to N8N.

**Critical implementation notes:**

#### Form Node (User-Friendly UI)

Use N8N's Form node with this pattern:

```html
<!-- Form Field: Action Selector -->
<label>What do you want to do?</label>
<select name="action">
  <option value="edit">Edit existing category</option>
  <option value="add">Add new category</option>
  <option value="delete">Delete category</option>
  <option value="enable">Enable category</option>
  <option value="disable">Disable category</option>
</select>

<!-- Form Field: Category Selector (shown when action=edit/delete/enable/disable) -->
<label>Select category:</label>
<select name="categoryId">
  <!-- Populated dynamically from config -->
  <option value="photo">📷 Photo</option>
  <option value="video">🎬 Video</option>
  <option value="adult">🔞 Adult</option>
</select>

<!-- Form Field: Category ID (shown when action=add) -->
<label>Category ID:</label>
<input type="text" name="categoryId" placeholder="my_category"
       pattern="[a-z0-9_]{1,30}" required>
<span class="hint">Alphanumeric + underscore, max 30 chars</span>

<!-- Validation error shown here -->
<div class="error" id="validation-error" style="display:none; color: red;"></div>
```

#### Form Validation (Inline Feedback)

```javascript
// Code node after form submission
const formData = $input.first().json;
const errors = [];

// Validate category ID
if (formData.action === 'add') {
  if (!formData.categoryId || !/^[a-z0-9_]{1,30}$/.test(formData.categoryId)) {
    errors.push({
      field: 'categoryId',
      message: 'ID: alphanumeric + underscore, max 30 chars'
    });
  }

  if (!formData.gdriveFolders || formData.gdriveFolders.length === 0) {
    errors.push({
      field: 'gdriveFolders',
      message: 'At least one GDrive folder required'
    });
  }
}

// Return errors to show in form
if (errors.length > 0) {
  return {
    json: {
      success: false,
      errors: errors
    }
  };
}

return { json: { success: true, data: formData } };
```

#### GDrive Connection Test Button

In the form, add a "Test Connection" button for GDrive Folder ID:

```javascript
// Code node: Test GDrive Connection
// Uses Google Drive node to list a single file from the folder ID
// Returns success or error message
// Shows result inline in the form
```

### 2.6 Test Config Workflow

1. Open Config Workflow in N8N
2. Click "Test Step"
3. Form should load
4. Try adding a category — validation errors should show inline
5. Save → config.json uploads to VPS
6. Verify content on VPS

### 2.7 Phase 2 Checklist

- [ ] config.json uploaded to VPS
- [ ] state.json uploaded to VPS
- [ ] All 5 N8N Credentials created
- [ ] All 9 N8N Variables set
- [ ] Config Workflow imported to N8N
- [ ] Config Workflow form loads
- [ ] Inline validation working
- [ ] Config save works (upload to VPS)
- [ ] Config validation works (duplicate ID, empty folder, etc.)
- [ ] GDrive folder test button working

---

## PHASE 3: N8N Main Workflow

### 3.1 Create Credentials in N8N

All 5 credentials from Phase 2 must be created first.

### 3.2 Build Main Workflow

Import `tevi-upload-main.json` to N8N.

**Critical implementations:**

#### Schedule Trigger Node

```javascript
// Read CRON_SCHEDULE from N8N Variables
// Default: "0 * * * *" (every hour on the hour)
// User can change in Settings → Variables
const schedule = $vars.CRON_SCHEDULE || '0 * * * *';
return { json: { schedule } };
```

#### Calculate Rotation Node

```javascript
const config = $input.first().json;
const state = $('Download State').first().json;

// Get enabled categories in rotation order
const enabledCategories = config.rotation.order
  .map(id => config.categories.find(c => c.id === id))
  .filter(c => c && c.enabled);

if (enabledCategories.length === 0) {
  throw new Error('NO_CATEGORY_ENABLED');
}

// Get next category (index-based, NOT modulo on filtered array)
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
  if (enabledSubTypes.length > 0) {
    const subIndex = state.adultSubCycleIndex % enabledSubTypes.length;
    result.selectedSubType = enabledSubTypes[subIndex];
    result.stateUpdates.adultSubCycleIndex = (state.adultSubCycleIndex + 1) % enabledSubTypes.length;
  } else {
    result.selectedSubType = null;
  }
}

// Skip check
const skipCount = state.categorySkipCount?.[category.id] || 0;
if (skipCount >= 3) {
  result.skipped = true;
  result.skipReason = 'SKIP_THRESHOLD';
}

return result;
```

#### Acquire Lock Node (Atomic SFTP Rename)

```
SFTP Node — operation: rename
from: {{ $vars.VPS_UPLOAD_DIR }}/state.json
to: {{ $vars.VPS_UPLOAD_DIR }}/state.json.lock
```

If `state.json.lock` already exists, rename fails → Error Output → Stop workflow.

#### Save State Node

```javascript
const state = $('Download State').first().json;
const rotation = $('Calculate Rotation').first().json;

const newState = {
  ...state,
  cycleIndex: rotation.stateUpdates.cycleIndex,
  adultSubCycleIndex: rotation.stateUpdates.adultSubCycleIndex ?? state.adultSubCycleIndex,
  categorySkipCount: rotation.stateUpdates.categorySkipCount ?? state.categorySkipCount ?? {},
  lastRun: new Date().toISOString()
};

return { json: newState };
```

#### GDrive List Node (Loop Over Folders)

For categories with multiple folders:

```
┌─────────────────────────────────────────────┐
│  Loop Over Items                             │
│  Items: {{ $json.selectedCategory.gdriveFolders }}
│  ┌─────────────────────────────────────────┐ │
│  │  Google Drive: List Files               │ │
│  │  Parent: {{ $json.item.json.id }}       │ │
│  │  Limit: 100                              │ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │  Code: Track Folder Source               │ │
│  │  Add selectedFolderId to each item      │ │
│  └─────────────────────────────────────────┘ │
│  └─────────────────────────────────────────┘ │
│  Collect all items from loop                 │
└─────────────────────────────────────────────┘
```

#### Random Pick Node

```javascript
const files = $input.all();
if (!files || files.length === 0) {
  throw new Error('NO_FILES');
}

const randomIndex = Math.floor(Math.random() * files.length);
const selected = files[randomIndex].json;

return {
  json: {
    ...selected,
    selectedFolderId: selected.selectedFolderId || selected.parents?.[0],
    fileName: selected.name,
    gdriveFileId: selected.id,
    gdriveMimeType: selected.mimeType,
    gdriveSize: selected.size
  }
};
```

#### Build Payload Node

```javascript
const item = $input.first().json;
const category = $('Get Category Config').first().json;
const subType = category.selectedSubType;
const tevi = $credentials['TEVI Account'];
const caption = $('Caption Result').first().json.caption;

// Resolve effective config (sub-type overrides parent)
const effective = {
  collection: subType?.collection || category.collection,
  audiencePaid: category.audience === 'paid',
  audienceFree: category.audience === 'free',
  audiencePrice: subType?.price || category.price || 10,
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
    collection: effective.collection || '',
    audienceFree: effective.audienceFree ?? false,
    audiencePaid: effective.audiencePaid ?? true,
    audiencePrice: effective.audiencePrice,
    audienceMembership: effective.audienceMembership ?? false,
    alwaysMembers: effective.alwaysMembers ?? false,
    nsfw: effective.nsfw ?? false,
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

#### HTTP Request Node

```
url: {{ $vars.VPS_UPLOAD_URL }}/upload
method: POST
sendBody: true
contentType: application/json
body: |
  {{ JSON.stringify($json) }}
options:
  timeout: 600000    ← 10 minutes for video
  maxRetries: 3
  retryWaitMillis: 5000
```

#### Release Lock Node (Always Runs)

Connect Error Trigger to:
1. Release Lock (SFTP Delete `{{ $vars.VPS_LOCK_FILE }}`)
2. Notify Failure (Email)

Connect success path to:
1. Release Lock (SFTP Delete `{{ $vars.VPS_LOCK_FILE }}`)

### 3.3 Phase 3 Checklist

- [ ] All 5 credentials created in N8N
- [ ] All 9 N8N Variables set
- [ ] Schedule trigger reads `CRON_SCHEDULE` variable
- [ ] Config download + validation working
- [ ] Rotation calculation working (test with 3 categories)
- [ ] Lock acquisition working (atomic rename)
- [ ] GDrive listing works for multi-folder categories
- [ ] Random pick working
- [ ] File download + SFTP upload working
- [ ] HTTP /upload request working
- [ ] Archive + FIFO working
- [ ] Lock release working on success
- [ ] Error trigger + lock release on failure working
- [ ] Email notifications working
- [ ] Skip threshold working

---

## PHASE 4: AI Caption System

### 4.1 AI Credential Architecture

**AI keys are stored ONLY in N8N Credential "AI Service".**

Settings are read from N8N Variables:
- `AI_ENDPOINT` — API endpoint
- `AI_MODEL` — model name
- `AI_MAX_TOKENS` — max tokens
- `AI_RETRY_ATTEMPTS` — retries
- `AI_CACHE_TTL_HOURS` — cache TTL

AI-related fields in config.json (safe — no keys):
- `aiTranslate` (boolean per category)
- `aiPrompt` (string per sub-type)

### 4.2 AI Caption Code Node

Create a dedicated Code node in the Main Workflow.

```javascript
// AI Caption Generator
const item = $input.first().json;
const category = $('Get Category Config').first().json;
const subType = category.selectedSubType;
const config = $('Read Config').first().json;

// Determine if AI should be used
const aiEnabled = subType?.aiTranslate || category.aiTranslate || config.ai?.aiTranslate;
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

// ── AI Caption Generation ──────────────────────────────────────
const filename = item.fileName;
const folderId = item.selectedFolderId;
const type = category.id;
const subTypeId = subType?.id;
const captionSuffix = category.captionSuffix || '';
const prompt = subType?.aiPrompt || category.aiPrompt ||
  'Translate to Bahasa Indonesia. Short, natural, max 10 words. No emojis.';

// Read AI settings from N8N Variables
const aiEndpoint = $vars.AI_ENDPOINT || 'https://gateway.olagon.site/anthropic/v1/messages';
const aiModel = $vars.AI_MODEL || 'claude-sonnet-4-6';
const aiMaxTokens = parseInt($vars.AI_MAX_TOKENS) || 200;
const aiRetries = parseInt($vars.AI_RETRY_ATTEMPTS) || 3;

// Check cache first
const cached = await checkCache(filename, folderId);
if (cached) {
  return {
    json: {
      caption: buildFinalCaption(cached, type, subTypeId, captionSuffix),
      usedAi: true,
      usedCache: true
    }
  };
}

// Layer 1: Indonesian word replacement
const cleaned = cleanFilename(filename);
const indoVersion = replaceIndonesian(cleaned);

// Layer 2: AI Translation
let translated = await aiTranslate(indoVersion);
if (!translated) translated = await aiTranslate(cleaned);

// Layer 3: Fallback
if (!translated) {
  translated = `${subTypeId || type} Video Dewasa ${indoVersion}`;
}

// Layer 4: Adult word injection
translated = injectAdultWords(translated, cleaned);

// Layer 5: Build final caption
const finalCaption = buildFinalCaption(translated, type, subTypeId, captionSuffix);

// Cache
await setCache(filename, folderId, translated);

return {
  json: {
    caption: finalCaption,
    usedAi: true,
    usedCache: false
  }
};

// ── Helpers ───────────────────────────────────────────────────

function cleanFilename(name) {
  return (name || '')
    .replace(/\.\w+$/, '')
    .replace(/[\[\]]/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b(uncen|nekop|care|xnxx|xvideos|hd|sd|720p|1080p|480p|360p|mp4|mkv|avi|mov|webm|m4v|bluray|discontinued|censored)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDONESIAN_MAP = {
  'masturbate': 'colmek', 'masturbation': 'colmek', 'masturbating': 'colmek',
  'breasts': 'dada', 'breast': 'dada', 'tits': 'dada', 'titties': 'dada',
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
  'stepmom': 'ibu tiri', 'stepmother': 'ibu tiri',
  'pussy': 'memek',
  'cheating': 'selingkuh', 'married': 'menikah',
  'doctor': 'dokter', 'nurse': 'perawat', 'maid': 'pramugari',
  'cosplay': 'cosplay', 'cosplayer': 'cosplayer',
  'idol': 'idol', 'jav': 'jav',
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

async function aiTranslate(text) {
  const keys = $credentials['AI Service']?.keys || [];
  if (!keys || keys.length === 0) return null;

  for (let attempt = 0; attempt < aiRetries; attempt++) {
    const apiKey = keys[attempt % keys.length];
    try {
      const response = await fetch(aiEndpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: aiModel,
          max_tokens: aiMaxTokens,
          messages: [{ role: 'user', content: `${prompt}\n"${text}"` }]
        })
      });

      if (!response.ok) continue;

      const json = await response.json();
      const blocks = json.content || [];
      const textBlock = blocks.find(b => b.type === 'text')?.text || '';
      const thinking = blocks.find(b => b.type === 'thinking')?.thinking || '';

      for (const source of [textBlock, thinking]) {
        const extracted = extractTranslation(source);
        if (extracted) return extracted;
      }
    } catch {}
  }
  return null;
}

function extractTranslation(text) {
  if (!text) return null;
  const clean = text.replace(/[*_`#]/g, '').trim();

  // Strategy 1: Quoted string
  const quotes = [...clean.matchAll(/"([A-Za-z0-9\sÀ-ɏḀ-ỿ一-鿿]{3,65})"/g)];
  if (quotes.length > 0) {
    const last = quotes[quotes.length - 1][1].trim();
    if (!/translate|should|short|natural|under|within|max|word|keep|help|adult|declin/i.test(last)) {
      return last;
    }
  }

  // Strategy 2: Bullet points
  const bullets = [...clean.matchAll(/^[\-\*]\s+(.+)$/gm)];
  if (bullets.length > 0) {
    const last = bullets[bullets.length - 1][1].trim();
    if (!/^the|^and|^jav\s*=|means|translate|refer|adult|porn|genre|search/i.test(last)) {
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
  const sentences = clean.split(/[.\n]/).map(s => s.trim())
    .filter(s => s.length > 4 && s.length < 70);

  const ID_KNOWN = /^(javan|idol|jav|cosplay|maid|onsen|kompilasi|video|dewasa|cewek|gadis|perawat|seksi|seragam|bokong|pantat|dada|kontol|vital|colmek|masturbasi|anal|seks|main|grup|publik|remaja|muda|telanjang|intim|vaginal|orgasme|memek|besar|kecil|luar|dalam|ranjang|kamar|pakai|sendiri|seksi|pantai|liburan|ibu|tiri|anak|hukuman|disiplin|terlarang|daging|wanita|menikah|selingkuh|koleksi|adegan|dokter|medis|konten|bugil|porno|oil|massage|hot)$/i;

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
      case 'japanese': return `(JAV) ${translated}${formattedSuffix}`;
      case 'amerika':  return `[Amerika] ${translated}${formattedSuffix}`;
      default:         return `${translated}${formattedSuffix}`;
    }
  }
  return `${translated}${formattedSuffix}`;
}

// ── Cache (SFTP-based) ─────────────────────────────────────────

async function checkCache(filename, folderId) {
  // Uses ssh2 npm package
  // Reads .caption_cache.json from VPS
  // Returns cached caption if valid (within TTL)
  const { Client } = require('ssh2');
  const conn = new Client();
  const cachePath = `${$vars.VPS_ARCHIVE_DIR}/.caption_cache.json`;
  const ttlMs = (parseInt($vars.AI_CACHE_TTL_HOURS) || 24) * 3600000;

  try {
    const content = await new Promise((resolve) => {
      conn.sftp((err, sftp) => {
        if (err) { resolve(null); return; }
        sftp.readFile(cachePath, 'utf8', (err, data) => {
          if (err) { resolve(null); return; }
          resolve(data);
        });
      });
    });

    if (!content) return null;
    const cache = JSON.parse(content);
    const key = `${filename}_${folderId}`;
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - new Date(entry.cachedAt).getTime() > ttlMs) return null;
    return entry.caption;
  } catch {
    return null;
  } finally {
    conn.end();
  }
}

async function setCache(filename, folderId, caption) {
  const { Client } = require('ssh2');
  const conn = new Client();
  const cachePath = `${$vars.VPS_ARCHIVE_DIR}/.caption_cache.json`;

  try {
    let cache = {};
    try {
      cache = JSON.parse(await new Promise((resolve) => {
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
    cache[key] = { caption, cachedAt: new Date().toISOString() };

    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) { reject(err); return; }
        const buf = Buffer.from(JSON.stringify(cache, null, 2));
        const stream = sftp.createWriteStream(cachePath);
        stream.on('close', resolve);
        stream.on('error', reject);
        stream.write(buf);
        stream.end();
      });
    });
  } catch {} finally {
    conn.end();
  }
}
```

### 4.3 Test AI Caption

1. Create a test folder in GDrive with a JAV filename
2. Run workflow manually
3. Check:
   - AI was called (or cache hit)
   - Caption is in Indonesian
   - Caption has proper format: `(JAV) {translated}\n\n{suffix}`
   - Cache was saved to `.caption_cache.json`

### 4.4 Phase 4 Checklist

- [ ] AI keys stored in N8N Credential only
- [ ] AI settings from N8N Variables (not config.json)
- [ ] Indonesian word map working
- [ ] AI translation working
- [ ] Adult word injection working
- [ ] Fallback working (test with bad API key)
- [ ] Cache working (re-upload same file → no API call)
- [ ] Per-type caption template working
- [ ] Retry logic working

---

## PHASE 5: Testing

### 5.1 Unit Tests

**Config validation:**
- Empty categories → should error
- Duplicate category ID → should error
- Category without folder → should error
- Adult with no active sub-types → should error

**Rotation:**
- 3 categories, 6 runs → each category twice
- 2 categories, 4 runs → each category twice
- 1 category, 5 runs → same category 5 times
- Disable middle category → should skip
- Skip threshold (3 empty) → deprioritize

**AI Caption:**
- Empty cache → AI call made
- Valid cache → no AI call
- Expired cache → AI call made
- API failure → fallback caption used
- Indonesian content policy bypass → works

### 5.2 Integration Tests

1. Upload a photo file to GDrive
2. Set up photo category in Config Workflow
3. Run Main Workflow manually
4. Verify:
   - File uploaded to TEVI
   - Caption correct
   - Archive file created
   - State updated
   - Lock released

### 5.3 Concurrency Tests

1. Start workflow (acquires lock)
2. Immediately trigger workflow again
3. Second workflow should stop with "Lock Failed"
4. Wait for first workflow to complete
5. Second workflow → should succeed

### 5.4 Phase 5 Checklist

- [ ] Config validation tests pass
- [ ] Rotation tests pass
- [ ] AI caption tests pass
- [ ] Integration: photo upload works
- [ ] Integration: adult upload + AI caption works
- [ ] Concurrency: lock prevents overlap
- [ ] Error handling: lock released on error
- [ ] Email notifications working

---

## PHASE 6: Documentation

Create `docs/` folder with these files:

| File | Content |
|------|---------|
| `SETUP.md` | VPS + N8N + GDrive + TEVI complete setup |
| `TEVISETUP.md` | TEVI account setup, collections, settings |
| `GDRIVESETUP.md` | GDrive API, folder structure, sharing |
| `CONFIG.md` | Config Workflow guide, form fields, validation |
| `AI.md` | AI caption system, word maps, caching |
| `TROUBLESHOOT.md` | Common issues + solutions |

### 6.1 Phase 6 Checklist

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

- [ ] No `console.log` in production code
- [ ] No hardcoded credentials anywhere
- [ ] No credentials in workflow JSON (exported)
- [ ] `.env.example` has placeholder values only
- [ ] `.gitignore` excludes `.env`, `node_modules/`, `tevi-uploads/`

### 7.2 Security Audit Checklist

- [ ] AI API keys only in N8N Credential "AI Service"
- [ ] TEVI email/password only in N8N Credential "TEVI Account"
- [ ] VPS SSH credentials only in N8N Credential "VPS SSH/SFTP"
- [ ] SMTP credentials only in N8N Credential "Email SMTP"
- [ ] config.json has NO credentials (only IDs + folder references)
- [ ] config.json has NO AI keys (settings from N8N Variables)
- [ ] server.js has NO credentials
- [ ] phases.md uses `$credentials.CREDENTIAL_NAME` pattern, not hardcoded values
- [ ] `.env.example` contains only placeholder text like `your-vps-ip`

### 7.3 Deploy to Production

On VPS:
```bash
cd /home/vps-devata/tevi-upload
git pull  # or upload new files via SFTP
pm2 restart tevi-upload
pm2 save
```

### 7.4 N8N Production

1. Export `tevi-upload-main.json` from N8N
2. Export `tevi-upload-config.json` from N8N
3. Import to production N8N instance
4. Create all 5 credentials (values stay in N8N database)
5. Set all 9 N8N Variables
6. Activate workflows

### 7.5 Monitoring

```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs tevi-upload --lines 100

# N8N executions
# Settings → Workflows → tevi-upload → Executions
```

### 7.6 Phase 7 Checklist

- [ ] No hardcoded credentials found
- [ ] Security audit passed
- [ ] server.js deployed to VPS
- [ ] PM2 auto-restart enabled
- [ ] N8N workflows activated
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
| Workflow stuck in loop | `pm2 restart tevi-upload`, deactivate N8N workflow |
| Lock not releasing | SSH: `rm /home/vps-devata/tevi-uploads/state.json.lock` |
| Config corrupted | Re-run Config Workflow to restore |
| AI caption generating bad content | Set `aiTranslate: false` in config.json |
| TEVI rate limited | Change `CRON_SCHEDULE` to longer interval |
| All uploads failing | `pm2 logs tevi-upload` → check server errors |
