# PRD: TEVI Upload System — N8N + VPS

> Self-hosted automation system for uploading content to TEVI.com. Generic, scalable, credentials stored in N8N.

## Overview

Sistem automasi upload konten ke TEVI.com. Arsitektur split:
- **N8N**: Brain — schedule, logic, credentials, caption, pricing, GDrive download, SFTP upload, archive
- **VPS (tevi-upload)**: Dumb executor — hanya Playwright upload (satu endpoint)

```
┌─────────────────────────────────────────────────────────────┐
│  N8N                                                            │
│  - Schedule (every 1 hour)                                     │
│  - GDrive OAuth2: list files → download (binary)             │
│  - Random pick: select 1 file from list                        │
│  - Caption / Audience config                                   │
│  - SFTP: upload file to VPS                                   │
│  - HTTP: POST /upload to VPS                                  │
│  - SFTP: archive + FIFO cleanup                              │
│  - Email: notify success/failure/skip                         │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │  SFTP upload (binary file)  │
           │  HTTP POST /upload          │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  VPS tevi-upload (self-hosted)                                │
│  - POST /upload — Playwright browser automation               │
│  - GET  /health — health check                               │
└──────────────────────────────────────────────────────────────┘
```

### Credentials Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  N8N Credentials (stored encrypted in N8N, never public)     │
│                                                              │
│  - Google Drive OAuth2 API    → GDrive List + Download      │
│  - SSH/SFTP Credentials       → Upload to VPS, Archive       │
│  - SMTP Email Credentials     → Notify Success/Failure/Skip  │
│  - TEVI Credentials           → Passed to VPS as JSON body   │
└─────────────────────────────────────────────────────────────┘

VPS server.js: NO credentials stored. All credentials in N8N.
```

### Requirements

| Component | Spec |
|-----------|------|
| VPS | Linux, 2GB RAM, 10GB disk, SSH access |
| N8N | v1.0+ (self-hosted or cloud) |
| Google Drive | Drive API enabled in Google Cloud project |
| TEVI.com | Active account |

---

## File Structure

```
tevi-autopilot/
├── README.md              # Public-facing overview
├── PRD.md                # This document — complete technical spec
├── LICENSE               # MIT License
├── .env.example          # Environment variables template
├── server.js             # VPS Playwright executor
├── ecosystem.json        # PM2 process manager config
├── docker-compose.yml    # Optional: Docker deployment
├── n8n-workflow/
│   └── tevi-autopilot.json   # N8N workflow JSON
└── docs/
    ├── SETUP.md          # Step-by-step setup guide
    ├── TEVISETUP.md      # TEVI account & collection setup
    ├── GDRIVESETUP.md    # Google Drive folder structure
    └── TROUBLESHOOT.md   # Common issues & solutions
