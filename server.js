'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const PORT = parseInt(process.env.PORT) || 3004;
const LOG_FILE = process.env.LOG_FILE || '/home/vps-devata/logs/tevi-upload.log';

function log(msg, level) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level || 'INFO'}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function isVideo(p) {
  return ['.mp4','.mkv','.avi','.mov','.webm','.m4v'].some(e => p.toLowerCase().endsWith(e));
}

function getChromiumPath() {
  return process.env.CHROMIUM_PATH || (
    '/home/vps-devata/.cache/ms-playwright/' +
    'chromium_headless_shell-1228/' +
    'chrome-headless-shell-linux64/' +
    'chrome-headless-shell'
  );
}

// ── LOGIN ───────────────────────────────────────────────────

async function login(page, email, password) {
  log(`Login: navigating to tevi.com`);
  await page.goto('https://tevi.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(13000);

  // Dismiss login banner if present
  try {
    const banner = await page.$('#nav-login-banner-btn');
    if (banner) {
      await banner.click();
      await sleep(2000);
      log(`Login: dismissed login banner`);
    }
  } catch {}

  // Click "with email"
  try {
    const emailBtn = page.locator('button', { hasText: /with\s+email/i }).first();
    await emailBtn.click({ timeout: 10000 });
    log(`Login: clicked email button`);
    await sleep(3000);
  } catch (e) {
    log(`Login: email button not found — ${e.message}`, 'WARN');
    return { success: false, reason: 'login_failed', step: 'navigate', detail: 'Email button not found' };
  }

  // Fill credentials
  try {
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"]', password);
    log(`Login: filled credentials`);
  } catch (e) {
    log(`Login: credential fields not found — ${e.message}`, 'WARN');
    return { success: false, reason: 'login_failed', step: 'fill', detail: 'Credential fields not found' };
  }

  // Submit
  try {
    await page.locator('button[type="submit"]').first().click({ timeout: 5000 });
    log(`Login: submitted`);
    await sleep(8000);
  } catch (e) {
    return { success: false, reason: 'login_failed', step: 'submit', detail: e.message };
  }

  // Poll for UID — login success
  try {
    await page.waitForFunction(
      () => !!document.querySelector('#nav-profile-btn, a[href*="/@"]'),
      { timeout: 60000, polling: 1000 }
    );
    log(`Login: UID found — login success`);
  } catch {
    log(`Login: UID not found after 60s`, 'WARN');
    return { success: false, reason: 'login_failed', step: 'login', detail: 'UID not found after 60s poll' };
  }

  await page.keyboard.press('Escape');
  await sleep(3000);
  return { success: true };
}

// ── UPLOAD ───────────────────────────────────────────────────

async function uploadContent(page, body) {
  const { filePath, caption, collection, audienceFree, audiencePaid,
          audiencePrice, audienceMembership, alwaysMembers, nsfw, type } = body;

  const isVideoFile = isVideo(filePath);
  log(`Upload: starting — file=${path.basename(filePath)}, type=${type}, nsfw=${nsfw}`);

  // 1. Homepage setup — scroll to init lazy load
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(2500);
  }
  await sleep(1000);
  log(`Upload: homepage initialized`);

  // 2. Modal cleanup — 5x
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.evaluate(() => {
      const selectors = [
        '.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root',
        '[role="presentation"]'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          const s = getComputedStyle(el);
          if (s.position === 'fixed' || parseInt(s.zIndex) > 1000) el.remove();
        });
      });
    });
    await sleep(300);
  }
  await sleep(1000);

  // 3. Mutation observer to auto-remove modals
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      ['.MuiBackdrop-root', '.MuiModal-root', '.MuiPopover-root', '.MuiMenu-root']
        .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // 4. Click #nav-create-btn
  let createClicked = false;
  try {
    const createBtn = await page.$('#nav-create-btn');
    if (createBtn) {
      await createBtn.scrollIntoViewIfNeeded();
      await createBtn.click({ force: true });
      createClicked = true;
      await sleep(2000);
      log(`Upload: clicked create button`);
    }
  } catch (e) {
    log(`Upload: create button error — ${e.message}`, 'WARN');
  }

  if (!createClicked) {
    return { success: false, reason: 'create_btn_not_clicked', step: 'create', detail: '#nav-create-btn not found' };
  }

  await sleep(8000);

  // 5. Poll for post form
  let formVisible = false;
  for (let i = 0; i < 45; i++) {
    const form = await page.$('#post-form-upload-media-btn, #post-form-root');
    if (form) { formVisible = true; break; }
    await sleep(1000);
  }

  if (!formVisible) {
    log(`Upload: post form not visible after 45s`, 'WARN');
    return { success: false, reason: 'post_form_not_visible', step: 'create', detail: 'Post form not visible after 45s' };
  }
  log(`Upload: post form visible`);

  // 6. File select
  let fileSelected = false;
  try {
    const fc = await page.waitForEvent('filechooser', { timeout: 15000 });
    await fc.setFiles(filePath);
    fileSelected = true;
    log(`Upload: file selected via filechooser`);
  } catch {
    try {
      const uploadBtn = await page.$('#post-form-upload-media-icon, #post-form-upload-media-btn');
      if (uploadBtn) {
        await uploadBtn.click();
        await sleep(500);
        const fc2 = await page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
        if (fc2) {
          await fc2.setFiles(filePath);
          fileSelected = true;
          log(`Upload: file selected via upload button`);
        }
      }
    } catch (e) {
      log(`Upload: file chooser error — ${e.message}`, 'WARN');
    }
  }

  if (!fileSelected) {
    return { success: false, reason: 'file_not_selected', step: 'upload', detail: 'File chooser not opened' };
  }

  // 7. Wait for preview
  const previewSelector = isVideoFile
    ? '#post-form-video-preview, video'
    : '#post-form-photo-preview, img[src*="preview"]';

  let previewLoaded = false;
  for (let i = 0; i < 120; i++) {
    // Check for unsupported format error
    const errText = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="error"], [class*="unsupported"]');
      for (const el of els) {
        const t = el.textContent.toLowerCase();
        if (t.includes('unsupported') || t.includes('format')) return t;
      }
      return null;
    });
    if (errText) {
      log(`Upload: unsupported format — ${errText}`, 'WARN');
      return { success: false, reason: 'unsupported_format', step: 'upload', detail: errText };
    }

    const preview = await page.$(previewSelector);
    if (preview) { previewLoaded = true; break; }
    await sleep(3000);
  }

  if (!previewLoaded) {
    log(`Upload: preview not loaded after 6 minutes`, 'WARN');
    return { success: false, reason: 'upload_error', step: 'upload', detail: 'Preview not loaded after 6 minutes' };
  }
  log(`Upload: preview loaded`);

  // 8. Caption
  try {
    const captionInput = await page.$('#post-form-caption-input');
    if (captionInput) {
      await captionInput.fill(caption || '');
      log(`Upload: caption filled`);
    }
  } catch {}

  // 9. Collection
  if (collection) {
    try {
      const colBtn = await page.$('#post-form-collection-open-btn');
      if (colBtn) {
        await colBtn.click();
        await sleep(2000);
        for (let attempt = 0; attempt < 10; attempt++) {
          const dialog = await page.$('#post-form-collection-dialog');
          if (dialog) {
            const items = await page.$$('[class*="collection-item"]');
            for (const item of items) {
              const text = await item.textContent();
              if (text.includes(collection)) {
                await item.click();
                await sleep(500);
                await page.keyboard.press('Escape');
                log(`Upload: collection selected — ${collection}`);
                break;
              }
            }
          }
          await sleep(1000);
        }
      }
    } catch {}
  }

  // 10. Audience
  if (audiencePaid) {
    try {
      const audienceBtn = await page.$('#post-form-audience-btn');
      if (audienceBtn) {
        await audienceBtn.click();
        await sleep(2000);

        const freeSwitch = await page.$('#post-form-audience-free-switch');
        if (freeSwitch && await freeSwitch.isChecked()) await freeSwitch.click();

        const paidSwitch = await page.$('#post-form-audience-paid-switch');
        if (paidSwitch && !(await paidSwitch.isChecked())) await paidSwitch.click();

        const priceInput = await page.$('#post-form-audience-star-price-input');
        if (priceInput) await priceInput.fill(String(audiencePrice || 10));

        const needMembers = audienceMembership || alwaysMembers || nsfw;
        if (needMembers) {
          const memberSwitch = await page.$('#post-form-audience-members-switch');
          if (memberSwitch && !(await memberSwitch.isChecked())) await memberSwitch.click();
        }

        await page.keyboard.press('Escape');
        await sleep(500);
        log(`Upload: audience set — paid=${audiencePaid}, price=${audiencePrice}, members=${audienceMembership || alwaysMembers || nsfw}`);
      }
    } catch {}
  }

  // 11. Submit
  try {
    const submitBtn = await page.$('#post-form-submit-btn');
    if (submitBtn) {
      await submitBtn.click();
      await sleep(3000);
      log(`Upload: submitted`);
    }
  } catch {}

  // 12. Guidelines confirm
  try {
    const guidelinesBtn = await page.$('#post-form-guidelines-confirm-btn');
    if (guidelinesBtn) {
      await guidelinesBtn.click();
      await sleep(2000);
      log(`Upload: guidelines confirmed`);
    }
  } catch {}

  // 13. Agree dialog (adult content)
  const isAdult = nsfw || audienceMembership || alwaysMembers;
  const agreePatterns = isAdult
    ? ['community', 'guideline', 'agree', 'adult', 'confirm', 'satisfied',
       'konten dewasa', 'nsfw', 'age', '18+', 'years old', 'persetujuan']
    : ['community', 'guideline', 'agree', 'confirm', 'satisfied'];

  const maxPoll = isAdult ? 400 : 50;
  const pollInterval = 300;

  for (let i = 0; i < maxPoll; i++) {
    const allButtons = await page.$$('button');
    for (const btn of allButtons) {
      const text = (await btn.textContent()).toLowerCase().trim();
      if (agreePatterns.some(p => text.includes(p))) {
        await btn.click();
        await sleep(2000);
        log(`Upload: agree dialog dismissed`);
        break;
      }
    }
    await sleep(pollInterval);
  }

  // 14. Verify post (dialog closed = success)
  const maxVerify = isAdult ? 600 : 80;
  let postVerified = false;
  let postError = null;

  for (let i = 0; i < maxVerify; i++) {
    const dialog = await page.$('#post-form-dialog');
    if (!dialog) { postVerified = true; break; }

    const errorText = await page.evaluate(() => {
      const d = document.querySelector('#post-form-dialog');
      if (!d) return null;
      const errorEls = d.querySelectorAll('[class*="error"], [class*="failed"]');
      return errorEls.length > 0 ? errorEls[0].textContent : null;
    });
    if (errorText) { postError = errorText; break; }

    // Video stuck detection
    if (isVideoFile) {
      const currentTime = await page.evaluate(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      });
      if (currentTime > 0 && currentTime < 4) {
        const stuck = await page.evaluate(() => {
          window._teviStuckCount = (window._teviStuckCount || 0) + 1;
          return window._teviStuckCount;
        });
        if (stuck >= 8) {
          await page.evaluate(() => {
            const v = document.querySelector('video');
            if (v) v.play().catch(() => {});
          });
          await page.evaluate(() => { window._teviStuckCount = 0; });
        }
      } else {
        await page.evaluate(() => { window._teviStuckCount = 0; });
      }
    }

    await sleep(3000);

    if (i === maxVerify - 1) {
      log(`Upload: post not verified after ${maxVerify * 3}s`, 'WARN');
      return { success: false, reason: 'post_unverified', step: 'verify', detail: 'Post dialog not closed after maximum timeout' };
    }
  }

  if (postError) {
    log(`Upload: post error — ${postError}`, 'WARN');
    return { success: false, reason: 'post_unverified', step: 'verify', detail: `Post error: ${postError}` };
  }

  log(`Upload: verified success`);

  // 15. Get post URL
  let postUrl = null;
  for (let i = 0; i < 30; i++) {
    postUrl = await page.evaluate(() => {
      if (window.location.href.includes('/post/')) return window.location.href;
      return null;
    });
    if (postUrl) break;
    await sleep(3000);
  }

  log(`Upload: done — url=${postUrl}`);
  return { success: true, url: postUrl };
}

