(() => {
if (window.S360AI && window.S360AI.__engineId === "s360-openai-single-v1") return;

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

// ============================================================
// Sales360 — AI Engine (frontend-only, provider-agnostic)
// ============================================================
if (window.S360AI && window.S360AI.__engineId === "s360-multi-provider-v1") {
  return;
}

const AI_MODE_STORAGE = "s360_ai_mode";
const AI_MODE_GEMINI = "gemini_all_in_one";
const AI_MODE_SPLIT = "split_apis";

const S360_GEMINI_KEY = "s360_gemini_key";
const S360_GEMINI_TEXT_MODEL = "s360_gemini_text_model";
const S360_GEMINI_AUDIO_MODEL = "s360_gemini_audio_model";


const AI_MODE_STORAGE = "s360_ai_mode";
const AI_MODE_GEMINI = "gemini_all_in_one";
const AI_MODE_SPLIT = "split_apis";

const S360_GEMINI_KEY = "s360_gemini_key";
const S360_GEMINI_TEXT_MODEL = "s360_gemini_text_model";
const S360_GEMINI_AUDIO_MODEL = "s360_gemini_audio_model";

const S360_AUDIO_PROVIDER = "s360_audio_provider";
const S360_AUDIO_API_KEY = "s360_audio_api_key";
const S360_TEXT_PROVIDER = "s360_text_provider";
const S360_TEXT_API_KEY = "s360_text_api_key";
const S360_TEXT_MODEL = "s360_text_model";

// Sales360 — AI Engine (frontend)
// Les appels Gemini passent uniquement par le backend (/api/*)
// ============================================================

const AI_PROVIDER = "gemini";
const AI_ENGINE_VERSION = "2026-03-27-backend";
const S360_API_BASE_STORAGE_KEY = "s360_api_base_url";

// ── Storage keys ─────────────────────────────────────────────
const STORAGE_CALLS = "s360_calls";
const STORAGE_CONTACTS = "s360_contacts";
const STORAGE_NEXT_STEPS = "s360_next_steps";

const DEFAULTS = {
  mode: AI_MODE_GEMINI,
  geminiTextModel: "gemini-2.0-flash",
  geminiAudioModel: "gemini-2.0-flash",
  audioProvider: "openai",
  textProvider: "openai",
  textModel: "gpt-4o-mini"
};

const CRM_PROMPT = `
Tu es un assistant CRM expert en vente B2B. On te fournit la transcription brute d'un appel commercial.

Analyse-la et retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :
{
  "prospect": {
    "name": "Prénom Nom du prospect",
    "company": "Nom de l'entreprise",
    "email": "email si mentionné, sinon ''",
    "phone": "téléphone si mentionné, sinon ''",
    "status": "Prospect" | "Intéressé" | "Chaud" | "Client",
    "estimatedValue": nombre entier en euros (0 si non mentionné),
    "notes": "2-3 phrases"
  },
  "callSummary": {
    "duration": "durée estimée ou N/A",
    "sentiment": "positif" | "neutre" | "négatif",
    "keyPoints": ["point 1", "point 2"],
    "objections": [],
    "outcome": "résultat en 1 phrase"
  },
  "nextSteps": [
    {
      "title": "Titre",
      "description": "Description",
      "type": "urgent" | "follow-up" | "opportunity" | "risk",
      "dueDate": "YYYY-MM-DD",
      "priority": "high" | "medium" | "low",
      "estimatedValue": nombre entier en euros
    }
  ],
  "pipelineStage": "Prospection" | "Qualification" | "Proposition" | "Négociation" | "Conclue"
}
`;

const AUDIO_PROMPT = `Analyse cet appel commercial.
1. Transcris l’appel de manière fidèle
2. Résume les points clés
3. Identifie les besoins du prospect
4. Identifie les objections éventuelles
5. Donne les prochaines étapes concrètes
Retourne uniquement un JSON valide:
{ "transcript":"", "summary":"", "needs":[], "objections":[], "next_steps":[] }`;

function loadData(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getAiMode() {
  return localStorage.getItem(AI_MODE_STORAGE) || DEFAULTS.mode;
}
function setAiMode(mode) {
  const next = [AI_MODE_GEMINI, AI_MODE_SPLIT].includes(mode) ? mode : DEFAULTS.mode;
  localStorage.setItem(AI_MODE_STORAGE, next);
  return next;
}

function getAiConfig() {
  return {
    mode: getAiMode(),
    geminiKey: localStorage.getItem(S360_GEMINI_KEY) || "",
    geminiTextModel: localStorage.getItem(S360_GEMINI_TEXT_MODEL) || DEFAULTS.geminiTextModel,
    geminiAudioModel: localStorage.getItem(S360_GEMINI_AUDIO_MODEL) || DEFAULTS.geminiAudioModel,
    audioProvider: localStorage.getItem(S360_AUDIO_PROVIDER) || DEFAULTS.audioProvider,
    audioApiKey: localStorage.getItem(S360_AUDIO_API_KEY) || "",
    textProvider: localStorage.getItem(S360_TEXT_PROVIDER) || DEFAULTS.textProvider,
    textApiKey: localStorage.getItem(S360_TEXT_API_KEY) || "",
    textModel: localStorage.getItem(S360_TEXT_MODEL) || DEFAULTS.textModel
  };
}

function saveAiConfig(config = {}) {
  const merged = { ...getAiConfig(), ...config };
  setAiMode(merged.mode);
  localStorage.setItem(S360_GEMINI_KEY, merged.geminiKey || "");
  localStorage.setItem(S360_GEMINI_TEXT_MODEL, merged.geminiTextModel || DEFAULTS.geminiTextModel);
  localStorage.setItem(S360_GEMINI_AUDIO_MODEL, merged.geminiAudioModel || DEFAULTS.geminiAudioModel);
  localStorage.setItem(S360_AUDIO_PROVIDER, merged.audioProvider || DEFAULTS.audioProvider);
  localStorage.setItem(S360_AUDIO_API_KEY, merged.audioApiKey || "");
  localStorage.setItem(S360_TEXT_PROVIDER, merged.textProvider || DEFAULTS.textProvider);
  localStorage.setItem(S360_TEXT_API_KEY, merged.textApiKey || "");
  localStorage.setItem(S360_TEXT_MODEL, merged.textModel || DEFAULTS.textModel);
  return getAiConfig();
}

function getProviderRuntime() {
  const cfg = getAiConfig();
  if (cfg.mode === AI_MODE_GEMINI) {
    return {
      mode: AI_MODE_GEMINI,
      audio: { provider: "gemini", model: cfg.geminiAudioModel },
      text: { provider: "gemini", model: cfg.geminiTextModel }
    };
  }
  return {
    mode: AI_MODE_SPLIT,
    audio: { provider: cfg.audioProvider },
    text: { provider: cfg.textProvider, model: cfg.textModel }
  };
}

function getMissingRequirements() {
  const cfg = getAiConfig();
  const missing = [];
  if (cfg.mode === AI_MODE_GEMINI) {
    if (!cfg.geminiKey) missing.push("Clé API Gemini manquante");
    return missing;
  }
  if (!cfg.audioApiKey) missing.push(`Clé API transcription (${cfg.audioProvider}) manquante`);
  if (!cfg.textApiKey) missing.push(`Clé API analyse texte (${cfg.textProvider}) manquante`);
  return missing;
}
function hasRequiredKeys() { return getMissingRequirements().length === 0; }

function getActiveAiSummary() {
  const cfg = getAiConfig();
  if (cfg.mode === AI_MODE_GEMINI) return "Gemini tout-en-un";
  const audioLabel = cfg.audioProvider === "deepgram" ? "Deepgram" : "OpenAI Transcribe";
  const textLabel = "OpenAI CRM";
  return `APIs séparées : ${audioLabel} + ${textLabel}`;
}

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

function sanitizeArray(arr) {
  return Array.isArray(arr) ? arr.map(v => String(v || "").trim()).filter(Boolean) : [];
}

function normalizeCrmAnalysis(parsed) {
  const fallback = {
    prospect: { name: "", company: "", email: "", phone: "", status: "Prospect", estimatedValue: 0, notes: "" },
    callSummary: { duration: "N/A", sentiment: "neutre", keyPoints: [], objections: [], outcome: "" },
    nextSteps: [],
    pipelineStage: "Prospection"
  };
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    prospect: {
      ...fallback.prospect,
      ...(parsed.prospect || {}),
      estimatedValue: Number(parsed?.prospect?.estimatedValue) || 0
    },
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

function normalizeAudioInsights(parsed) {
  return {
    transcript: String(parsed?.transcript || "").trim(),
    summary: String(parsed?.summary || "").trim(),
    needs: sanitizeArray(parsed?.needs),
    objections: sanitizeArray(parsed?.objections),
    next_steps: sanitizeArray(parsed?.next_steps)
  };
}

async function fetchJson(url, options, fallbackMessage = "Erreur réseau") {
  let res;
  try { res = await fetch(url, options); }
  catch { throw new Error(fallbackMessage); }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || body?.error || `${fallbackMessage} (${res.status})`);
  return body;
}

async function callGeminiText(geminiKey, model, systemPrompt, userContent) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      contents: [{ role: "user", parts: [{ text: userContent }] }]
    })
  }, "Gemini indisponible");

  return body?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === "string")?.text || "{}";
}