```

---

## Phase 1: VPS Upload Executor

### server.js

Node.js HTTP server yang jalan di VPS. Hanya terima request dari N8N, jalankan Playwright automation, return result.

**Dependencies:**
```json
{
  "express": "^4.18.0",
  "playwright": "^1.40.0",
  "cors": "^2.8.5"
}
```

**Environment Variables (server.js):**
```bash
PORT=3004
CHROMIUM_PATH=/path/to/chromium
UPLOAD_DIR=/home/vps-devata/tevi-uploads
ARCHIVE_DIR=/home/vps-devata/tevi-uploads/archive
LOG_LEVEL=info  # debug | info | warn | error
```

**NO credentials in server.js.** All auth data comes from N8N request body.

---

### VPS Endpoints

**Authentication**: Open (no API key). VPS should be firewalled to only accept connections from N8N IP, or use Cloudflare tunnel.

#### `POST /upload`

Execute Playwright browser automation to upload content to TEVI.com.

**Request Body:**
```json
{
  "email": "tevi@email.com",
  "password": "tevi_password",

  "filePath": "/home/vps-devata/tevi-uploads/video.mp4",
  "caption": "Judul konten — Topup Star Tevi di babyval.com",

  "collection": "Nama Koleksi",
  "audienceFree": false,
  "audiencePaid": true,
  "audiencePrice": 10,
  "audienceMembership": false,
  "alwaysMembers": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | TEVI account email |
| `password` | string | Yes | TEVI account password |
| `filePath` | string | Yes | Absolute path to file on VPS |
| `caption` | string | Yes | Post caption text |
| `type` | string | Yes | `photo` or `video` |
| `collection` | string | No | Collection name, null = no collection |
| `audienceFree` | boolean | No | Free post (default: false) |
| `audiencePaid` | boolean | No | Paid per post (default: true) |
| `audiencePrice` | integer | No | Star price (default: 10) |
| `audienceMembership` | boolean | No | Members only (default: false) |
| `alwaysMembers` | boolean | No | Force members-only override (default: false) |

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "uploaded": true,
  "file": "video.mp4",
  "url": "https://tevi.com/@channel/post/abc123"
}
```

**Error Response (HTTP 200 with success:false):**
```json
{
  "success": false,
  "reason": "login_failed",
  "step": "login",
  "detail": "UID not found after 60s poll. Login modal still visible."
}
```

**HTTP Error Responses (4xx/5xx):**
- `400`: Invalid request body (missing required fields)
- `413`: File too large
- `500`: Internal server error (browser crash, etc.)

#### `GET /health`

Health check endpoint. Returns server status and uptime.

**Response:**
```json
{
  "status": "ok",
  "uptime": 12345,
  "browser": "chromium",
  "version": "1.40.0"
}
```

---

### Flow: LOGIN

Login fresh setiap request — tidak pakai cookie/session reuse.

```
1.  page.goto('https://tevi.com/')
2.  sleep(13000)                       ← wait for initial page load

