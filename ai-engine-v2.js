(() => {
if (window.S360AI && (window.S360AI.__engineId === "s360-openai-single-v1" || window.S360AI.__engineId === "s360-openai-single-v2")) return;

const STORAGE_CALLS = "s360_calls";
const STORAGE_CONTACTS = "s360_contacts";
const STORAGE_NEXT_STEPS = "s360_next_steps";

const AI_MODE_STORAGE = "s360_ai_mode";
const OPENAI_KEY_STORAGE = "s360_openai_api_key";
const OPENAI_MODEL_STORAGE = "s360_openai_text_model";
const OPENAI_TRANSCRIBE_MODEL_STORAGE = "s360_openai_transcribe_model";

const DEFAULT_MODE = "openai_single";
const DEFAULT_TEXT_MODEL = "gpt-4o-mini";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const CRM_PROMPT = `
Tu es un assistant CRM expert en vente B2B. On te fournit la transcription brute d'un appel commercial.
Retourne UNIQUEMENT un JSON valide:
{
  "prospect": {"name":"","company":"","email":"","phone":"","status":"Prospect","estimatedValue":0,"notes":""},
  "callSummary": {"duration":"N/A","sentiment":"neutre","keyPoints":[],"objections":[],"outcome":""},
  "nextSteps": [{"title":"","description":"","type":"follow-up","dueDate":"YYYY-MM-DD","priority":"medium","estimatedValue":0}],
  "pipelineStage": "Prospection"
}`;

function loadData(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getAiMode() { return localStorage.getItem(AI_MODE_STORAGE) || DEFAULT_MODE; }
function setAiMode(mode) { localStorage.setItem(AI_MODE_STORAGE, DEFAULT_MODE); return DEFAULT_MODE; }

function getAiConfig() {
  return {
    mode: DEFAULT_MODE,
    openAiKey: localStorage.getItem(OPENAI_KEY_STORAGE) || "",
    textModel: localStorage.getItem(OPENAI_MODEL_STORAGE) || DEFAULT_TEXT_MODEL,
    transcribeModel: localStorage.getItem(OPENAI_TRANSCRIBE_MODEL_STORAGE) || DEFAULT_TRANSCRIBE_MODEL
  };
}

function saveAiConfig(cfg = {}) {
  const merged = { ...getAiConfig(), ...cfg };
  localStorage.setItem(OPENAI_KEY_STORAGE, merged.openAiKey || "");
  localStorage.setItem(OPENAI_MODEL_STORAGE, merged.textModel || DEFAULT_TEXT_MODEL);
  localStorage.setItem(OPENAI_TRANSCRIBE_MODEL_STORAGE, merged.transcribeModel || DEFAULT_TRANSCRIBE_MODEL);
  localStorage.setItem(AI_MODE_STORAGE, DEFAULT_MODE);
  return getAiConfig();
}

function getProviderRuntime() {
  const cfg = getAiConfig();
  return {
    mode: DEFAULT_MODE,
    audio: { provider: "openai", model: cfg.transcribeModel },
    text: { provider: "openai", model: cfg.textModel }
  };
}

function getMissingRequirements() {
  const cfg = getAiConfig();
  const missing = [];
  if (!cfg.openAiKey) missing.push("Clé API GPT manquante");
  return missing;
}
function hasRequiredKeys() { return getMissingRequirements().length === 0; }
function getActiveAiSummary() { return "GPT unique (OpenAI transcription + CRM)"; }

function normalizeJsonText(raw) {
  const txt = String(raw || "").trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return "";
  return txt.slice(first, last + 1);
}
function parseJsonWithFallback(raw, fallback) {
  try { return JSON.parse(normalizeJsonText(raw) || ""); }
  catch { return fallback; }
}
function sanitizeArray(arr) { return Array.isArray(arr) ? arr.map(v => String(v || "").trim()).filter(Boolean) : []; }

function normalizeCrmAnalysis(parsed) {
  const fallback = {
    prospect: { name: "", company: "", email: "", phone: "", status: "Prospect", estimatedValue: 0, notes: "" },
    callSummary: { duration: "N/A", sentiment: "neutre", keyPoints: [], objections: [], outcome: "" },
    nextSteps: [],
    pipelineStage: "Prospection"
  };
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    prospect: { ...fallback.prospect, ...(parsed.prospect || {}), estimatedValue: Number(parsed?.prospect?.estimatedValue) || 0 },
    callSummary: {
      ...fallback.callSummary,
      ...(parsed.callSummary || {}),
      keyPoints: sanitizeArray(parsed?.callSummary?.keyPoints),
      objections: sanitizeArray(parsed?.callSummary?.objections)
    },
    nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.map(step => ({
      title: String(step?.title || "Action à préciser"),
      description: String(step?.description || ""),
      type: ["urgent", "follow-up", "opportunity", "risk"].includes(step?.type) ? step.type : "follow-up",
      dueDate: String(step?.dueDate || new Date().toISOString().slice(0, 10)),
      priority: ["high", "medium", "low"].includes(step?.priority) ? step.priority : "medium",
      estimatedValue: Number(step?.estimatedValue) || 0
    })) : [],
    pipelineStage: String(parsed.pipelineStage || fallback.pipelineStage)
  };
}

async function fetchJson(url, options, fallback = "Erreur réseau") {
  let res;
  try { res = await fetch(url, options); }
  catch { throw new Error(fallback); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || body?.error || `${fallback} (${res.status})`);
  return body;
}

async function analyzeWithOpenAIText(apiKey, model, userContent) {
  const body = await fetchJson("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: CRM_PROMPT }, { role: "user", content: userContent }]
    })
  }, "Analyse GPT indisponible");
  return body?.choices?.[0]?.message?.content || "{}";
}

