// Detects browsers embedded inside chat/social apps (WhatsApp, Instagram, etc).
// Google OAuth can complete inside these (via Custom Tabs / SFSafariViewController)
// without the resulting session ever reaching the app's own WebView, since the two
// contexts don't share cookie/storage state — leaving sign-up stuck after the
// "connected" step. Users need to be pointed to their real browser instead.
const IN_APP_BROWSER_PATTERN =
  /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|musical_ly|MicroMessenger|KAKAOTALK|NAVER/i

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_PATTERN.test(userAgent)
}
