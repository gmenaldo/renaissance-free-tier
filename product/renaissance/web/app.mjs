import { GENERATOR, cite, grade, listenControl, matchRow, matchText, notesFor, refusedListen } from "./match.mjs";
import { speakLine } from "./speech.mjs";

const view = document.querySelector("#view");
const nav = document.querySelector("nav");
let audio = null;
let catalog = null;

const NOTICE = "A printed hertz is a source value, not a medical effect. This is not a medical device and not PEMF.";

function hertzText(row) {
  return row.hertz == null ? "—" : `${row.hertz} Hz`;
}

function stopAudio() {
  if (!audio) return;
  audio.stopped = true;
  audio.speech?.cancel?.();
  window.speechSynthesis?.cancel();
  for (const node of audio.nodes) node.stop?.();
  audio.context.close();
  clearInterval(audio.timer);
  audio = null;
}

function startBed(plan, speech) {
  stopAudio();
  const context = new AudioContext();
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.08, now + 3);
  master.gain.setValueAtTime(0.08, now + 114);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 120);
  master.connect(context.destination);
  const nodes = [];
  plan.carriers.forEach((row, index) => {
    const merger = context.createChannelMerger(2);
    const left = context.createOscillator();
    const right = context.createOscillator();
    const gain = context.createGain();
    left.frequency.value = index === 0 ? plan.leftHz : row.hertz;
    right.frequency.value = index === 0 ? plan.rightHz : row.hertz;
    gain.gain.value = index === 0 ? 1 : 0.5;
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(gain);
    gain.connect(master);
    left.start(now);
    right.start(now);
    left.stop(now + 120);
    right.stop(now + 120);
    nodes.push(left, right);
  });
  const state = { context, nodes, stopped: false, timer: null, speech: null };
  audio = state;
  if (speech.text) {
    state.speech = speakLine(speech.text, { at: speech.at || 0 });
    state.speech.catch(() => {
      const note = document.querySelector(".card");
      if (!note || state.stopped || note.querySelector("[data-speech]")) return;
      const p = document.createElement("p");
      p.className = "note";
      p.dataset.speech = "failed";
      p.textContent = "This browser did not speak the personal line. The words stay on the card.";
      note.append(p);
    });
  }
  return state;
}

function card(plan, speech, phaseLabel) {
  const wrap = document.createElement("section");
  wrap.className = "card";
  const rows = plan.named.map((row) => `${row.category} · ${row.organ} · ${hertzText(row)} · ${row.grade}`).join("<br>");
  wrap.innerHTML = `<h2>The note</h2>
    <p>${plan.earLine}</p>
    <p class="phase" data-phase>${phaseLabel || "Calibrate · 0–25s"}</p>
    <p>${rows}</p>
    <p class="note">${plan.disclosures.join(" ")}</p>
    <p class="note">${plan.named.flatMap((row) => row.notes).join(" ")}</p>
    <p class="note">${NOTICE} Start at a low volume. Generator: ${GENERATOR}.</p>
    <p><button type="button" class="stop">Stop</button> <button type="button" class="copy">Copy link</button></p>`;
  wrap.querySelector(".stop").addEventListener("click", stopAudio);
  wrap.querySelector(".copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
  });
  const phase = wrap.querySelector("[data-phase]");
  const started = performance.now();
  const timer = window.setInterval(() => {
    const elapsed = (performance.now() - started) / 1000;
    if (phaseLabel) phase.textContent = elapsed < 120 ? phaseLabel : "Finished";
    else phase.textContent = elapsed < 25 ? "Calibrate · 0–25s" : elapsed < 100 ? "Train · 25–100s" : elapsed < 120 ? "Compound · 100–120s" : "Finished";
    if (elapsed >= 120) {
      clearInterval(timer);
      stopAudio();
    }
  }, 500);
  if (audio) audio.timer = timer;
  if (speech.text) {
    const line = document.createElement("p");
    line.textContent = speech.label + speech.text;
    wrap.prepend(line);
  }
  return wrap;
}

function writeUrl(pillar, fields) {
  const params = new URLSearchParams({ pillar, ...fields });
  history.replaceState(null, "", `?${params.toString()}`);
}