3.  if (#nav-login-banner-btn visible)
      click #nav-login-banner-btn
      sleep(2000)

4.  Click button "with email"          ← regex: /^with\s+email$/i
    sleep(3000)

5.  Fill email input → Fill password input → Click submit or press Enter
    sleep(8000)

6.  POLL LOGIN SUCCESS (60s, 1s interval):
    Check: document.querySelector('#nav-profile-btn, a[href*="/@"], [class*="nav-profile"]')
    → UID element found in DOM → LOGIN SUCCESS
    → URL contains /@ → LOGIN SUCCESS
    → Timeout (60s) → LOGIN FAILED

7.  page.keyboard.press('Escape')
    sleep(3000)
```

**Login Success Condition**: UID element found in DOM. NOT modal close, NOT URL only.

**Error Tracking**: If login fails, capture:
- `reason`: `login_failed`
- `step`: `login`
- `detail`: Specific reason (e.g., "UID not found after 60s", "wrong credentials", "network error")

---

### Flow: UPLOAD

```
HOMEPAGE SETUP
1.  window.scrollTo(0, 0)
2.  3x loop:
      window.scrollTo(0, document.body.scrollHeight)
      window.scrollTo(0, 0)
      sleep(2500)

─── CREATE POST ───────────────────────────
3.  MODAL CLEANUP LOOP (5x):
      for i in 0..4:
        page.keyboard.press('Escape')
        sleep(500)
        page.evaluate → remove:
          .MuiBackdrop-root
          .MuiModal-root
          .MuiPopover-root
          .MuiMenu-root
          [role="presentation"]
          [class*="backdrop"]
          [class*="overlay"] (zIndex > 1000 or position:fixed)
        sleep(300)
4.  sleep(1000)

5.  INJECT MUTATION OBSERVER:
      observe document.body
      auto-remove new .MuiBackdrop-root, .MuiModal-root, .MuiPopover-root, .MuiMenu-root

6.  if (#nav-create-btn visible):
      scrollIntoView
      click { force: true }
      createClicked = true
      sleep(2000)
      for sel in ['text=Create a post', '[class*="create-post"]']:
        if popup visible → click

7.  if NOT createClicked:
      ERROR: create_btn_not_clicked
      close browser, return

8.  sleep(8000)

─── POST FORM WAIT ────────────────────────
9.  POLL #post-form-upload-media-btn OR #post-form-root (max 45s, 1s interval)
    if NOT found → ERROR: post_form_not_visible

─── FILE SELECT ─────────────────────────────
10. WAIT FILECHOOSER EVENT (15s timeout)
    Click #post-form-upload-media-icon (fallback: #post-form-upload-media-btn)
    if fc → fc.setFiles(filePath)

    if NOT fileSelected → ERROR: file_not_selected

─── WAIT PREVIEW ───────────────────────────
11. Photo: poll #post-form-photo-preview OR img[src*="preview"] (max 120 x 3s = 6min)
    Video: poll #post-form-video-preview OR video element (max 120 x 3s)
    Check for "unsupported format" error text → ERROR: unsupported_format

─── CAPTION ────────────────────────────────
12. Fill #post-form-caption-input with caption text

─── COLLECTION ──────────────────────────────
13. if collection defined AND NOT null:
      Click #post-form-collection-open-btn
      Wait #post-form-collection-dialog (max 10 attempts, 1s each)
      Find collection button by text match
      Click to toggle (if not already selected)
      Close dialog (Escape or close button)

─── AUDIENCE ────────────────────────────────
14. if audienceFree = true:
      log: 'FREE audience (default, no action)'

15. if audiencePaid = true:
      a. Click #post-form-audience-btn
         sleep(2000)

      b. Uncheck #post-form-audience-free-switch
         (if element exists AND is checked)

      c. Check #post-form-audience-paid-switch
         (if not already checked)

      d. Fill #post-form-audience-star-price-input
         with audiencePrice value (number)

      e. if audienceMembership = true OR alwaysMembers = true:
           Check #post-form-audience-members-switch
           → Forces members-only visibility
           → alwaysMembers is N8N override flag

      f. Press Escape
         sleep(500)

─── SUBMIT ──────────────────────────────────
16. Click #post-form-submit-btn
    sleep(3000)

─── GUIDELINES CONFIRM ──────────────────────
17. if (#post-form-guidelines-confirm-btn visible):
      Click it
      sleep(2000)

─── POST-SUBMIT CONFIRM DIALOGS ─────────────
18. Poll for agree/confirm button in dialog:
    Photo/Video patterns: community, guideline, agree, adult, confirm, satisfied
    Hentai/NSFW patterns: adult, konten dewasa, nsfw, age, 18+, years old, persetujuan
    Max poll: non-hentai 50 x 300ms = 15s
              hentai 400 x 300ms = 2min
    Find button matching pattern → click

19. HENTAI ONLY: Check video playback ended
      video.currentTime >= video.duration - 1
      → Server has approved content
      → Look for agree/confirm button → click
      → If no agree button appears within 30s, proceed anyway

─── VERIFY POST ─────────────────────────────
20. Poll #post-form-dialog state (max 80 x 3s = 4min)
    Hentai: max 600 x 3s = 30min
    Dialog closed with no error → SUCCESS
    Dialog closed with error text → FAILED
    Timeout → ERROR: post_unverified

21. Video stuck detection:
      if video.currentTime stuck at 0-4s for 8+ consecutive polls:
        video.play()
        click play button if visible
        wait 10s → recheck

─── GET POST URL ────────────────────────────
22. Poll window.location.href for /post/ or /posts/ (max 30 x 3s = 90s)
    Check success toast: "posted", "berhasil", "success"

─── DONE ────────────────────────────────────
23. Return { success: true, url: "...", file: "..." }
24. Close browser
```

---

### Audience Switch Logic

```javascript
// audienceMembers: true = members only (from N8N config)
// alwaysMembers: true = override flag from N8N (force members)

const membersSwitch = audienceMembership || alwaysMembers;

if (audiencePaid) {
  // Already in paid flow (step 15)
}

if (membersSwitch) {
  // Check #post-form-audience-members-switch
  // This overrides paid visibility: post only visible to paying members
}
```

| Config | `audiencePaid` | `audienceMembership` | `alwaysMembers` | Result |
|--------|----------------|---------------------|----------------|--------|
| Free | true | false | false | Free post |
| Paid (any) | true | false | false | Paid post, public |
| Paid + Membership | true | true | false | Paid post, members only |
| Free + Override | false | false | true | **Not valid** (free can't be members-only) |
| Paid + Override | true | false | true | Paid post, members only (forced) |

---

### Chromimum Config

```javascript
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || (
  '/home/vps-devata/.cache/ms-playwright/' +
  'chromium_headless_shell-1228/' +
  'chrome-headless-shell-linux64/' +
  'chrome-headless-shell'
);

browser = await chromium.launch({
  headless: true,
  executablePath: CHROMIUM_PATH,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-gpu-rasterization',
    '--disable-gpu-compositing',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-accelerated-video-decode',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ]
});

context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  acceptDownloads: false,  // downloads disabled — file path from N8N
});
```

**Chromium Installation:**
```bash
# On VPS:
npx playwright install chromium

# Or with specific version:
npx playwright install chromium --with-deps
```

---

### Upload Error Reasons

VPS MUST return structured error response with `reason`, `step`, and `detail`:

```json
{
  "success": false,
  "reason": "login_failed",
  "step": "login",
  "detail": "UID not found after 60s. #auth-signin-btn still visible."
}
```

| reason | step | HTTP | Keterangan |
|--------|------|------|------------|
| `login_failed` | login | 200 | UID not found after 60s polling |
| `login_timeout` | login | 200 | Browser/network timeout during login |
| `create_btn_not_clicked` | create | 200 | #nav-create-btn not found or not clickable |
| `post_form_not_visible` | create | 200 | Post form not appeared after 45s |
| `file_not_selected` | upload | 200 | File chooser failed or no file passed |
| `unsupported_format` | upload | 200 | TEVI rejected file format |
| `upload_error` | upload | 200 | Generic upload error |
| `post_unverified` | verify | 200 | Post dialog didn't close (timeout or error) |
| `guideline_timeout` | confirm | 200 | Guidelines dialog timeout |
| `agree_timeout` | confirm | 200 | Agree dialog timeout (hentai: 2min, normal: 15s) |
| `file_not_found` | upload | 200 | File at filePath does not exist on VPS |

---

## Phase 2: N8N Workflow

### Architecture Principles

1. **No hardcoded credentials** — All sensitive data via N8N Credentials
2. **No hardcoded paths** — All paths via environment variables
3. **Single branch execution** — Only one content type runs per trigger
4. **Binary data explicit** — GDrive → SFTP binary flow documented
5. **Retry only for network errors** — HTTP retry in N8N, not for business logic

### Node List

| # | Name | Type | Description |
|---|------|------|-------------|
| 1 | Every 1 Hour | Schedule Trigger | Cron: `0 * * * *` — exactly on the hour |
| 2 | Login Info | Code | Inject email, password, determine `uploadType` from hour (`photo\|video\|porn`) |
| 3 | Photo? | IF | Branch: `uploadType === 'photo'` |
| 4 | Video? | IF | Branch: `uploadType === 'video'` |
| 5 | Porn? | IF | Branch: `uploadType === 'porn'` |
| 6 | Photo Config | Code | Caption pool, audience config, GDrive folder ID |
| 7 | Video Config | Code | Caption pool, audience, sub-type from minute |
| 8 | Porn Config | Code | Caption pool, audience (membership=true), sub-type |
| 9 | GDrive List Subfolders | Google Drive (OAuth2) | List subfolders in photo root |
| 10 | GDrive List Photos (direct) | Google Drive (OAuth2) | List photos directly (no subfolder) |
| 11 | Pick Random Subfolder | Code | Random pick 1 subfolder |
| 12 | GDrive List From Subfolder | Google Drive (OAuth2) | List photos in selected subfolder |
| 13 | GDrive List Videos | Google Drive (OAuth2) | List videos in video/porn folder |
| 14 | Random Pick Photo | Code | Random pick 1 photo → `fileId`, `fileName` |
| 15 | Random Pick Video | Code | Random pick 1 video → `fileId`, `fileName` |
| 16 | File Found? (Photo) | IF | If `error` exists → No File branch |
| 17 | File Found? (Video) | IF | If `error` exists → No File branch |
| 18 | No File — Skip (Photo) | Code | Output skip notification data |
| 19 | No File — Skip (Video) | Code | Output skip notification data |
| 20 | Notify Skip (Photo) | Email | Send skip notification |
| 21 | Notify Skip (Video) | Email | Send skip notification |
| 22 | GDrive Download File | Google Drive (OAuth2) | Download selected file as binary |
| 23 | Upload File to VPS | SFTP | Upload binary → VPS upload directory |
| 24 | Build Upload Payload | Code | Assemble all fields for TEVI upload |
| 25 | Execute TEVI Upload | HTTP Request | POST to VPS `/upload` — 600s timeout, retry: 3 |
| 26 | Upload Success? | IF | Check `success === true` AND `url` exists |
| 27 | Archive File (SFTP) | SFTP | Move file → archive directory |
| 28 | FIFO Cleanup (max 10) | SFTP | Delete oldest if >10 files |
| 29 | Result: Success | Code | Compile success notification |
| 30 | Result: Failed | Code | Compile failure notification |
| 31 | Notify Success | Email | Email: success + post URL |
| 32 | Notify Failure | Email | Email: failure + reason + detail |

---

### Workflow Execution Flow (Single Branch)

```
[Schedule Trigger: 0 * * * *]
          │
          ▼
   [Login Info: Code]
   email, password, uploadType (hour%3)
          │
    ┌─────┴─────┐
    │           │           │
    ▼           ▼           ▼
[Photo?]   [Video?]   [Porn?]
   │           │           │     ← Only ONE branch executes
   ▼           │           │       (others get empty input, skip)
[Config]        │           │
   │            │           │
   ▼            │           │
[GDrive List]   │           │   ← Photo: list subfolders OR direct
   │            │           │
   ▼            │           │
[Random Pick]   │           │   ← Video/Porn: list → random pick
   │            │           │
   ▼            │           │
[File Found?]    │           │
   │            │           │
 ┌─┴─┐          │           │
 │YES│          │           │   ← NO: skip → notify → stop
 │   │          │           │
 ▼   ▼          ▼           ▼
[GDrive Download File]      ← GDrive node: returns BINARY
   │
   ▼
[Upload File to VPS]        ← SFTP node: inputBinaryFieldName="data"
   │                           remotePath = {{ $env.VPS_UPLOAD_DIR }}/{{ $json.fileName }}
   ▼
[Build Upload Payload]       ← Assemble: email, password, filePath,
   │                           caption, type, collection, audience*
   ▼
[Execute TEVI Upload]       ← HTTP POST {{ $env.VPS_UPLOAD_URL }}/upload
   │                           timeout: 600000ms
   │                           retry: max 3, retryWait: 5000ms
   │                           (retry for network errors only)
   ▼
[Upload Success?]            ← IF: success === true AND url exists
   │
 ┌─┴────────────────────────┐
 │YES                      │NO
 ▼                         ▼
[Archive File (SFTP)]  [Result: Failed]
 mv {fileName}        Notify Failure email
 ▼
[FIFO Cleanup]         ← Execute command via SFTP:
 ls -t | tail -n+11   ← Delete oldest if >10
 | xargs rm -f
 ▼
[Result: Success]
 Notify Success email
```

**Single Branch Guarantee**: Only one IF branch has data. Photo/Video/Porn configs are in separate branches. The one whose `uploadType` matches the current hour executes. Others receive no input and their downstream nodes are not triggered.

---

### Content Type Rotation

**Primary types** (based on hour):
```
Hour % 3 == 0 → Photo
Hour % 3 == 1 → Video
Hour % 3 == 2 → Porn
```

**Video sub-types** (based on minute):
```
Min 0-19  → short  (price: 20)
Min 20-39 → medium (price: 40)
Min 40-59 → dance  (price: 10)
```

**Porn sub-types** (based on minute):
```
Min 0-19  → hentai    (price: 10, membership: true)
Min 20-39 → japanese  (price: 10, membership: true)
Min 40-59 → amerika   (price: 10, membership: true)
```

**Caption Generation**: Random pick from pool + suffix. Both stored in Code nodes (not credentials, not env vars — acceptable for public repo).

### GDrive Folder IDs (Template — Replace with Your Own)

| Type | Sub-type | Folder ID | getSubfolder |
|------|----------|-----------|--------------|
| photo | — | `YOUR_PHOTO_FOLDER_ID` | true |
| video | short | `YOUR_VIDEO_FOLDER_ID` | false |
| video | medium | `YOUR_VIDEO_FOLDER_ID` | false |
| video | dance | `YOUR_VIDEO_FOLDER_ID` | false |
| porn | hentai | `YOUR_PORN_FOLDER_ID` | false |
| porn | japanese | `YOUR_PORN_FOLDER_ID` | false |
| porn | amerika | `YOUR_PORN_FOLDER_ID` | false |

See `docs/GDRIVESETUP.md` for how to structure GDrive folders.

### N8N → VPS /upload Payload

```json
{
  "email": "{{ $json.email }}",
  "password": "{{ $json.password }}",
  "filePath": "{{ $env.VPS_UPLOAD_DIR }}/{{ $json.fileName }}",
  "caption": "{{ $json.upload.caption }}",
  "type": "{{ $json.type }}",
  "collection": "{{ $json.upload.collection }}",
  "audienceFree": {{ $json.upload.audienceFree }},
  "audiencePaid": {{ $json.upload.audiencePaid }},
  "audiencePrice": {{ $json.upload.audiencePrice }},
  "audienceMembership": {{ $json.upload.audienceMembership }},
  "alwaysMembers": {{ $json.upload.alwaysMembers }}
}
```

---

### Credentials yang Dibutuhkan

| Credential | Type | Setup Location | Used by |
|-----------|------|----------------|---------|
| Google Drive OAuth2 | OAuth2 API | N8N → Credentials → Google Drive | GDrive List*, GDrive Download |
| SSH/SFTP | SSH Credentials | N8N → Credentials → SSH | Upload File to VPS, Archive, FIFO |
| Email (SMTP) | SMTP | N8N → Credentials → Email | Notify Success, Notify Failure, Notify Skip |
| TEVI Account | N8N Custom Credentials | N8N → Credentials → TEVI | Referenced in Code nodes |

**TEVI Credentials** (Custom credentials in N8N):
```json
{
  "email": "your-tevi@email.com",
  "password": "your_password",
  "channelSlug": "your_channel"
}
```

---

### Environment Variables (N8N Variables)

| Variable | Example | Used by |
|---------|---------|---------|
| `VPS_UPLOAD_DIR` | `/home/vps-devata/tevi-uploads` | SFTP Upload, Archive, Build Payload |
| `VPS_UPLOAD_URL` | `https://your-vps.com/upload` | Execute TEVI Upload |
| `ARCHIVE_DIR` | `/home/vps-devata/tevi-uploads/archive` | Archive, FIFO Cleanup |

---

### Retry Logic — Network Errors Only

**N8N HTTP Request retry settings:**
```javascript
{
  "timeout": 600000,  // 10 minutes
  "options": {
    "retry": {
      "maxRetries": 3,
      "retryWaitMillis": 5000
    }
  }
}
```

**What retries:**
- Network timeout
- Connection refused/reset
- HTTP 5xx errors from VPS
- DNS resolution failures

**What does NOT retry** (returns immediately to failure path):
- HTTP 200 with `success: false` from VPS (business logic failures)
- Invalid credentials → `login_failed`
- File not found → `file_not_found`
- Post unverified → `post_unverified`

**Rationale**: Business logic failures indicate a problem that retrying won't fix (wrong password won't become correct in 5 seconds). Only network transient errors benefit from retry.

