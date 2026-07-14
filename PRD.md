# PRD: TEVI Upload System — N8N + VPS

> Self-hosted automation for uploading content to TEVI.com. Generic, scalable, fully configurable via N8N UI. No code editing required.

**Version**: 3.0 — Flexible Category System
**Status**: Implementation ready

---

## Overview

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  N8N (Brain)                                                   │
│  ├── Schedule trigger (cron)                                     │
│  ├── SFTP: download state.json (cycle state)                   │
│  ├── SFTP: download config.json (upload config)                 │
│  ├── SFTP: acquire lock (atomic rename)                         │
│  ├── GDrive: list files from category folders                   │
│  ├── Random pick + per-folder metadata                           │
│  ├── GDrive: download selected file                             │
│  ├── AI caption generation (adult content)                      │
│  ├── SFTP: upload file to VPS                                  │
│  ├── HTTP: POST /upload to VPS (Playwright)                    │
│  ├── SFTP: archive file + FIFO cleanup                         │
│  ├── SFTP: release lock                                         │
│  └── Email: notify success/failure/skip                        │
└────────────────────────────┬─────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  VPS (Executor)                                                │
│  POST /upload — Playwright automation                           │
│  GET  /health — health check                                  │
│  Stores: config.json, state.json, .caption_cache.json           │
│  Stores: .tevi-upload.lock                                     │
└──────────────────────────────────────────────────────────────┘
```

### Credentials Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  N8N Credentials (encrypted)                                    │
│  ├── TEVI Account     → email + password                     │
│  ├── VPS SSH/SFTP     → host, user, password or key          │
│  ├── Google Drive     → OAuth2 API (Client ID + Secret)      │
│  ├── Email SMTP       → host, port, user, password            │
│  └── AI Service       → API keys (round-robin)                │
└──────────────────────────────────────────────────────────────┘
│  N8N Variables (editable in N8N UI Settings)                   │
│  ├── VPS_UPLOAD_DIR                                        │
│  ├── VPS_ARCHIVE_DIR                                        │
│  ├── VPS_UPLOAD_URL                                         │
│  ├── VPS_LOCK_FILE                                          │
│  └── NOTIFY_EMAIL                                           │
└──────────────────────────────────────────────────────────────┘
│  VPS Files (managed via N8N Config Workflow)                   │
│  ├── config.json        → categories, folders, captions       │
│  ├── state.json         → cycle, subCycle, skip counts        │
│  └── .caption_cache.json → AI translation cache (24h TTL)     │
└──────────────────────────────────────────────────────────────┘
```

**Zero credentials in code. Zero credentials in workflow JSON.**

---

## Phase 1: Config System

### 1.1 Config Files on VPS

| File | Location | Purpose | Managed by |
|------|----------|---------|------------|
| `config.json` | `{VPS_UPLOAD_DIR}/` | Upload config | Config Workflow |
| `state.json` | `{VPS_UPLOAD_DIR}/` | Rotation state | Main Workflow |
| `.caption_cache.json` | `{VPS_ARCHIVE_DIR}/` | AI caption cache | Main Workflow |
| `.tevi-upload.lock` | `{VPS_UPLOAD_DIR}/` | Concurrency lock | Main Workflow |

---

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
        },
        {
          "id": "FOLDER_ID_2",
          "name": "Album 02",
          "scanSubfolders": false
        }
      ],
      "collection": "Cosplay",
      "audience": "paid",
      "alwaysMembers": false,
      "price": 20,
      "captionSuffix": "Topup Star Tevi di babyval.com",
      "captions": [
        "Love this vibes 💖",
        "New content just for you ✨",
        "Double tap if you love it ❤️"
      ],
      "aiTranslate": false,
      "filenamePriceOverride": {
        "lips reveal": { "price": 100, "nsfw": true, "label": "lips_100" }
      }
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
        },
        {
          "id": "FOLDER_ID_MEDIUM",
          "key": "medium",
          "price": 40,
          "indexStart": 1,
          "caption": "Video Pribadi medium ke {n}\n\n-VCS DM Tevi-\n\n{captionSuffix}"
        },
        {
          "id": "FOLDER_ID_DANCE",
          "key": "dance",
          "price": 10,
          "indexStart": 1,
          "caption": "Sexy dance video ke {n}\n\n-VCS DM Tevi-\n\n{captionSuffix}"
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
  ],
  "ai": {
    "enabled": true,
    "endpoint": "https://gateway.olagon.site/anthropic/v1/messages",
    "model": "claude-sonnet-4-6",
    "maxTokens": 200,
    "retryAttempts": 3,
    "cacheTTLHours": 24
  }
}
```

---

### 1.3 config.json Fields Detail

#### Rotation

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | Yes | Must be `3`. Workflow validates before parsing. |
| `rotation.enabled` | boolean | Yes | Enable/disable rotation entirely |
| `rotation.order[]` | array | Yes | Category IDs in rotation order. Empty = no rotation (first category only). |
| `rotation.adultSubRotation[]` | array | No | Sub-type IDs for adult category rotation |

#### Category (standard type)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier. Alphanumeric + underscore. Max 30 chars. |
| `name` | string | Yes | Display name for UI |
| `type` | string | Yes | `"standard"` or `"adult"` |
| `enabled` | boolean | Yes | Whether this category is active |
| `gdriveFolders[]` | array | Yes | At least 1 folder required |
| `gdriveFolders[].id` | string | Yes | Google Drive folder ID |
| `gdriveFolders[].name` | string | No | Display name (for subfolders) |
| `gdriveFolders[].scanSubfolders` | boolean | No | Photo only: list subfolders then files |
| `gdriveFolders[].key` | string | No | Video only: short/medium/dance |
| `gdriveFolders[].price` | integer | No | Override default price for this folder |
| `gdriveFolders[].indexStart` | integer | No | Video only: starting upload number for this folder |
| `gdriveFolders[].caption` | string | No | Video only: template with `{n}` for index |
| `collection` | string | No | TEVI collection name |
| `audience` | string | No | `"free"` or `"paid"` (default: `"paid"`) |
| `alwaysMembers` | boolean | No | Force members-only (default: `false`) |
| `price` | integer | No | Default price in stars (default: `10`) |
| `captionSuffix` | string | No | Suffix appended to all captions |
| `captions[]` | array | No | Random caption pool (used if `aiTranslate: false`) |
| `aiTranslate` | boolean | No | Use AI caption translation (default: `false`) |
| `filenamePriceOverride{}` | object | No | Photo only: price override by filename keyword (case-insensitive) |

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
- Inherited from parent: `audience`, `alwaysMembers`, `captionSuffix`, `captions[]`
- Can override: `gdriveFolders[]`, `collection`, `price`, `aiTranslate`, `aiPrompt`

#### AI Settings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ai.enabled` | boolean | No | Global AI toggle (default: `false`) |
| `ai.endpoint` | string | No | AI API endpoint |
| `ai.model` | string | No | Model name |
| `ai.maxTokens` | integer | No | Max tokens (default: `200`) |
| `ai.retryAttempts` | integer | No | Max retries per AI call (default: `3`) |
| `ai.cacheTTLHours` | integer | No | Cache TTL in hours (default: `24`) |

