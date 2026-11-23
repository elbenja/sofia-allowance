# Allowance

A lab project, and a personal itch to scratch: a small web app for keeping track of the chores a kid does around the house and the tips they earn for them.

The kid opens it to see how much they've earned this month, how the year is going, and what they did on each day. A 3D goldendoodle peeks over the summary card and celebrates when money comes in. Parents unlock a PIN-protected mode to log chores, remove entries, and edit the list of chores and what each one pays.

Everything is stored in a Google Sheet, so you can also read and edit the data by hand.

It was built for one family, so expect some rough edges. It's shared as-is.

## How it works

```
browser ──► Vercel ──────────────────────────► Apps Script web app ──► Google Sheet
            middleware.ts   site password gate
            api/login.ts    sets the login cookie
            api/sheet.ts    checks the parent PIN, then adds the secret key
```

- **Front end:** Vite, React and TypeScript, with three.js for the dog.
- **Password gate:** the whole site sits behind one shared password. A correct login sets an HttpOnly cookie that lasts 90 days. Changing the password signs everyone out.
- **The sheet:** a Google Apps Script deployed as a web app acts as the database. The browser never talks to it directly. `/api/sheet` checks the parent PIN and then calls the script with a secret key that only the server knows.
- **Offline copy:** the browser keeps a copy of the data so the page opens instantly, then refreshes it from the sheet.

## Setup

You need Node 20.19+ (or 22.12+), a Google account, and a Vercel account (the free plan is enough).

### 1. Create the Google Sheet

Create a new Google Sheet with two tabs, named exactly `activities` and `entries`. Put these headers in row 1. The script always skips row 1 and reads the columns in this order:

| Tab          | A    | B      | C        | D        | E        | F      |
| ------------ | ---- | ------ | -------- | -------- | -------- | ------ |
| `activities` | `id` | `name` | `amount` | `icon`   | `tint`   |        |
| `entries`    | `id` | `date` | `name`   | `amount` | `icon`   | `tint` |

- `activities` is the chore list. You can add rows here by hand (any unique text works as the `id`), or add chores from the app in parent mode.
- `entries` is filled in by the app. Each row is one chore done on one day (`date` is `YYYY-MM-DD`).
- `amount` is a number above zero.
- `icon` is one of `bed`, `shirt`, `paw` (or `dog`), `vacuum` (or `vacuum-cleaner`), `pot`, `kitchen-utensils`, `dish-washer`, `washing-machine`, or `star`. Unknown names show a star.
- `tint` is the icon tile's background, in any CSS colour, e.g. `#ffe4ec`.

### 2. Set up the Apps Script

1. In the sheet, open **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`google-apps-script/Code.gs`](google-apps-script/Code.gs) and save.
3. Make a long random secret. This becomes `sheet_key`:

   ```bash
   openssl rand -hex 32
   ```

4. Open **Project Settings** (the gear icon). Under **Script Properties**, add a property named `PARENT_PIN` and set its value to that secret. Despite the old name, it holds `sheet_key`, not the parent PIN.
5. Click **Deploy → New deployment**, choose the **Web app** type, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
6. Deploy and approve the permissions Google asks for. Copy the **Web app URL** (it ends in `/exec`). This becomes `sheet_url`.

Anyone who has `sheet_url` can **read** the sheet. Writing needs the key, and after five wrong keys the script refuses all writes for ten minutes. Keep the URL private: it only ever goes in the server's environment variables.

If you change `Code.gs` later, publish it with **Deploy → Manage deployments → Edit → Version: New version**. That keeps the same URL.

### 3. Environment variables

The four secrets are server-only and never reach the browser. Keep their names lowercase and don't add a `VITE_` prefix.

| Variable     | What it is                                                               |
| ------------ | ------------------------------------------------------------------------ |
| `password`   | The password for the whole site (the login page).                        |
| `parent_pin` | The PIN that unlocks parent mode (adding and removing chores).           |
| `sheet_url`  | The Apps Script web-app URL from step 2.                                 |
| `sheet_key`  | The random secret from step 2, the same value as the `PARENT_PIN` property. |

Two optional settings personalise the page. They're shown to anyone who opens the site, so they aren't secrets. The `VITE_` prefix is what sends them to the browser.

| Variable          | What it is                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `VITE_KID_NAME`   | Who the app is for. It's used in the greeting and the page title. Without it, the page says "Hi there" and "Allowance". |
| `VITE_AVATAR_URL` | A link to a square picture, used for the avatar and the browser-tab icon. Without it, the avatar shows the name's first letter. |

Keeping the name and picture in settings means none of your family's details end up in the code. To host the picture, a public [Vercel Blob](https://vercel.com/docs/vercel-blob) store works: in your Vercel project, open **Storage**, create a Blob store, upload the image, and copy its URL.

### 4. Run it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local`, then start the dev server:

```bash
npm run dev
```

Open http://localhost:5173 and log in with your `password`. In development, the Vite server takes the place of the Vercel middleware and functions (see `vite.config.ts`). That means the login and sheet calls work locally with no Vercel CLI.

### 5. Deploy to Vercel

1. Import the repository in Vercel. It detects Vite on its own: the build command is `npm run build` and the output folder is `dist`.
2. Under **Settings → Environment Variables**, add the same variables.
3. Deploy. If you change a variable later, redeploy so the change takes effect. The `VITE_` settings are baked in when the site is built.

## Make it yours

- **Name and picture:** set `VITE_KID_NAME` and `VITE_AVATAR_URL` (see above). They're read in `src/kid.ts`.
- **Default tab icon:** `public/favicon.svg`, used when there's no picture.
- **More chore icons:** add entries to `ACTIVITY_ICONS` in `src/ui.tsx`, using any icon from `@hugeicons/core-free-icons`.

## Project layout

```
src/                 the app: App.tsx (dashboard), ChoresSheet.tsx (parent mode), DogAvatar.tsx + dog.js (3D dog), login.tsx, kid.ts (name and picture)
server/              shared server code: auth.ts (password gate), sheet.ts (sheet proxy)
api/                 Vercel edge functions that wrap server/
middleware.ts        Vercel middleware that sends signed-out visitors to /login
google-apps-script/  the script that goes in the Google Sheet
html/                a standalone page with the 3D goldendoodle
```

## Scripts

- `npm run dev`: dev server, with the password gate and the sheet proxy
- `npm run build`: type-check and build to `dist/`
- `npm run preview`: serve the built `dist/`

## A note on security

This is a family app, not a hardened one. There's one shared password and no user accounts. Wrong passwords and PINs get a short delay to slow down guessing, and the Apps Script locks writes after repeated wrong keys. Your data stays in your own Google Sheet.
