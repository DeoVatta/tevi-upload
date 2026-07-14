/**
 * TEVI UPLOAD SERVER
 * ====================
 * Dumb executor — semua brain logic ada di N8N.
 * Server.js hanya: terima request → Playwright automation → return result.
 *
 * Endpoints:
 *   POST /upload  — Playwright browser automation
 *   GET  /health — Health check
 *
 * NO credentials stored here. All auth data from N8N request body.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const cors = require('cors');

// ── Config ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3004;
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/home/vps-devata/tevi-uploads';
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || '/home/vps-devata/tevi-uploads/archive';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || (
  '/home/vps-devata/.cache/ms-playwright/' +
  'chromium_headless_shell-1228/' +
  'chrome-headless-shell-linux64/' +
  'chrome-headless-shell'
);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// ── Logging ─────────────────────────────────────────────────────────────────
const LOG_FILE = '/home/vps-devata/logs/tevi-upload.log';
function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function log(msg, level) {
  level = level || 'INFO';
  if (LOG_LEVEL === 'debug' || level === 'ERROR' || level === 'WARN') {
    const ts = new Date().toISOString();
    const line = `${ts} [TEVI] [${level}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isVideo(p) { return ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'].includes(path.extname(p).toLowerCase()); }
function isPhoto(p) { return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(p).toLowerCase()); }
function isHentai(body) { return body && body.audienceMembership === true; }

// ── Setup ───────────────────────────────────────────────────────────────────
ensureDir(UPLOAD_DIR);
ensureDir(ARCHIVE_DIR);
ensureDir(path.dirname(LOG_FILE));

// ── Helpers ─────────────────────────────────────────────────────────────────
async function withBrowser(fn) {
  let browser;
  try {
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
    return await fn(browser);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function errorResponse(reason, step, detail, statusCode = 200) {
  return { success: false, reason, step, detail };
}

function successResponse(file, url) {
  return { success: true, uploaded: true, file, url };
}

// ── LOGIN ──────────────────────────────────────────────────────────────────
async function login(page, email, password) {
  log(`Login start: ${email}`);

  await page.goto('https://tevi.com/', { waitUntil: 'domcontentloaded' });
  await sleep(13000); // Wait for initial page load

  // Click login banner if visible
  try {
    const bannerBtn = await page.$('#nav-login-banner-btn');
    if (bannerBtn) {
      await bannerBtn.click();
      await sleep(2000);
      log('Login banner clicked');
    }
  } catch (e) {
    log('No login banner found, continuing');
  }

  // Click "with email" button
  const emailBtn = await page.locator('button', { hasText: /with\s+email/i }).first();
  await emailBtn.click();
  await sleep(3000);
  log('With email clicked');

  // Fill credentials
  await page.fill('#auth-email-input, input[type="email"], input[name="email"]', email);
  await page.fill('#auth-password-input, input[type="password"], input[name="password"]', password);
  await sleep(500);

  // Submit
  const submitBtn = await page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign In")').first();
  await submitBtn.click();
  await sleep(8000);
  log('Credentials submitted');

  // Poll for UID (login success)
  const uidFound = await page.waitForFunction(
    () => {
      const el = document.querySelector('#nav-profile-btn, a[href*="/@"], [class*="nav-profile"]');
      return !!el || (window.location.pathname && window.location.pathname.startsWith('/@'));
    },
    { timeout: 60000, polling: 1000 }
  ).then(() => true).catch(() => false);

  if (!uidFound) {
    // Check if login modal is still visible
    const modalVisible = await page.$('#auth-signin-btn, #auth-forgot-password-btn');
    const modalText = modalVisible ? await modalVisible.textContent() : '';
    log(`Login failed: UID not found. Modal visible: ${!!modalVisible}`, 'ERROR');
    return { success: false, reason: 'login_failed', step: 'login', detail: `UID not found after 60s poll. Modal visible: ${!!modalVisible}. ${modalText}` };
  }

  log('Login success: UID found in DOM');
  await page.keyboard.press('Escape');
  await sleep(3000);
  return { success: true };
}

// ── UPLOAD ─────────────────────────────────────────────────────────────────
async function uploadContent(page, body) {
  const { filePath, caption, collection, audienceFree, audiencePaid, audiencePrice, audienceMembership, alwaysMembers } = body;
  const isVideoFile = isVideo(filePath);

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return errorResponse('file_not_found', 'upload', `File not found: ${filePath}`);
  }

  // Homepage setup: scroll to init lazy load
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(2500);
  }
  await sleep(1000);

  // Modal cleanup loop (5x)
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.evaluate(() => {
      const selectors = [
        '.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root',
        '[role="presentation"]',
        ...Array.from(document.querySelectorAll('[class*="backdrop"], [class*="overlay"]'))
          .filter(el => parseInt(getComputedStyle(el).zIndex) > 1000 || getComputedStyle(el).position === 'fixed')
      ];
      selectors.forEach(el => { if (el && el.remove) el.remove(); });
    });
    await sleep(300);
  }
  await sleep(1000);

  // Inject mutation observer to auto-remove modals
  await page.evaluate(() => {
    const observer = new MutationObserver(mutations => {
      const selectors = ['.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root'];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Click #nav-create-btn
  let createClicked = false;
  const createBtn = await page.$('#nav-create-btn');
  if (createBtn) {
    await createBtn.scrollIntoViewIfNeeded();
    await createBtn.click({ force: true });
    createClicked = true;
    await sleep(2000);
    log('Create button clicked');

    // Handle "Create a post" popup if it appears
    for (const sel of ['text=Create a post', '[class*="create-post"]']) {
      const popup = await page.$(sel);
      if (popup) { await popup.click(); break; }
    }
  }

  if (!createClicked) {
    return errorResponse('create_btn_not_clicked', 'create', '#nav-create-btn not found or not clickable');
  }

  await sleep(8000); // Wait for post form

  // Poll for post form
  const formVisible = await page.waitForFunction(
    () => !!document.querySelector('#post-form-upload-media-btn, #post-form-root'),
    { timeout: 45000, polling: 1000 }
  ).then(() => true).catch(() => false);

  if (!formVisible) {
    return errorResponse('post_form_not_visible', 'create', 'Post form not visible after 45s');
  }
  log('Post form visible');

  // File select
  const fc = await page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);
  if (!fc) {
    // Try clicking the upload button
    const uploadBtn = await page.$('#post-form-upload-media-icon, #post-form-upload-media-btn');
    if (uploadBtn) await uploadBtn.click();
    await sleep(500);
    const fc2 = await page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
    if (!fc2) return errorResponse('file_not_selected', 'upload', 'File chooser not opened');
    await fc2.setFiles(filePath);
  } else {
    await fc.setFiles(filePath);
  }
  log(`File selected: ${path.basename(filePath)}`);

  // Wait for preview
  const previewSelector = isVideoFile
    ? '#post-form-video-preview, video'
    : '#post-form-photo-preview, img[src*="preview"]';

  for (let i = 0; i < 120; i++) {
    // Check for unsupported format error
    const errEl = await page.$('[class*="error"], [class*="unsupported"], [class*="format"]');
    if (errEl) {
      const text = await errEl.textContent().catch(() => '');
      if (text.toLowerCase().includes('unsupported') || text.toLowerCase().includes('format')) {
        return errorResponse('unsupported_format', 'upload', `Unsupported format error: ${text}`);
      }
    }

    const preview = await page.$(previewSelector);
    if (preview) { log('Preview loaded'); break; }
    await sleep(3000);

    if (i === 119) {
      return errorResponse('upload_error', 'upload', 'Preview not loaded after 6 minutes');
    }
  }

  // Caption
  const captionInput = await page.$('#post-form-caption-input');
  if (captionInput) {
    await captionInput.fill(caption || '');
    log('Caption filled');
  }

  // Collection
  if (collection) {
    const colBtn = await page.$('#post-form-collection-open-btn');
    if (colBtn) {
      await colBtn.click();
      await sleep(1000);
      for (let attempt = 0; attempt < 10; attempt++) {
        const dialog = await page.$('#post-form-collection-dialog');
        if (dialog) {
          const collectionItem = await page.locator('[class*="collection-item"], [class*="collection"]', { hasText: collection }).first();
          if (await collectionItem.isVisible().catch(() => false)) {
            await collectionItem.click();
            await sleep(500);
            await page.keyboard.press('Escape');
            break;
          }
        }
        await sleep(1000);
      }
      log(`Collection: ${collection}`);
    }
  }

  // Audience
  if (audienceFree === true) {
    log('Audience: FREE (default, no action)');
  }

  if (audiencePaid === true) {
    const audienceBtn = await page.$('#post-form-audience-btn');
    if (audienceBtn) {
      await audienceBtn.click();
      await sleep(2000);

      // Uncheck free switch if checked
      const freeSwitch = await page.$('#post-form-audience-free-switch');
      if (freeSwitch) {
        const isChecked = await freeSwitch.isChecked().catch(() => false);
        if (isChecked) await freeSwitch.click();
      }

      // Check paid switch if not already checked
      const paidSwitch = await page.$('#post-form-audience-paid-switch');
      if (paidSwitch) {
        const isChecked = await paidSwitch.isChecked().catch(() => false);
        if (!isChecked) await paidSwitch.click();
      }

      // Fill star price
      const priceInput = await page.$('#post-form-audience-star-price-input');
      if (priceInput) {
        await priceInput.fill(String(audiencePrice || 10));
      }

      // Members switch: check if audienceMembership OR alwaysMembers
      const membersSwitch = audienceMembership === true || alwaysMembers === true;
      if (membersSwitch) {
        const switchEl = await page.$('#post-form-audience-members-switch');
        if (switchEl) {
          const isChecked = await switchEl.isChecked().catch(() => false);
          if (!isChecked) await switchEl.click();
          log('Audience: MEMBERS ONLY enforced');
        }
      }

      await page.keyboard.press('Escape');
      await sleep(500);
      log('Audience settings applied');
    }
  }

  // Submit
  const submitBtn = await page.$('#post-form-submit-btn');
  if (submitBtn) {
    await submitBtn.click();
    await sleep(3000);
    log('Submit clicked');
  }

  // Guidelines confirm
  const guidelinesBtn = await page.$('#post-form-guidelines-confirm-btn');
  if (guidelinesBtn) {
    await guidelinesBtn.click();
    await sleep(2000);
    log('Guidelines confirmed');
  }

  // Agree dialog — poll for button with matching patterns
  const agreePatterns = isHentai(body)
    ? ['community', 'guideline', 'agree', 'adult', 'confirm', 'satisfied', 'konten dewasa', 'nsfw', 'age', '18+', 'years old', 'persetujuan']
    : ['community', 'guideline', 'agree', 'adult', 'confirm', 'satisfied'];

  const maxPoll = isHentai(body) ? 400 : 50;
  const pollInterval = 300; // ms

  for (let i = 0; i < maxPoll; i++) {
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = (await btn.textContent().catch(() => '')).toLowerCase().trim();
      if (agreePatterns.some(p => text.includes(p))) {
        await btn.click();
        log(`Agree button clicked: "${text}"`);
        await sleep(2000);
        break;
      }
    }
    await sleep(pollInterval);

    // Hentai: check if video ended (server approved)
    if (isHentai(body)) {
      const videoEl = await page.$('video');
      if (videoEl) {
        const currentTime = await page.evaluate(() => {
          const v = document.querySelector('video');
          return v ? v.currentTime : 0;
        });
        const duration = await page.evaluate(() => {
          const v = document.querySelector('video');
          return v ? v.duration : 0;
        });
        if (currentTime > 0 && duration > 0 && currentTime >= duration - 1) {
          log('Hentai video ended — server approved content');
          // Look for agree button again
        }
      }
    }
  }

  if (isHentai(body)) {
    log('Agree dialog (hentai) timeout — proceeding anyway', 'WARN');
  }

  // Verify post (poll dialog closed = success)
  const maxVerify = isHentai(body) ? 600 : 80;
  let postVerified = false;
  let postError = null;

  for (let i = 0; i < maxVerify; i++) {
    const dialog = await page.$('#post-form-dialog');
    if (!dialog) {
      postVerified = true;
      log('Post verified: dialog closed');
      break;
    }

    // Check for error text in dialog
    const errorText = await page.evaluate(() => {
      const dialog = document.querySelector('#post-form-dialog');
      if (!dialog) return null;
      const errorEls = dialog.querySelectorAll('[class*="error"], [class*="failed"]');
      return errorEls.length > 0 ? Array.from(errorEls).map(el => el.textContent).join(' ') : null;
    });

    if (errorText) {
      postError = errorText;
      break;
    }

    // Video stuck detection
    if (isVideoFile) {
      const currentTime = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      });

      if (currentTime > 0 && currentTime < 4) {
        const stuckCount = await page.evaluate(() => window._videoStuckCount || 0);
        await page.evaluate(() => {
          const v = document.querySelector('video');
          window._videoStuckCount = (window._videoStuckCount || 0) + 1;
        });

        if (stuckCount >= 8) {
          log('Video stuck — attempting to play');
          await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) v.play().catch(() => {});
          });
          const playBtn = await page.$('[class*="play"], [class*="playback"]');
          if (playBtn) await playBtn.click().catch(() => {});
          await page.evaluate(() => { window._videoStuckCount = 0; });
        }
      } else {
        await page.evaluate(() => { window._videoStuckCount = 0; });
      }
    }

    await sleep(3000);

    if (i === maxVerify - 1) {
      return errorResponse('post_unverified', 'verify', 'Post dialog not closed after maximum timeout');
    }
  }

  if (postError) {
    return errorResponse('post_unverified', 'verify', `Post error: ${postError}`);
  }

  // Get post URL
  let postUrl = null;
  for (let i = 0; i < 30; i++) {
    postUrl = await page.evaluate(() => {
      const href = window.location.href;
      if (href.includes('/post/') || href.includes('/posts/')) return href;
      return null;
    });

    // Also check for success toast
    const toastText = await page.evaluate(() => {
      const toasts = document.querySelectorAll('[class*="toast"], [class*="snackbar"], [class*="notification"]');
      for (const t of toasts) {
        const text = t.textContent.toLowerCase();
        if (text.includes('posted') || text.includes('berhasil') || text.includes('success')) return text;
      }
      return null;
    });

    if (postUrl || toastText) {
      log(`Post URL captured: ${postUrl || 'from toast: ' + toastText}`);
      break;
    }
    await sleep(3000);
  }

  return { success: true, url: postUrl };
}

// ── HTTP Server ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  cors()(req, res, () => {});

  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── GET /health ──────────────────────────────────────────────────────────
  if (url === '/health' && req.method === 'GET') {
    const uptime = Math.floor(process.uptime());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime, browser: 'chromium', version: '1.40' }));
    return;
  }

  // ── POST /upload ─────────────────────────────────────────────────────────
  if (url === '/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let data;
      try { data = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'invalid_body', step: 'parse', detail: 'Invalid JSON' }));
        return;
      }

      // Validate required fields
      if (!data.email || !data.password || !data.filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'missing_fields', step: 'validate', detail: 'email, password, and filePath are required' }));
        return;
      }

      log(`Upload request: ${data.filePath}, caption: "${(data.caption || '').substring(0, 50)}..."`);

      try {
        const result = await withBrowser(async (browser) => {
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
            acceptDownloads: false,
          });
          const page = await context.newPage();

          // LOGIN
          const loginResult = await login(page, data.email, data.password);
          if (!loginResult.success) {
            await context.close();
            return loginResult;
          }

          // UPLOAD
          const uploadResult = await uploadContent(page, data);
          await context.close();
          return uploadResult;
        });

        const statusCode = result.success ? 200 : 200; // Always 200, success/fail in body
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.success
          ? successResponse(path.basename(data.filePath), result.url)
          : result
        ));
      } catch (err) {
        log(`Server error: ${err.message}`, 'ERROR');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse('upload_error', 'server', err.message)));
      }
      return;
    });
    return;
  }

  // ── 404 ─────────────────────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, reason: 'not_found' }));
});

server.listen(PORT, () => {
  log(`TEVI Upload Server started on port ${PORT}`);
  log(`Upload dir: ${UPLOAD_DIR}`);
  log(`Archive dir: ${ARCHIVE_DIR}`);
  log(`Chromium: ${CHROMIUM_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    log('Server closed');
    process.exit(0);
  });
});
