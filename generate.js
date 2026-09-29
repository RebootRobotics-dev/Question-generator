// Reboot Question Generator — server side.
// Builds the question-paper prompt from the form settings (plus any uploaded
// book pages, PDFs or notes) and streams the AI's answer back to the page.
// Your API key never reaches the browser.
//
// Environment variables (Netlify > Site configuration > Environment variables).
// Set ONE of the two keys. If both are set, Gemini is used.
//   GEMINI_API_KEY     free key from aistudio.google.com (Google Gemini, free tier)
//   GEMINI_MODEL       optional  defaults to gemini-flash-latest
//   ANTHROPIC_API_KEY  paid key from console.anthropic.com (Claude)
//   CLAUDE_MODEL       optional  defaults to claude-sonnet-5-5
//   ACCESS_CODE        optional  if set, users must type this code to generate

const TYPE_RULES = {
  mcq:     { title: "Multiple Choice Questions",   rule: 'exactly 4 options, one correct. Answer like "B) option text".' },
  fill:    { title: "Fill in the Blanks",          rule: 'use "______" for the blank. Answer is the missing word(s).' },
  tf:      { title: "True or False",               rule: 'a statement. Answer "True" or "False" with a short reason.' },
  oneword: { title: "One-Word Answers",            rule: "answerable in one word or a short phrase. Answer is that word or phrase." },
  match:   { title: "Match the Following",         rule: 'put 4 to 6 pairs in "pairs" as [left, right], with the right-hand items SHUFFLED so they do not line up with their partners. "q" is a one-line instruction. Answer like "1-c, 2-a, 3-d, 4-b", where the letters are the right-hand items in the order you listed them (a = first).' },
  ar:      { title: "Assertion and Reason",        rule: '"q" is "Assertion (A): ...\\nReason (R): ...". "options" are exactly these four, in this order: "Both A and R are true, and R is the correct explanation of A", "Both A and R are true, but R is not the correct explanation of A", "A is true, but R is false", "A is false, but R is true". Answer like "A) ...".' },
  vsa:     { title: "Very Short Answer Questions", rule: "answerable in 1-2 lines. Answer: a model answer in one sentence." },
  short:   { title: "Short Answer Questions",      rule: "answerable in 2-4 lines. Answer: model answer in 1-3 sentences." },
  long:    { title: "Long Answer Questions",       rule: "needs explanation, diagram or steps. Answer: key points expected." },
  case:    { title: "Case-Based Questions",        rule: '"q" is a short case, passage, scenario or small data set (4-8 sentences). Put 3 or 4 sub-questions about it in "parts". Answer: answers to each part, labelled (i), (ii), (iii)...' },
  code:    { title: "Coding & Practical",          rule: 'a coding, circuit or practical task (write, complete or debug a short program, predict output, describe wiring). Put any program text in "code" with real line breaks. Answer: expected solution or key points.' },
  diagram: { title: "Diagram & Circuit",           rule: "asks the student to draw, label or complete a diagram, circuit, flowchart, block program or robot layout. Answer: what the finished diagram must show." },
};
const LANGS = ["English", "Bengali", "Hindi"];
const LEVELS = ["Easy", "Medium", "Hard", "Mixed"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SOURCE_CHARS = 7_000_000; // base64 + text, keeps the request well inside API limits

const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f]+/g, " ").trim().slice(0, n);
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// How to pitch the questions for each class or group.
function audience(grade) {
  const g = grade.toLowerCase();
  if (/nursery|lkg|ukg|pre-?primary|kinder/.test(g))
    return "These are very young children (about 3-6 years old) who are just starting to read. Use very short, simple sentences and everyday words, one idea per question, no negatives or trick wording. Prefer recognise, tick, match, name and count style questions that a teacher can read aloud.";
  const n = parseInt((g.match(/class\s*(\d+)/) || [])[1]);
  if (n >= 1 && n <= 2) return "Children aged about 6-8. Short sentences, simple words, concrete examples from daily life.";
  if (n >= 3 && n <= 5) return "Primary-school children. Clear simple language, concrete examples, gentle reasoning.";
  if (n >= 6 && n <= 8) return "Middle-school students. Mix recall with understanding and simple application.";
  if (n >= 9 && n <= 10) return "Secondary students preparing for board exams. Balance knowledge, understanding, application and analysis.";
  if (n >= 11 && n <= 12) return "Senior-secondary students. Expect precise terminology, derivations or reasoning, and application to unfamiliar situations.";
  if (/diploma|b\.?tech|b\.?e\b|bca|b\.?sc|mca|m\.?tech|college|university|undergrad|postgrad/.test(g))
    return "College / university students. Use proper technical depth: analysis, design, derivation, debugging and justification, not just recall.";
  if (/educator|teacher|trainer|faculty/.test(g))
    return "Teachers and trainers being assessed. Test deep subject mastery, common student misconceptions, troubleshooting, and how to teach or demonstrate the concept in a classroom or lab.";
  if (/beginner/.test(g)) return "Beginners who have just started robotics and coding. Keep it concrete and confidence-building.";
  if (/intermediate/.test(g)) return "Students with some hands-on experience. Include wiring, logic and short code reasoning.";
  if (/advanced/.test(g)) return "Advanced students. Include debugging, design choices, optimisation and multi-step projects.";
  return "";
}

