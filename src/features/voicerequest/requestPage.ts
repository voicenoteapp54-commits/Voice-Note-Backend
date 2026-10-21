export const MAX_RECORDING_SECONDS = 180;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STYLES = `
:root{--bg:#f6f5f2;--card:#fff;--text:#1c1b19;--muted:#6b6a66;--border:#e7e5e0;--accent:#e5484d;--ring:rgba(229,72,77,.28);--ok:#2f9e6b;--field:#faf9f7}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1d1d1b;--text:#f2f1ed;--muted:#9a9890;--border:#2c2b28;--ring:rgba(229,72,77,.4);--field:#242422}}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:22px;padding:34px 26px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.07)}
h1{font-size:1.4rem;line-height:1.3;margin:0 0 10px}
p{margin:0 0 18px;color:var(--muted)}
.emoji{font-size:2.6rem;margin-bottom:8px}
.quote{margin:0 0 22px;padding:12px 16px;background:var(--field);border:1px solid var(--border);border-radius:14px;color:var(--text);font-style:italic;word-break:break-word}
.rec-btn{width:96px;height:96px;border-radius:50%;border:0;background:var(--accent);color:#fff;cursor:pointer;display:grid;place-items:center;margin:6px auto 14px;transition:transform .15s}
.rec-btn:active{transform:scale(.95)}
.rec-btn:focus-visible,.btn:focus-visible,input:focus-visible{outline:3px solid var(--ring);outline-offset:2px}
.rec-btn.recording{animation:pulse 1.4s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 var(--ring)}70%{box-shadow:0 0 0 24px rgba(229,72,77,0)}100%{box-shadow:0 0 0 0 rgba(229,72,77,0)}}
.rec-btn .i-stop{display:none}
.rec-btn.recording .i-mic{display:none}
.rec-btn.recording .i-stop{display:block}
.timer{font-variant-numeric:tabular-nums;font-size:1.7rem;font-weight:650;margin-bottom:10px}
progress{width:100%;height:6px;border:0;border-radius:3px;overflow:hidden;background:var(--border);appearance:none;-webkit-appearance:none}
progress::-webkit-progress-bar{background:var(--border)}
progress::-webkit-progress-value{background:var(--accent)}
progress::-moz-progress-bar{background:var(--accent)}
.hint{margin:14px 0 0;font-size:.92rem;min-height:1.4em}
.hint.error{color:var(--accent)}
audio{width:100%;margin:4px 0 18px}
input[type=text]{width:100%;padding:13px 14px;border-radius:12px;border:1px solid var(--border);background:var(--field);color:var(--text);font:inherit;margin-bottom:14px}
.btn{width:100%;padding:14px;border-radius:12px;border:1px solid transparent;font:inherit;font-weight:600;cursor:pointer;margin-bottom:10px}
.btn.primary{background:var(--accent);color:#fff}
.btn.secondary{background:transparent;border-color:var(--border);color:var(--text)}
.btn:disabled{opacity:.55;cursor:not-allowed}
.foot{margin-top:22px;font-size:.8rem;color:var(--muted)}
`;

const shell = (title: string, body: string, script = "", nonce = ""): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
${body}
${script ? `<script nonce="${nonce}">${script}</script>` : ""}
</html>`;

/** Friendly dead-end page: invalid / used / expired / cancelled links. */
export const renderStatusPage = (opts: {
  emoji: string;
  title: string;
  message: string;
}): string =>
  shell(
    opts.title,
    `<body>
<main class="card">
  <div class="emoji">${opts.emoji}</div>
  <h1>${escapeHtml(opts.title)}</h1>
  <p>${escapeHtml(opts.message)}</p>
</main>
</body>`,
  );

export const renderRecorderPage = (opts: {
  token: string;
  requesterName: string;
  message: string | null;
  expiresAt: Date;
  nonce: string;
}): string => {
  const hoursLeft = Math.max(
    1,
    Math.round((opts.expiresAt.getTime() - Date.now()) / 3_600_000),
  );
  const who = escapeHtml(opts.requesterName);

  const body = `<body data-token="${escapeHtml(opts.token)}">
<main class="card">

  <section id="view-record">
    <h1>${who} would like a voice note from you</h1>
    <p>Record a short message. No account needed.</p>
    ${opts.message ? `<blockquote class="quote">&ldquo;${escapeHtml(opts.message)}&rdquo;</blockquote>` : ""}

    <button id="recBtn" class="rec-btn" type="button" aria-label="Start recording">
      <svg class="i-mic" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v4"></path></svg>
      <svg class="i-stop" width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3"></rect></svg>
    </button>

    <div id="timer" class="timer">00:00</div>
    <progress id="bar" max="${MAX_RECORDING_SECONDS}" value="0"></progress>
    <p id="hint" class="hint" aria-live="polite">Tap the button to start (max ${MAX_RECORDING_SECONDS / 60} minutes)</p>
  </section>

  <section id="view-review" hidden>
    <h1>Happy with it?</h1>
    <p>Listen back, then send it to ${who}.</p>
    <audio id="player" controls></audio>
    <input id="name" type="text" maxlength="80" placeholder="Your name (optional)" autocomplete="name">
    <button id="sendBtn" class="btn primary" type="button">Send voice note</button>
    <button id="retryBtn" class="btn secondary" type="button">Record again</button>
    <p id="sendStatus" class="hint" aria-live="polite"></p>
  </section>

  <section id="view-done" hidden>
    <div class="emoji">&#9989;</div>
    <h1>Sent!</h1>
    <p>Your voice note is on its way to ${who}. Thank you. You can close this page.</p>
  </section>

  <section id="view-error" hidden>
    <div class="emoji">&#9888;&#65039;</div>
    <h1 id="errorTitle">This link isn&rsquo;t available</h1>
    <p id="errorText"></p>
  </section>

  <p class="foot" id="foot">This link works once and expires in about ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}.</p>