async function transcribeWithOpenAI(apiKey, model, audioBlob) {
  const form = new FormData();
  form.append("file", new File([audioBlob], "call.webm", { type: audioBlob.type || "audio/webm" }));
  form.append("model", model || DEFAULT_TRANSCRIBE_MODEL);
  form.append("response_format", "json");
  const body = await fetchJson("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  }, "Transcription GPT indisponible");
  return {
    transcript: String(body?.text || "").trim(),
    summary: "",
    needs: [],
    objections: [],
    next_steps: []
  };
}

async function analyzeTranscriptRaw(transcriptText, callerId = "") {
  const cfg = getAiConfig();
  const prompt = callerId ? `Interlocuteur connu : ${callerId}\n\n---\n${transcriptText}` : transcriptText;
  const raw = await analyzeWithOpenAIText(cfg.openAiKey, cfg.textModel, prompt);
  return normalizeCrmAnalysis(parseJsonWithFallback(raw, {}));
}

function persistAnalysis(transcriptText, analysis, callerId = "", extra = {}) {
  const callRecord = {
    id: uid(),
    date: new Date().toISOString(),
    transcript: transcriptText,
    analysis,
    callerId,
    source: extra.source || "manual-transcript",
    audioInsights: extra.audioInsights || null
  };
  const calls = loadData(STORAGE_CALLS);
  calls.unshift(callRecord);
  saveData(STORAGE_CALLS, calls);

  const contactId = upsertContact(analysis.prospect, callRecord.id);
  const steps = (analysis.nextSteps || []).map((s) => ({
    ...s,
    id: uid(),
    callId: callRecord.id,
    contactId,
    contactName: analysis.prospect?.name || "Inconnu",
    done: false,
    createdAt: new Date().toISOString()
  }));
  const allSteps = loadData(STORAGE_NEXT_STEPS);
  allSteps.unshift(...steps);
  saveData(STORAGE_NEXT_STEPS, allSteps);
  return { callId: callRecord.id, contactId, analysis, nextSteps: steps };
}

async function analyzeTranscript(transcriptText, callerId = "") {
  if (!transcriptText || transcriptText.trim().length < 20) throw new Error("Le transcript est trop court.");
  const missing = getMissingRequirements();
  if (missing.length) throw new Error(missing.join(" · "));
  const analysis = await analyzeTranscriptRaw(transcriptText, callerId);
  return persistAnalysis(transcriptText, analysis, callerId);
}

async function analyzeCallAudio(audioBlob, callerId = "") {
  if (!audioBlob || !audioBlob.size) throw new Error("Aucun audio valide à analyser.");
  const missing = getMissingRequirements();
  if (missing.length) throw new Error(missing.join(" · "));
  const cfg = getAiConfig();
  const audioAnalysis = await transcribeWithOpenAI(cfg.openAiKey, cfg.transcribeModel, audioBlob);
  if (!audioAnalysis.transcript) throw new Error("Transcription audio vide.");

  const analysis = await analyzeTranscriptRaw(audioAnalysis.transcript, callerId);
  const persisted = persistAnalysis(audioAnalysis.transcript, analysis, callerId, { source: "audio-recording", audioInsights: audioAnalysis });
  return { ...persisted, transcript: audioAnalysis.transcript, audioAnalysis };
}

async function testOpenAIKey(key) {
  if (!key) throw new Error("Clé API GPT manquante");
  await fetchJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }, "Clé GPT invalide");
  return true;
}
async function testGeminiKey(key) { return testOpenAIKey(key); }
async function testAudioProviderKey(provider, key) { return testOpenAIKey(key); }
async function testTextProviderKey(provider, key) { return testOpenAIKey(key); }

