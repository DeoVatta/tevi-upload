# PRD: TEVI Upload System — N8N + VPS

> Self-hosted automation for uploading content to TEVI.com. Generic, scalable, fully configurable via N8N UI. No code editing required.

**Version**: 3.1 — Audit Fixes
**Status**: Implementation ready

---

## Overview

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  N8N (Brain)                                                │
│  Schedule (cron) → Config → Lock → GDrive → File →         │
│  AI Caption → Upload → Archive → Notify → Unlock            │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  VPS (Executor)                                             │
│  POST /upload — Playwright browser automation               │
│  GET  /health — health check                                │
│  Stores: config.json, state.json, .caption_cache.json       │
└──────────────────────────────────────────────────────────────┘
```

### Credentials Architecture

**N8N Credentials (encrypted at rest):**
- `TEVI Account` — email + password
- `VPS SSH/SFTP` — host, user, password/key
- `Google Drive OAuth2` — Client ID + Secret + Redirect URI
- `Email SMTP` — host, port, user, password
- `AI Service` — API keys array (round-robin)

**N8N Variables (editable in UI):**
- `VPS_UPLOAD_DIR` — path to upload queue on VPS
- `VPS_ARCHIVE_DIR` — path to archive directory
- `VPS_UPLOAD_URL` — VPS server URL (e.g. `http://13.75.2.24:3004`)
- `VPS_LOCK_FILE` — lock file path
- `NOTIFY_EMAIL` — notification email address
- `CRON_SCHEDULE` — cron expression (default: `0 * * * *`)

**VPS Files (managed via N8N Config Workflow):**
- `config.json` — categories, folders, captions, rotation
- `state.json` — cycle index, skip counts
- `.caption_cache.json` — AI caption cache (24h TTL)

**Zero credentials in code. Zero credentials in workflow JSON exports. All secrets in N8N Credentials.**

---

## Phase 1: Config System

### 1.1 Config Files on VPS

| File | Location | Purpose | Managed by |
|------|----------|---------|------------|
| `config.json` | `{VPS_UPLOAD_DIR}/` | Upload config | Config Workflow |
| `state.json` | `{VPS_UPLOAD_DIR}/` | Rotation state | Main Workflow |
| `.caption_cache.json` | `{VPS_ARCHIVE_DIR}/` | AI caption cache | Main Workflow |
| `state.json.lock` | `{VPS_UPLOAD_DIR}/` | Concurrency lock | Main Workflow |

### 1.2 config.json Schema (v3)

```json
{
  "version": 3,
  "rotation": {
    "enabled": true,
    "order": ["photo", "video", "adult"],
    "adultSubRotation": ["hentai", "japanese", "amerika"]
  },
  "categories": [
    {
      "id": "photo",
      "name": "📷 Photo",
      "type": "standard",
      "enabled": true,
      "gdriveFolders": [
        {
          "id": "FOLDER_ID",
          "name": "Album 01",
          "scanSubfolders": true
        }
      ],
      "collection": "Cosplay",
      "audience": "paid",
      "alwaysMembers": false,
      "price": 20,
      "captionSuffix": "Topup Star Tevi di babyval.com",
      "captions": [
        "Love this vibes 💖",
        "New content just for you ✨"
      ],
      "aiTranslate": false
    },
    {
      "id": "video",
      "name": "🎬 Video",
      "type": "standard",
      "enabled": true,
      "gdriveFolders": [
        {
          "id": "FOLDER_ID_SHORT",
          "key": "short",
          "price": 20,
          "indexStart": 1,
          "caption": "Video Pribadi short ke {n}\n\n-VCS DM Tevi-\n\n{captionSuffix}"
        }
      ],
      "collection": "Streaming Challenge",
      "audience": "paid",
      "alwaysMembers": false,
      "captionSuffix": "Topup Star Tevi di babyval.com",
      "aiTranslate": false
    },
    {
      "id": "adult",
      "name": "🔞 Adult",
      "type": "adult",
      "enabled": true,
      "audience": "paid",
      "alwaysMembers": true,
      "captionSuffix": "Topup Star Tevi di babyval.com",
      "captions": [
        "🔞 18+ Content\n\nTopup Star Tevi di babyval.com"
      ],
      "aiTranslate": true,
      "aiPrompt": "Translate to Bahasa Indonesia. Short, natural, max 10 words. No emojis.",
      "subTypes": [
        {
          "id": "hentai",
          "name": "Hentai",
          "enabled": true,
          "gdriveFolders": [
            { "id": "HENTAI_FOLDER_ID", "price": 10 }
          ],
          "collection": "Hentai",
          "aiTranslate": true
        },
        {
          "id": "japanese",
          "name": "Japanese",
          "enabled": true,
          "gdriveFolders": [
            { "id": "JAPANESE_FOLDER_ID", "price": 10 }
          ],
          "collection": "Japanese",
          "aiTranslate": true
        },
        {
          "id": "amerika",
          "name": "Amerika",
          "enabled": true,
          "gdriveFolders": [
            { "id": "AMERIKA_FOLDER_ID", "price": 10 }
          ],
          "collection": "Amerika",
          "aiTranslate": true
        }
      ]
    }
  ]
}
```