</main>
</body>`;

  // NOTE: plain string concatenation only (no template literals) inside this script.
  const script = `
(function () {
  var MAX = ${MAX_RECORDING_SECONDS};
  var token = document.body.getAttribute("data-token");
  var $ = function (id) { return document.getElementById(id); };
  var views = { record: $("view-record"), review: $("view-review"), done: $("view-done"), error: $("view-error") };
  var recBtn = $("recBtn"), timerEl = $("timer"), bar = $("bar"), hint = $("hint");
  var player = $("player"), nameInput = $("name"), sendBtn = $("sendBtn"), retryBtn = $("retryBtn"), sendStatus = $("sendStatus");

  var stream = null, recorder = null, chunks = [], blob = null;
  var seconds = 0, duration = 0, tick = null, objectUrl = null, recording = false;

  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== name); });
    if (name === "done" || name === "error") $("foot").hidden = true;
  }

  function fatal(title, text) {
    $("errorTitle").textContent = title;
    $("errorText").textContent = text;
    show("error");
  }

  function fmt(s) {
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? "0" : "") + m + ":" + (r < 10 ? "0" : "") + r;
  }

  function pickMime() {
    var options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (var i = 0; i < options.length; i++) {
      if (MediaRecorder.isTypeSupported(options[i])) return options[i];
    }
    return "";
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    fatal("Recording isn't supported here", "Please open this link in an up-to-date browser such as Chrome, Safari or Firefox.");
    return;
  }

  function resetRecorderUi() {
    recording = false;
    recBtn.classList.remove("recording");
    recBtn.setAttribute("aria-label", "Start recording");
    seconds = 0;
    timerEl.textContent = "00:00";
    bar.value = 0;
  }

  function startRecording() {
    hint.className = "hint";
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      var mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = onStopped;
      recorder.start();

      recording = true;
      seconds = 0;
      recBtn.classList.add("recording");
      recBtn.setAttribute("aria-label", "Stop recording");
      hint.textContent = "Recording... tap again to stop";

      tick = setInterval(function () {
        seconds += 1;
        timerEl.textContent = fmt(seconds);
        bar.value = seconds;
        if (seconds >= MAX) stopRecording();
      }, 1000);
    }).catch(function () {
      hint.className = "hint error";
      hint.textContent = "Microphone access was blocked. Allow it in your browser settings, then try again.";
    });
  }

  function stopRecording() {
    clearInterval(tick);
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function onStopped() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    duration = seconds;
    var type = (recorder && recorder.mimeType) || "audio/webm";
    blob = new Blob(chunks, { type: type });
    resetRecorderUi();

    if (duration < 1 || blob.size === 0) {
      hint.className = "hint error";
      hint.textContent = "That was too short. Tap the button and try again.";
      return;
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    player.src = objectUrl;
    sendStatus.textContent = "";
    show("review");
  }

  recBtn.addEventListener("click", function () {
    if (recording) stopRecording(); else startRecording();
  });

  retryBtn.addEventListener("click", function () {
    blob = null;
    hint.className = "hint";
    hint.textContent = "Tap the button to start (max " + (MAX / 60) + " minutes)";
    show("record");
  });

  sendBtn.addEventListener("click", function () {
    if (!blob) return;
    sendBtn.disabled = true;
    retryBtn.disabled = true;
    sendStatus.className = "hint";
    sendStatus.textContent = "Sending...";

    var ext = blob.type.indexOf("mp4") !== -1 ? "m4a" : blob.type.indexOf("ogg") !== -1 ? "ogg" : "webm";
    var form = new FormData();
    form.append("audio", blob, "recording." + ext);
    var name = nameInput.value.trim();
    if (name) form.append("senderName", name);
    form.append("durationSeconds", String(duration));

    fetch("/api/v1/public/requests/" + encodeURIComponent(token) + "/submit", { method: "POST", body: form })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) { show("done"); return; }
          if (res.status === 404 || res.status === 410) {
            fatal("This link isn't available", body.message || "It may have expired or already been used.");
            return;
          }
          sendStatus.className = "hint error";
          sendStatus.textContent = body.message || "Something went wrong. Please try again.";
          sendBtn.disabled = false;
          retryBtn.disabled = false;
        });
      })
      .catch(function () {
        sendStatus.className = "hint error";
        sendStatus.textContent = "Network error. Check your connection and try again.";
        sendBtn.disabled = false;
        retryBtn.disabled = false;
      });
  });
})();
`;

  return shell(`Voice note for ${opts.requesterName}`, body, script, opts.nonce);
};