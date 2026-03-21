# Takeout Viewer

A local web app that lets you browse your entire Google history — email, files, calendar, contacts, notes, tasks, bookmarks, chat, and saved links — without uploading anything to the cloud.

You export your data from Google, drop the zip file into this app, and it indexes everything into a fast, searchable interface that looks and feels like the Google products you're used to.

---

## Table of Contents

- [Quick Start](#quick-start)
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

## Quick Start

**Mac / Linux**
```bash
./setup.sh
```
*(First time only: `chmod +x setup.sh` if you get a permissions error)*

**Windows**
Double-click `setup.bat`

**Manual**
```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

Requires **Node.js v18 or newer** — download from [nodejs.org](https://nodejs.org).

---

## How to Use It

### Getting your Google Takeout

1. Go to [takeout.google.com](https://takeout.google.com)
2. Select the Google products you want to export. For this app the most useful ones are:
   - **Mail** — your Gmail archive
   - **Drive** — your Google Drive files
   - **Calendar** — your events
   - **Contacts** — your address book
   - **Keep** — your notes
   - **Tasks** — your to-do lists
   - **Chrome** — your bookmarks and browsing history
   - **Google Chat** — your message history
   - **Saved** — your starred links from Search and Maps
3. Choose export format (leave defaults — the app handles all the formats Google uses)
4. Choose delivery method — "Send download link via email" is easiest
5. Wait for the email (can take minutes to hours depending on archive size)
6. Download the zip file(s). Large archives are split into multiple parts like `takeout-20240101-001.zip`, `002.zip`, etc.

### Importing your archive

1. Open the app at [http://localhost:3000](http://localhost:3000)
2. On the onboarding screen, drag-and-drop your zip file(s) into the drop zone, or click "Choose File(s)"
3. If you have multiple zip parts, select all of them at once
4. Click **Import**
5. A progress bar shows what's happening in real time — extraction, then each data type being indexed
6. When it finishes (5–20 minutes for large archives), the app opens automatically to your Mail tab

To re-import or start fresh, click the 🗑 icon in the top-right corner, which wipes the index and returns you to the import screen.

### Browsing your data

- **Search bar** (top center) — searches within whatever tab you're currently on, with a 300ms debounce so results update as you type
- **Sidebar** — switches between data types; each tab has its own sub-navigation (folders, labels, view modes)
- **Tabs are hidden** if you didn't export that data type — only tabs with actual content appear
- **Port conflict** — if port 3000 is already in use, the app automatically tries 3001, 3002, 3003

---

## What Each Tab Does

### Mail
Displays your Gmail archive. The left panel shows an email list — sender, subject, snippet, and date, styled like Gmail's inbox. Bold rows are unread; clicking an email marks it as read (persisted to disk, survives page refresh) and opens the full email in a right-side detail pane. HTML emails render in a sandboxed iframe; plain-text emails render in a `<pre>` block. The sidebar shows all your folders (Inbox, Sent, Drafts, Trash, Spam, Starred, and any custom labels) with message counts. You can filter by folder or search across all mail simultaneously.

### Drive
Shows every file from your Google Drive export. Toggle between a card grid view and a table list view using the buttons in the top-right. Click any file to open a preview modal — images render inline, PDFs open in an embedded viewer, and everything else shows a metadata card with a download button. The sidebar shows the full folder tree; clicking a folder filters the file list to that folder and its subfolders.

### Calendar
Shows your Google Calendar events. The sidebar lets you switch between **List view** (events in chronological order, grouped by date, with time and location) and **Month grid view** (a classic calendar layout with event chips on each day). Use the ← → buttons to navigate by month. Recurring events are marked with a ↻ badge.

### Contacts
A card grid of your Google Contacts, sorted alphabetically. Each card shows the contact's initials (color-coded by name), primary email, and organization. Click any card to open a detail modal with all their emails, phone numbers, job title, and notes.

### Keep
Your Google Keep notes displayed as a masonry card grid — each card uses the same background color you assigned in Keep (yellow, teal, pink, etc.). Pinned notes appear first. Checklist notes show each item with its checked/unchecked state. The sidebar lets you filter by label.

### Tasks
Your Google Tasks history, split into two columns — **Pending** on the left and **Completed** on the right. Pending tasks with a past due date are highlighted in red. Click the sidebar buttons to filter to just pending or just completed.

### Chrome
Your Chrome bookmarks and browsing history. Use the sidebar to switch between the two sub-views:
- **Bookmarks** — organized by folder, each entry shows the page title, domain, and the date you bookmarked it
- **History** — reverse-chronological list of every page you visited, grouped by date, with the time of visit. Both views show favicons fetched from Google's favicon service.

### Chat
Your Google Chat / Hangouts message history. The left panel lists all conversations with participant names and message counts. Clicking a conversation opens the full message thread in the right panel, styled as a chat UI with speech bubbles — your messages on the right, others on the left. Long conversations are paginated.

### Saved
Your starred links from Google Search and Google Maps. Simple list with title, domain, favicon, and the date saved. Clicking a link opens it in a new tab.

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

No database engine, no React, no TypeScript, no build step. The entire stack is:

| Layer | Technology | Reason |
|---|---|---|
| Server | Node.js + Express 4 | Simple, stable, zero config |
| File uploads | multer | Standard multipart middleware |
| Zip extraction | adm-zip | Pure JavaScript, no native compilation |
| Storage | JSON files on disk | Universally readable, no native bindings |
| Progress | Server-Sent Events (SSE) | Built into browsers, simpler than WebSockets |
| Frontend | Vanilla HTML/CSS/JS | Zero build step, easy to share, easy to read |

The decision to use JSON files instead of SQLite was deliberate — SQLite requires `node-gyp` native compilation which regularly breaks on people's machines. JSON files are slower for huge datasets but fast enough for the archive sizes involved (filtering 20,000 emails in memory takes under 200ms), and they're universally debuggable.

### The import pipeline

When you upload a zip, this is the exact sequence:

```
1. multer saves zip(s) to data/uploads/

2. indexer.js: extract each zip entry-by-entry to data/extracted/
   (never loads whole zip into RAM — written to disk immediately)

3. Walk the entire extracted directory tree

4. Route files to the right parser:
   ├── *.mbox       → mboxParser     → emails
   ├── Keep/*.json  → keepParser     → notes
   ├── Tasks/*.ics  → tasksParser    → VTODO blocks
   ├── *.ics        → icsParser      → VEVENT blocks (calendar)
   ├── *.vcf        → vcfParser      → contacts
   ├── Chrome/      → chromeParser   → bookmarks + history
   ├── Google Chat/ → chatParser     → conversations
   ├── Saved/       → savedParser    → links
   └── Google Drive/ → (direct file walk) → drive index

5. Write data/index.json with all metadata arrays

6. For each email: write data/emails/{id}.json (full body)

7. Emit SSE "done" event → browser auto-redirects to Mail tab
```

The SSE progress stream emits `{ stage, message, percent }` objects throughout, which power the progress bar in the browser. The server does not buffer progress events — they are pushed to all connected clients via a `Set` of response objects.

### Data storage

Everything lives in a `data/` directory that is gitignored:

```
data/
├── index.json          ← master index (all metadata + read state)
├── emails/
│   ├── email-0-123.json
│   ├── email-1-456.json
│   └── ...             ← one file per email (full body)
├── extracted/          ← unzipped Takeout contents
└── uploads/            ← temporary zip landing zone (deleted after import)
```

**`index.json` structure:**
```json
{
  "indexed": true,
  "indexedAt": "2026-03-21T10:00:00Z",
  "readEmailIds": ["email-0-123", "email-1-456"],
  "emails": [/* metadata only, no bodies */],
  "driveFiles": [/* file metadata + fullPath for serving */],
  "events": [],
  "contacts": [],
  "keepNotes": [],
  "tasks": [],
  "chromeBookmarks": [],
  "chromeHistory": [],
  "chatConversations": [/* includes full messages array */],
  "savedLinks": []
}
```

Email metadata rows are kept tiny (subject, from, date, snippet, labels) so the entire index loads fast. Full bodies live in individual files and are only read when you open a specific email. Chat conversations store their full message arrays in the index since they're typically small.

**Read/unread state** is stored as a `readEmailIds` array inside `index.json`. When you open an email, the browser fires `PATCH /api/emails/:id/read` which appends the ID and rewrites the index file. On every subsequent page load the email list response includes the full `readIds` array, which the frontend uses to re-hydrate its in-memory Set.

### Parser details

#### mboxParser.js — the most critical file

MBOX is a plain-text format where emails are concatenated with `From ` lines as separators. A large Gmail export can be a 10+ GB single file. The parser never loads it all into memory — it streams line-by-line using Node's `readline` module:

```
createReadStream(path)
  → readline interface (processes one line at a time)
  → accumulate lines until the next "From " boundary
  → parse the accumulated buffer as one complete email
  → call onEmail(metadata, fullEmail) and await it
  → clear buffer, repeat
