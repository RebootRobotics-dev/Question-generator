# Reboot Question Generator

A web app that writes question papers from **LKG to Class 12, college and educator level**,
for two sections:

- **RRA (Reboot Robotics Academy):** Arduino, ESP32, sensors, robotics projects, AI, Machine
  Learning, LEGO, Scratch, Blix Box, MakeCode Arcade, mechanics, Cretile, drones, Python, C,
  electronics and IoT. The Reboot logo prints on every page, plus a partner's logo when you
  run a paper in collaboration.
- **School / organisation syllabus:** CBSE, ICSE / ISC, West Bengal and other state boards,
  university or an organisation's own syllabus. Only that school's or organisation's logo is
  printed. The Reboot logo is left off.

You choose the class, subject, topic, syllabus, difficulty, language, full marks, pass marks and
time. The question format can be MCQ only, fill in the blanks only, true/false only, one of the
ready patterns (CBSE, ICSE, unit test, practical, college exam and more), or fully custom:
set how many of each of 12 question types you want, add your own question types, and type
your own instructions.

You can also **upload book pages or notes** (JPG, JPEG, PNG, PDF, DOCX, XLSX, CSV). The paper
is then written from that material.

Every finished paper can be printed, downloaded as a PDF, and **saved automatically to your
Google Drive folder**. Every page carries the logos and a page number.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The app people open in the browser |
| `logo.png` | Browser-tab icon (the logo on the paper is built into `index.html`) |
| `netlify/edge-functions/generate.js` | Talks to the AI (Gemini, or Claude) with your secret API key |
| `netlify/edge-functions/drive.js` | Passes finished papers to your Google Drive script |
| `google-drive/Code.gs` | Small Google script that saves papers into your Drive folder |
| `netlify.toml` | Tells Netlify how to publish the site |

## Cost: everything can run free

| Part | Free option |
|---|---|
| AI that writes the questions | **Google Gemini** free tier (no card needed) |
| Website hosting | **Netlify** free plan |
| Saving to Google Drive | **Google Apps Script** (free with any Google account) |

If you get funds later, you can switch the AI to Claude (paid) by changing one setting.
See step 3.

## 1. Get a free Gemini API key

1. Go to https://aistudio.google.com and sign in with the academy's Google account.
2. Click **Get API key → Create API key**. Copy it.
3. Don't add billing. Without billing the key stays on the free tier and never charges you.

Keep this key private. It only goes into Netlify's settings, never into `index.html`.

**Free-tier limits:** Google allows a limited number of requests per minute and per day.
That's plenty for a teaching team. If many papers are made at once, the app says "free AI
limit reached, wait a minute". The exact limits are shown in AI Studio under **Usage**.

**Privacy:** on the free tier Google may use what you send to improve its products. Uploading
textbook pages and notes is fine. Don't upload students' personal details (names with marks,
phone numbers and so on).

## 2. Deploy to Netlify

The server functions only run when Netlify builds the site, so use one of these
(plain drag-and-drop of the folder may skip the functions):

**Option A: GitHub (easiest to update later)**
1. Create a new GitHub repository and upload everything in this folder
   (keep the `netlify` folder and its path exactly as it is).
2. In Netlify: **Add new site → Import an existing project → GitHub** and pick the repo.
3. Leave the build command empty. Publish directory: `.`  → **Deploy**.

**Option B: Netlify CLI**
```
npm install -g netlify-cli
netlify login
cd reboot-question-generator
netlify deploy --prod
```

## 3. Add your settings in Netlify

Site → **Site configuration → Environment variables → Add a variable**:

| Key | Value | Needed? |
|---|---|---|
| `GEMINI_API_KEY` | your free key from step 1 | Yes |
| `GEMINI_MODEL` | e.g. `gemini-2.5-flash` | Optional. Leave empty to use Google's latest Flash model. Set it if Google renames models |
| `ACCESS_CODE` | a code you choose, e.g. `reboot2026` | Recommended. Stops strangers using up your free AI limit and your Drive |
| `ANTHROPIC_API_KEY` | a paid Claude key from console.anthropic.com | Only if you later switch to Claude. Remove `GEMINI_API_KEY` too, because Gemini is used whenever it is set |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | Optional, Claude only |
| `DRIVE_SCRIPT_URL` | the Web app link from step 4 | For Google Drive saving |
| `DRIVE_TOKEN` | the secret word from step 4 | For Google Drive saving |

Then **Deploys → Trigger deploy** so the new settings take effect.

## 4. Connect Google Drive

Papers are saved by a small script that runs in **your own Google account**, so nobody else
needs to sign in to Google.

1. In Google Drive, open (or create) the folder where papers should go, e.g. *Question Papers*.
   Copy the ID from the link: the part after `/folders/`.
   Any sub-folders inside it (up to two levels) will appear in the app's folder list.
2. Go to https://script.google.com → **New project**. Delete the sample code and paste in
   everything from `google-drive/Code.gs`.
3. At the top of the script, change:
   - `TOKEN`: a long secret word (letters and numbers, 20+ characters).
   - `ROOT_FOLDER_ID`: the folder ID from step 1.
4. Click **Deploy → New deployment → Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy**, allow the permissions Google asks for, and copy the **Web app URL**
   (it ends in `/exec`).
5. In Netlify add `DRIVE_SCRIPT_URL` (the Web app URL) and `DRIVE_TOKEN` (the same secret
   word), then trigger a new deploy.

In the app, step 6 "Google Drive" now shows **Connected**. Pick the folder, and leave "Save
every new paper automatically" ticked. If you edit a paper after it was saved, press
**Save changes to Drive**. This replaces the earlier copy.

If you change the script later, use **Deploy → Manage deployments → Edit → New version**
so the link stays the same.

## 5. Use it

Open your site link (e.g. `https://reboot-questions.netlify.app`). If you set an access code,
the app asks for it the first time. Share the code only with your trainers and teachers.

- **Partner and school logos:** upload them in step 5. They are remembered in that browser,
  so you can switch between partners with one click.
- **Uploads:** photos of book pages work best when they are sharp and straight. PDFs must be
  under 4.5 MB. Old `.doc` files and Google Docs need saving as `.docx` or PDF first
  (Google Docs: *File → Download*).
- **Editing:** click any question, option or answer on the preview to change it. Hover a
  question to replace it with a new one or remove it.

You can rename the site link in Netlify under **Site configuration → Change site name**,
or connect your own domain (e.g. `questions.rebootrobotics.in`) under **Domain management**.