**API Keys**: Stored in N8N Credential "AI Service" (not in config.json). Referenced via `$credentials.aiService`.

---

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

**Note**: `cycleIndex` and `adultSubCycleIndex` are **indices**, not values. They point to position in the enabled array.

---

### 1.5 Rotation Logic

```
Every cron trigger (per hour):

1. Read state.json
2. Get enabled categories in rotation order
   enabledCategories = rotation.order.filter(id => categories[id].enabled)

3. If enabledCategories is empty:
   → STOP + Notify "No categories enabled"

4. If rotation.order is empty:
   → Always select first enabled category

5. Normal rotation:
   currentIndex = state.cycleIndex
   nextIndex = (currentIndex + 1) % enabledCategories.length
   selectedCategoryId = enabledCategories[nextIndex]
   state.cycleIndex = nextIndex

6. Adult sub-rotation:
   If selectedCategory.type === "adult":
     enabledSubTypes = adult.subTypes.filter(st => st.enabled)
     If enabledSubTypes is empty:
       → Treat adult as standard (no sub-rotation)
     Else:
       subIndex = state.adultSubCycleIndex % enabledSubTypes.length
       selectedSubType = enabledSubTypes[subIndex]
       state.adultSubCycleIndex = (subIndex + 1) % enabledSubTypes.length

7. Skip check:
   If categorySkipCount[selectedId] >= SKIP_THRESHOLD (default: 3):
     → Skip this category (increment index again)
     → Send notify "Category skipped (too many empty folders)"
     → Increment skip count for next in line

8. Save state.json
9. Continue with selected category
```

**Skip Threshold**: After 3 consecutive skips, the category is deprioritized for one cycle. This prevents spam notifications for permanently empty folders.

---

### 1.6 Config Validation Rules

Before saving config.json, the Config Workflow validates:

```javascript
// 1. Version
if (config.version !== 3) {
  throw new Error('CONFIG_VERSION_MISMATCH');
}

// 2. Category ID uniqueness
const ids = config.categories.map(c => c.id);
if (new Set(ids).size !== ids.length) {
  throw new Error('DUPLICATE_CATEGORY_ID');
}

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
  if (folders.length === 0) {
    throw new Error('NO_FOLDER_IN_CATEGORY: ' + cat.id);
  }
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
if (config.categories.length > 10) {
  throw new Error('MAX_CATEGORIES_EXCEEDED');
}

// 8. At least one category enabled
const enabledCats = config.categories.filter(c => c.enabled);
if (enabledCats.length === 0) {
  throw new Error('NO_CATEGORY_ENABLED');
}
```

---

### 1.7 Config Version Migration (v2 → v3)

When Config Workflow detects `version !== 3`:

```javascript
async function migrateFromV2(v2Config) {
  const v3 = {
    version: 3,
    rotation: {
      enabled: true,
      order: [],
      adultSubRotation: ["hentai", "japanese", "amerika"]
    },
    categories: []
  };

  // Map v2 root keys to v3 categories
  const v2KeyMap = {
    photo: { type: 'standard', name: '📷 Photo' },
    video: { type: 'standard', name: '🎬 Video' },
    hentai: { type: 'adult', name: '🔞 Hentai', subTypeId: 'hentai' },
    japanese: { type: 'adult', name: '🔞 Japanese', subTypeId: 'japanese' },
    amerika: { type: 'adult', name: '🔞 Amerika', subTypeId: 'amerika' }
  };

  for (const [key, value] of Object.entries(v2Config)) {
    if (!v2KeyMap[key] || !value) continue;
    const meta = v2KeyMap[key];

    v3.rotation.order.push(key);

    if (meta.type === 'standard') {
      v3.categories.push({
        id: key,
        name: meta.name,
        type: 'standard',
        enabled: true,
        ...value
      });
    } else {
      // Adult: add to adult category or create adult category
      let adultCat = v3.categories.find(c => c.id === 'adult');
      if (!adultCat) {
        adultCat = {
          id: 'adult',
          name: '🔞 Adult',
          type: 'adult',
          enabled: true,
          audience: 'paid',
          alwaysMembers: true,
          captionSuffix: value.captionSuffix || '',
          captions: [],
          aiTranslate: true,
          subTypes: []
        };
        v3.categories.push(adultCat);
      }
      adultCat.subTypes.push({
        id: meta.subTypeId,
        name: meta.name,
        enabled: true,
        gdriveFolders: (value.gdriveFolders || []).map(id => ({ id, price: value.price || 10 })),
        collection: value.collection,
        aiTranslate: value.aiTranslate || false
      });
    }
  }

  // Add ai section from v2
  if (v2Config.ai) {
    v3.ai = v2Config.ai;
  }

  return v3;
}
```