async function transcribeWithGemini(geminiKey, model, audioBlob) {
  const base64Data = await blobToBase64(audioBlob);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      contents: [{
        role: "user",
        parts: [
          { text: AUDIO_PROMPT },
          { inlineData: { mimeType: audioBlob.type || "audio/webm", data: base64Data } }
        ]
      }]
    })
  }, "Gemini audio indisponible");
  const raw = body?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === "string")?.text || "{}";
  return normalizeAudioInsights(parseJsonWithFallback(raw, {}));
}

async function transcribeWithOpenAI(apiKey, audioBlob) {
  const form = new FormData();
  form.append("file", new File([audioBlob], "call.webm", { type: audioBlob.type || "audio/webm" }));
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const body = await fetchJson("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  }, "Transcription GPT indisponible");
  }, "Transcription OpenAI indisponible");

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


async function transcribeWithDeepgram(apiKey, audioBlob) {
  const body = await fetchJson("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": audioBlob.type || "audio/webm"
    },
    body: audioBlob
  }, "Transcription Deepgram indisponible");

  const transcript = body?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  return { transcript: String(transcript).trim(), summary: "", needs: [], objections: [], next_steps: [] };
}

async function analyzeWithOpenAIText(apiKey, model, transcript) {
  const body = await fetchJson("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CRM_PROMPT },
        { role: "user", content: transcript }
      ]
    })
  }, "Analyse CRM OpenAI indisponible");

  return body?.choices?.[0]?.message?.content || "{}";
}