```

Each parsed email goes through:
1. **Header parsing** — splits at the first blank line, handles folded header continuation lines (RFC 2822 says lines starting with whitespace are continuations of the previous header)
2. **RFC 2047 decoding** — subject lines and sender names are often encoded as `=?UTF-8?B?SGVsbG8=?=` (base64) or `=?UTF-8?Q?Hello_world?=` (quoted-printable). The parser decodes these so you see actual text instead of garbled encoding
3. **MIME multipart handling** — most emails have multiple parts (plain text, HTML, attachments). The parser finds the `boundary=` parameter in the Content-Type header and splits the body on that boundary recursively, extracting `text/plain` and `text/html` parts
4. **Body decoding** — each part may be base64 or quoted-printable encoded; both are decoded
5. **Snippet generation** — prefers the plain text part; strips HTML tags from the HTML part as fallback; takes the first 200 characters
6. **Folder detection** — Gmail adds an `X-Gmail-Labels` header with comma-separated label names. The parser maps these to folder names (Inbox, Sent, Trash, Spam, Drafts, Starred, All Mail)
7. **Date parsing** — email dates are notoriously inconsistent. The parser tries `new Date(cleaned)`, strips timezone abbreviations like `(PST)` that confuse the parser, and falls back to epoch 0 for completely unparseable dates (these sort to the bottom)

#### icsParser.js

Google Calendar exports `.ics` files containing `VEVENT` blocks. The parser:
- Unfolds continuation lines (RFC 5545 allows wrapping long lines with a leading space)
- Handles two date formats: all-day (`20240315`) and datetime (`20240315T120000Z`)
- Strips `TZID=` prefixes from property keys
- Stores `RRULE` as a raw string and marks recurring events with a flag for display

#### tasksParser.js

Same ICS format as Calendar but `VTODO` blocks instead of `VEVENT`. The indexer intentionally scopes this parser to only the `Tasks/` directory so Tasks and Calendar don't parse each other's files. VTODO has `STATUS:COMPLETED` or `STATUS:NEEDS-ACTION`, plus optional `DUE` and `COMPLETED` timestamps.

#### vcfParser.js

vCard format — each contact is a `BEGIN:VCARD ... END:VCARD` block. The parser:
- Unfolds continuation lines
- Handles multiple `EMAIL` and `TEL` properties per contact (collects all into arrays)
- Strips parameter suffixes from property keys (e.g. `EMAIL;TYPE=INTERNET` → just `EMAIL`)
- Skips `PHOTO` fields entirely (base64-encoded images would bloat the index massively)

#### keepParser.js

Google Keep exports one JSON file per note. Each file has a flat structure — the parser reads all `*.json` files from the `Keep/` directory, converts microsecond timestamps to milliseconds, and normalizes the checklist `listContent` array. Notes are sorted with pinned ones first, then by last-edited time descending.

#### chromeParser.js

Two parsers in one file:

**Bookmarks** use the Netscape bookmark HTML format — the same format used by every browser's import/export function since the 1990s. The parser tracks folder context by watching for `<H3>` headings (folder names) and `</DL>` closing tags (folder ends), building a stack to assign each `<A>` link to its correct folder. The `ADD_DATE` attribute is a Unix timestamp in seconds.

**History** is a JSON file with a `Browser History` array. The tricky part is the timestamp: Chrome stores time as microseconds since **January 1, 1601** (the Windows FILETIME epoch), not the Unix epoch. The conversion is: subtract `11644473600 × 10^6` microseconds to get to Unix epoch, then divide by 1000 for milliseconds.

#### chatParser.js

Google Chat exports one `messages.json` per conversation, organized into `Groups/` and `DMs/` subdirectories. Each file has a `messages` array where each message has a `creator` object and a `created_date` string in a verbose human format like `"Wednesday, January 15, 2025 at 10:00:00 AM UTC"`. The parser strips the weekday prefix and converts "at" separators to make it parseable by `new Date()`.

#### savedParser.js

Reuses the Netscape bookmark HTML parser from `chromeParser.js`. Google's Saved exports use the same format. A JSON fallback handles alternative export formats.

### The server and API

`server.js` is a single Express app. All routes follow the same pattern: read the index from disk, filter in memory, paginate, respond.

**Why read the index on every request?** Because it's a local app with one user and a file that's at most a few MB. The overhead of `JSON.parse` on each request is negligible compared to the simplicity of not having to manage an in-memory cache that can go stale.

**Full route list:**

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/import` | Accepts zip upload, starts background indexing |
| `GET` | `/api/import/progress` | SSE stream of `{stage, message, percent}` |
| `GET` | `/api/status` | Returns `{indexed, importing, counts}` |
| `GET` | `/api/emails` | Paginated email list with folder filter + search |
| `GET` | `/api/emails/:id` | Full email body from individual JSON file |
| `PATCH` | `/api/emails/:id/read` | Marks email as read, persists to index.json |
| `GET` | `/api/drive` | Paginated file list with folder filter + search |
| `GET` | `/api/drive/download/:id` | Serves file with `Content-Disposition: attachment` |
| `GET` | `/api/drive/preview/:id` | Serves file inline (for image/PDF preview) |
| `GET` | `/api/calendar` | Events filtered by year + month + search |
| `GET` | `/api/contacts` | Contacts sorted alphabetically, searchable |
| `GET` | `/api/keep` | Notes filtered by label + search, paginated |
| `GET` | `/api/tasks` | Returns `{pending, completed}` split, searchable |
| `GET` | `/api/chrome` | Bookmarks or history (`?type=`), paginated |
| `GET` | `/api/chat` | Conversation list, or messages for one conversation |
| `GET` | `/api/saved` | Saved links, paginated, searchable |
| `POST` | `/api/reset` | Deletes the entire `data/` directory |