// What each board or syllabus expects.
function boardRule(board) {
  const b = board.toLowerCase();
  if (b.includes("cbse"))
    return "Follow the latest official CBSE guidelines and CBSE sample question paper design for this class: NCERT textbook content and terminology, competency-based and application questions, case/source-based and assertion-reason items where those sections are requested, and answer lengths that suit the marks.";
  if (b.includes("icse") || b.includes("isc") || b.includes("cisce"))
    return "Follow the official CISCE (ICSE / ISC) syllabus and specimen question paper style for this class: precise, well-structured questions, compulsory short questions first, then longer structured questions, with the marks-to-length balance CISCE uses.";
  if (b.includes("wbbse") || b.includes("wbchse") || b.includes("west bengal"))
    return "Follow the West Bengal board (WBBSE / WBCHSE) syllabus and textbook for this class.";
  if (b.includes("state")) return "Follow the state board syllabus and textbook for this class.";
  if (b.includes("organi")) return "Follow the organisation's own syllabus as described in the teacher's instructions and any attached material.";
  if (b.includes("university") || b.includes("college")) return "Match the style and depth of university semester examinations for this programme.";
  return "";
}

function buildPrompt(p, hasSources) {
  const custom = {};
  for (const c of Array.isArray(p.custom) ? p.custom.slice(0, 8) : []) {
    const id = String(c?.id || "");
    if (/^c\d{1,2}$/.test(id) && clip(c.title, 60))
      custom[id] = { title: clip(c.title, 60), rule: clip(c.rule, 400) || "follow the section name." };
  }
  const rules = { ...TYPE_RULES, ...custom };
  const mix = (Array.isArray(p.mix) ? p.mix : [])
    .filter(t => rules[t?.id])
    .map(t => ({ id: t.id, n: Math.min(30, Math.max(0, parseInt(t.n) || 0)) }))
    .filter(t => t.n > 0);
  if (!mix.length) return null;
  if (mix.reduce((s, t) => s + t.n, 0) > 60) return null;

  const grade = clip(p.grade, 60);
  const board = clip(p.board, 60);
  const who = p.mode === "reboot"
    ? `students of Reboot Robotics Academy (a robotics, coding, STEM and AI academy in Kolkata). Level: ${grade}. Keep questions practical and hands-on: real components (Arduino UNO, ESP32, sensors, motors, drivers, LEDs, breadboards, LEGO, drones), block coding, Arduino C/C++ or Python where relevant, and real-life robot applications.`
    : `${grade} learners following the ${board || "school"} syllabus in India. Match textbook language and the depth expected at that level.`;
  const topic = clip(p.topic, 300);
  const extra = clip(p.extra, 1500);
  const avoid = (Array.isArray(p.avoid) ? p.avoid : []).slice(0, 40).map(q => clip(q, 220)).filter(Boolean);
  const fm = parseFloat(p.fullMarks) || 0;
  const time = clip(p.time, 40);

  const sourceRule = !hasSources ? "" : p.sourceMode === "only"
    ? "- The teacher attached source material (textbook pages, notes or sheets) above. Every question MUST come from that material only. Read photos of book pages carefully, including diagrams and tables. Do not ask about anything the material does not cover."
    : "- The teacher attached source material (textbook pages, notes or sheets) above. Base most questions on it, and use the topic to decide what to focus on. Read photos of book pages carefully, including diagrams and tables.";

  return `You are an experienced question-paper setter. Write an original question paper for ${who}
${audience(grade)}
${boardRule(board)}

Subject: ${clip(p.subject, 60) || "General"}
Topic: ${topic || "take the topic from the attached material"}
Difficulty: ${LEVELS.includes(p.level) ? p.level : "Medium"}${p.level === "Mixed" ? " (about 30% easy, 50% medium, 20% hard)" : ""}
${time ? "Time allowed: " + time : ""}${fm ? "   Full marks: " + fm : ""}
Language of questions and answers: ${LANGS.includes(p.lang) ? p.lang : "English"}
${extra ? "Teacher's instructions (follow these carefully): " + extra : ""}

Produce exactly these sections, in this order, with exactly this many questions each:
${mix.map(t => `- type "${t.id}" (${rules[t.id].title}): ${t.n} questions`).join("\n")}

Rules:
- Every question must be about the topic, factually correct, clear, age-appropriate and not repeated.
${sourceRule}
${mix.map(t => `- "${t.id}": ${rules[t.id].rule}`).join("\n")}
- Leave "options", "code", "pairs" and "parts" empty when a question doesn't need them.
- Give 3 to 5 short general instructions suitable for this exam.
${avoid.length ? "- These questions are already on the paper. Write different ones that test something else:\n" + avoid.map(q => "  * " + q).join("\n") : ""}

Reply with only JSON (no markdown fence, no other text) in this shape:
{"title":"short paper title naming the topic","instructions":["..."],"sections":[{"type":"mcq","questions":[{"q":"question text","options":[],"code":"","pairs":[],"parts":[],"answer":"..."}]}]}`;
}

