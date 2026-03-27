// ============================================================
// Sales360 — AI Engine (frontend)
// Les appels Gemini passent uniquement par le backend (/api/*)
// ============================================================

const AI_PROVIDER = "gemini";
const AI_ENGINE_VERSION = "2026-03-27-backend";

// ── Storage keys ─────────────────────────────────────────────
const STORAGE_CALLS = "s360_calls";
const STORAGE_CONTACTS = "s360_contacts";
const STORAGE_NEXT_STEPS = "s360_next_steps";

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

// ── Appel backend pour analyse transcript ────────────────────
async function callTranscriptAnalysis(transcriptText, callerId = "") {
  const res = await fetch("/api/analyze-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcriptText, callerId })
  });

  if (!res.ok) {
    throw new Error(await parseError(res, `Erreur API (${res.status})`));
  }

  const data = await res.json();
  if (!data?.analysis) {
    throw new Error("Réponse backend invalide: analyse absente.");
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

  const res = await fetch("/api/analyze-call-audio", {
    method: "POST",
    body: formData
  });

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

// ── Crée ou met à jour un contact ────────────────────────────
function upsertContact(prospectData, callId) {
  if (!prospectData?.name) return null;

  const contacts = loadData(STORAGE_CONTACTS);
  const nameNorm = prospectData.name.toLowerCase().trim();

  const idx = contacts.findIndex(
    (c) =>
      c.name.toLowerCase().trim() === nameNorm ||
      (prospectData.email && c.email === prospectData.email)
  );

  const now = new Date().toISOString();

  if (idx >= 0) {
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
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx >= 0) {
    steps[idx].done = true;
    steps[idx].doneAt = new Date().toISOString();
    saveData(STORAGE_NEXT_STEPS, steps);
    return true;
  }
  return false;
}

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
    urgentSteps: urgent.length,
    followUpSteps: followUp.length,
    opportunities: opps.length
  };
}

window.S360AI = {
  provider: AI_PROVIDER,
  model: "backend-proxy",
  version: AI_ENGINE_VERSION,
  analyzeTranscript,
  analyzeCallAudio,
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
