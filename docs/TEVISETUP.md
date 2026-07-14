# TEVI Setup Guide

How to set up your TEVI.com account for automation.

## Account Requirements

- Active TEVI.com account
- Email verified
- Content creator account (not viewer only)

## Testing Login Manually

Before automating, test your credentials manually:

1. Open https://tevi.com/
2. Click "Login" → "With Email"
3. Enter your email and password
4. Verify you can log in successfully
5. Check your profile URL: `https://tevi.com/@yourchannel`
   - The slug after `@` is your `channelSlug`

## Creating Collections

If you use `collection` in your upload config:

1. Log in to TEVI.com manually
2. Go to your profile
3. Find "Collections" or "Create Collection"
4. Create a collection named exactly as you'll use in N8N config

**Note**: Collection names must match exactly (case-sensitive) between your N8N config and TEVI.

## Understanding Audience Settings

### Free Post
```json
{
  "audienceFree": true,
  "audiencePaid": false
}
```
Everyone can see the post without paying.

### Paid Post (anyone)
```json
{
  "audienceFree": false,
  "audiencePaid": true,
  "audiencePrice": 10,
  "audienceMembership": false
}
```
Viewers pay stars to see the post. Non-members can buy access.

### Paid Post (members only)
```json
{
  "audienceFree": false,
  "audiencePaid": true,
  "audiencePrice": 10,
  "audienceMembership": true
}
```
Only paying members can see the post at all.

## Testing with Manual Upload

Before running automation, test the upload flow manually:

1. Go to tevi.com
2. Click "Create a post"
3. Select a small test file (photo or short video)
4. Fill in caption
5. Set audience (free/paid/members)
6. Submit
7. Verify post appears on your profile

This ensures:
- Your account can create posts
- The audience settings work as expected
- Your collection exists (if using one)

## Finding Your Channel Slug

Your channel slug appears in your profile URL:

```
https://tevi.com/@cutieval
                 ^^^^^^^^
                 This is your channelSlug
```

## Troubleshooting TEVI Login Issues

### "Wrong credentials"
- Verify email/password is correct
- Try logging in manually first

### "Account not found"
- Email may not be registered
- Check for typos in email

### "Login modal keeps appearing"
- This is the issue the automation addresses
- The login flow in server.js handles this with UID polling
- If it keeps failing, TEVI might have changed their login UI

### "2FA / OTP required"
- If TEVI requires 2FA, automation won't work
- You'll need to disable 2FA or use an account without it

## Supported Content Formats

### Photos
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)

### Videos
- MP4 (.mp4) — recommended
- MOV (.mov)
- AVI (.avi)
- MKV (.mkv)
- WebM (.webm)

**Note**: HEVC (.hevc, .m4v) may not be supported depending on TEVI's transcoding.

## Content Guidelines

TEVI has community guidelines for uploaded content. Violations may result in:
- Post removal
- Account suspension
- Content flagged as adult/NSFW requiring additional confirmation

The automation handles:
- Age verification dialogs (18+ content)
- Community guideline confirmations
- Adult content agreements

## Rate Limits

- Avoid uploading too frequently (spam flags)
- The 1-hour schedule is conservative
- If posts fail with rate limit errors, increase the interval