async function analyzeTranscriptRaw(transcriptText, callerId = "") {
  const cfg = getAiConfig();
  const userPrompt = callerId ? `Interlocuteur connu : ${callerId}\n\n---\n${transcriptText}` : transcriptText;

  if (cfg.mode === AI_MODE_GEMINI) {
    const raw = await callGeminiText(cfg.geminiKey, cfg.geminiTextModel, CRM_PROMPT, userPrompt);
    return normalizeCrmAnalysis(parseJsonWithFallback(raw, null));
  }

  if (cfg.textProvider === "openai") {
    const raw = await analyzeWithOpenAIText(cfg.textApiKey, cfg.textModel, userPrompt);
    return normalizeCrmAnalysis(parseJsonWithFallback(raw, null));
  }

  throw new Error(`Provider texte non supporté: ${cfg.textProvider}`);
}

async function transcribeAudioRaw(audioBlob) {
  const cfg = getAiConfig();
  if (cfg.mode === AI_MODE_GEMINI) {
    return transcribeWithGemini(cfg.geminiKey, cfg.geminiAudioModel, audioBlob);
  }
  if (cfg.audioProvider === "openai") return transcribeWithOpenAI(cfg.audioApiKey, audioBlob);
  if (cfg.audioProvider === "deepgram") return transcribeWithDeepgram(cfg.audioApiKey, audioBlob);
  throw new Error(`Provider audio non supporté: ${cfg.audioProvider}`);
}

