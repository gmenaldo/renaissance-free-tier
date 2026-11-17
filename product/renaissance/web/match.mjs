// Deterministic catalog matcher. No network, no model, no invented hertz.
export const GENERATOR = "deterministic-no-llm";

const ALIASES = [
  ["gallbladder", "gall bladder"],
  ["breathing", "lungs"],
  ["breath", "lungs"],
  ["queasy", "stomach"],
  ["nausea", "stomach"],
  ["kidneys", "kidney"],
  ["adrenal", "adrenals"],
  ["lung", "lungs"],
];

// Shared labels in the file. They are not symptom triggers.
export const GENERIC_BODY = new Set([
  "sky", "mineral", "tone", "color", "unspecified", "earth-ionosphere", "meridian", "voice", "brain",
]);

const WORK = /\b(job|jobs|work|career|workplace)\b/;

export function normalize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasPhrase(haystack, phrase) {
  return new RegExp(`(?:^| )${escapeRegExp(phrase)}(?:$| )`).test(` ${haystack} `);
}

function applyAliases(text) {
  let out = ` ${normalize(text)} `;
  for (const [from, to] of [...ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replaceAll(` ${from} `, ` ${to} `);
  }
  return out.trim();
}

export function grade(row) {
  if (row.hertz == null) return "No hertz";
  if (row.category === "schumann") return "Geophysics";
  if (row.category === "ohm" || row.category === "cosmic-octave") return "Tuning";
  if (row.category === "binaural") return "Review bound";
  if (row.category === "solfeggio" || row.category === "page-claim") return "Convention";
  return "Chart";
}

export function notesFor(row) {
  const notes = [];
  if (row.hertz === 528 && row.category === "solfeggio") {
    notes.push("528 Hz is an ordinary C. A DNA-repair claim is not established.");
  }
  if (grade(row) === "Chart") {
    notes.push("This number was printed at the source. It is not a healing frequency.");
  }
  if (row.category === "meridian") notes.push("Meridian name only. No hertz is printed, so nothing is played.");
  if (row.category === "binaural") notes.push("This is the 30 Hz evidence-limit upper bound, not a tone.");
  if (row.category === "color" || row.category === "mineral" || row.category === "planet") {
    notes.push("Optional chart color or texture. Not a claim that anyone needs this row.");
  }
  return notes;
}

export function cite(row) {
  return {
    category: row.category,
    organ: row.organ,
    body_part: row.body_part,
    hertz: row.hertz,
    grade: grade(row),
    notes: notesFor(row),
  };
}

function requireRows(db) {
  const ohm = db.entries.find((row) => row.category === "ohm" && row.organ === "ohm" && row.hertz === 136.1);
  const schumann = db.entries.find((row) => row.organ === "Schumann fundamental" && row.hertz === 7.83);
  const schumann2 = db.entries.find((row) => row.organ === "Schumann harmonic 2" && row.hertz === 14.3);
  if (!ohm || !schumann || !schumann2) throw new Error("Required catalog rows are missing. No frequency will be invented.");
  return { ohm, schumann, schumann2 };
}

function formatHz(value) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function audible(row) {
  return typeof row.hertz === "number" && row.hertz >= 80 && row.category !== "binaural" && row.category !== "meridian";
}

function legalDifference(row) {
  return typeof row.hertz === "number"
    && row.hertz >= 1
    && row.hertz <= 30
    && row.category !== "binaural";
}

function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = `${row.category}|${row.organ}|${row.body_part}|${row.hertz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function bed(db, carriers, differenceRow, disclosures, named) {
  const { ohm } = requireRows(db);
  const primary = carriers[0] || ohm;
  const difference = differenceRow.hertz;
  return {
    generator: GENERATOR,
    leftHz: primary.hertz,
    rightHz: Math.round((primary.hertz + difference) * 100) / 100,
    differenceHz: difference,
    carriers: carriers.map(cite),
    difference: cite(differenceRow),
    named: named.map(cite),
    disclosures,
    earLine: `Left ear ${formatHz(primary.hertz)} Hz. Right ear ${formatHz(primary.hertz + difference)} Hz. Headphones keep the difference. Speakers weaken it.`,
  };
}

function fallback(db, disclosures, named) {
  const { ohm, schumann } = requireRows(db);
  disclosures.push("No verified symptom-specific hertz was found. The note uses the Cousto ohm tuning 136.1 Hz and the Schumann fundamental 7.83 Hz as the ear-to-ear difference.");
  return bed(db, [ohm], schumann, disclosures, dedupe([ohm, schumann, ...named]));
}

function workBed(db, disclosures) {
  const { ohm, schumann2 } = requireRows(db);
  disclosures.push("Job or work language does not have a catalog frequency. This station uses the Cousto ohm tuning 136.1 Hz and Schumann harmonic 2 at 14.3 Hz.");
  return bed(db, [ohm], schumann2, disclosures, [ohm, schumann2]);
}

function fromHits(db, hits) {
  const disclosures = [];
  const named = dedupe(hits);
  const audibleRows = [];
  const seenHz = new Set();
  for (const row of named) {
    if (!audible(row) || seenHz.has(row.hertz)) continue;
    seenHz.add(row.hertz);
    audibleRows.push(row);
  }
  if (audibleRows.length) {
    const carriers = audibleRows.slice(0, 2);
    if (audibleRows.length > 2) {
      disclosures.push("More than two audible catalog rows matched. Stable file order keeps two. The card names the rest.");
    }
    const distinctByOrgan = new Map();
    for (const row of named) {
      if (typeof row.hertz !== "number") continue;
      const list = distinctByOrgan.get(row.organ) || new Set();
      list.add(row.hertz);
      distinctByOrgan.set(row.organ, list);
    }
    for (const [organ, values] of distinctByOrgan) {
      if (values.size > 1) disclosures.push(`${organ} has conflicting printed values: ${[...values].join(" and ")}. They are not averaged.`);
    }
    for (const row of named) {
      if (row.hertz == null || audible(row) || carriers.includes(row)) continue;
      if (!legalDifference(row)) {
        disclosures.push(`${row.organ} at ${row.hertz} Hz is under 80 Hz and outside the 1–30 Hz difference limit, so it is named and not played.`);
      } else {
        disclosures.push(`${row.organ} at ${row.hertz} Hz stays on the card. The ear-to-ear difference stays the Schumann fundamental because an audible carrier matched.`);
      }
    }
    const { schumann } = requireRows(db);
    return bed(db, carriers, schumann, disclosures, dedupe([...carriers, schumann, ...named]));
  }

  const differences = named.filter(legalDifference);
  if (differences.length) {
    const chosen = differences[0];
    if (differences.length > 1) {
      disclosures.push(`Several sub-audible values matched. The ear-to-ear difference uses ${chosen.organ} at ${chosen.hertz} Hz. The others stay on the card.`);
    }
    disclosures.push(`${chosen.organ} at ${chosen.hertz} Hz is under 80 Hz, so it is the ear-to-ear difference on the Cousto 136.1 Hz tuning, not a loud tone.`);
    const { ohm } = requireRows(db);
    return bed(db, [ohm], chosen, disclosures, dedupe([ohm, ...named]));
  }

  if (named.some((row) => row.category === "meridian")) {
    disclosures.push("Meridian names have no verified acoustic hertz. No organ tone is assigned to a meridian.");
  }
  if (named.some((row) => row.category === "binaural")) {
    disclosures.push("The binaural percept limit is an upper bound, not a tone.");
  }
  for (const row of named) {
    if (typeof row.hertz === "number" && !legalDifference(row) && !audible(row)) {
      disclosures.push(`${row.organ} at ${row.hertz} Hz is printed and is not played. It is outside the audible carrier rule and outside the 1–30 Hz difference rule.`);
    }
  }
  return fallback(db, disclosures, named);
}

export function matchText(db, text, mode = "telegram") {
  const raw = normalize(text);
  if (/\bmeridian\b/.test(raw)) {
    const hits = db.entries.filter((row) => row.category === "meridian" && hasPhrase(raw, normalize(row.organ)));
    return fromHits(db, hits);
  }
  const haystack = applyAliases(raw);
  const hits = [];
  for (const row of db.entries) {
    const organ = normalize(row.organ);
    const body = normalize(row.body_part);
    const organHit = organ && hasPhrase(haystack, organ);
    const bodyHit = body && body !== organ && !GENERIC_BODY.has(body) && hasPhrase(haystack, body);
    if (organHit || bodyHit) hits.push(row);
  }
  if (!hits.length && mode === "manifest" && WORK.test(haystack)) return workBed(db, []);
  return fromHits(db, hits);
}

export function listenControl(row) {
  if (typeof row.hertz !== "number") {
    return { label: "No hertz is printed", playable: false, hertz: null };
  }
  return { label: "Listen", playable: true, hertz: row.hertz };
}

export function refusedListen(row) {
  const cited = cite(row);
  return {
    generator: GENERATOR,
    playable: false,
    leftHz: null,
    rightHz: null,
    differenceHz: null,
    carriers: [],
    difference: null,
    named: [cited],
    disclosures: ["No hertz is printed for this row. No organ tone is assigned and no frequency is invented."],
    earLine: "No hertz is printed. Nothing is played.",
  };
}

export function matchRow(db, row) {
  if (row.category === "meridian" || row.hertz == null) {
    return fromHits(db, [row]);
  }
  if (audible(row)) {
    const { schumann } = requireRows(db);
    const siblings = db.entries.filter((other) => other !== row && other.organ === row.organ && other.hertz !== row.hertz);
    const disclosures = [];
    if (siblings.length) {
      disclosures.push(`${row.organ} also prints ${siblings.map((item) => item.hertz ?? "no hertz").join(" and ")}. This listen uses the row you chose. Values are not averaged.`);
    }
    return bed(db, [row], schumann, disclosures, dedupe([row, schumann, ...siblings]));
  }
  if (legalDifference(row)) {
    const { ohm } = requireRows(db);
    return bed(
      db,
      [ohm],
      row,
      [`${row.organ} at ${row.hertz} Hz is the ear-to-ear difference on the Cousto 136.1 Hz tuning.`],
      [ohm, row],
    );
  }
  return fromHits(db, [row]);
}

export function matchKeys(db) {
  const keys = new Map();
  function add(key, row) {
    const name = normalize(key);
    if (!name) return;
    if (!keys.has(name)) keys.set(name, []);
    keys.get(name).push(row);
  }
  for (const row of db.entries) {
    add(row.organ, row);
    if (row.body_part && !GENERIC_BODY.has(normalize(row.body_part))) add(row.body_part, row);
  }
  for (const [from] of ALIASES) add(from, { alias: true });
  return [...keys.keys()].sort();
}