// Turn uploaded material into Claude content blocks (converted for Gemini below).
function sourceBlocks(list) {
  if (!Array.isArray(list) || !list.length) return { blocks: [] };
  let size = 0;
  const blocks = [];
  for (const f of list.slice(0, 20)) {
    const name = clip(f?.name, 120) || "file";
    if (f?.kind === "image" && IMAGE_TYPES.includes(f.media) && typeof f.data === "string") {
      size += f.data.length;
      blocks.push({ type: "text", text: `Source file: ${name}` });
      blocks.push({ type: "image", source: { type: "base64", media_type: f.media, data: f.data } });
    } else if (f?.kind === "pdf" && typeof f.data === "string") {
      size += f.data.length;
      blocks.push({ type: "document", title: name, source: { type: "base64", media_type: "application/pdf", data: f.data } });
    } else if (f?.kind === "text" && typeof f.text === "string" && f.text.trim()) {
      const text = f.text.slice(0, 200_000);
      size += text.length;
      blocks.push({ type: "document", title: name, source: { type: "text", media_type: "text/plain", data: text } });
    }
    if (size > MAX_SOURCE_CHARS) return { error: "The uploaded files are too large together. Remove some pages and try again." };
  }
  return { blocks };
}

// Claude content blocks -> Gemini parts.
function geminiParts(blocks, prompt) {
  const parts = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ text: b.text });
    else if (b.type === "image") parts.push({ inline_data: { mime_type: b.source.media_type, data: b.source.data } });
    else if (b.source.type === "base64") parts.push({ text: `Source file: ${b.title}` }, { inline_data: { mime_type: "application/pdf", data: b.source.data } });
    else parts.push({ text: `Source file: ${b.title}\n\n${b.source.data}` });
  }
  parts.push({ text: prompt });
  return parts;
}

