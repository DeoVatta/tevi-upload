# AI.md — AI Caption System

> How the AI caption translation system works and how to configure it.

---

## Overview

The AI Caption System translates JAV content filenames to Indonesian captions using a 5-layer pipeline. It's designed to bypass AI content policy while generating natural-sounding captions.

---

## How It Works

```
Input: "Uncen JAV Idol Massage Oil HD.mp4"

Layer 1 — Indonesian Replacement (before AI):
  mastrubate → colmek, breasts → dada, sex → seks
  → "JAV Idol Massage Oil"

Layer 2 — AI Translation (via Olagon Gateway):
  → "Pijat Oil Mahasiswi Glamour"

Layer 3 — Adult Word Injection (after AI):
  → "Pijat Oil Mahasiswi Glamour"
  (restores Indonesian adult terms found in original)

Layer 4 — Fallback Chain:
  AI fails → retry with English → "Video dewasa JAV Idol Massage Oil"
  Still fails → random caption from list

Layer 5 — Caching (VPS file, 24h TTL):
  Same file + folder → instant caption, no API call
```

---

## Indonesian Word Map

Applied BEFORE AI call to bypass content policy.

| English | Indonesian | English | Indonesian |
|---------|------------|---------|------------|
| masturbate | colmek | teen | remaja |
| breasts | dada | naked | telanjang |
| sex | seks | big | besar |
| dick | kontol | ass | bokong |
| fuck | main | rough | main |
| hardcore | main | group | grup |
| outdoor | luar ruangan | public | publik |
| stepmom | ibu tiri | pussy | memek |
| cheating | selingkuh | married | menikah |
| doctor | dokter | nurse | perawat |
| maid | pramugari | cosplay | cosplay |
| idol | idol | jav | jav |

Full list: ~40 word mappings in `tevi-upload-main.json` → "Generate AI Caption" node.

---

## Caption Format Per Type

| Type | Sub-type | Format |
|------|----------|--------|
| adult | japanese | `(JAV) {translated}\n\n{suffix}` |
| adult | amerika | `[Amerika] {translated}\n\n{suffix}` |
| adult | (default) | `{translated}\n\n{suffix}` |
| standard | any | `{translated}\n\n{suffix}` |

**Example:**
```
(JAV) Pijat Oil Mahasiswi Glamour

Topup Star Tevi di babyval.com
```

---

## Configuration

### Enable AI per Category

In the Config Workflow:

1. Edit the category
2. Set **AI Translate**: "Yes (AI translate)"
3. Save

### Custom AI Prompt

For adult content, you can customize the prompt:

1. Edit the category
2. Fill **AI Prompt**:
   ```
   Translate to Bahasa Indonesia. Short, natural, max 10 words. No emojis.
   ```
3. Save

### Per-SubType Prompt

For adult categories, you can set a different prompt per sub-type:

In config.json:
```json
{
  "id": "adult",
  "type": "adult",
  "aiTranslate": true,
  "subTypes": [
    {
      "id": "hentai",
      "aiPrompt": "Translate to Bahasa Indonesia. Short, max 8 words. No emojis. Hentai style."
    },
    {
      "id": "japanese",
      "aiPrompt": "Translate to Bahasa Indonesia. Short, max 10 words. No emojis. JAV style."
    }
  ]
}
```

---

## N8N AI Settings

These are N8N Variables (Settings → Variables):

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_ENDPOINT` | `https://gateway.olagon.site/anthropic/v1/messages` | API endpoint |
| `AI_MODEL` | `claude-sonnet-4-6` | Model name |
| `AI_MAX_TOKENS` | `200` | Max tokens per request |
| `AI_RETRY_ATTEMPTS` | `3` | Number of retries |
| `AI_CACHE_TTL_HOURS` | `24` | Caption cache TTL |

---

## AI API Keys

AI API keys are stored in the N8N Credential "AI Service".

### Adding Keys

1. Settings → Credentials → "AI Service"
2. Edit the credential
3. Update the `keys` field:
   ```json
   ["rk_live_key1...", "rk_live_key2..."]
   ```
4. Save

Keys are used in **round-robin** order across retries.

---

## Caching

Captions are cached on the VPS at:
```
{VPS_ARCHIVE_DIR}/.caption_cache.json
```

### Cache Structure

```json
{
  "entries": {
    "filename_folderid": {
      "caption": "(JAV) Pijat Oil...",
      "cachedAt": "2026-07-14T10:00:00Z"
    }
  }
}
```

### Cache Behavior

- **Same file + same folder** within 24h → uses cached caption (no API call)
- **Different folder** → new API call
- **Expired (24h)** → new API call
- **Cache write failed** → continues without caching

### Clear Cache

To clear the caption cache:

```bash
# SSH to VPS
rm ~/.caption_cache.json
```

Or use the Config Workflow to trigger a cache clear.

---

## Disabling AI

To disable AI caption and use random captions instead:

1. In Config Workflow, edit the category
2. Set **AI Translate**: "No (Random caption)"
3. Add captions in the **Captions** field (one per line)

---

## Troubleshooting

### AI returning English instead of Indonesian

- Check if the Indonesian word map is being applied
- The AI prompt may need adjustment
- Try with a different filename

### AI returning "I can't help with that"

- The Indonesian word replacement map should bypass content policy
- Try a less explicit filename
- Check if the AI model is blocking the request

### Captions are too long

- Reduce `AI_MAX_TOKENS` (try 100)
- Adjust the prompt to say "max 5 words"

### Captions not being cached

- Check if `.caption_cache.json` exists on VPS
- Check file permissions
- VPS user must have write access to archive directory

---

## Testing AI Caption

1. Put a test file in a GDrive folder:
   ```
   JAV College Girl Massage Oil HD.mp4
   ```
2. Run the Main Workflow manually
3. Check the notification email for the generated caption
4. Check `.caption_cache.json` on VPS for the cached result
