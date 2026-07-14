# TROUBLESHOOT.md — Common Issues & Solutions

---

## VPS / Server Issues

### Server not starting

**Symptom**: `pm2 start` fails or server exits immediately.

**Check**:
```bash
pm2 logs tevi-upload --lines 50
```

**Common causes**:
- Port 3004 already in use: `lsof -i :3004` or change PORT
- Chromium not installed: `npx playwright install chromium`
- Permission denied on log file: `mkdir -p ~/logs && chmod 755 ~/logs`

**Fix**:
```bash
# Check if port is free
lsof -i :3004

# Check Chromium path
ls /home/vps-devata/.cache/ms-playwright/

# Reinstall Chromium
npx playwright install chromium
```

---

### Health endpoint returns error

**Symptom**: `curl http://localhost:3004/health` returns non-200.

**Check**:
```bash
curl -v http://localhost:3004/health
```

**Fix**:
```bash
pm2 restart tevi-upload
pm2 logs tevi-upload --lines 20
```

---

### Browser crashes / memory error

**Symptom**: Server crashes with `out of memory` or Chromium error.

**Fix**:
- Add swap: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- Limit browser instances: server.js uses 1 instance only
- Use headless shell variant (already configured)

---

## Login Issues

### "UID not found after 60s poll"

**Symptom**: Login fails in upload flow.

**Causes**:
1. Wrong email or password → check N8N TEVI Credential
2. 2FA enabled on TEVI account → disable 2FA or use account without 2FA
3. TEVI changed login flow → check selectors in server.js

**Fix**:
- Test login manually in browser first
- Check N8N TEVI Credential credentials
- Verify account doesn't have 2FA

---

### "Email button not found"

**Symptom**: Login step fails at email button click.

**Cause**: TEVI may have changed the login page UI.

**Fix**:
- Manually test login at tevi.com
- Check the button selector in server.js
- Update selector: look for button containing "email" text

---

## Upload Issues

### "Post form not visible after 45s"

**Symptom**: Upload fails after clicking create button.

**Causes**:
- TEVI requires login → login should have failed earlier
- Modal overlay blocking → check server.js modal cleanup
- TEVI changed UI → check selectors

**Fix**:
- Test manually: go to tevi.com, click create button, does form appear?
- Check if server.js selectors match current TEVI UI

---

### "File chooser not opened"

**Symptom**: `fileNotSelected` error.

**Cause**: The upload button click didn't work.

**Fix**:
- Check if `#post-form-upload-media-btn` or `#post-form-upload-media-icon` exists
- TEVI may have changed the upload button selector

---

### "Unsupported format"

**Symptom**: TEVI rejects the file format.

**Cause**: File type not supported by TEVI.

**Supported formats**:
- Photos: JPG, PNG, GIF, WEBP
- Videos: MP4, MKV, AVI, MOV, WEBM, M4V

**Fix**:
- Convert file to supported format
- Check file extension matches actual content

---

### "Post unverified" — dialog doesn't close

**Symptom**: Post dialog stays open after submit.

**Causes**:
- Video stuck uploading (large file)
- TEVI rate limiting
- TEVI content policy violation

**Fix**:
- Check TEVI upload limits
- Try smaller file
- Wait and retry

---

## N8N Workflow Issues

### "CONFIG_VERSION_MISMATCH"

**Symptom**: Workflow stops at Validate Version node.

**Cause**: config.json has wrong version or is corrupted.

**Fix**:
```bash
# SSH to VPS and check config
nano ~/tevi-uploads/config.json

# Make sure version is 3
{
  "version": 3,
  ...
}
```

Or use Config Workflow to re-save the config.

---

### "NO_CATEGORY_ENABLED"

**Symptom**: Workflow stops with this error.

**Cause**: All categories are disabled.

**Fix**:
1. Open Config Workflow
2. Select "Enable Category"
3. Enter the category ID
4. Save

---

### Lock Failed — workflow stops

**Symptom**: Workflow stops with "Lock Failed" error.

**Cause**: Another workflow instance is still running.

**Fix**:
1. Wait for the other instance to finish
2. Or manually remove lock file:
   ```bash
   ssh vps-devata@13.75.2.24 "rm ~/tevi-uploads/state.json.lock"
   ```

---

### Lock not releasing after error

**Symptom**: Lock file still exists after workflow error.

**Cause**: Error happened before Release Lock node ran.

**Fix**:
```bash
ssh vps-devata@13.75.2.24 "rm ~/tevi-uploads/state.json.lock"
```

---

### "NO_FILES" — folder is empty

**Symptom**: Workflow stops, no files found.

**Cause**: GDrive folder has no files, or OAuth2 can't access it.

**Fix**:
- Add files to the GDrive folder
- Share folder with OAuth2 account
- Check folder ID in config

---

### Credential not found

**Symptom**: Workflow errors on credential nodes.

**Cause**: Credential not created or not assigned to node.

**Fix**:
1. Settings → Credentials
2. Check all 5 credentials exist
3. Open workflow → click on each node → verify credential is assigned

---

## Google Drive Issues

### "Insufficient permissions"

**Symptom**: Google Drive node fails.

**Cause**: OAuth2 account doesn't have access to folder.

**Fix**:
1. Open Google Drive
2. Right-click the folder → Share
3. Add the email used in N8N Google Drive credential
4. Role: Editor

---

### OAuth token expired

**Symptom**: Google Drive node fails with auth error.

**Fix**:
1. In N8N: Settings → Credentials
2. Open "Google Drive" credential
3. Click "Reconnect" or "Sign in with Google"
4. Re-authorize

---

### Wrong files listed

**Symptom**: Wrong category picks files.

**Cause**: Folder ID in config is wrong.

**Fix**:
1. Get correct folder ID from Google Drive URL
2. Update config via Config Workflow

---

## AI Caption Issues

### AI returning null / fallback caption

**Symptom**: Caption uses fallback instead of AI translation.

**Causes**:
- No AI API keys in N8N Credential
- API endpoint unreachable
- AI model error

**Fix**:
1. Check AI Service credential has valid keys
2. Check AI_ENDPOINT variable
3. Test API manually with curl

---

### Captions are English instead of Indonesian

**Symptom**: AI returns English captions.

**Cause**: Indonesian word map not being applied, or AI ignoring it.

**Fix**:
- Check Indonesian word map in Generate AI Caption node
- Try different filename

---

## Email Notification Issues

### No emails received

**Causes**:
- SMTP credential wrong
- Email going to spam
- Email not configured

**Fix**:
- Check Email SMTP credential
- Check NOTIFY_EMAIL variable
- Check spam folder

---

## Quick Diagnosis Commands

```bash
# Check server status
pm2 status
pm2 logs tevi-upload --lines 20

# Check lock file
ls -la ~/tevi-uploads/*.lock

# Check config
nano ~/tevi-uploads/config.json

# Check state
nano ~/tevi-uploads/state.json

# Test server
curl http://localhost:3004/health

# Check disk space
df -h

# Check memory
free -h
```