**Port fallback:** The server tries to listen on port 3000. If it gets `EADDRINUSE`, it tries 3001, then 3002, then 3003. This is handled by a recursive `startServer(port, attemptsLeft)` function on the server's error event.

### The frontend

Single HTML page (`public/index.html`) with no framework and no build step. JavaScript is split into one file per tab, all loaded via `<script>` tags.

**State management** (`app.js`): a plain object called `state` holds everything — active tab, search query, current page numbers, selected email ID, which chat conversation is open, etc. There's no reactivity system; functions simply read from `state` and re-render their DOM sections when called.

**Tab routing**: `switchTab(tab)` hides all views and shows the target one, hides all sidebar sections and shows the target one, then calls the appropriate `load*()` function. Tabs with zero items have the CSS class `nav-item-hidden` applied at boot time based on the counts in `/api/status`.

**Search**: A single search input in the header fires whichever `load*()` function matches the active tab, with a 300ms debounce to avoid hammering the server on every keystroke.

**Pagination**: A shared `renderPagination(containerId, page, total, pageSize, onPage)` helper is used by all paginated views. It renders Previous/Next buttons and a count label.

**Drive preview modal**: Clicking a file in Drive determines the file type by extension. Images (`jpg`, `png`, `gif`, `webp`, `svg`) get an `<img>` tag pointing at `/api/drive/preview/:id`. PDFs get an `<iframe>`. Everything else gets a metadata summary and download button. The preview endpoint uses `res.sendFile()` without `Content-Disposition: attachment` so the browser renders it inline.