// ── Helpers storage ──────────────────────────────────────────
function loadData(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function parseError(res, fallbackMessage) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    // no-op
  }
  return body?.error || fallbackMessage;
}

function getApiBaseUrl() {
  const fromWindow = typeof window !== "undefined" ? (window.S360_API_BASE_URL || "") : "";
  const fromStorage = typeof localStorage !== "undefined" ? (localStorage.getItem(S360_API_BASE_STORAGE_KEY) || "") : "";
  const value = (fromWindow || fromStorage || "").trim();
  return value.replace(/\/$/, "");
}

function apiUrl(path) {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

function setApiBaseUrl(url = "") {
  const clean = String(url || "").trim().replace(/\/$/, "");
  if (typeof window !== "undefined") window.S360_API_BASE_URL = clean;
  if (typeof localStorage !== "undefined") localStorage.setItem(S360_API_BASE_STORAGE_KEY, clean);
  return clean;
}

// ── Appel backend pour analyse transcript ────────────────────
async function callTranscriptAnalysis(transcriptText, callerId = "") {
  let res;
  try {
    res = await fetch(apiUrl("/api/analyze-transcript"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText, callerId })
    });
  } catch (err) {
    throw new Error(
      `Backend API inaccessible (${apiUrl("/api/analyze-transcript")}). Configurez S360_API_BASE_URL.`
    );
  }

  if (!res.ok) {
    throw new Error(await parseError(res, `Erreur API (${res.status})`));
  }

  const data = await res.json();
  if (!data?.analysis) {
    throw new Error("Réponse backend invalide: analyse absente.");
  }
  if (!cfg.audioApiKey) missing.push(`Clé API transcription (${cfg.audioProvider}) manquante`);
  if (!cfg.textApiKey) missing.push(`Clé API analyse texte (${cfg.textProvider}) manquante`);
  return missing;
}
function hasRequiredKeys() { return getMissingRequirements().length === 0; }

function getActiveAiSummary() {
  const cfg = getAiConfig();
  if (cfg.mode === AI_MODE_GEMINI) return "Gemini tout-en-un";
  const audioLabel = cfg.audioProvider === "deepgram" ? "Deepgram" : "OpenAI Transcribe";
  const textLabel = "OpenAI CRM";
  return `APIs séparées : ${audioLabel} + ${textLabel}`;
}

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

function sanitizeArray(arr) {
  return Array.isArray(arr) ? arr.map(v => String(v || "").trim()).filter(Boolean) : [];
}

function normalizeCrmAnalysis(parsed) {
  const fallback = {
    prospect: { name: "", company: "", email: "", phone: "", status: "Prospect", estimatedValue: 0, notes: "" },
    callSummary: { duration: "N/A", sentiment: "neutre", keyPoints: [], objections: [], outcome: "" },
    nextSteps: [],
    pipelineStage: "Prospection"
  };
  if (!parsed || typeof parsed !== "object") return fallback;
  return {
    prospect: {
      ...fallback.prospect,
      ...(parsed.prospect || {}),
      estimatedValue: Number(parsed?.prospect?.estimatedValue) || 0
    },
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

function normalizeAudioInsights(parsed) {
  return {
    transcript: String(parsed?.transcript || "").trim(),
    summary: String(parsed?.summary || "").trim(),
    needs: sanitizeArray(parsed?.needs),
    objections: sanitizeArray(parsed?.objections),
    next_steps: sanitizeArray(parsed?.next_steps)
  };
}

async function fetchJson(url, options, fallbackMessage = "Erreur réseau") {
  let res;
  try { res = await fetch(url, options); }
  catch { throw new Error(fallbackMessage); }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || body?.error || `${fallbackMessage} (${res.status})`);
  return body;
}

async function callGeminiText(geminiKey, model, systemPrompt, userContent) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
      contents: [{ role: "user", parts: [{ text: userContent }] }]
    })
  }, "Gemini indisponible");

  return body?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === "string")?.text || "{}";
}

