// Who the app is for. The name and picture come from settings (VITE_KID_NAME and
// VITE_AVATAR_URL, in .env.local and on Vercel), so the public code holds neither.
// Both are shown on the page, so neither is a secret.
export const KID_NAME: string = import.meta.env.VITE_KID_NAME?.trim() ?? ''
export const AVATAR_URL: string = import.meta.env.VITE_AVATAR_URL?.trim() ?? ''
export const TITLE = KID_NAME ? `${KID_NAME}'s Allowance` : 'Allowance'

// Both pages import this file, so the tab title and icon follow the settings too.
document.title = TITLE
if (AVATAR_URL) document.querySelector('link[rel="icon"]')?.setAttribute('href', AVATAR_URL)