function upsertContact(prospectData, callId) {
  if (!prospectData?.name) return null;
  const contacts = loadData(STORAGE_CONTACTS);
  const nameNorm = prospectData.name.toLowerCase().trim();
  const idx = contacts.findIndex(c => c.name.toLowerCase().trim() === nameNorm || (prospectData.email && c.email === prospectData.email));
  const now = new Date().toISOString();
  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...prospectData, lastCallId: callId, lastCallDate: now, callCount: (contacts[idx].callCount || 0) + 1 };
    saveData(STORAGE_CONTACTS, contacts);
    return contacts[idx].id;
  }
  const newContact = { id: uid(), ...prospectData, callCount: 1, lastCallId: callId, lastCallDate: now, createdAt: now, source: "Appel analysé" };
  contacts.unshift(newContact);
  saveData(STORAGE_CONTACTS, contacts);
  return newContact.id;
}

function markStepDone(stepId) {
  const steps = loadData(STORAGE_NEXT_STEPS);
  const idx = steps.findIndex(s => s.id === stepId);
  if (idx >= 0) {
    steps[idx].done = true;
    steps[idx].doneAt = new Date().toISOString();
    saveData(STORAGE_NEXT_STEPS, steps);
    return true;
  }
  return false;
}
function deleteStep(stepId) { saveData(STORAGE_NEXT_STEPS, loadData(STORAGE_NEXT_STEPS).filter(s => s.id !== stepId)); }
function deleteContact(contactId) { saveData(STORAGE_CONTACTS, loadData(STORAGE_CONTACTS).filter(c => c.id !== contactId)); }
function getStats() {
  const calls = loadData(STORAGE_CALLS), contacts = loadData(STORAGE_CONTACTS), steps = loadData(STORAGE_NEXT_STEPS);
  const pending = steps.filter(s => !s.done);
  return {
    totalCalls: calls.length,
    totalContacts: contacts.length,
    pendingSteps: pending.length,
    urgentSteps: pending.filter(s => s.type === "urgent").length,
    followUpSteps: pending.filter(s => s.type === "follow-up").length,
    opportunities: pending.filter(s => s.type === "opportunity").length
  };
}

window.S360AI = {
  __engineId: "s360-openai-single-v2",
  provider: "openai",
  version: "2026-04-17-openai-single-v2",
  STORAGE_CALLS, STORAGE_CONTACTS, STORAGE_NEXT_STEPS,
  loadData, saveData,
  getAiMode, setAiMode, getAiConfig, saveAiConfig,
  getProviderRuntime, getMissingRequirements, hasRequiredKeys, getActiveAiSummary,
  testOpenAIKey, testGeminiKey, testAudioProviderKey, testTextProviderKey,
  analyzeTranscript, analyzeCallAudio,
  upsertContact, markStepDone, deleteStep, deleteContact, getStats
};
})();