---

### Binary Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  GDrive Download File (Google Drive node)                        │
│                                                                  │
│  Output: Binary data (the file itself)                          │
│  Property: "data" (default)                                      │
│  Mode: Return file as binary                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    binary.output.data
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Upload File to VPS (SFTP node)                                   │
│                                                                  │
│  operation: "upload"                                              │
│  binaryData: true                                                │
│  inputBinaryFieldName: "data"    ← MUST match GDrive output     │
│  remotePath: "{{ $env.VPS_UPLOAD_DIR }}/{{ $json.fileName }}"    │
└─────────────────────────────────────────────────────────────────┘
```

**Critical Config in N8N UI:**
1. GDrive Download File → Set "File Format" → "File Object (Binary)"
2. SFTP Upload → Set `inputBinaryFieldName` → `"data"` (must match exactly)

---

### Unique Filename Strategy

To prevent file overwrite when workflow runs multiple times or multiple uploads happen:

**Archive naming:**
```
Original:  video.mp4
Archived:  {{ $json.fileName }}_{{ $json.uploadType }}_{{ $now.format('YYYYMMDD-HHmmss') }}.mp4

Example:   video.mp4_video_20260714-143022.mp4
```

This is applied in the **Archive File (SFTP)** node's `remotePath`:
```
remotePath = {{ $env.VPS_ARCHIVE_DIR }}/{{ $json.fileName }}_{{ $json.uploadType }}_{{ $now.format('YYYYMMDD-HHmmss') }}
```

**Why not rename uploaded file?** Because Playwright needs the exact `filePath` from N8N payload. Renaming before upload would break the automation. Archive gets unique name for safety.

---

### Concurrency Protection

To prevent overlapping runs (e.g., manual trigger + scheduled trigger):

**Strategy**: Lock file via SFTP.

```
Before upload starts:
1. SFTP check: does {{ $env.VPS_LOCK_FILE }} exist?
   - If YES: stop workflow (another run in progress)
   - If NO: continue