async function transcribeWithGemini(geminiKey, model, audioBlob) {
  const base64Data = await blobToBase64(audioBlob);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      contents: [{
        role: "user",
        parts: [
          { text: AUDIO_PROMPT },
          { inlineData: { mimeType: audioBlob.type || "audio/webm", data: base64Data } }
        ]
      }]
    })
  }, "Gemini audio indisponible");
  const raw = body?.candidates?.[0]?.content?.parts?.find(p => typeof p?.text === "string")?.text || "{}";
  return normalizeAudioInsights(parseJsonWithFallback(raw, {}));
}

async function transcribeWithOpenAI(apiKey, audioBlob) {
  const form = new FormData();
  form.append("file", new File([audioBlob], "call.webm", { type: audioBlob.type || "audio/webm" }));
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const body = await fetchJson("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  }, "Transcription OpenAI indisponible");

  return {
    transcript: String(body?.text || "").trim(),
    summary: "",
    needs: [],
    objections: [],
    next_steps: []
  };
}

async function transcribeWithDeepgram(apiKey, audioBlob) {
  const body = await fetchJson("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": audioBlob.type || "audio/webm"
    },
    body: audioBlob
  }, "Transcription Deepgram indisponible");

  const transcript = body?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  return { transcript: String(transcript).trim(), summary: "", needs: [], objections: [], next_steps: [] };
}

async function analyzeWithOpenAIText(apiKey, model, transcript) {
  const body = await fetchJson("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CRM_PROMPT },
        { role: "user", content: transcript }
      ]
    })
  }, "Analyse CRM OpenAI indisponible");

  return body?.choices?.[0]?.message?.content || "{}";
}

async function analyzeTranscriptRaw(transcriptText, callerId = "") {
  const cfg = getAiConfig();
  const userPrompt = callerId ? `Interlocuteur connu : ${callerId}\n\n---\n${transcriptText}` : transcriptText;

  if (cfg.mode === AI_MODE_GEMINI) {
    const raw = await callGeminiText(cfg.geminiKey, cfg.geminiTextModel, CRM_PROMPT, userPrompt);
    return normalizeCrmAnalysis(parseJsonWithFallback(raw, null));
  }

  if (cfg.textProvider === "openai") {
    const raw = await analyzeWithOpenAIText(cfg.textApiKey, cfg.textModel, userPrompt);
    return normalizeCrmAnalysis(parseJsonWithFallback(raw, null));
  }

  throw new Error(`Provider texte non supporté: ${cfg.textProvider}`);
}

async function transcribeAudioRaw(audioBlob) {
  const cfg = getAiConfig();
  if (cfg.mode === AI_MODE_GEMINI) {
    return transcribeWithGemini(cfg.geminiKey, cfg.geminiAudioModel, audioBlob);
  }
  if (cfg.audioProvider === "openai") return transcribeWithOpenAI(cfg.audioApiKey, audioBlob);
  if (cfg.audioProvider === "deepgram") return transcribeWithDeepgram(cfg.audioApiKey, audioBlob);
  throw new Error(`Provider audio non supporté: ${cfg.audioProvider}`);
}

  return data.analysis;
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

async function testOpenAIKey(key) {
  if (!key) throw new Error("Clé API GPT manquante");
  await fetchJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }, "Clé GPT invalide");
  return true;
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

  const audioAnalysis = await transcribeAudioRaw(audioBlob);
  if (!audioAnalysis.transcript) throw new Error("Transcription audio vide.");

  const analysis = await analyzeTranscriptRaw(audioAnalysis.transcript, callerId);
  const persisted = persistAnalysis(audioAnalysis.transcript, analysis, callerId, {
    source: "audio-recording",
    audioInsights: audioAnalysis
  });

  return { ...persisted, transcript: audioAnalysis.transcript, audioAnalysis };
}

async function testGeminiKey(key) {
  if (!key) throw new Error("Clé Gemini manquante");
  const raw = await callGeminiText(key, DEFAULTS.geminiTextModel, "Réponds {\"ok\":true}", "ping");
  return Boolean(parseJsonWithFallback(raw, {}).ok);
}

