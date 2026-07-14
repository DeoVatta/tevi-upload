# TEVISETUP.md — TEVI.com Account Setup

> How to set up your TEVI.com account for automated uploads.

---

## Account Requirements

- Active TEVI.com account
- Verified email
- Creator account (not regular user)

---

## 1. Login to TEVI.com

1. Go to https://tevi.com
2. Click "Log in"
3. Choose "with email"
4. Enter your credentials

**Important**: Test your login manually first before running the automation.

---

## 2. Create Collections

Collections help organize your content. Create them in TEVI UI:

1. Go to your profile
2. Click "Collections" or "My Collections"
3. Create collections matching your categories:
   - `Cosplay` (for photo)
   - `Streaming Challenge` (for video)
   - `Hentai` (for adult hentai)
   - `Japanese` (for adult JAV)
   - `Amerika` (for adult Western)

**Note**: Collection names in config.json must match exactly with TEVI.

---

## 3. Check Account Settings

### Content Settings

- Make sure your account can post content
- Verify age-restricted content is allowed
- Check if there are posting limits

### Privacy Settings

- If your account is private, the automation may not work
- Make sure content is visible to the intended audience

---

## 4. Rate Limiting

TEVI may rate-limit posting:
- Max posts per hour: ~3-5
- Max posts per day: ~20-30

If you hit rate limits:
1. Increase cron interval (e.g., `0 */2 * * *` for every 2 hours)
2. Reduce number of categories

---

## 5. Troubleshooting Login

If login fails:

1. **UID not found**: Check if 2FA is enabled on the account — the automation can't bypass 2FA
2. **Wrong credentials**: Verify email and password
3. **Account locked**: TEVI may lock accounts with too many failed attempts

---

## 6. Test Upload Manually

Before running the automation, test manually:

1. Go to TEVI.com
2. Click the create button (+)
3. Select a file
4. Fill in caption and settings
5. Submit

This confirms your account can accept uploads and you know the correct settings.

---

## 7. Multiple Accounts

To use multiple TEVI accounts:

1. Create multiple `TEVI Account` credentials in N8N
2. Modify the workflow to pick which credential to use based on category
3. Or run separate workflows per account

---

## 8. Content Guidelines

TEVI content guidelines:
- No CSAM or illegal content
- Proper age verification for adult content
- No copyrighted content without rights
- No violence or harassment

The automation handles the "I Agree" dialog automatically, but you are responsible for content compliance.
