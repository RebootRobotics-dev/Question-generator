// Reboot Question Generator — Google Drive relay.
// Passes finished papers to your Google Apps Script (google-drive/Code.gs),
// which saves them into your Drive folder. The script link stays secret here.
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   DRIVE_SCRIPT_URL  required for Drive saving  the Apps Script "Web app" URL ending in /exec
//   DRIVE_TOKEN       required for Drive saving  the same secret word you typed into Code.gs
//   ACCESS_CODE       optional                   same access code as the generator
//
//   GET  /api/drive  -> list of folders you can save into
//   POST /api/drive  -> save one file  {name, mimeType, data (base64), folder, path[], replaceId}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (request) => {
  const script = Netlify.env.get("DRIVE_SCRIPT_URL");
  if (!script) return json(501, { error: "drive_not_setup" });

  const code = Netlify.env.get("ACCESS_CODE");
  if (code && request.headers.get("x-access-code") !== code) return json(401, { error: "access_code" });

  const url = new URL(script);
  url.searchParams.set("token", Netlify.env.get("DRIVE_TOKEN") || "");

  let res;
  try {
    if (request.method === "GET") {
      url.searchParams.set("action", "folders");
      res = await fetch(url);
    } else if (request.method === "POST") {
      // Forward the body untouched; no need to parse a few MB of PDF here.
      const body = await request.arrayBuffer();
      if (body.byteLength > 25_000_000) return json(413, { error: "That file is too large for Drive saving." });
      res = await fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body });
    } else {
      return json(405, { error: "Use GET or POST." });
    }
  } catch {
    return json(502, { error: "Couldn't reach the Google Drive script." });
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    return json(502, { error: "script_reply", detail: text.slice(0, 200) });
  }
  return json(data.error ? 400 : 200, data);
};

export const config = { path: "/api/drive" };
