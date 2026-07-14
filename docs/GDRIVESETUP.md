# GDRIVESETUP.md — Google Drive Setup

> How to set up Google Drive API and folder structure for the TEVI Upload System.

---

## 1. Create Google Cloud Project

### 1.1 Go to Google Cloud Console

https://console.cloud.google.com/

### 1.2 Create New Project

1. Click "Select a project" dropdown
2. Click "New Project"
3. Project name: `tevi-autopilot`
4. Click "Create"

### 1.3 Enable Google Drive API

1. In sidebar: "APIs & Services" → "Library"
2. Search "Google Drive API"
3. Click "Google Drive API"
4. Click "Enable"

---

## 2. Create OAuth2 Credentials

### 2.1 Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External"
3. Fill:
   - App name: `TEVI Autopilot`
   - User support email: your email
   - Developer contact: your email
4. Click "Save and Continue"

### 2.2 Scopes

1. Click "Add or Remove Scopes"
2. Add: `../auth/drive.readonly`
3. Click "Save and Continue"

### 2.3 Test Users

1. Add your Google account as a test user
2. This allows you to use the OAuth flow during development

### 2.4 Create OAuth Client ID

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `tevi-autopilot-n8n`
5. Authorized redirect URIs:
   - N8N Cloud: `https://YOUR-N8N-INSTANCE/rest/oauth2-credential/callback`
   - Self-hosted: `http://YOUR-N8N-URL:5678/rest/oauth2-credential/callback`
6. Click "Create"
7. Copy **Client ID** and **Client Secret**

### 2.5 Add to N8N

1. In N8N: Settings → Credentials → Add Credential
2. Type: "Google Drive OAuth2 API"
3. Paste Client ID and Client Secret
4. Click "Sign in with Google" to authorize
5. Grant access to the folders you'll use

---

## 3. Create Folder Structure

Create this structure in Google Drive:

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

### 3.1 How to Get Folder ID

The folder ID is the last part of the Google Drive URL:

```
https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is the Folder ID
```

### 3.2 Share Folders

For each folder, share with the Google account used in the N8N OAuth2 credential:

1. Right-click folder → "Share"
2. Add the email address
3. Role: "Editor"
4. Click "Send"

---

## 4. Adding Content

### 4.1 Photo Content

- Put photos directly in the album folder
- Supports: JPG, PNG, GIF, WEBP
- Naming convention doesn't matter (for non-AI captions)

### 4.2 Video Content

- Put videos in the appropriate subfolder (short/medium/dance)
- Supports: MP4, MKV, AVI, MOV, WEBM, M4V
- For AI caption: use descriptive filenames like `Uncen JAV Idol Massage Oil HD.mp4`

### 4.3 Adult Content

- Use descriptive English filenames for AI caption translation
- Examples:
  - `JAV College Girl Cosplay Massage Oil.mp4`
  - `Uncen Amateur Housewife Cheating Husband.mp4`
  - `Hentai Maid Costume Service.mp4`

---

## 5. Managing Folders

### 5.1 Adding New Albums

1. Create folder in Google Drive
2. Share with OAuth2 account
3. Add folder ID to config via Config Workflow:
   - Action: "Edit Category"
   - Add the new GDrive Folder ID

### 5.2 Removing Content

1. Delete files from Google Drive
2. Or move to a separate folder not in the config
3. Files are picked randomly — no need to edit config

### 5.3 Scanning Subfolders

For photo albums with subfolders:

In config, set `scanSubfolders: true`:

```json
{
  "id": "photo",
  "gdriveFolders": [
    {
      "id": "PARENT_FOLDER_ID",
      "scanSubfolders": true
    }
  ]
}
```

This will list files from all subfolders inside.

---

## 6. Troubleshooting

### 6.1 "Insufficient permissions"

- The OAuth2 account doesn't have access to the folder
- Re-share the folder with the account

### 6.2 "File not found"

- The file was moved or deleted from Google Drive
- Check if the file still exists

### 6.3 OAuth token expired

- Re-authorize the Google Drive credential in N8N
- In N8N: open the credential → click "Reconnect"

---

## 7. Security Notes

- Only share folders with the dedicated automation account
- Don't share your personal Google Drive folders
- Use a separate Google account for automation
- The OAuth2 credential has access to all folders shared with that account