**Email rendering**: HTML email bodies are injected into a sandboxed `<iframe>` using the `srcdoc` attribute. The sandbox prevents scripts from running while still allowing the HTML and CSS to render. The iframe height is set to match its content via an `onload` handler.

---

## File-by-File Reference

```
takeout-viewer/
│
├── package.json          — Dependencies: express, multer, adm-zip
├── setup.sh              — Mac/Linux quick-start script
├── setup.bat             — Windows quick-start script
│
├── src/
│   ├── server.js         — Express app, all API routes, SSE, port fallback
│   ├── db.js             — Read/write index.json, email files, read state
│   ├── indexer.js        — Zip extraction, walks directory, calls all parsers
│   ├── mboxParser.js     — Streaming line-by-line mbox parser
│   ├── icsParser.js      — VEVENT parser for Google Calendar
│   ├── tasksParser.js    — VTODO parser for Google Tasks
│   ├── vcfParser.js      — VCARD parser for Google Contacts
│   ├── keepParser.js     — JSON parser for Google Keep notes
│   ├── chromeParser.js   — Netscape HTML bookmarks + Chrome history JSON
│   ├── chatParser.js     — Google Chat messages.json parser
│   └── savedParser.js    — Saved links HTML/JSON parser
│
└── public/
    ├── index.html        — Single-page shell, all views declared here
    ├── css/
    │   └── app.css       — All styles; Gmail-faithful design system
    └── js/
        ├── app.js        — Global state, tab router, search, onboarding, SSE
        ├── mail.js       — Email list, folder sidebar, detail pane, read state
        ├── drive.js      — File grid/list, folder tree, preview modal
        ├── calendar.js   — Event list and month grid, month navigation
        ├── contacts.js   — Contact cards, detail modal
        ├── keep.js       — Masonry note grid, label filter sidebar
        ├── tasks.js      — Two-column pending/completed layout
        ├── chrome.js     — Bookmarks by folder, history by date
        ├── chat.js       — Conversation list, message thread panel
        └── saved.js      — Saved links list
```

