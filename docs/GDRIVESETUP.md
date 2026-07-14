# Google Drive Setup Guide

How to set up Google Drive folders and OAuth2 for TEVI Autopilot.

## Folder Structure

### Recommended Structure

```
My Drive/
└── TEVI/
    ├── photo/              ← Photos (albums as subfolders)
    │   ├── Album 01/
    │   ├── Album 02/
    │   └── ...
    ├── video/              ← Videos (flat or by sub-type)
    │   ├── short/
    │   ├── medium/
    │   └── dance/
    └── porn/               ← Adult content
        ├── hentai/
        ├── japanese/
        └── amerika/
```

### Alternative: Flat Structure

```
My Drive/
└── TEVI/
    ├── photo/              ← Photos (no subfolders, listed directly)
    ├── video/
    │   ├── short/
    │   ├── medium/
    │   └── dance/
    └── porn/
        ├── hentai/
        ├── japanese/
        └── amerika/
```

Set `getSubfolder: true` in Photo Config if using subfolders.

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: `tevi-autopilot`
4. Note your Project ID

## Step 2: Enable Google Drive API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Drive API"
3. Click "Enable"

## Step 3: Create OAuth2 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `tevi-autopilot-n8n`
5. Add Authorized redirect URI:
   ```
   https://YOUR_N8N_URL/rest/oauth2-credential/callback
   ```
   Example: `https://n8n.example.com/rest/oauth2-credential/callback`
6. Click "Create"
7. Copy **Client ID** and **Client Secret**

## Step 4: Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Select "External"
3. Fill in:
   - App name: `TEVI Autopilot`
   - User support email: your@email.com
   - Developer contact: your@email.com
4. Click "Save and Continue"
5. Scopes: Click "Add or Remove Scopes"
   - Select: `../auth/drive.readonly`
6. Click "Save and Continue"
7. Add test users (your own email for testing)
8. Publish app or keep as "Testing" (Testing requires adding test users)

## Step 5: Share GDrive Folders

OAuth2 credentials access files shared with the authorized user.

1. Open Google Drive
2. Right-click on each content folder → "Share"
3. Add the Google account you used in OAuth2 setup
4. Set as "Editor"
5. Repeat for all content folders

## Step 6: Get Folder IDs

1. Open each folder in Google Drive
2. Look at the URL:
   ```
   https://drive.google.com/drive/folders/1eNwc_oeG3uwRtaDpzd3ZcEhMQdrB5FGy
                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                     This is the Folder ID
   ```
3. Copy the Folder ID for each folder
4. Paste into N8N Code nodes (Photo Config, Video Config, Porn Config)

## Testing OAuth2 Connection

### In N8N:

1. Open the workflow
2. Find a Google Drive node (e.g., "GDrive List Videos")
3. Click "Test step"
4. If prompted, authorize via OAuth2
5. Should return file list from your GDrive

### If authorization fails:

- Check redirect URI matches exactly (including https)
- Check OAuth consent screen is published or user is in test list
- Check folder is shared with the OAuth user

## Finding Your Folder IDs

### Method 1: URL

```
https://drive.google.com/drive/folders/FOLDER_ID_HERE
```

### Method 2: API

Use the Google Drive API to list folders:

```javascript
// In N8N HTTP Request node
GET https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder'
Headers: Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Organizing Content

### Photos

Photos can be organized as:
1. **Flat**: All photos in one folder, `getSubfolder: false`
2. **Albums**: Subfolders as albums, `getSubfolder: true`
   - N8N picks a random subfolder, then a random photo from that subfolder
   - Good for: one album per upload

### Videos

Videos organized by:
1. **Type** (video vs porn)
2. **Sub-type** (short/medium/dance, hentai/japanese/amerika)
3. **Flat**: All videos in one folder, random pick from all

The workflow's sub-type rotation (based on minute) determines which folder is used.

## GDrive API Limits

- 1,000 queries/day (free tier)
- At 1 upload/hour, you'll use ~30 queries/day (list + download)
- Plenty of headroom

## Large File Downloads

Google Drive has download limits:
- Files > 10MB: Download via `alt=media` endpoint
- Files > 5GB: May need resumable upload

The N8N Google Drive node handles large files automatically.

## Service Account Alternative

For multiple users or automation, consider Service Accounts instead of OAuth2:

1. Create Service Account in Google Cloud
2. Share folders with service account email
3. Use service account JSON in N8N

**Note**: Service accounts may not work with N8N's built-in Google Drive node. Check N8N documentation.

## Security Notes

- OAuth2 tokens are stored encrypted in N8N
- Tokens are NOT in server.js or workflow JSON
- Only share folders you want N8N to access
- Revoke access anytime from Google Account security settings