// Plain-language messages for Gemini errors, shown to the teacher as-is.
function geminiError(status, detail) {
  if (status === 429) return json(429, { error: "The free AI limit has been reached for now. Wait a minute and try again (the daily limit resets every day)." });
  if (/API key|API_KEY|PERMISSION_DENIED/i.test(detail) || status === 401 || status === 403)
    return json(502, { error: "The site's Gemini API key isn't working. The site owner should check GEMINI_API_KEY in Netlify." });
  if (status === 404) return json(502, { error: "The chosen Gemini model isn't available. The site owner should check GEMINI_MODEL in Netlify." });
  if (status === 400 && /image|pdf|inline|mime|file/i.test(detail)) return json(502, { error: "One of the uploaded files couldn't be read. Remove it (or re-save it) and try again." });
  if (status === 400 && /location|region|not supported/i.test(detail)) return json(502, { error: "Gemini isn't available for this site's region or account. See README.md." });
  if (status === 503 || status === 500) return json(429, { error: "Gemini is busy right now. Wait a minute, then try again." });
  return json(502, { error: "The AI service had a problem. Please try again." });
}

// Gemini's event stream, reshaped into the Claude-style events the page reads.
function fromGemini(body) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const send = (c, ev) => c.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
  let buf = "";
  const handle = (c, line) => {
    line = line.trim();
    if (!line.startsWith("data:")) return;
    let ev; try { ev = JSON.parse(line.slice(5)); } catch { return; }
    if (ev.error) return send(c, { type: "error", error: { type: ev.error.status === "UNAVAILABLE" ? "overloaded_error" : "api_error" } });
    const cand = ev.candidates?.[0];
    for (const part of cand?.content?.parts || [])
      if (part.text && !part.thought) send(c, { type: "content_block_delta", delta: { type: "text_delta", text: part.text } });
    if (cand?.finishReason === "MAX_TOKENS") send(c, { type: "message_delta", delta: { stop_reason: "max_tokens" } });
    else if (cand?.finishReason && cand.finishReason !== "STOP") send(c, { type: "error", error: { type: "api_error" } });
  };
  return body.pipeThrough(new TransformStream({
    transform(chunk, c) {
      buf += dec.decode(chunk, { stream: true });
      let k;
      while ((k = buf.indexOf("\n")) >= 0) { handle(c, buf.slice(0, k)); buf = buf.slice(k + 1); }
    },
    flush(c) { handle(c, buf); },
  }));
}

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "Use POST." });

  const gemini = Netlify.env.get("GEMINI_API_KEY");
  const key = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!gemini && !key) return json(500, { error: "The site owner hasn't added GEMINI_API_KEY in Netlify yet. See README.md." });

  let p;
  try { p = await request.json(); } catch { return json(400, { error: "Bad request." }); }

  const code = Netlify.env.get("ACCESS_CODE");
  if (code && String(p.accessCode || "") !== code) return json(401, { error: "access_code" });

  const src = sourceBlocks(p.sources);
  if (src.error) return json(400, { error: src.error });
  if (!clip(p.topic, 300) && !src.blocks.length) return json(400, { error: "Enter a topic or upload some material." });
  const prompt = buildPrompt(p, src.blocks.length > 0);
  if (!prompt) return json(400, { error: "Choose between 1 and 60 questions in total." });

  if (gemini) {
    const model = Netlify.env.get("GEMINI_MODEL") || "gemini-flash-latest";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": gemini, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: geminiParts(src.blocks, prompt) }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 32768 },
      }),
    });
    if (!res.ok) return geminiError(res.status, (await res.text().catch(() => "")).slice(0, 500));
    return new Response(fromGemini(res.body), {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Netlify.env.get("CLAUDE_MODEL") || "claude-sonnet-5-5",
      max_tokens: 16000,
      stream: true,
      messages: [{ role: "user", content: [...src.blocks, { type: "text", text: prompt }] }],
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    const status = upstream.status === 429 || upstream.status === 529 ? 429 : 502;
    return json(status, { error: "upstream", status: upstream.status, detail: detail.slice(0, 300) });
  }

  // Pass Claude's event stream straight through to the page.
  return new Response(upstream.body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/generate" };
