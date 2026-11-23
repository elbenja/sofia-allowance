// Who the app is for. The name and pictures come from settings (VITE_KID_NAME,
// VITE_AVATAR_URL and VITE_FAVICON_URL, in .env.local and on Vercel), so the public
// code holds none of them. They are shown on the page, so none is a secret.
export const KID_NAME: string = import.meta.env.VITE_KID_NAME?.trim() ?? ''
export const AVATAR_URL: string = import.meta.env.VITE_AVATAR_URL?.trim() ?? ''
export const TITLE = KID_NAME ? `${KID_NAME}'s Allowance` : 'Allowance'

// The tab icon: its own picture if set, else the plush dog in public/favicon.png.
const FAVICON_URL: string = import.meta.env.VITE_FAVICON_URL?.trim() ?? ''

// Both pages import this file, so the tab title and icon follow the settings too.
document.title = TITLE
if (FAVICON_URL) document.querySelector('link[rel="icon"]')?.setAttribute('href', FAVICON_URL)