function renderLibrary() {
  const q = document.createElement("input");
  q.className = "search";
  q.type = "search";
  q.placeholder = "Search the catalog";
  q.setAttribute("aria-label", "Search the catalog");
  const list = document.createElement("div");
  function draw() {
    const needle = q.value.trim().toLowerCase();
    list.replaceChildren();
    for (const row of catalog.entries) {
      const blob = `${row.category} ${row.organ} ${row.body_part} ${row.hertz ?? ""} ${grade(row)}`.toLowerCase();
      if (needle && !blob.includes(needle)) continue;
      const item = document.createElement("article");
      item.className = "row";
      const cited = cite(row);
      item.innerHTML = `<strong>${cited.organ}</strong><span class="grade">${cited.grade} · ${hertzText(cited)} · ${cited.category}</span>`;
      for (const note of notesFor(row)) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = note;
        item.append(p);
      }
      const control = listenControl(row);
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "action";
      listen.textContent = control.label;
      listen.addEventListener("click", () => {
        view.querySelector(".card")?.remove();
        if (!control.playable) {
          stopAudio();
          view.append(card(refusedListen(row), { text: "", at: 0, label: "" }, "No hertz is printed"));
          return;
        }
        const plan = matchRow(catalog, row);
        startBed(plan, { text: "", at: 0 });
        view.append(card(plan, { text: "", at: 0, label: "" }, "Catalog listen"));
      });
      item.append(listen);
      list.append(item);
    }
  }
  q.addEventListener("input", draw);
  view.replaceChildren(q, list);
  draw();
}

function renderTelegram(fields = {}) {
  const form = document.createElement("form");
  form.innerHTML = `<h2>Telegram</h2>
    <p>One button builds a two-minute note from catalog hertz only.</p>
    <label>Symptoms or body area<input name="symptom" maxlength="120" required value="${escapeAttr(fields.symptom || "")}"></label>
    <label>A personal line<textarea name="line" maxlength="200">${escapeText(fields.line || "")}</textarea></label>
    <label>From, optional<input name="from" maxlength="40" value="${escapeAttr(fields.from || "")}"></label>
    <button class="action" type="submit">Play the note</button>`;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const symptom = String(data.get("symptom") || "");
    const line = String(data.get("line") || "").trim();
    const from = String(data.get("from") || "").trim();
    const plan = matchText(catalog, symptom, "telegram");
    writeUrl("telegram", { symptom, line, from });
    const speechText = [from ? `From ${from}.` : "", line].filter(Boolean).join(" ");
    view.querySelector(".card")?.remove();
    startBed(plan, { text: speechText, at: 0 });
    view.append(card(plan, { text: speechText, at: 0, label: "" }, "Playing the note"));
  });
  view.replaceChildren(form);
}

function renderManifest(fields = {}) {
  const form = document.createElement("form");
  form.innerHTML = `<h2>Manifest station</h2>
    <p>One desire. Calibrate, then one spoken pass, then the close. No settings.</p>
    <label>One desire<input name="desire" maxlength="200" required value="${escapeAttr(fields.desire || "")}"></label>
    <button class="action" type="submit">Play the station</button>`;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const desire = String(new FormData(form).get("desire") || "").trim();
    const plan = matchText(catalog, desire, "manifest");
    writeUrl("manifest", { desire });
    view.querySelector(".card")?.remove();
    startBed(plan, { text: desire, at: 25000 });
    view.append(card(plan, { text: desire, at: 25000, label: "Spoken once at the train mark: " }));
  });
  view.replaceChildren(form);
}

function escapeAttr(value) {
  return escapeText(value).replaceAll('"', "&quot;");
}
function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const screens = { library: renderLibrary, telegram: renderTelegram, manifest: renderManifest };

function show(pillar, fields) {
  stopAudio();
  for (const button of nav.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.pillar === pillar));
  }
  (screens[pillar] || renderLibrary)(fields);
}

nav.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  history.replaceState(null, "", `?pillar=${button.dataset.pillar}`);
  show(button.dataset.pillar);
});

const response = await fetch(new URL("../../../FREQUENCY_DATABASE.json", import.meta.url));
catalog = await response.json();
const params = new URLSearchParams(location.search);
const pillar = params.get("pillar") || "library";
show(screens[pillar] ? pillar : "library", {
  symptom: params.get("symptom") || "",
  line: params.get("line") || "",
  from: params.get("from") || "",
  desire: params.get("desire") || "",
});