After upload starts (before TEVI upload):
2. SFTP write: create {{ $env.VPS_LOCK_FILE }} with content "{timestamp}"

After archive + FIFO:
3. SFTP delete: remove {{ $env.VPS_LOCK_FILE }}
```

**Lock file content:**
```json
{
  "startedAt": "2026-07-14T14:30:00.000Z",
  "type": "video",
  "fileName": "video.mp4",
  "workflowId": "abc123"
}
```

**Lock file path:** `{{ $env.VPS_UPLOAD_DIR }}/.tevi-upload.lock`

**Note**: Lock file uses dot-prefix (`.tevi-upload.lock`) so FIFO cleanup `ls -t` excludes it (only counts non-dot files).

---

### Archive FIFO Cleanup

After file is moved to archive:

```bash
# Via SFTP executeCommand:
cd {{ $env.VPS_ARCHIVE_DIR }} && \
  ls -t | grep -v '^\.' | tail -n +11 | xargs -d '\n' rm -f 2>/dev/null; \
  echo "Archive count: $(ls -1 | grep -v '^\.' | wc -l)"
```

**Logic:**
1. List files sorted by modification time (newest first)
2. Exclude dotfiles (lock file)
3. Skip first 10 (keep newest 10)
4. Delete the rest
5. Return count for logging

**Max archive: 10 files** — configurable in N8N if needed.

---

### Error Handling Path

| Error | Detection | Action |
|-------|----------|--------|
| GDrive folder empty | `error` field in Random Pick output | Skip → Notify Skip email |
| GDrive download failed | GDrive node throws | Skip → Notify Failure |
| SFTP upload failed | SFTP node throws | Skip → Notify Failure |
| Lock file exists | SFTP check returns file | Skip → Notify Skip (concurrent) |
| VPS /upload timeout | HTTP timeout after 600s | Retry (up to 3x) → Notify Failure |
| VPS /upload HTTP 5xx | HTTP error response | Retry (up to 3x) → Notify Failure |
| VPS returns success:false | Business logic error | Notify Failure (reason + detail) |
| VPS /upload HTTP 4xx | Bad request | Notify Failure (don't retry) |
| Archive mv failed | SFTP error | Notify Success (upload worked, archive failed) |
| FIFO cleanup failed | SFTP error | Log only, don't fail workflow |

---

### SFTP Node Types

There are two different SFTP nodes in N8N. PRD uses correct types:

| Node | N8N Type | Credential Type | Used for |
|------|----------|----------------|---------|
| Upload File to VPS | `n8n-nodes-base.sftp` | SSH (password or key) | Binary upload |
| Archive File (SFTP) | `n8n-nodes-base.sftp` | SSH (password or key) | Move file |
| FIFO Cleanup | `n8n-nodes-base.sftp` | SSH (password or key) | Execute command |

**NOT**: `n8n-nodes-base.sshCredentials` — that is the old/deprecated SSH node type.

---

## Phase 3: GDrive Folder Structure

### Required: Share folders with Service Account

For N8N Google Drive OAuth2 to access your folders:

1. Create a Google Cloud project
2. Enable Google Drive API
3. Create OAuth2 credentials (Client ID + Secret)
4. In N8N: Create Google Drive OAuth2 API credential
5. For each content folder: **Share the folder** with the OAuth2 user's email address

See `docs/GDRIVESETUP.md` for detailed steps.

### Folder Structure (Recommended)

```
My Drive/
├── TEVI/
│   ├── photo/              ← N8N lists this, then lists subfolders
│   │   ├── Album 01/
│   │   ├── Album 02/
│   │   ├── Album 03/
│   │   └── ...
│   ├── video/
│   │   └── (all videos flat)
│   └── porn/
│       ├── hentai/
│       ├── japanese/
│       └── amerika/
```

**Alternative (flat structure):**
```
TEVI/
├── photo/                  ← N8N lists files directly (no subfolder)
├── video/
│   ├── short/
│   ├── medium/
│   └── dance/
└── porn/
    ├── hentai/
    ├── japanese/
    └── amerika/