---

## Phase 2: AI Caption Translation System

### 2.1 Overview

AI Caption System translates JAV content filenames to Indonesian captions using a 5-layer pipeline designed to bypass AI content policy for adult content.

```
┌─────────────────────────────────────────────────────────────┐
│  INPUT: filename                                             │
│  "Uncen JAV Idol Massage Oil HD.mp4"                         │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Indonesian Word Replacement (before AI)            │
│  mastrubate → colmek                                        │
│  breasts → dada                                              │
│  sex → seks                                                 │
│  teen → remaja                                               │
│  big → besar                                                 │
│  ... (30+ word map)                                           │
│  → "Uncen JAV Idol Massage Oil" (bypass content policy)      │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: AI Translation (Olagon Gateway)                    │
│  Model: claude-sonnet-4-6                                     │
│  Prompt: "Translate to Bahasa Indonesia. Short, natural..."    │
│  Parse response: 4 strategies (see 2.4)                      │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Adult Word Injection (after AI)                    │
│  Check original filename for English adult words              │
│  Replace translated words with Indonesian equivalents          │
│  "Massage" (English) → "Pijat"                               │
│  → "Pijat Oil" (Indonesian)                                 │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: Fallback Chain                                     │
│  Layer 2 fails → retry Layer 2 with English filename          │
│  Both fail → "Video dewasa JAV {cleaned_filename}"           │
│  Still fail → random from captions[] fallback                 │
└──────────────────────────┬──────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5: Caching (VPS file)                                 │
│  Cache key: hash(filename + folderId)                         │
│  TTL: 24 hours (configurable)                                │
│  Re-upload same file → instant (no API call)                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Indonesian Word Replacement Map

Applied BEFORE AI call to bypass content policy.

```javascript
const INDONESIAN_WORD_MAP = {
  // Masturbation
  'masturbate': 'colmek',
  'masturbates': 'colmek',
  'masturbation': 'colmek',
  'masturbating': 'colmek',
  'masturbated': 'colmek',

  // Breasts
  'breasts': 'dada',
  'breast': 'dada',
  'tits': 'dada',
  'tit': 'dada',
  'titties': 'dada',

  // Sex
  'sex': 'seks',
  'sexual': 'seks',

  // Dick/Penis
  'dick': 'kontol',
  'dicks': 'kontol',
  'penis': 'kontol',

  // Fuck
  'fuck': 'main',
  'fucked': 'main',
  'fucking': 'main',
  'fucks': 'main',

  // Teen
  'teen': 'remaja',
  'teens': 'remaja',
  'teenage': 'remaja',

  // Body parts
  'naked': 'telanjang',
  'nude': 'telanjang',
  'big': 'besar',
  'huge': 'besar',
  'ass': 'bokong',
  'asses': 'bokong',

  // Actions
  'rough': 'main',
  'hardcore': 'main',
  'extreme': 'main',
  'group': 'grup',

  // Locations
  'outdoor': 'luar ruangan',
  'public': 'publik',

  // Relationships
  'stepmom': 'ibu tiri',
  'stepmother': 'ibu tiri',
  'stepson': 'anak tiri',
  'step': 'tiri',

  // Other
  'pussy': 'memek',
  'cum': 'mani',
  'cumming': 'keluar',
  'squirt': 'semprot',
  'creampie': 'creampie',
  'virgin': 'perawan',
  'cheating': 'selingkuh',
  'married': 'menikah',
  'wife': 'istri',
  'doctor': 'dokter',
  'nurse': 'perawat',
  'maid': 'pramugari',
  'teacher': 'guru',
  'punishment': 'hukuman',
  'cosplay': 'cosplay',
  'cosplayer': 'cosplayer',
  'idol': 'idol',
  'jav': 'jav',
  'uncensored': '',
  'censored': '',
  'amateur': 'amatir',
  'professional': 'profesional',
};
```

### 2.3 Adult Word Injection Map

Applied AFTER AI translation to restore Indonesian adult terminology.

```javascript
const ADULT_INJECTION_MAP = [
  // [englishPattern, replacementIndonesian]
  [/\bmasturbat\w*/gi, 'colmek'],
  [/\btits?\b/gi, 'dada'],
  [/\bbreasts?\b/gi, 'dada'],
  [/\bass(es)?\b/gi, 'bokong'],
  [/\bsex\b/gi, 'seks'],
  [/\bdick\b/gi, 'kontol'],
  [/\bpenis\b/gi, 'kontol'],
  [/\bfuck\w*\b/gi, 'main'],
  [/\bteen\b/gi, 'remaja'],
  [/\bnaked\b/gi, 'telanjang'],
  [/\bnude\b/gi, 'telanjang'],
  [/\bpussy\b/gi, 'memek'],
  [/\bbig\s+(dick|penis)\b/gi, 'kontol besar'],
  [/\bbig\s+(ass|booty)\b/gi, 'bokong besar'],
  [/\bhuge\s+(ass|booty)\b/gi, 'bokong besar'],
  [/\bhuge\s+(breasts?|tits?)\b/gi, 'dada besar'],
  [/\bbig\b/gi, 'besar'],
  [/\bhuge\b/gi, 'besar'],
  [/\brough\b/gi, 'main'],
  [/\bhardcore\b/gi, 'main'],
  [/\bextreme\b/gi, 'main'],
  [/\bgroup\b/gi, 'grup'],
  [/\boutdoor\b/gi, 'luar ruangan'],
  [/\bpublic\b/gi, 'publik'],
  [/\bstepmom\b/gi, 'ibu tiri'],
  [/\bstepson\b/gi, 'anak tiri'],
  [/\bforbidden\b/gi, 'terlarang'],
  [/\bcheating\b/gi, 'selingkuh'],
  [/\bmarried\s+woman\b/gi, 'wanita menikah'],
  [/\bpunishment\b/gi, 'hukuman'],
  [/\bdiscipline\b/gi, 'disiplin'],
  [/\bdoctor\b/gi, 'dokter'],
  [/\bnurse\b/gi, 'perawat'],
  [/\bmaid\b/gi, 'pramugari'],
  [/\bteacher\b/gi, 'guru'],
];
```

### 2.4 AI Response Parsing

AI responses are parsed using 4 strategies (tried in order):

```javascript
function extractTranslation(text) {
  if (!text) return null;
  const clean = text.replace(/[*_`#]/g, '').trim();

  // Strategy 1: Quoted string
  // "Massage Oil Scene"
  const quotes = [...clean.matchAll(/"([A-Za-z0-9\sÀ-ɏḀ-ỿÀ-ÿ一-鿿]{3,65})"/g)];
  if (quotes.length > 0) {
    const last = quotes[quotes.length - 1][1].trim();
    if (!/translate|should|short|natural|under|within|max|word|keep|help|adult|declin|legitimate|request/i.test(last)) {
      return last;
    }
  }

  // Strategy 2: Bullet points
  // - Massage Oil Scene
  const bullets = [...clean.matchAll(/^[\-\*]\s+(.+)$/gm)];
  if (bullets.length > 0) {
    const last = bullets[bullets.length - 1][1].trim();
    if (!/^the|^and|^jav\s*=|means|translate|refer|adult|porn|genre|search|term|acronym/i.test(last)) {
      return last;
    }
  }

  // Strategy 3: Final answer pattern
  // "Translation is: Massage Oil Scene"
  const final = clean.match(/(?:final answer|translation is|here(?:'s| is) the)[\s:]+"?(.+?)"?\s*$/im);
  if (final) {
    const c = final[1].trim();
    if (!/translate|should|declin/i.test(c) && c.length > 3) return c;
  }

  // Strategy 4: Indonesian sentences
  // Finds the last meaningful Indonesian sentence
  const sentences = clean.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 4 && s.length < 70);

  // Known Indonesian words (not English translated content)
  const ID_KNOWN = /^(javan|idol|jav|cosplay|maid|onsen|kompilasi|video|dewasa|cewek|gadis|perawat|seksi|seragam|bokong|pantat|dada|kontol|alat|vital|colmek|masturbasi|anal|seks|main|grup|publik|remaja|muda|telanjang|intim|vaginal|orgasme|memek|besar|kecil|luar|dalam|ranjang|kamar|pakai|sendiri|seksi|pantai|liburan|ibu|tiri|anak|hukuman|disiplin|terlarang|daging|wanita|menikah|selingkuh|koleksi|adegan|dokter|medis|konten|bugil|porno|oil|massage|hot|cool|new|latest)$/i;

  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    // Skip English-heavy sentences
    if (/^(the|and|but|so|however|actually|let me|this|user|looking|need|for translation|keeping|short|natural|under|within|max|word|keep|help|legitimate|abbreviation|genre|type|category|search|term|adult|explicit|pornograph)/i.test(s)) continue;
    // Check if mostly English
    const words = s.split(/\s+/);
    const englishOnly = words.filter(w => /^[A-Za-z]{4,}$/.test(w) && !ID_KNOWN.test(w));
    if (englishOnly.length > words.length * 0.6) continue;
    const c = s.replace(/^["'\-*>\s]+/, '').replace(/["'\s]+$/, '').trim();
    if (c.length > 3) return c;
  }

  return null;
}
```

### 2.5 Caption Template Per Type

```javascript
function buildCaption(type, subType, translatedText, captionSuffix) {
  switch (type) {
    case 'adult':
      switch (subType) {
        case 'japanese':
          return `(JAV) ${translatedText}\n\n${captionSuffix}`;
        case 'amerika':
          return `[Amerika] ${translatedText}\n\n${captionSuffix}`;
        case 'hentai':
        default:
          return `${translatedText}\n\n${captionSuffix}`;
      }
    case 'photo':
      // Photo uses album name + index from folder
      return `${translatedText} - ALBUM PRIBADI\n\n${captionSuffix}`;
    default:
      return `${translatedText}\n\n${captionSuffix}`;
  }
}
```

### 2.6 AI Caption Cache

Stored on VPS at `{VPS_ARCHIVE_DIR}/.caption_cache.json`.

```json
{
  "entries": {
    "hash(filename+folderId)": {
      "caption": "Translated caption...",
      "cachedAt": "2026-07-14T10:00:00.000Z"
    }
  }
}
```

```javascript
async function getCachedCaption(filename, folderId) {
  const cache = await sftpDownload('.caption_cache.json');
  if (!cache || !cache.entries) return null;

  const key = hash(`${filename}_${folderId}`);
  const entry = cache.entries[key];

  if (!entry) return null;

  const ttlMs = (ai.cacheTTLHours || 24) * 60 * 60 * 1000;
  if (Date.now() - new Date(entry.cachedAt).getTime() > ttlMs) {
    delete cache.entries[key];
    await sftpUpload('.caption_cache.json', cache);
    return null;
  }

  return entry.caption;
}

async function setCachedCaption(filename, folderId, caption) {
  const cache = await sftpDownload('.caption_cache.json') || { entries: {} };
  const key = hash(`${filename}_${folderId}`);
  cache.entries[key] = {
    caption,
    cachedAt: new Date().toISOString()
  };
  await sftpUpload('.caption_cache.json', cache);
}
```

---

### 2.7 AI Caption Node (N8N Code)

```javascript
// Node: AI Caption Generator
// Input: filename, folderId, type, subType, aiConfig, captionSuffix
// Output: { caption: string, usedCache: boolean }

const { filename, folderId, type, subType, aiConfig, captionSuffix } = $input.first().json;

// Skip if not adult type
if (!aiConfig?.enabled) {
  return { caption: captionSuffix, usedCache: false };
}
if (type !== 'adult' || !subType) {
  return { caption: captionSuffix, usedCache: false };
}

// 1. Check cache
const cached = await getCachedCaption(filename, folderId);
if (cached) {
  return { caption: cached, usedCache: true };
}

// 2. Clean filename
const clean = cleanFilename(filename);

// 3. Layer 1: Indonesian word replacement
const indoVersion = replaceIndonesian(clean);

// 4. Layer 2: AI Translation (Indonesian first, then English fallback)
let translated = await aiTranslate(indoVersion, aiConfig);

if (!translated || translated === '__FAILED__') {
  translated = await aiTranslate(clean, aiConfig);
}

if (!translated || translated === '__FAILED__') {
  // Layer 4: Fallback
  translated = `${type === 'adult' && subType ? subType.toUpperCase() : 'Video'} dewasa ${indoVersion}`;
}

// 5. Layer 3: Adult word injection
translated = injectAdultWords(translated, clean);

// 6. Build caption
const finalCaption = buildCaption(type, subType, translated, captionSuffix);

// 7. Cache
await setCachedCaption(filename, folderId, finalCaption);

return { caption: finalCaption, usedCache: false };

// ── Helper functions ──────────────────────────────────────────────────

function cleanFilename(name) {
  return name
    .replace(/\.\w+$/, '')
    .replace(/[\[\]]/g, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b(uncen|nekop|\.care|xnxx|xvideos|hd|sd|720p|1080p|480p|360p|mp4|mkv|avi|mov|webm|m4v|bluray|discontinued|censored)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceIndonesian(text) {
  for (const [eng, indo] of Object.entries(INDONESIAN_WORD_MAP)) {
    const re = new RegExp(`\\b${eng}\\b`, 'gi');
    text = text.replace(re, indo);
  }
  return text;
}

function injectAdultWords(translated, original) {
  let result = translated;
  for (const [pattern, replacement] of ADULT_INJECTION_MAP) {
    if (pattern.test(original) && !pattern.test(result)) {
      result = result.replace(pattern, replacement);
    }
  }
  return result;
}

async function aiTranslate(text, config) {
  const keys = $credentials.aiService?.keys || [];
  const endpoint = config.endpoint || 'https://gateway.olagon.site/anthropic/v1/messages';
  const model = config.model || 'claude-sonnet-4-6';
  const prompt = config.prompt || 'Translate to Bahasa Indonesia. Short, natural, max 10 words. No emojis.';
  const maxTokens = config.maxTokens || 200;
  const retries = config.retryAttempts || 3;

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
        if (extracted && extracted !== '__REFUSED__') {
          return extracted;
        }
      }

      // Also check thinking block
      const thinking = blocks.find(b => b.type === 'thinking')?.thinking || '';
      if (thinking) {
        const extracted = extractTranslation(thinking);
        if (extracted && extracted !== '__REFUSED__') {
          return extracted;
        }
      }
    } catch (e) {
      // Continue to next retry
    }
  }

  return '__FAILED__';
}
```

---

## Phase 3: N8N Main Workflow

### 3.1 Workflow: tevi-upload-main.json

**Trigger**: Schedule — cron `0 * * * *` (every hour on the hour)

### Node List

| # | Name | Type | Description |
|---|------|------|-------------|
| 1 | Every Hour | Schedule Trigger | Cron: `0 * * * *` |
| 2 | Download State | SFTP Download | Download `state.json` |
| 3 | Read Config | SFTP Download | Download `config.json` |
| 4 | Validate Version | Code | Check `version === 3`, throw on mismatch |
| 5 | Calculate Rotation | Code | Determine next category from state + config |
| 6 | No Category Enabled? | IF | If no enabled categories → Stop |
| 7 | Category Skipped Too Many? | IF | If skipCount >= 3 → try next category |
| 8 | Get Category Config | Code | Extract config for selected category |
| 9 | Acquire Lock | SFTP Rename | Atomic: `state.json` → `state.json.lock` |
| 10 | Lock Failed? | IF | If rename fails → another run in progress → Stop |
| 11 | Save State | SFTP Upload | Increment cycle, save state.json |
| 12 | List GDrive Files | Google Drive | List files from all folders in category |
| 13 | Files Found? | IF | If empty → Skip + Release Lock |
| 14 | Random Pick | Code | Pick 1 random file, track folder source |
| 15 | Download File | Google Drive | Download selected file as binary |
| 16 | SFTP Upload | SFTP | Upload binary to VPS upload dir |
| 17 | Build Payload | Code | Assemble all fields for VPS |
| 18 | AI Caption? | IF | If aiTranslate === true → generate |
| 19 | Generate AI Caption | Code | 5-layer AI caption pipeline |
| 20 | Random Caption? | IF | If aiTranslate === false → random pick |
| 21 | Pick Random Caption | Code | Random from captions[] |
| 22 | Apply Index | Code | Replace `{n}` with upload index |
| 23 | Upload to VPS | HTTP Request | POST /upload — 600s timeout, retry 3 |
| 24 | Upload Success? | IF | Check `success === true` |
| 25 | Archive File | SFTP Rename | Move to archive with unique name |
| 26 | FIFO Cleanup | SFTP Execute | Delete oldest if >10 in archive |
| 27 | Delete Uploaded File | SFTP Execute | Remove from upload dir |
| 28 | Reset Skip Count | Code | Set categorySkipCount[id] = 0 |
| 29 | Notify Success | Email | Success + post URL |
| 30 | Release Lock | SFTP Delete | Delete `.lock` file |
| 31 | Notify Skip | Email | Folder empty or disabled |
| 32 | Increment Skip Count | Code | categorySkipCount[id]++ |
| 33 | Notify Failure | Email | Error + reason + detail |
| 34 | Release Lock (error) | SFTP Delete | Always runs on failure |

### 3.2 Lock Mechanism (Atomic)

```
Workflow A:                            Workflow B:
                                        │
1. SFTP Rename                         1. SFTP Rename
   state.json → .lock                     state.json → .lock  ← FAILS! File exists
                                        │
                                        ▼
                                        STOP + Notify
                                        │
                                        ▼
                                       END
                                       │
←───────────────────────               │
│                                      |
2. Continue upload flow                 |
3. SFTP Delete .lock                   |
4. END                                  |
```

SFTP rename is atomic on most filesystems. If rename fails, another workflow is running → stop.

### 3.3 SFTP Upload Node (Critical Config)

**CRITICAL** — binary upload requires explicit field name:

```
operation: "upload"
binaryData: true
inputBinaryFieldName: "data"     ← MUST match GDrive Download output property name
remotePath: "{{ $vars.VPS_UPLOAD_DIR }}/{{ $json.fileName }}"
```

### 3.4 HTTP Request Node

```
url: "{{ $vars.VPS_UPLOAD_URL }}/upload"
method: POST
timeout: 600000          ← 10 minutes (photos: 300000 = 5 minutes)
maxRetries: 3
retryWaitMillis: 5000

Retries on: timeout, connection error, HTTP 5xx
Does NOT retry on: HTTP 200 with success: false (business error)
```

### 3.5 Archive Naming

```
Original: video_short.mp4
Archive:  video_short_20260714-143022.mp4

If collision: video_short_20260714-143022_1.mp4, _2.mp4, etc.
```

Format: `{basename}_{type}_{YYYYMMDD-HHmmss}[_{counter}].{ext}`

### 3.6 FIFO Cleanup

```bash
cd {{ $vars.VPS_ARCHIVE_DIR }} && \
  ls -t | grep -v '^\.' | tail -n +11 | xargs -d '\n' rm -f 2>/dev/null || true
```

**Rule**: Keep 10 newest. Dotfiles (`.caption_cache.json`) excluded by `grep -v '^\.'`.

---

## Phase 4: N8N Config Workflow

### 4.1 Workflow: tevi-upload-config.json

**Trigger**: Manual (Test Step button) or Webhook

### 4.2 Node List

| # | Name | Type | Description |
|---|------|------|-------------|
| 1 | Manual Trigger | Manual Trigger | Runs on demand |
| 2 | Download Config | SFTP Download | Load existing config.json |
| 3 | Config Form | Form Node | HTML form for editing |
| 4 | Detect Action | Code | Parse form action: add/edit/delete/disable/enable/reorder |
| 5 | Validate Form | Code | Validate required fields, uniqueness |
| 6 | Migration Check | Code | If version !== 3 → migrate from v2 |
| 7 | Apply Changes | Code | Apply CRUD operations to config |
| 8 | Validate Config | Code | Run all validation rules |
| 9 | Preview JSON | Code | Generate formatted JSON |
| 10 | Preview Display | Display | Show JSON to user |
| 11 | User Confirmed? | IF | If confirmed → save |
| 12 | Upload Config | SFTP Upload | Write config.json to VPS |
| 13 | Verify Upload | SFTP Download | Re-download and verify |
| 14 | Notify | Email | Send confirmation email |

### 4.3 Config Form UI

The form uses N8N Form node with custom HTML for full control.

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ TEVI Upload Config Editor — v3                            │
├─────────────────────────────────────────────────────────────┤
│  ACTION:                                                     │
│  (•) Edit Config  ( ) Add Category  ( ) Delete Category    │
│  ( ) Reorder Rotation                                       │
├─────────────────────────────────────────────────────────────┤
│  📋 Category List                                             │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [1] 📷 Photo            [✓] [Edit] [Disable] [✕ Del] │  │
│  │     Subfolders: 2 | Audience: Paid | Price: 20 ⭐     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [2] 🎬 Video           [✓] [Edit] [Disable] [✕ Del]   │  │
│  │     Folders: 3 | Audience: Paid | Price: 10-40 ⭐   │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [3] 🔞 Adult          [✓] [Edit] [Disable] [✕ Del]   │  │
│  │     Sub-types: 3 (hentai,japanese,amerika)          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [+ Add New Category]                                       │
├─────────────────────────────────────────────────────────────┤
│  🔐 TEVI Account                                            │
│  Email:    [____________________________]                  │
│  Password: [____________________________]                  │
├─────────────────────────────────────────────────────────────┤
│  📁 VPS Paths                                                │
│  Upload Dir:  [{{ $vars.VPS_UPLOAD_DIR }}______________]  │
│  Archive Dir: [{{ $vars.VPS_ARCHIVE_DIR }}____________]  │
│  Lock File:   [.tevi-upload.lock____________]             │
├─────────────────────────────────────────────────────────────┤
│  🤖 AI Settings (optional)                                  │
│  Enabled: [✓]                                               │
│  Endpoint: [gateway.olagon.site/anthropic/v1/messages____] │
│  Model: [claude-sonnet-4-6________________________________] │
│  Max Tokens: [200]                                           │
│  Retry Attempts: [3]                                         │
│  Cache TTL Hours: [24]                                      │
│  API Keys: (stored in N8N AI Service credential)            │
├─────────────────────────────────────────────────────────────┤
│  [ Preview JSON ]     [ Download JSON ]   [ Save to VPS ]    │
└─────────────────────────────────────────────────────────────┘
```

### 4.4 Add Category Modal (Form Fields)

```
┌─────────────────────────────────────────────────────────────┐
│  ➕ Add New Category                                          │
├─────────────────────────────────────────────────────────────┤
│  Category ID: [my_category_____]                             │
│  (alphanumeric + underscore, max 30 chars)                  │
│                                                             │
│  Display Name: [📹 My Content_____]                         │
│                                                             │
│  Type: (•) Standard  ( ) Adult (sub-category)              │
│                                                             │
│  ═══════════════════ STANDARD ═══════════════════          │
│                                                             │
│  GDrive Folder IDs:                                         │
│  [+ Add Folder]                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Folder 1: [ID__________________________]            │    │
│  │ Name: [Album Name______________]                     │    │
│  │ Type: (•) Photos ( ) Videos ( ) Subfolder scan [✓]  │    │
│  │ Key: [short_________] (for video)                   │    │
│  │ Price override: [_____] (optional)                  │    │
│  │ Index Start: [1_____] (for video)                   │    │
│  │ Caption Template: [Video ke {n}\n\n{suffix}______]  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Collection: [My Collection______________]                  │
│  Audience: (•) Paid  ( ) Free                              │
│  Members Only: [ ]                                          │
│  Price: [10] stars                                          │
│  Caption Suffix: [Topup Star Tevi di babyval.com____________]│
│  Captions (one per line, random pick):                      │
│  [_____________________________________________________]    │
│  [_____________________________________________________]    │
│  AI Translate: [ ] Enable                                   │
│                                                             │
│  ═══════════════════ ADULT ═════════════════════════       │
│                                                             │
│  Sub-Types:                                                 │
│  [+ Add Sub-Type]                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Sub-Type ID: [hentai__________]                     │    │
│  │ Display Name: [Hentai_________]                      │    │
│  │ GDrive Folder ID: [_______________________________] │    │
│  │ Collection: [Hentai__________]                        │    │
│  │ AI Translate: [✓]                                    │    │
│  │ Price: [10]                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│  [+ Add Sub-Type]                                            │
│                                                             │
│  Default Captions:                                           │
│  [🔞 18+ Content\n\n{suffix}____________________________]  │
│  AI Translate Default: [✓]                                  │
│  AI Prompt: [Translate to Bahasa Indonesia...______________]│
│                                                             │
│  (Inherited: audience, alwaysMembers, captionSuffix)         │
│                                                             │
│  [Cancel]                               [Add Category]       │
└─────────────────────────────────────────────────────────────┘
```

### 4.5 Form Validation (Client + Server)

**Client-side** (before submit):
```javascript
if (!categoryId || !/^[a-z0-9_]{1,30}$/.test(categoryId)) {
  alert('Category ID: alphanumeric + underscore, max 30 chars');
  return false;
}
if (folders.length === 0) {
  alert('At least one GDrive folder required');
  return false;
}
if (categoryId === 'adult' && subTypes.length === 0) {
  alert('Adult category needs at least one sub-type');
  return false;
}
```

**Server-side** (Code node):
- All validation rules from Section 1.6
- Duplicate ID check
- Max 10 categories
- Required fields

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

**Request Body:**
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

**All fields passed from N8N. server.js has zero hardcoded values.**

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "uploaded": true,
  "file": "video.mp4",
  "url": "https://tevi.com/@channel/post/abc123"
}
```

**Error Response (HTTP 200):**
```json
{
  "success": false,
  "reason": "login_failed",
  "step": "login",
  "detail": "UID not found after 60s poll."
}
```

#### `GET /health`

```json
{ "status": "ok", "uptime": 12345, "browser": "chromium", "version": "3.0" }
```

### 5.3 Error Reasons

| reason | step | HTTP | Keterangan |
|--------|------|------|------------|
| `login_failed` | login | 200 | UID not found after 60s |
| `create_btn_not_clicked` | create | 200 | #nav-create-btn not found |
| `post_form_not_visible` | create | 200 | Post form not appeared after 45s |
| `file_not_selected` | upload | 200 | File chooser failed |
| `file_not_found` | upload | 200 | File at filePath does not exist |
| `unsupported_format` | upload | 200 | TEVI rejected file format |
| `post_unverified` | verify | 200 | Dialog not closed after timeout (max 10 min) |
| `upload_error` | server | 500 | Browser crash or internal error |

---

## Phase 6: GDrive Folder Structure

### 6.1 Recommended Structure

```
My Drive/
└── TEVI/
    ├── photo/
    │   ├── Album 01/
    │   ├── Album 02/
    │   └── Album 03/
    ├── video/
    │   ├── short/
    │   ├── medium/
    │   └── dance/
    ├── hentai/
    ├── japanese/
    └── amerika/
```

### 6.2 Sharing

Share each folder with the Google account used in N8N OAuth2 credential.

---

## Phase 7: Setup Checklist

### VPS

- [ ] Linux VPS, 2GB+ RAM
- [ ] Node.js 18+
- [ ] `npm install express playwright cors`
- [ ] `npx playwright install chromium`
- [ ] Create directories:
  - `{VPS_UPLOAD_DIR}/` — upload queue
  - `{VPS_ARCHIVE_DIR}/` — archive
- [ ] Deploy `server.js`
- [ ] `pm2 start ecosystem.json`
- [ ] Firewall: port 3004 from N8N IP only (or Cloudflare tunnel)

### N8N

- [ ] Import `tevi-upload-main.json`
- [ ] Import `tevi-upload-config.json`
- [ ] Create credentials:
  - **TEVI Account**: email + password
  - **SSH/SFTP**: host, user, password or key
  - **Google Drive OAuth2**: Client ID + Secret + Redirect URI
  - **Email SMTP**: host, port, user, password
  - **AI Service**: API keys array
- [ ] Set N8N Variables:
  - `VPS_UPLOAD_DIR`
  - `VPS_ARCHIVE_DIR`
  - `VPS_UPLOAD_URL`
  - `VPS_LOCK_FILE`
  - `NOTIFY_EMAIL`
- [ ] Run Config Workflow: fill form → save to VPS
- [ ] Activate Main Workflow

### Google Drive

- [ ] Enable Drive API in Google Cloud
- [ ] Create OAuth2 credentials
- [ ] Share content folders with OAuth2 account

### TEVI

- [ ] Active account
- [ ] Create collections (if using)
- [ ] Test login manually first

---

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-07-14 | v1 | Initial PRD |
| 2026-07-14 | v2 | Full audit fix + Config system + AI section |
| 2026-07-14 | **v3** | **Flexible category system** |
| | | — Dynamic categories (1-10, user-defined IDs) |
| | | — Sub-category for adult (1-level depth) |
| | | — Rotation state persistence (state.json) |
| | | — Adult sub-rotation persistence |
| | | — Skip threshold (3 consecutive skips) |
| | | — Config validation (uniqueness, required fields) |
| | | — Atomic lock (SFTP rename) |
| | | — Config v2 → v3 migration |
| | | — AI caption 5-layer pipeline |
| | | — AI caption caching (24h TTL) |
| | | — Indonesian word map (30+ words) |
| | | — Adult word injection |
| | | — AI keys in N8N Credential (not config.json) |
| | | — Per-subType AI translate override |
| | | — Config form with add/edit/delete/disable/reorder |
| | | — Lock on state file (not separate lock file) |
| | | — Atomic lock prevents race condition |
| | | — Category skip count reset on success |

---

## Bug Fix Summary

All bugs from v2 audit fixed:

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | 🔴 CRITICAL | Rotation state not persisted | state.json persisted per run |
| 2 | 🔴 CRITICAL | Adult sub-rotation not persisted | adultSubCycleIndex in state.json |
| 3 | 🔴 CRITICAL | Disable → modulo breaks | Index-based rotation, not modulo on filtered array |
| 4 | 🔴 CRITICAL | Race condition (lock timing) | Atomic SFTP rename on state.json |
| 5 | 🔴 CRITICAL | Category ID uniqueness not validated | Validation rule + client-side check |
| 6 | 🟡 HIGH | Empty folder → perpetual skip | Skip threshold (3), notify per cycle |
| 7 | 🟡 HIGH | All sub-types disabled → crash | Validate at least 1 enabled sub-type |
| 8 | 🟡 HIGH | AI keys in config.json | Keys in N8N Credential, config has references |
| 9 | 🟡 HIGH | AI caption multi-layer missing | Full 5-layer pipeline implemented |
| 10 | 🟡 HIGH | AI caption no caching | .caption_cache.json on VPS, 24h TTL |
| 11 | 🟢 MEDIUM | Sub-type config inheritance unclear | Documented inheritance rules |
| 12 | 🟢 MEDIUM | AI prompt per sub-type | aiPrompt override in subType |
| 13 | 🟢 MEDIUM | Max category not enforced | Validation: max 10 |
| 14 | 🟢 MEDIUM | Sub-type ID uniqueness | Validation within adult category |
| 15 | 🟢 MEDIUM | Delete mid-rotation | Warn if deleting active category |
| 16 | 🟢 MEDIUM | AI failure → workflow fail | Try-catch + fallback captions |
| 17 | 🟢 MEDIUM | Form validation missing | Client + server validation |

---

## File Structure

```
tevi-upload/
├── server.js                     # VPS executor (v3)
├── ecosystem.json               # PM2 config
├── package.json                # Dependencies
├── .env.example                # Environment template
├── .gitignore
├── LICENSE                     # MIT
├── README.md                    # Overview
├── PRD.md                      # This document (v3)
├── phases.md                   # Implementation phases
├── n8n-workflow/
│   ├── tevi-upload-main.json   # Main workflow (v3)
│   └── tevi-upload-config.json # Config editor workflow (v3)
└── docs/
    ├── SETUP.md
    ├── TEVISETUP.md
    ├── GDRIVESETUP.md
    ├── CONFIG.md               # Config workflow guide
    ├── AI.md                   # AI caption system
    └── TROUBLESHOOT.md
```
