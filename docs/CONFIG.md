# CONFIG.md — Config Workflow Guide

> How to use the N8N Config Workflow to manage your upload configuration.

---

## What is the Config Workflow?

The Config Workflow lets you manage `config.json` on your VPS through a simple form — no JSON editing required.

Access: Open `TEVI Upload — Config Editor` in N8N → click "Test Step"

---

## Available Actions

| Action | Description |
|--------|-------------|
| **View Config** | Preview current config.json |
| **Add Category** | Add a new upload category |
| **Edit Category** | Edit an existing category |
| **Delete Category** | Permanently remove a category |
| **Enable Category** | Re-enable a disabled category |
| **Disable Category** | Temporarily disable a category |
| **Reorder Rotation** | Change the rotation order |

---

## Adding a Category

### 1. Open the Form

1. Open "TEVI Upload — Config Editor" in N8N
2. Click "Test Step"
3. Select "Add Category" from the Action dropdown

### 2. Fill the Form

| Field | Required | Description |
|-------|----------|-------------|
| **Category ID** | Yes | Unique identifier (alphanumeric + underscore, max 30 chars) |
| **Category Name** | No | Display name (e.g. "📷 Photo") |
| **Category Type** | Yes | Standard = Photo/Video, Adult = Sub-category |
| **GDrive Folder ID** | Yes | Get from Google Drive folder URL |
| **GDrive Folder Name** | No | Optional display name |
| **Collection** | No | TEVI collection name (must match exactly) |
| **Audience** | No | Paid = ⭐ (default), Free |
| **Price** | No | Default price in stars (default: 10) |
| **Always Members Only** | No | Yes = Members Only, No = Anyone can buy |
| **Caption Suffix** | No | Text appended to all captions |
| **AI Translate** | No | Yes = AI translate filenames, No = Random caption |
| **AI Prompt** | No | Custom AI prompt (for adult content) |
| **Captions** | No | Random captions (one per line), used when AI is OFF |

### 3. Set Confirmation

- **"No — just preview"**: See what the config would look like without saving
- **"Yes — save to VPS"**: Actually save to VPS

### 4. Submit

Click Submit. The config will be uploaded to VPS.

---

## AI Translate vs Random Caption

### AI Translate (Recommended for Adult)

- Translates JAV filenames to Indonesian captions
- Uses 5-layer pipeline:
  1. Indonesian word replacement (bypasses content policy)
  2. AI translation via Olagon Gateway
  3. Adult word injection
  4. Fallback chain
  5. Caching (24h)

**Filename examples:**
```
Input:  "JAV College Girl Massage Oil HD.mp4"
Output: "(JAV) Pijat Oil Mahasiswi Glamour\n\nTopup Star Tevi di babyval.com"
```

### Random Caption (Recommended for Photo/Video)

- Picks a random caption from the captions list
- Good for non-adult content
- No API calls needed

**Captions format:**
```
Love this vibes 💖
New content just for you ✨
Double tap if you love it ❤️
```

---

## Edit Category

1. Select "Edit Category" from Action
2. Enter the Category ID to edit
3. Fill only the fields you want to change
4. Submit

---

## Delete Category

1. Select "Delete Category" from Action
2. Enter the Category ID to delete
3. Set "Confirm Action" to "Yes"
4. Submit

**Warning**: This permanently removes the category from config.json.

---

## Enable / Disable Category

Disable when:
- Folder is empty
- You want to pause uploads for this category
- Maintenance

Enable when:
- Ready to resume

---

## Reorder Rotation

The rotation order determines which category is picked next.

**Example**: `photo,video,adult`
- Run 1: photo
- Run 2: video
- Run 3: adult
- Run 4: photo
- Run 5: video
- Run 6: adult

**To change order:**
1. Select "Reorder Rotation" from Action
2. Enter comma-separated IDs: `adult,photo,video`
3. Submit

---

## Validation Rules

The form validates:

1. **Category ID format**: alphanumeric + underscore, max 30 chars
2. **Duplicate ID**: Cannot add a category with existing ID
3. **Max 10 categories**: Cannot exceed 10 categories
4. **At least one folder**: Each category needs at least one GDrive folder
5. **Adult needs sub-type**: Adult categories need at least one enabled sub-type

Validation errors are shown inline next to the field.

---

## Preview JSON

Before saving, you can preview the full config.json:

1. Set "Confirm Action" to "No — just preview"
2. Submit
3. The Preview node shows the formatted JSON

---

## Manual Edit (Advanced)

If you need to edit config.json manually:

```bash
# SSH to VPS
ssh vps-devata@13.75.2.24

# Edit config
nano ~/tevi-uploads/config.json

# Validate syntax
python3 -m json.tool ~/tevi-uploads/config.json
```

---

## Reset Config

To reset to empty config:

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