async function testAudioProviderKey(provider, key) {
  if (!key) throw new Error("Clé audio manquante");
  if (provider === "openai") {
    await fetchJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }, "Clé OpenAI audio invalide");
    return true;
  }
  if (provider === "deepgram") {
    await fetchJson("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${key}` } }, "Clé Deepgram invalide");
    return true;
  }
  throw new Error("Provider audio non supporté");
}

async function testTextProviderKey(provider, key) {
  if (!key) throw new Error("Clé texte manquante");
  if (provider === "openai") {
    await fetchJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } }, "Clé OpenAI texte invalide");
    return true;
  }
  throw new Error("Provider texte non supporté");
}

async function blobToBase64(blob) {
  const ab = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
// ── Fonction principale : analyser un transcript ─────────────
async function analyzeTranscript(transcriptText, callerId = "") {
  if (!transcriptText || transcriptText.trim().length < 20) {
    throw new Error("Le transcript est trop court pour être analysé.");
  }

  const analysis = await callTranscriptAnalysis(transcriptText, callerId);
  return persistAnalysis(transcriptText, analysis, callerId);
}

// ── Nouveau flux : analyser un audio ─────────────────────────
async function analyzeCallAudio(audioBlob, callerId = "") {
  if (!audioBlob || !audioBlob.size) {
    throw new Error("Aucun audio valide à analyser.");
  }

  const mime = audioBlob.type || "audio/webm";
  const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "m4a" : "webm";
  const file = new File([audioBlob], `call-recording.${ext}`, { type: mime });

  const formData = new FormData();
  formData.append("audio", file);
  formData.append("callerId", callerId || "");

  let res;
  try {
    res = await fetch(apiUrl("/api/analyze-call-audio"), {
      method: "POST",
      body: formData
    });
  } catch (err) {
    throw new Error(
      `Backend API inaccessible (${apiUrl("/api/analyze-call-audio")}). Configurez S360_API_BASE_URL.`
    );
  }

  if (!res.ok) {
    throw new Error(await parseError(res, `Erreur API audio (${res.status})`));
  }

  const data = await res.json();
  if (!data?.crmAnalysis || !data?.audioAnalysis?.transcript) {
    throw new Error("Réponse backend audio invalide.");
  }

  const persisted = persistAnalysis(
    data.audioAnalysis.transcript,
    data.crmAnalysis,
    callerId,
    { source: "audio-recording", audioInsights: data.audioAnalysis }
  );

  return {
    ...persisted,
    transcript: data.audioAnalysis.transcript,
    audioAnalysis: data.audioAnalysis
  };
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
  const now = new Date().toISOString();

  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...prospectData, lastCallId: callId, lastCallDate: now, callCount: (contacts[idx].callCount || 0) + 1 };
  const now = new Date().toISOString();

  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...prospectData, lastCallId: callId, lastCallDate: now, callCount: (contacts[idx].callCount || 0) + 1 };

  const idx = contacts.findIndex(
    (c) =>
      c.name.toLowerCase().trim() === nameNorm ||
      (prospectData.email && c.email === prospectData.email)
  );

  const now = new Date().toISOString();
  if (idx >= 0) {
    contacts[idx] = { ...contacts[idx], ...prospectData, lastCallId: callId, lastCallDate: now, callCount: (contacts[idx].callCount || 0) + 1 };
    saveData(STORAGE_CONTACTS, contacts);
    return contacts[idx].id;
  }
  const newContact = { id: uid(), ...prospectData, callCount: 1, lastCallId: callId, lastCallDate: now, createdAt: now, source: "Appel analysé" };
    contacts[idx] = {
      ...contacts[idx],
      ...prospectData,
      lastCallId: callId,
      lastCallDate: now,
      callCount: (contacts[idx].callCount || 0) + 1
    };
    saveData(STORAGE_CONTACTS, contacts);
    return contacts[idx].id;
  }

  const newContact = { id: uid(), ...prospectData, callCount: 1, lastCallId: callId, lastCallDate: now, createdAt: now, source: "Appel analysé" };
  const newContact = {
    id: uid(),
    ...prospectData,
    callCount: 1,
    lastCallId: callId,
    lastCallDate: now,
    createdAt: now,
    source: "Appel analysé"
  };

  contacts.unshift(newContact);
  saveData(STORAGE_CONTACTS, contacts);
  return newContact.id;
}

