# Troubleshooting Guide

Common issues and solutions.

## VPS Issues

### server.js won't start

**Error**: `Error: Cannot find module 'playwright'`

**Solution**:
```bash
cd /home/vps-user/tevi-upload
npm install express playwright cors
```

---

### Chromium not found

**Error**: `Error: Executable doesn't exist at /path/to/chromium`

**Solution**:
```bash
npx playwright install chromium
```

Find the correct path:
```bash
find /home -name 'chrome-headless-shell' 2>/dev/null
find /root -name 'chrome-headless-shell' 2>/dev/null
```

Update `CHROMIUM_PATH` in ecosystem.json or .env.

---

### Port 3004 already in use

**Error**: `Error: listen EADDRINUSE :::3004`

**Solution**:
```bash
# Find what's using port 3004
sudo lsof -i :3004

# Kill it
sudo kill <PID>

# Or use a different port
PORT=3005 pm2 restart tevi-upload
```

---

### PM2 process keeps crashing

**Check logs**:
```bash
pm2 logs tevi-upload --lines 100
```

**Check if out of memory**:
```bash
free -h
```

Playwright needs ~2GB RAM. Use a larger VPS or reduce concurrent processes.

---

## N8N Issues

### GDrive OAuth2 not working

**Error**: `OAuth2 authorization error`

**Solutions**:
1. Check redirect URI in Google Cloud Console matches N8N URL exactly
2. Check OAuth consent screen is published or user is in test users
3. Re-authorize in N8N:
   - Delete old credential
   - Create new credential
   - Re-authorize

---

### SFTP upload fails

**Error**: `Error: ENOENT: no such file or directory`

**Solutions**:
1. Check upload directory exists on VPS:
   ```bash
   ls -la /home/vps-user/tevi-uploads/
   ```
2. Check SFTP credentials in N8N are correct
3. Check directory permissions:
   ```bash
   chmod 755 /home/vps-user/tevi-uploads/
   ```

---

### Workflow not triggering

**Check**:
1. Workflow is "Active" (toggle on)
2. Schedule is correct: `0 * * * *` (every hour)
3. N8N is running
4. Check execution history in N8N UI

---

### Lock file stuck

**Problem**: `.tevi-upload.lock` exists, workflow keeps skipping

**Solution**:
```bash
# SSH to VPS
rm /home/vps-user/tevi-uploads/.tevi-upload.lock
```

---

## TEVI Upload Issues

### Login fails

**Error**: `login_failed`

**Check**:
1. Credentials are correct
2. TEVI account exists and is active
3. No 2FA enabled on TEVI account
4. TEVI hasn't changed their login UI

**Debug**: Check VPS logs for what element is visible:
```
pm2 logs tevi-upload --lines 50
```

---

### Create button not clicking

**Error**: `create_btn_not_clicked`

**Causes**:
1. Login failed (modal covering the button)
2. TEVI UI changed
3. Button selector changed

**Debug**: Add screenshot in server.js:
```javascript
await page.screenshot({ path: '/tmp/debug-create-btn.png' });
```

---

### File not selected

**Error**: `file_not_selected`

**Causes**:
1. File path doesn't exist on VPS
2. Wrong file path format (use absolute path)
3. File permissions issue

**Debug**:
```bash
# Check file exists
ls -la /home/vps-user/tevi-uploads/video.mp4

# Check path format in N8N payload
# Should be absolute: /home/vps-user/tevi-uploads/video.mp4
# NOT relative: video.mp4
```

---

### Upload timeout

**Error**: Timeout after 600 seconds

**Causes**:
1. Video file is very large
2. Slow internet connection
3. TEVI servers are slow

**Solutions**:
1. Use smaller test files first
2. Increase timeout in N8N HTTP Request node
3. Check VPS internet speed

---

### Unsupported format

**Error**: `unsupported_format`

**Cause**: TEVI doesn't support the file format

**Solutions**:
1. Convert to supported format:
   ```bash
   # Convert to MP4
   ffmpeg -i input.avi -c:v libx264 -crf 23 output.mp4
   ```
2. Check supported formats in TEVISETUP.md

---

### Post unverified

**Error**: `post_unverified`

**Cause**: Post dialog didn't close, meaning upload may have failed silently

**Debug**:
1. Check TEVI profile for the post
2. Check if there was an error message
3. Try with a smaller/shorter file

---

### "Terms of Service" or guideline dialog not handled

**Problem**: Upload hangs waiting for a dialog

**Solution**: Check if TEVI added new dialog patterns. Update the agree button patterns in server.js:

```javascript
const agreePatterns = [
  'community', 'guideline', 'agree', 'adult',
  'confirm', 'satisfied', 'konten dewasa',
  'nsfw', 'age', '18+', 'years old', 'persetujuan'
];
```

---

## GDrive Issues

### No files found

**Error**: `no_file_in_gdrive`

**Check**:
1. Folder ID is correct
2. Folder is shared with OAuth2 user
3. Folder has files (not just empty subfolders)
4. Files are in supported MIME types

**Debug**: Use N8N's test mode to run GDrive List node and see what it returns.

---

### Folder ID wrong

**Get correct ID**:
```
https://drive.google.com/drive/folders/1eNwc_oeG3uwRtaDpzd3ZcEhMQdrB5FGy
                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                      Copy this part only
```

---

### "getSubfolder" not working

**Problem**: Photo uploads always use direct list, not subfolders

**Cause**: `gdriveGetSubfolder` is false in config

**Fix**: Set to true in Photo Config Code node:
```javascript
gdriveGetSubfolder: true
```

---

## Debug Mode

### Enable debug logging on VPS

```bash
# In .env or ecosystem.json:
LOG_LEVEL=debug

# Restart
pm2 restart tevi-upload

# Watch logs
pm2 logs tevi-upload --lines 200 --nostream
```

### Take screenshots

Add to server.js during debugging:
```javascript
const DEBUG = process.env.DEBUG === 'true';

if (DEBUG) {
  await page.screenshot({ path: `/tmp/debug-${Date.now()}.png`, fullPage: true });
  console.log('Screenshot saved:', `/tmp/debug-${Date.now()}.png`);
}
```

Then run with:
```bash
DEBUG=true pm2 restart tevi-upload
```

---

## Getting Help

1. Check this troubleshooting guide first
2. Check [SETUP.md](./SETUP.md)
3. Check [TEVISETUP.md](./TEVISETUP.md)
4. Check [GDRIVESETUP.md](./GDRIVESETUP.md)
5. Check N8N execution logs
6. Check VPS PM2 logs
7. Open an issue on GitHub with:
   - Error message
   - VPS logs (with DEBUG enabled)
   - What you were trying to do
   - Steps you've already tried
