/**
 * Reboot Question Generator — Google Drive saver.
 *
 * Paste this whole file into a new Google Apps Script project (script.google.com),
 * fill in the two settings below, then Deploy > New deployment > Web app:
 *   Execute as: Me        Who has access: Anyone
 * Copy the Web app URL (ends in /exec) into Netlify as DRIVE_SCRIPT_URL, and the
 * TOKEN below as DRIVE_TOKEN. Full steps are in README.md.
 */

// 1. A secret word only you and Netlify know. Use letters and numbers, 20+ characters.
const TOKEN = 'change-this-to-a-long-secret-word';

// 2. The ID of your main question-paper folder: open the folder in Drive and copy
//    the part of the link after /folders/
const ROOT_FOLDER_ID = 'paste-your-folder-id-here';

const MARK = 'Created by Reboot Question Generator';

function doGet(e) {
  try {
    if ((e.parameter.token || '') !== TOKEN) return out({ error: 'bad_token' });
    if (e.parameter.action !== 'folders') return out({ error: 'unknown_action' });
    const root = DriveApp.getFolderById(ROOT_FOLDER_ID);
    const folders = [];
    // The main folder's sub-folders, two levels deep.
    const walk = (folder, prefix, depth) => {
      const it = folder.getFolders();
      while (it.hasNext() && folders.length < 300) {
        const f = it.next();
        const name = prefix + f.getName();
        folders.push({ id: f.getId(), name: name });
        if (depth < 2) walk(f, name + ' › ', depth + 1);
      }
    };
    walk(root, '', 1);
    folders.sort((a, b) => a.name.localeCompare(b.name));
    return out({ ok: true, root: { id: root.getId(), name: root.getName() }, folders: folders });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    if ((e.parameter.token || '') !== TOKEN) return out({ error: 'bad_token' });
    const p = JSON.parse(e.postData.contents);

    let folder = DriveApp.getFolderById(folderId(p.folder) || ROOT_FOLDER_ID);
    (p.path || []).slice(0, 4).forEach(function (part) {
      const name = String(part || '').replace(/[\\/]/g, '-').trim().slice(0, 80);
      if (!name) return;
      const it = folder.getFoldersByName(name);
      folder = it.hasNext() ? it.next() : folder.createFolder(name);
    });

    // Replace an earlier copy of the same paper, but only files this app made.
    if (p.replaceId) {
      try {
        const old = DriveApp.getFileById(String(p.replaceId));
        if (old.getDescription() === MARK) old.setTrashed(true);
      } catch (ignore) {}
    }

    const name = String(p.name || 'Question paper.pdf').replace(/[\\/]/g, '-').slice(0, 150);
    const blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mimeType || 'application/pdf', name);
    const file = folder.createFile(blob);
    file.setDescription(MARK);
    return out({ ok: true, id: file.getId(), url: file.getUrl(), folder: folder.getName() });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}

function folderId(s) {
  const m = String(s || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