```

Set `getSubfolder` = true/false per folder to match your structure.

---

## Setup Checklist

### VPS Side

- [ ] VPS dengan SSH access
- [ ] Node.js 18+ installed
- [ ] Chromium installed: `npx playwright install chromium`
- [ ] Folder dibuat:
  - `{{ VPS_UPLOAD_DIR }}/` — upload queue
  - `{{ VPS_UPLOAD_DIR }}/archive/` — archived files
- [ ] PM2 installed: `npm install -g pm2`
- [ ] server.js deployed
- [ ] PM2 started: `pm2 start ecosystem.json`
- [ ] Firewall: port 3004 only from N8N IP (or Cloudflare tunnel)

### N8N Side

- [ ] Import `tevi-autopilot.json`
- [ ] Create Google Drive OAuth2 credential
- [ ] Create SSH/SFTP credential (VPS login)
- [ ] Create SMTP credential (email)
- [ ] Create TEVI custom credential (email + password)
- [ ] Update Code nodes with your GDrive folder IDs
- [ ] Set N8N environment variables:
  - `VPS_UPLOAD_DIR`
  - `VPS_ARCHIVE_DIR`
  - `VPS_UPLOAD_URL`
  - `VPS_LOCK_FILE`
- [ ] Update notify email addresses

### Google Drive Side

- [ ] Enable Drive API in Google Cloud
- [ ] Create OAuth2 credentials
- [ ] Share each content folder with your Google account

### TEVI Side

- [ ] Active TEVI.com account
- [ ] Collections created (if using collections)
- [ ] Account email/password tested manually

---

## Revision History

| Date | Change |
|------|--------|
| 2026-07-14 | Initial PRD |
| 2026-07-14 | Login: success = UID found (not modal close) |
| 2026-07-14 | N8N v5: GDrive native + SFTP archive |
| 2026-07-14 | Simplified: N8N download → SFTP to VPS → VPS /upload |
| 2026-07-14 | DNS: tevi.upload.babyval.com → 13.75.2.24 |
| 2026-07-14 | Full audit fix: merge bug, retry doc, paths env var, binary flow, unique filename, concurrency lock, FIFO, audience logic clarified |
