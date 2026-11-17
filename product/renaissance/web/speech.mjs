// Personal-line speech. speak() runs in the caller turn. A timer around
// speechSynthesis.speak leaves the user gesture and Chromium drops the line.

export function speakLine(text, options = {}) {
  const line = String(text || "").trim();
  if (!line) return Promise.resolve({ spoken: "", event: "empty" });
  if (options.engine === "say") return speakWithSay(line, options.outFile);
  return speakWithSynthesis(line, options);
}

function speakWithSynthesis(line, options) {
  const synthesis = options.synthesis ?? globalThis.speechSynthesis;
  const Utterance = options.Utterance || globalThis.SpeechSynthesisUtterance;
  const at = Number(options.at) || 0;
  let timer = 0;
  let cancel = () => {};
  const promise = new Promise((resolve, reject) => {
    if (!synthesis || typeof synthesis.speak !== "function" || typeof Utterance !== "function") {
      reject(new Error("speech synthesis unavailable"));
      return;
    }
    const utterance = new Utterance(line);
    utterance.rate = 0.95;
    let ended = false;
    const finish = (result) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      resolve(result);
    };
    const fail = (error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error || "speech-error")));
    };
    utterance.onstart = () => {
      if (at > 0 && typeof synthesis.pause === "function") synthesis.pause();
    };
    utterance.onend = () => finish({ spoken: line, event: "end" });
    utterance.onerror = (event) => fail(new Error(event?.error || "speech-error"));
    cancel = () => {
      clearTimeout(timer);
      if (typeof synthesis.cancel === "function") synthesis.cancel();
    };
    if (typeof synthesis.cancel === "function") synthesis.cancel();
    synthesis.speak(utterance);
    if (at > 0 && !ended) timer = setTimeout(() => synthesis.resume?.(), at);
  });
  promise.cancel = () => cancel();
  return promise;
}

async function speakWithSay(line, outFile) {
  if (!outFile) throw new Error("say engine needs an output file");
  const { spawn } = await import("node:child_process");
  const code = await new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/say", ["-o", outFile, "--", line]);
    child.on("error", reject);
    child.on("exit", (status) => resolve(status));
  });
  if (code !== 0) throw new Error(`say failed with status ${code}`);
  return { spoken: line, event: "end", file: outFile };
}