**Note**: AI settings (`endpoint`, `model`, `maxTokens`, `retryAttempts`, `cacheTTLHours`) are NOT stored in config.json. They are stored in N8N Variables (`AI_ENDPOINT`, `AI_MODEL`, etc.) to keep config.json safe to version-control.

### 1.3 config.json Fields Detail

#### Rotation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | Yes | Must be `3`. Workflow validates before parsing. |
| `rotation.enabled` | boolean | Yes | Enable/disable rotation entirely |
| `rotation.order[]` | array | Yes | Category IDs in rotation order |
| `rotation.adultSubRotation[]` | array | No | Sub-type IDs for adult category rotation |

#### Category (standard type)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID. Alphanumeric + underscore. Max 30 chars. |
| `name` | string | Yes | Display name for UI |
| `type` | string | Yes | `"standard"` or `"adult"` |
| `enabled` | boolean | Yes | Whether this category is active |
| `gdriveFolders[]` | array | Yes | At least 1 folder required |
| `gdriveFolders[].id` | string | Yes | Google Drive folder ID |
| `gdriveFolders[].scanSubfolders` | boolean | No | Photo only: list subfolders then files |
| `gdriveFolders[].key` | string | No | Video only: short/medium/dance |
| `gdriveFolders[].price` | integer | No | Override default price for this folder |
| `gdriveFolders[].indexStart` | integer | No | Video only: starting upload number |
| `gdriveFolders[].caption` | string | No | Video only: template with `{n}` for index |
| `collection` | string | No | TEVI collection name |
| `audience` | string | No | `"free"` or `"paid"` (default: `"paid"`) |
| `alwaysMembers` | boolean | No | Force members-only (default: `false`) |
| `price` | integer | No | Default price in stars (default: `10`) |
| `captionSuffix` | string | No | Suffix appended to all captions |
| `captions[]` | array | No | Random caption pool (used if `aiTranslate: false`) |
| `aiTranslate` | boolean | No | Use AI caption translation (default: `false`) |

#### Category (adult type)