function markStepDone(stepId) {
  const steps = loadData(STORAGE_NEXT_STEPS);
  const idx = steps.findIndex(s => s.id === stepId);
  const idx = steps.findIndex((s) => s.id === stepId);
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
function getStats() {
  const calls = loadData(STORAGE_CALLS), contacts = loadData(STORAGE_CONTACTS), steps = loadData(STORAGE_NEXT_STEPS);
  const pending = steps.filter(s => !s.done);
function getStats() {
  const calls = loadData(STORAGE_CALLS), contacts = loadData(STORAGE_CONTACTS), steps = loadData(STORAGE_NEXT_STEPS);
  const pending = steps.filter(s => !s.done);
function getStats() {
  const calls = loadData(STORAGE_CALLS), contacts = loadData(STORAGE_CONTACTS), steps = loadData(STORAGE_NEXT_STEPS);
  const pending = steps.filter(s => !s.done);

function deleteStep(stepId) {
  const steps = loadData(STORAGE_NEXT_STEPS);
  saveData(STORAGE_NEXT_STEPS, steps.filter((s) => s.id !== stepId));
}

function deleteContact(contactId) {
  const contacts = loadData(STORAGE_CONTACTS);
  saveData(STORAGE_CONTACTS, contacts.filter((c) => c.id !== contactId));
}

function getStats() {
  const calls = loadData(STORAGE_CALLS);
  const contacts = loadData(STORAGE_CONTACTS);
  const steps = loadData(STORAGE_NEXT_STEPS);

  const pending = steps.filter((s) => !s.done);
  const urgent = pending.filter((s) => s.type === "urgent");
  const followUp = pending.filter((s) => s.type === "follow-up");
  const opps = pending.filter((s) => s.type === "opportunity");

  return {
    totalCalls: calls.length,
    totalContacts: contacts.length,
    pendingSteps: pending.length,
    urgentSteps: pending.filter(s => s.type === "urgent").length,
    followUpSteps: pending.filter(s => s.type === "follow-up").length,
    opportunities: pending.filter(s => s.type === "opportunity").length
    urgentSteps: urgent.length,
    followUpSteps: followUp.length,
    opportunities: opps.length
  };
}

window.S360AI = {
  __engineId: "s360-openai-single-v1",
  provider: "openai",
  version: "2026-04-17-openai-single",
  __engineId: "s360-multi-provider-v1",
  provider: "multi-provider",
  version: "2026-03-28-front-only",
  STORAGE_CALLS, STORAGE_CONTACTS, STORAGE_NEXT_STEPS,
  loadData, saveData,
  getAiMode, setAiMode, getAiConfig, saveAiConfig,
  getProviderRuntime, getMissingRequirements, hasRequiredKeys, getActiveAiSummary,
  testOpenAIKey, testGeminiKey, testAudioProviderKey, testTextProviderKey,
  analyzeTranscript, analyzeCallAudio,
  upsertContact, markStepDone, deleteStep, deleteContact, getStats
  testGeminiKey, testAudioProviderKey, testTextProviderKey,
  analyzeTranscript, analyzeCallAudio,
  upsertContact, markStepDone, deleteStep, deleteContact, getStats
  provider: AI_PROVIDER,
  model: "backend-proxy",
  version: AI_ENGINE_VERSION,
  analyzeTranscript,
  analyzeCallAudio,
  getApiBaseUrl,
  setApiBaseUrl,
  upsertContact,
  markStepDone,
  deleteStep,
  deleteContact,
  getStats,
  loadData,
  saveData,
  STORAGE_CALLS,
  STORAGE_CONTACTS,
  STORAGE_NEXT_STEPS
};
})();
