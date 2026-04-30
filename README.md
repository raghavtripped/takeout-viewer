# Takeout Viewer

A local app that lets you browse your entire Google history — email, files, calendar, contacts, notes, tasks, bookmarks, chat, and saved links — without uploading anything to the cloud.

You export your data from Google, drop the zip file into the app, and it indexes everything into a fast, searchable interface that looks and feels like the Google products you're used to.

---

## Table of Contents

- [Install the Desktop App (Easiest)](#install-the-desktop-app-easiest)
- [Windows Setup Guide](#windows-setup-guide)
- [Build the Desktop App Yourself](#build-the-desktop-app-yourself)
- [Run from Source (Developers)](#run-from-source-developers)
- [How to Use It](#how-to-use-it)
  - [Getting your Google Takeout](#getting-your-google-takeout)
  - [Importing your archive](#importing-your-archive)
  - [Browsing your data](#browsing-your-data)
- [What Each Tab Does](#what-each-tab-does)
- [How Everything Works — Technical Deep Dive](#how-everything-works--technical-deep-dive)
  - [Architecture overview](#architecture-overview)
  - [The import pipeline](#the-import-pipeline)
  - [Data storage](#data-storage)
  - [Parser details](#parser-details)
  - [The server and API](#the-server-and-api)
  - [The frontend](#the-frontend)
- [File-by-File Reference](#file-by-file-reference)
- [Design Decisions](#design-decisions)

---

## Install the Desktop App (Easiest)

No terminal. No Node.js. Just download and double-click — exactly like installing any other app.

### Mac

1. Go to the [**Releases page**](https://github.com/raghavtripped/takeout-viewer/releases)
2. Download the file ending in `.dmg`
3. Open the `.dmg` file
4. Drag **Takeout Viewer** into your Applications folder
5. Open it from Applications (or Spotlight — press `⌘ Space` and type "Takeout Viewer")

> **"App can't be opened because it's from an unidentified developer"?**
> Right-click the app → **Open** → **Open** again in the dialog. You only have to do this once.

### Windows

> **There is currently no prebuilt `.exe` installer published.** Windows users need to run the app from source — it sounds scary, but it's about 5 minutes of copy-paste. Follow the [**Windows Setup Guide**](#windows-setup-guide) below.

### Where your data is stored

- **Mac:** `~/Library/Application Support/Takeout Viewer/data/`
- **Windows:** `C:\Users\<you>\AppData\Roaming\Takeout Viewer\data\`

Uninstalling the app does **not** delete your indexed data.

---

## Windows Setup Guide

You don't need to be a developer. Follow these steps in order — every click and every command — and the app will be running on your PC.

### Step 1 — Install Node.js

The app is built on Node.js (a free runtime that ships with `npm`, the package manager we'll use).

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the big green **LTS** button (e.g. "20.x.x LTS — Recommended For Most Users")
3. Run the downloaded `.msi` installer. **Click Next on every screen** — the defaults are correct.
4. When it's done, **close any Command Prompt or PowerShell windows you have open**, otherwise they won't see Node.js.

**Verify it worked.** Press `Win + R`, type `cmd`, hit Enter. In the black window that opens, type:
```
node --version
```
You should see something like `v20.11.0`. If it says "not recognized", restart your PC and try again.

### Step 2 — Get the source code

Pick **one** of the two options below.

**Option A — Download ZIP (no extra tools needed)**

1. Go to **[github.com/raghavtripped/takeout-viewer](https://github.com/raghavtripped/takeout-viewer)**
2. Click the green **Code** button → **Download ZIP**
3. Right-click the downloaded zip → **Extract All…** → pick a location you'll remember (e.g. `C:\Users\<you>\Documents\takeout-viewer`)

**Option B — With Git (if you already have it installed)**

```cmd
git clone https://github.com/raghavtripped/takeout-viewer.git
cd takeout-viewer
```

### Step 3 — Run the app

1. Open the folder you extracted in **File Explorer**.
2. Find the file named **`setup.bat`** (it has a gear-cog icon).
3. **Double-click it.**

A black Command Prompt window will open and you'll see:
```
Takeout Viewer - Setup
-------------------------------------
Node.js v20.x.x found
Installing dependencies...
```

The first run takes 1–3 minutes (it downloads ~100 MB of packages). When you see:

```
Open http://localhost:3000 in your browser
(Press Ctrl+C to stop the server)
```

…you're done.

### Step 4 — Open it in your browser

Open Chrome, Edge, or Firefox and go to **[http://localhost:3000](http://localhost:3000)**.

That's it — the app is running entirely on your PC. Now jump to [How to Use It](#how-to-use-it).

### Stopping and restarting

- **To stop the app:** click the black Command Prompt window and press **`Ctrl + C`**, then close it.
- **To start it again later:** double-click `setup.bat` in the same folder. (After the first run it skips the slow `npm install` if dependencies are already there.)

### Optional — Build a real `.exe` installer for yourself

If you'd rather have a normal desktop app icon (no Command Prompt window, launches from the Start menu), you can build the installer locally.

Open Command Prompt **inside the `takeout-viewer` folder** (Shift + right-click in the folder → "Open PowerShell window here", or `cd` into it from a normal prompt) and run:

```cmd
npm install
npm run build:win
```

This takes 3–10 minutes. When it finishes, look in the `release\` subfolder — you'll find:

- `Takeout Viewer Setup x.x.x.exe` — double-click to install like any normal Windows app
- A `win-unpacked\` folder — the portable version, runs without installing

> **"Windows protected your PC" / SmartScreen warning?** This is normal — the app isn't code-signed. Click **More info** → **Run anyway**.

### Troubleshooting (Windows)

| Problem | Fix |
|---|---|
| `'node' is not recognized as an internal or external command` | Node.js isn't installed, or you opened the terminal *before* installing it. Close all Command Prompt windows and reopen one. |
| `npm install` fails with `EACCES` or permission errors | Right-click `setup.bat` → **Run as administrator**. |
| `npm install` fails with `node-gyp` / Python / Visual Studio errors | This app deliberately avoids native compilation — you should never see this. If you do, delete the `node_modules` folder and the `package-lock.json` file, then re-run `setup.bat`. |
| `Error: listen EADDRINUSE` on port 3000 | Something else is using port 3000. The app auto-falls-back to 3001, 3002, 3003 — just check what URL the terminal printed. |
| Browser shows "This site can't be reached" | The Command Prompt window must stay open the whole time the app is running. If you closed it, run `setup.bat` again. |
| Windows Defender / antivirus quarantines a file | Add the `takeout-viewer` folder to your antivirus's exclusions list. The app is fully open-source — you can read every line in the `src/` and `public/` folders. |
| The black Command Prompt window flashes and disappears | Open Command Prompt manually, `cd` into the folder, and run `setup.bat` from there — you'll be able to read the actual error message. |

---

## Build the Desktop App Yourself

```bash
git clone https://github.com/raghavtripped/takeout-viewer.git
cd takeout-viewer
npm install

npm run build:mac    # → release/  produces a .dmg
npm run build:win    # → release/  produces a .exe installer
npm run build:linux  # → release/  produces an .AppImage
```

---

## Run from Source (Developers)

**Mac / Linux**
```bash
./setup.sh
```

**Windows** — double-click `setup.bat`

**Manual**
```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser. Requires **Node.js v18+** — [nodejs.org](https://nodejs.org).

<details>
<summary>Never used a terminal before? Click here.</summary>

### Step 1 — Install Node.js

Go to [nodejs.org](https://nodejs.org), click the **LTS** button, run the installer, then verify with `node --version` in a new terminal.

### Step 2 — Download this app

```bash
git clone https://github.com/raghavtripped/takeout-viewer.git
cd takeout-viewer
```

Or click the green **Code** button → **Download ZIP**, unzip, and open a terminal in that folder.

### Step 3 — Run

**Mac/Linux:** `./setup.sh` (run `chmod +x setup.sh` first if you see "permission denied")

**Windows:** `setup.bat`

### Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: node` | Close and reopen the terminal after installing Node.js |
| `permission denied: ./setup.sh` | Run `chmod +x setup.sh` first |
| Port 3000 already in use | App tries 3001, 3002, 3003 automatically |
| Page won't load | Make sure the terminal is still open |

</details>

---

## How to Use It

### Getting your Google Takeout

1. Go to [takeout.google.com](https://takeout.google.com)
2. Select the products you want: **Mail, Drive, Calendar, Contacts, Keep, Tasks, Chrome, Google Chat, Saved**
3. Leave format defaults — the app handles all formats Google uses
4. Choose "Send download link via email", wait for the email, download all files
5. Large archives are split: `takeout-20240101-001.zip`, `002.zip`, etc. Gmail exports separately as `.mbox` — download that too.

### Importing your archive

#### Option A — Local paths (recommended for large archives)

Fastest method — no upload, app reads directly from disk.

1. Unzip your Takeout files (double-click on macOS; right-click → Extract on Windows)
2. In the app's **"or use local paths"** section, paste the full path(s) — one per line:
   - Folder: `/Users/you/Downloads/Takeout`
   - mbox file: `/Users/you/Downloads/All mail Including Spam and Trash.mbox`
   - Multiple paths are fine — the app aggregates all of them
3. Click **Process Local Files** and watch the live progress bar

| Stage | Typical time |
|---|---|
| Email indexing | 20–60 min |
| Drive / Calendar / Contacts / etc. | 1–5 min |
| **Total** | **~20–65 min** |

#### Option B — Upload (for smaller archives)

1. Drag-and-drop zip files and/or `.mbox` files onto the drop zone, or click "Choose File(s)"
2. Select all parts at once, then click **Import**

| Stage | Typical time |
|---|---|
| Upload | 5–15 min |
| Email indexing | 20–60 min |
| Zip extraction | 5–15 min |
| Drive / Calendar / etc. | 1–5 min |
| **Total** | **~30–90 min** |

---

A red **✕ Cancel & Clear** button is always visible during import — it stops immediately and wipes partial data.

To start fresh at any time, click the 🗑 icon in the top-right corner.

### Browsing your data

- **Search bar** — searches within the active tab as you type
- **Sidebar** — sub-navigation per tab (folders, labels, view modes, filters)
- **Tabs are hidden** when you have no data for that type — only tabs with content appear
- **Port fallback** — if 3000 is in use, the app automatically tries 3001, 3002, 3003

---

## What Each Tab Does

### Mail

Gmail-style inbox for your full email archive.

- **Email list** — sender, subject, snippet, labels, 📎 attachment indicator, date. Bold = unread.
- **Reading pane** — opens to the right. Read state persists across page refreshes.
- **HTML emails** render in a sandboxed iframe. Links open correctly in new tabs.
- **Plain-text emails** render in a `<pre>` block.
- **Attachments** — shown as clickable chips with file-type icons and sizes, just like Gmail. Click to open or download directly.
- **Folder sidebar** — all Gmail folders (Inbox, Sent, Drafts, Trash, Spam, Starred, custom labels) with message counts.
- **Advanced search filters** — type filter tokens directly in the search bar:

  | Token | Example | Effect |
  |---|---|---|
  | `from:` | `from:alice` | Only emails from that sender |
  | `to:` | `to:bob@example.com` | Only emails to that recipient |
  | `subject:` | `subject:invoice` | Only emails matching that subject |
  | `has:attachment` | `has:attachment` | Only emails with attachments |

  Combine freely: `from:alice subject:invoice has:attachment`. Active filters appear as removable blue chips below the email list — click ✕ on any chip to remove that filter.

- **Encoding repair** — automatically fixes UTF-8 mojibake (garbled `Â ` characters) that appears in some exported emails due to quoted-printable decoding bugs.

### Drive

A hierarchical file browser that mirrors your actual Google Drive folder structure.

- **Folder navigation** — starts at root (My Drive), showing only top-level folders and root files. Click a folder to go inside; only that folder's direct contents are shown.
- **Breadcrumb** — shows current path (My Drive / Projects / 2024) with clickable segments to jump back up
- **Sidebar tree** — collapsible full folder tree for quick-jumping to any nested folder
- **Grid view** — file cards with image thumbnails (lazy-loaded), emoji icons for other types
- **List view** — sortable table; click Name, Size, or Modified to sort
- **File preview** — click any file:
  - Images render inline
  - PDFs open in an embedded viewer
  - Text / CSV / HTML shows content in a scrollable pane
  - Anything else shows a metadata card with a download button
- **Search** — spans all files across all folders globally
- **Download** — every file has a ⬇ button

### Calendar

- **List view** — events grouped by day, with time range and location
- **Month grid** — classic calendar layout with event chips; click "+N more" to see all events for a day
- **← → navigation** — move between months
- **Event modal** — full details: description, location, attendees, URL, categories, recurrence
- Recurring events marked with ↻

### Contacts

- **Avatar cards** — colored initials (color from name hash), organisation, primary email
- **Detail modal** — all emails (with type: Home/Work), all phones, physical addresses, URLs, birthday, notes

### Keep

- **Full color palette** — all 14 Keep colors (Default, Red, Pink, Purple, Blue, Teal, Sage, Gray, Brown, Orange, Yellow, Green, Cerulean, Spearmint)
- **Pinned notes** appear first with 📌; archived notes show 🗄
- **Checklist notes** show each item checked/unchecked
- **Label sidebar** — filter to notes with a specific label
- **Note modal** — full text, all list items, labels, timestamps

### Tasks

- **Two columns** — Pending and Completed, each with a count badge
- **Overdue highlighting** — past due dates shown in red
- **Checklist style** — ✅ completed / ⬛ pending
- **Sidebar filters** — All / Pending / Completed

### Chrome

- **Bookmarks** — organized by folder with an interactive sidebar. Title, domain, date added.
- **History** — reverse-chronological, grouped by date, with time of visit
- **Privacy** — no Google favicon requests. All icons are locally-generated letter avatars with deterministic colors.

### Chat

- **Conversation list** — 👤 DM or 👥 group, name, message count, last date
- **Chat bubbles** — your messages right (blue), others left (gray), timestamps, date separators
- **Smart "you" detection** — finds your identity by picking the most frequent sender across all conversations (no hardcoded assumptions)

### Saved

Starred links from Google Search and Maps — letter avatars, title, domain, date saved, folder badge.

---

## How Everything Works — Technical Deep Dive

### Architecture overview

```
Browser (vanilla HTML/CSS/JS)
        ↕  HTTP / SSE
Express server (Node.js)
        ↕
JSON files on disk  +  Extracted Takeout files
```

| Layer | Technology | Reason |
|---|---|---|
| Server | Node.js + Express 4 | Simple, stable, zero config |
| File uploads | multer | Standard multipart middleware |
| Zip extraction | unzipper | Streaming — entries piped to disk, no RAM buffer |
| Storage | JSON files on disk | No native bindings, universally debuggable |
| Progress | Server-Sent Events | Built into browsers, simpler than WebSockets |
| Frontend | Vanilla HTML/CSS/JS | Zero build step, easy to read and share |

### The import pipeline

**Path A — Local paths**
```
POST /api/import/local
  → classify paths: dir / .mbox / .zip
  → index .mbox files first
  → extract any .zip files
  → walk each dir through all parsers
  → write index.json + emails/ + attachments/
  → SSE "done"
```

**Path B — Upload**
```
multer → data/uploads/
  → index .mbox first (email-first ordering)
  → stream-extract .zip files to data/extracted/
  → walk extracted tree through all parsers
  → write index.json + emails/ + attachments/
  → SSE "done"
```

**Drive folder discovery** — Takeout often splits Drive across multiple zip parts (`Takeout 4/Drive/`, `Takeout 5/Drive/`). The indexer recursively finds **all** directories named Drive/My Drive/Google Drive, then excludes false positives like `My Activity/Drive/` (activity logs). All discovered Drive dirs are merged into a single index.

Every stage emits live progress with ETA. A **✕ Cancel & Clear** button stops at the next checkpoint.

### Data storage

```
data/
├── index.json          ← all metadata + read state
├── emails/             ← one JSON per email (full body, loaded on demand)
├── attachments/        ← extracted email attachments (up to 25 MB each)
│   └── email-0-123/
│       └── report.pdf
├── extracted/          ← unzipped Takeout contents
└── uploads/            ← temporary (deleted after import)
```

`index.json` holds lightweight metadata for all data types. Email bodies and attachments are stored separately and read only when needed.

**Read/unread state** — stored as `readEmailIds` in `index.json`. Updated via `PATCH /api/emails/:id/read` when you open an email. Re-hydrated into a frontend Set on every page load.

### Parser details

#### mboxParser.js

Streams the mbox line-by-line via `readline`. Never loads the full file into memory. Per-email processing:

1. **Header parsing** — RFC 2822 folded continuations joined to parent line
2. **RFC 2047 decoding** — `=?UTF-8?B?...?=` (base64) and `=?UTF-8?Q?...?=` (quoted-printable). Q-encoding fix: collects bytes into an array then calls `Buffer.from(bytes).toString('utf8')` — this correctly handles multi-byte sequences that were previously decoded as mojibake (`Â ` etc.)
3. **MIME multipart** — recursive boundary splitting; single-part HTML emails detected by outer `Content-Type: text/html` (no boundary)
4. **Body decoding** — both base64 and QP decoded via byte-array approach
5. **Attachment extraction** — `Content-Disposition: attachment` or `filename=` param → saved to `data/attachments/<emailId>/` (≤25 MB; larger marked unavailable)
6. **Snippet** — first 200 chars of plain text (or tag-stripped HTML)
7. **Folder detection** — `X-Gmail-Labels` header mapped to standard folder names
8. **Date parsing** — tries multiple formats, strips timezone abbrs, falls back to epoch 0

#### icsParser.js

- Unfolds RFC 5545 continuation lines
- All date formats: UTC (`Z`), local, TZID-aware, all-day (`YYYYMMDD`)
- Extracts attendees (`CN=` + `mailto:`), URL, CATEGORIES, DESCRIPTION
- RRULE stored as raw string; recurring events flagged

#### vcfParser.js

- Emails → `[{address, type}]`, phones → `[{number, type}]`
- Physical addresses from `ADR` → `{type, street, city, state, zip, country}`
- `BDAY` normalized to `YYYY-MM-DD`; `URL`, `NICKNAME`, `ORG`, `TITLE`, `NOTE` all extracted
- `PHOTO` skipped; `hasPhoto: true` flag set when present

#### chromeParser.js

- Bookmarks: Netscape HTML format, folder context tracked via `<H3>`/`</DL>` stack
- History: Windows FILETIME epoch fix — `time_usec / 1000 - 11644473600000`; fallback for Unix microseconds
- All Google favicon API requests removed; replaced with letter avatars

#### chatParser.js

- Scans all `messages.json` files across `Groups/` and `DMs/`
- "You" = most frequent sender across all conversations

### The server and API

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/import` | Upload zip/mbox files, start indexing |
| `POST` | `/api/import/local` | Import from local paths without uploading |
| `GET` | `/api/import/progress` | SSE stream — `{stage, message, percent}` |
| `GET` | `/api/status` | `{indexed, importing, counts}` |
| `GET` | `/api/emails` | Paginated list; filters: `folder`, `q`, `from`, `to`, `subject`, `has` |
| `GET` | `/api/emails/:id` | Full email body |
| `PATCH` | `/api/emails/:id/read` | Mark read, persist to disk |
| `GET` | `/api/attachments/:emailId/:filename` | Serve extracted attachment |
| `GET` | `/api/drive` | Folder browser (exact-folder match); `q` searches globally |
| `GET` | `/api/drive/download/:id` | Download file |
| `GET` | `/api/drive/preview/:id` | Inline preview (image/PDF/text) |
| `GET` | `/api/calendar` | Events by year/month/search |
| `GET` | `/api/contacts` | Alphabetical, searchable |
| `GET` | `/api/keep` | By label + search, paginated |
| `GET` | `/api/tasks` | Pending/completed split, searchable |
| `GET` | `/api/chrome` | Bookmarks or history (`?type=`) |
| `GET` | `/api/chat` | Conversation list or messages |
| `GET` | `/api/saved` | Paginated, searchable |
| `POST` | `/api/abort` | Stop in-progress import |
| `POST` | `/api/reset` | Wipe all data |

All HTML/JS/CSS served with `Cache-Control: no-store` — updates always load immediately.

### The frontend

Single `index.html`, one JS file per tab, no framework, no build step.

**State** — plain `state` object in `app.js`. Functions read state and re-render their DOM sections.

**Tab routing** — `switchTab(tab)` hides all views/sidebars, shows the target, calls `load*()`.

**Email sandbox** — `<iframe srcdoc="..." sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox">`. The `allow-popups-to-escape-sandbox` flag lets links opened from emails load normally in new tabs (without it, target pages see JavaScript as disabled).

**Drive browser** — `getDirectSubfolders(allFolders, parent)` computes immediate children. Root shows top-level folders + root files. Clicking into a folder fetches only that folder's files. Search bypasses folder filtering.

**Letter avatars** — `domainColor(str)` hashes the input to one of 12 colors; `domainInitial(str)` returns the first letter. Replaces all external favicon requests.

---

## File-by-File Reference

```
takeout-viewer/
│
├── package.json          — Dependencies + Electron build config (dmg/exe/AppImage)
├── setup.sh              — Mac/Linux one-command start
├── setup.bat             — Windows one-command start
│
├── src/
│   ├── server.js         — Express app, all API routes, SSE, no-cache headers, port fallback
│   ├── db.js             — index.json r/w, email files, attachments dir, read state
│   ├── indexer.js        — Zip extraction, multi-dir Drive discovery, calls all parsers
│   ├── mboxParser.js     — Streaming mbox, MIME multipart, attachment extraction, UTF-8 fix
│   ├── icsParser.js      — VEVENT (calendar): TZID, attendees, all-day, recurring
│   ├── tasksParser.js    — VTODO (tasks): status, due/completed dates
│   ├── vcfParser.js      — vCard: multi-email/phone with types, addresses, birthday, URLs
│   ├── keepParser.js     — Keep JSON: notes, checklists, colors, labels
│   ├── chromeParser.js   — Bookmarks HTML + history JSON, FILETIME fix, no favicons
│   ├── chatParser.js     — Chat messages.json, "you" detection
│   └── savedParser.js    — Saved links HTML/JSON
│
└── public/
    ├── index.html        — Single-page shell
    ├── css/
    │   └── app.css       — All styles
    └── js/
        ├── app.js        — State, tab router, search, onboarding, SSE
        ├── mail.js       — Email list, folder sidebar, detail pane, attachments, search filters
        ├── drive.js      — Folder browser, breadcrumb, grid/list, preview modal
        ├── calendar.js   — List + month grid, event modal
        ├── contacts.js   — Avatar cards, full detail modal
        ├── keep.js       — Masonry grid, 14-color palette, note modal
        ├── tasks.js      — Checklist columns, overdue highlighting
        ├── chrome.js     — Bookmarks by folder, history by date, letter avatars
        ├── chat.js       — Conversation list, chat bubbles, date separators
        └── saved.js      — Links list with letter avatars
```

---

## Design Decisions

**Why no database?** SQLite requires `node-gyp` native compilation which fails on many machines. JSON files work everywhere and are fast enough for personal archive sizes.

**Why no framework/build step?** Vanilla JS means anyone can open any file and understand it immediately. No build failures, no `dist/` folder to explain.

**Why stream the mbox?** Gmail archives exceed 10 GB. Loading into RAM would crash Node. `readline` keeps memory flat regardless of file size — one email in memory at a time.

**Why individual files for email bodies?** Storing all bodies in `index.json` would make it huge and slow. Metadata in the index, bodies on demand.

**Why SSE instead of WebSockets?** SSE is unidirectional server → client, which is all progress reporting needs. No handshake, works over plain HTTP, native `EventSource` in every browser.

**Why hide tabs at zero?** Six empty tabs is confusing. Showing only tabs with data makes the app feel shaped for your specific export.

**Why remove favicon requests?** The app is a private archive viewer. Requesting `https://www.google.com/s2/favicons?domain=...` for every bookmark and history entry leaks your data to Google. Letter avatars are fully local.

**Why `allow-popups-to-escape-sandbox`?** Without it, links clicked inside HTML emails open new tabs that inherit the sandbox — the target page sees JavaScript as disabled and refuses to load. This flag lets the popup escape into a normal browsing context.