Same as standard, PLUS:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subTypes[]` | array | Yes | At least 1 sub-type required |
| `subTypes[].id` | string | Yes | Sub-type identifier (unique within adult) |
| `subTypes[].name` | string | Yes | Display name |
| `subTypes[].enabled` | boolean | Yes | Whether this sub-type is active |
| `subTypes[].gdriveFolders[]` | array | Yes | Folders for this sub-type |
| `subTypes[].collection` | string | No | Override parent collection |
| `subTypes[].price` | integer | No | Override parent price |
| `subTypes[].aiTranslate` | boolean | No | Override parent setting |
| `subTypes[].aiPrompt` | string | No | Override parent AI prompt |

**Inheritance rules** (adult → sub-type):
- Inherited: `audience`, `alwaysMembers`, `captionSuffix`, `captions[]`
- Can override: `gdriveFolders[]`, `collection`, `price`, `aiTranslate`, `aiPrompt`

### 1.4 state.json Schema

```json
{
  "cycleIndex": 2,
  "adultSubCycleIndex": 0,
  "categorySkipCount": {
    "photo": 0,
    "video": 3,
    "adult": 0
  },
  "lastRun": "2026-07-14T10:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cycleIndex` | integer | Current index into `rotation.order[]`. Next category = `enabled[cycleIndex]`. |
| `adultSubCycleIndex` | integer | Current index into `adultSubRotation[]` |
| `categorySkipCount{}` | object | Consecutive skip count per category ID. Resets on successful upload. |
| `lastRun` | ISO string | Timestamp of last workflow run |

### 1.5 Rotation Logic

```
Every cron trigger:

1. Read state.json
2. Get enabled categories in rotation order
   enabledCategories = rotation.order.filter(id => categories[id].enabled)

3. If enabledCategories is empty:
   → STOP + Notify "No categories enabled"

4. Normal rotation:
   currentIndex = state.cycleIndex
   nextIndex = (currentIndex + 1) % enabledCategories.length
   selectedCategoryId = enabledCategories[nextIndex]
   state.cycleIndex = nextIndex

5. Adult sub-rotation:
   If selectedCategory.type === "adult":
     enabledSubTypes = adult.subTypes.filter(st => st.enabled)
     subIndex = state.adultSubCycleIndex % enabledSubTypes.length
     selectedSubType = enabledSubTypes[subIndex]
     state.adultSubCycleIndex = (subIndex + 1) % enabledSubTypes.length

6. Skip check:
   If categorySkipCount[selectedId] >= 3:
     → Skip this category (try next)
     → Increment skip count for next in line
     → Send notify "Category skipped (empty folder)"

7. Save state.json → state.json.lock (atomic rename)
8. Continue with selected category
```

### 1.6 Config Validation Rules

```javascript
// 1. Version
if (config.version !== 3) { throw new Error('CONFIG_VERSION_MISMATCH'); }

// 2. Category ID uniqueness
const ids = config.categories.map(c => c.id);
if (new Set(ids).size !== ids.length) { throw new Error('DUPLICATE_CATEGORY_ID'); }

// 3. Category ID format
for (const id of ids) {
  if (!/^[a-z0-9_]{1,30}$/.test(id)) {
    throw new Error('INVALID_CATEGORY_ID: ' + id);
  }
}

// 4. Sub-type ID uniqueness within adult
for (const cat of config.categories) {
  if (cat.type === 'adult') {
    const subIds = cat.subTypes.map(st => st.id);
    if (new Set(subIds).size !== subIds.length) {
      throw new Error('DUPLICATE_SUBTYPE_ID in ' + cat.id);
    }
  }
}

// 5. At least one folder per category
for (const cat of config.categories) {
  const folders = cat.type === 'adult'
    ? cat.subTypes.flatMap(st => st.gdriveFolders)
    : cat.gdriveFolders;
  if (folders.length === 0) { throw new Error('NO_FOLDER_IN_CATEGORY: ' + cat.id); }
}

// 6. At least one active sub-type for adult
for (const cat of config.categories) {
  if (cat.type === 'adult') {
    const enabledSubTypes = cat.subTypes.filter(st => st.enabled);
    if (enabledSubTypes.length === 0 && cat.enabled) {
      throw new Error('NO_ACTIVE_SUBTYPE_IN_ADULT: ' + cat.id);
    }
  }
}

// 7. Max 10 categories
if (config.categories.length > 10) { throw new Error('MAX_CATEGORIES_EXCEEDED'); }

// 8. At least one category enabled
const enabledCats = config.categories.filter(c => c.enabled);
if (enabledCats.length === 0) { throw new Error('NO_CATEGORY_ENABLED'); }
```

### 1.7 Config Version Migration (v2 → v3)

When Config Workflow detects `version !== 3`, it migrates automatically.

See `phases.md` Phase 2.4 for the complete migration code.

---

## Phase 2: AI Caption Translation System

### 2.1 Overview

AI Caption translates JAV content filenames to Indonesian captions using a 5-layer pipeline.

```
INPUT: "Uncen JAV Idol Massage Oil HD.mp4"
  │
  ▼
LAYER 1: Indonesian Word Replacement (bypass content policy)
  mastrubate → colmek, breasts → dada, sex → seks
  → "JAV Idol Massage Oil"
  │
  ▼
LAYER 2: AI Translation (Olagon Gateway via N8N AI Credential)
  → "Pijat Oil Idol JAV"
  │
  ▼
LAYER 3: Adult Word Injection (restore Indonesian adult terms)
  → "Pijat Oil Idol JAV"
  │
  ▼
LAYER 4: Fallback Chain
  Layer 2 fails → retry with English filename
  Both fail → "Video dewasa JAV {cleaned}"
  │
  ▼
LAYER 5: Caching (VPS file, 24h TTL)
  Same file + folder → instant, no API call
```

### 2.2 Indonesian Word Replacement Map

Applied BEFORE AI call to bypass content policy.

| English | Indonesian | English | Indonesian |
|---------|------------|---------|------------|
| masturbate | colmek | pussy | memek |
| breasts | dada | teen | remaja |
| sex | seks | naked | telanjang |
| dick | kontol | big | besar |
| fuck | main | ass | bokong |
| rough | main | hardcore | main |

See `phases.md` Section 4.1 for the complete word map (~40 words).

### 2.3 AI Credential Architecture

**AI API keys are stored in N8N Credential "AI Service" only.**
No API keys in config.json, workflow JSON, or server.js.

The N8N Code node reads keys via `$credentials.aiService?.keys`.

AI settings that ARE safe in config.json:
- `aiTranslate` (boolean per category)
- `aiPrompt` (string per sub-type)

AI settings that are N8N Variables (NOT in config.json):
- `AI_ENDPOINT` — API endpoint URL
- `AI_MODEL` — model name (e.g. `claude-sonnet-4-6`)
- `AI_MAX_TOKENS` — max tokens (default: 200)
- `AI_RETRY_ATTEMPTS` — retries (default: 3)
- `AI_CACHE_TTL_HOURS` — cache TTL (default: 24)

This separation ensures config.json is safe to commit to git.

### 2.4 Caption Template Per Type

```javascript
function buildCaption(type, subType, translatedText, captionSuffix) {
  const suffix = captionSuffix ? `\n\n${captionSuffix}` : '';
  if (type === 'adult') {
    switch (subType) {
      case 'japanese': return `(JAV) ${translatedText}${suffix}`;
      case 'amerika':  return `[Amerika] ${translatedText}${suffix}`;
      default:         return `${translatedText}${suffix}`;
    }
  }
  return `${translatedText}${suffix}`;
}
```

---

## Phase 3: N8N Main Workflow

### 3.1 Workflow: tevi-upload-main.json

**Trigger**: Schedule — cron from N8N Variable `CRON_SCHEDULE` (default: `0 * * * *` = every hour)

### Node List

| # | Name | Type | Notes |
|---|------|------|-------|
| 1 | Every Hour | Schedule Trigger | Reads `CRON_SCHEDULE` from N8N Variables |
| 2 | Download State | SFTP Download | |
| 3 | Read Config | SFTP Download | |
| 4 | Validate Version | Code | Check `version === 3` |
| 5 | Calculate Rotation | Code | Determines next category |
| 6 | No Category Enabled? | IF | Stop if none enabled |
| 7 | Acquire Lock | SFTP Rename | Atomic: `state.json` → `state.json.lock` |
| 8 | Lock Failed? | IF | If rename fails → another run → Stop |
| 9 | Save State | SFTP Upload | Increment cycle, save state.json |
| 10 | List GDrive Files | Loop Over Items | For each folder in category |
| 11 | Files Found? | IF | If empty → Skip + Release Lock |
| 12 | Random Pick | Code | Pick 1 random file |
| 13 | Download File | Google Drive | Download as binary |
| 14 | SFTP Upload | SFTP | Upload binary to VPS |
| 15 | Build Payload | Code | Assemble all fields for VPS |
| 16 | AI Caption? | IF | If aiTranslate → generate |
| 17 | Generate AI Caption | Code | 5-layer pipeline (see phases.md) |
| 18 | Random Caption? | IF | Else → random from pool |
| 19 | Pick Random Caption | Code | |
| 20 | Apply Index | Code | Replace `{n}` with upload index |
| 21 | Upload to VPS | HTTP Request | POST /upload, 600s timeout |
| 22 | Upload Success? | IF | Check `success === true` |
| 23 | Archive File | SFTP Rename | Move to archive |
| 24 | FIFO Cleanup | SFTP Execute | Keep 10 newest |
| 25 | Reset Skip Count | Code | Set `categorySkipCount[id] = 0` |
| 26 | Notify Success | Email | Success + post URL |
| 27 | Release Lock | SFTP Delete | Always runs |
| 28 | Notify Skip | Email | Folder empty |
| 29 | Increment Skip Count | Code | `categorySkipCount[id]++` |
| 30 | Notify Failure | Email | Error + reason |
| 31 | Release Lock (error) | SFTP Delete | On Error Trigger |

### 3.2 Lock Mechanism (Atomic)

```
Workflow A:                            Workflow B:
SFTP Rename state.json → state.json.lock
                                       SFTP Rename state.json → state.json.lock
                                       → FAILS (file exists)
                                       → STOP + Notify "Lock failed"
SFTP Upload state.json
SFTP Upload / delete file
SFTP Delete state.json.lock
END
```

### 3.3 N8N Credentials Reference

| Credential Name | Type | Fields | Stored Where |
|-----------------|------|--------|--------------|
| `TEVI Account` | Custom | `email`, `password` | N8N (encrypted) |
| `VPS SSH/SFTP` | SSH/SFTP | `host`, `port`, `username`, `password` | N8N (encrypted) |
| `Google Drive` | Google Drive | OAuth2 Client ID + Secret | N8N (encrypted) |
| `Email SMTP` | SMTP | `host`, `port`, `user`, `password` | N8N (encrypted) |
| `AI Service` | Custom | `keys` (array of API key strings) | N8N (encrypted) |

When you export the workflow JSON, credential IDs are included but **not the actual values**. Values stay in the N8N database. Anyone importing the workflow must create their own credentials.

---

## Phase 4: N8N Config Workflow

### 4.1 Workflow: tevi-upload-config.json

**Trigger**: Manual (Test Step button) or Webhook

### 4.2 Node List

| # | Name | Type | Description |
|---|------|------|-------------|
| 1 | Manual Trigger | Manual Trigger | Runs on demand |
| 2 | Download Config | SFTP Download | Load existing config.json |
| 3 | Config Form | Form Node | User-friendly HTML form |
| 4 | Detect Action | Code | Parse form action |
| 5 | Validate Form | Code | Validate required fields |
| 6 | Migration Check | Code | If version !== 3 → migrate |
| 7 | Apply Changes | Code | CRUD operations |
| 8 | Validate Config | Code | All 8 validation rules |
| 9 | Preview JSON | Code | Formatted JSON |
| 10 | User Confirmed? | IF | If confirmed → save |
| 11 | Upload Config | SFTP Upload | Write to VPS |
| 12 | Verify Upload | SFTP Download | Re-download and verify |
| 13 | Notify | Email | Send confirmation |

### 4.3 Config Form UI

The form is designed for non-coders. All actions are dropdown-based with clear labels.

**Main view:**
- Current categories shown as cards with status badges
- Action buttons: Edit / Disable / Enable / Delete per category
- [+ Add Category] button for new entries
- AI Settings section (toggle, prompt text area)
- [Preview JSON] button — shows JSON before saving
- [Save to VPS] button — uploads to VPS

**Add/Edit Category:**
- All fields are form inputs with labels
- GDrive Folder ID has "Test Connection" button
- Validation errors shown inline next to the field
- Preview updates in real-time

See `phases.md` Section 2.4 for complete form field reference.

---

## Phase 5: VPS Upload Executor (server.js)

### 5.1 Dependencies

```json
{
  "express": "^4.18.0",
  "playwright": "^1.40.0",
  "cors": "^2.8.5"
}
```

### 5.2 Endpoints

#### `POST /upload`

**Request body** (all fields from N8N):
```json
{
  "email": "tevi@email.com",
  "password": "tevi_password",
  "filePath": "/home/user/tevi-uploads/video.mp4",
  "caption": "Video Pribadi short ke 14\n\n-VCS DM Tevi-\n\nTopup Star Tevi di babyval.com",
  "collection": "Streaming Challenge",
  "audienceFree": false,
  "audiencePaid": true,
  "audiencePrice": 20,
  "audienceMembership": false,
  "alwaysMembers": false,
  "nsfw": false,
  "type": "video",
  "sourceFolderId": "FOLDER_ID"
}
```

**Success (HTTP 200):**
```json
{ "success": true, "uploaded": true, "file": "video.mp4",
  "url": "https://tevi.com/@channel/post/abc123" }
```

**Error (HTTP 200):**
```json
{ "success": false, "reason": "login_failed",
  "step": "login", "detail": "UID not found after 60s" }
```

#### `GET /health`

```json
{ "status": "ok", "uptime": 12345, "browser": "chromium", "version": "3.1" }
```

### 5.3 Error Reasons

| reason | step | Keterangan |
|--------|------|------------|
| `login_failed` | login | UID not found after 60s |
| `create_btn_not_clicked` | create | #nav-create-btn not found |
| `post_form_not_visible` | create | Post form not appeared after 45s |
| `file_not_selected` | upload | File chooser failed |
| `file_not_found` | upload | File at filePath does not exist |
| `unsupported_format` | upload | TEVI rejected file format |
| `post_unverified` | verify | Dialog not closed after timeout |
| `upload_error` | server | Browser crash or internal error |

---

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-07-14 | v1 | Initial PRD |
| 2026-07-14 | v2 | Full audit fix + Config system + AI section |
| 2026-07-14 | v3 | Flexible category system |
| 2026-07-14 | **v3.1** | **Audit fixes** |
| | | — AI endpoint/model moved from config.json → N8N Variables |
| | | — Removed hardcoded SFTP credentials from phases.md |
| | | — Config Form simplified, validation feedback added |
| | | — Clarified "zero creds" = N8N Credential (encrypted) |
| | | — N8N Variables for all paths + AI settings |
| | | — Cron schedule configurable via N8N Variable |
| | | — phases.md is implementation guide (source of truth) |

---

## File Structure

```
tevi-upload/
├── server.js                     # VPS executor
├── ecosystem.json               # PM2 config
├── package.json
├── .env.example                 # Template — NO real values
├── .gitignore
├── LICENSE
├── README.md
├── PRD.md                       # This document (technical spec)
├── phases.md                   # Implementation guide (detailed steps)
├── n8n-workflow/
│   ├── tevi-upload-main.json   # Main workflow
│   └── tevi-upload-config.json  # Config editor workflow
└── docs/
    ├── SETUP.md
    ├── TEVISETUP.md
    ├── GDRIVESETUP.md
    ├── CONFIG.md
    ├── AI.md
    └── TROUBLESHOOT.md
```
