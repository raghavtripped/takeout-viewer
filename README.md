# Takeout Viewer

Browse your Google Takeout archive locally — Gmail, Drive, Calendar, Contacts, Keep, Tasks, Chrome, Chat, and Saved links.

---

## Quick Start

**Mac / Linux**
```bash
./setup.sh
```
*(If you get a permissions error: `chmod +x setup.sh` then try again.)*

**Windows**
Double-click `setup.bat`

**Manual (any platform)**
```bash
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

---

## Requirements

- Node.js v18 or newer — download from [nodejs.org](https://nodejs.org)

---

## Importing your data

1. Download your archive from [takeout.google.com](https://takeout.google.com)
2. In the app, click **⊕ Import** and upload the zip file(s)
3. Wait for indexing (5–20 min for large archives)
4. Browse your data — everything is indexed locally

**Multi-part zips:** Google splits large exports into `takeout-001.zip`, `takeout-002.zip`, etc. Select all of them at once in the file picker.

---

## What it indexes

| Tab | Google service | Format |
|---|---|---|
| Mail | Gmail | `.mbox` |
| Drive | Google Drive | files |
| Calendar | Google Calendar | `.ics` |
| Contacts | Google Contacts | `.vcf` |
| Keep | Google Keep | `.json` per note |
| Tasks | Google Tasks | `.ics` (VTODO) |
| Chrome | Chrome bookmarks + history | `.html` + `.json` |
| Chat | Google Chat | `messages.json` per conversation |
| Saved | Saved links | `.html` |

Tabs with no data are hidden automatically.

---

## Notes

- All data stays on your machine — nothing is uploaded or shared
- Indexed data lives in the `data/` folder next to this app
- To start fresh: click the 🗑 button in the top-right corner
- If port 3000 is busy the app automatically tries 3001, 3002, 3003