// ── BROWSER ──────────────────────────────────────────────────

async function withBrowser(fn) {
  let browser;
  const CHROMIUM_PATH = getChromiumPath();

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
  } catch (err) {
    log(`Browser error: ${err.message}`, 'ERROR');
    throw err;
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

// ── HTTP SERVER ───────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /health
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      browser: 'chromium',
      version: '3.1'
    }));
    return;
  }

  // POST /upload
  if (req.url === '/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'invalid_body', step: 'parse', detail: 'Invalid JSON' }));
        return;
      }

      if (!data.email || !data.password || !data.filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'missing_fields', step: 'validate', detail: 'email, password, filePath required' }));
        return;
      }

      if (!fs.existsSync(data.filePath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'file_not_found', step: 'upload', detail: `File not found: ${data.filePath}` }));
        return;
      }

      log(`Upload request: file=${path.basename(data.filePath)}, type=${data.type}`);

      try {
        const result = await withBrowser(async (browser) => {
          const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
          });
          const page = await context.newPage();

          const loginResult = await login(page, data.email, data.password);
          if (!loginResult.success) {
            await context.close();
            return loginResult;
          }

          return await uploadContent(page, data);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (result.success) {
          res.end(JSON.stringify({ success: true, uploaded: true, file: path.basename(data.filePath), url: result.url }));
        } else {
          res.end(JSON.stringify(result));
        }
      } catch (err) {
        log(`Server error: ${err.message}`, 'ERROR');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'upload_error', step: 'server', detail: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, reason: 'not_found' }));
});

// ── START ─────────────────────────────────────────────────────

ensureDir(path.dirname(LOG_FILE));

server.listen(PORT, () => {
  log(`TEVI Upload Server v3.1 started on port ${PORT}`);
});

process.on('SIGTERM', () => {
  log('SIGTERM — graceful shutdown');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  log('SIGINT — graceful shutdown');
  server.close(() => process.exit(0));
});