---

## Design Decisions

**Why no database?** SQLite requires native compilation via `node-gyp`, which fails on many machines due to missing build tools, Python version mismatches, or Xcode license issues. JSON files on disk work everywhere, are human-readable, and are fast enough for personal archive sizes.

**Why no React/Vue/build step?** The app is meant to be shared with non-developers. A build step means `npm run build` can fail, creates a `dist/` folder to explain, and adds complexity for zero user-visible benefit. Vanilla JS means anyone can open any file and immediately understand it.

**Why streaming the mbox?** Gmail archives commonly exceed 10GB as a single `.mbox` file. Loading that into memory would crash the Node process. The `readline` approach keeps memory usage flat regardless of file size — only one email is ever in RAM at a time.

**Why individual files for email bodies?** The full text/HTML of all your emails would make `index.json` enormous and slow to parse on every request. Storing metadata in the index and bodies in separate files means the index stays small and fast. Email bodies are only read when you actually open that specific email.

**Why SSE instead of WebSockets?** Server-Sent Events are unidirectional (server → client only), which is exactly what progress reporting needs. They work over plain HTTP, require no handshake protocol, and are handled natively by `EventSource` in every browser. WebSockets would add complexity for no benefit here.

**Why tabs hidden at zero?** If you only exported Gmail and Contacts, seeing six empty tabs for Drive/Calendar/Keep/Tasks/Chrome/Chat/Saved is confusing and makes the app feel broken. Hiding them makes the app feel like it's exactly shaped for your data.
