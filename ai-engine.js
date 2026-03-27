// ============================================================
// Sales360 — AI Engine
// Pilote toutes les interactions avec Google Gemini
// ============================================================

const GEMINI_API_KEY = "AIzaSyD7cBh9d0WgnzQkBRVNZtU8jwJXLKcbFTs";
const GEMINI_MODEL   = "gemini-2.5-flash";

// ── Storage keys ─────────────────────────────────────────────
const STORAGE_CALLS      = "s360_calls";       // tableau d'appels analysés
const STORAGE_CONTACTS   = "s360_contacts";    // prospects/contacts
const STORAGE_NEXT_STEPS = "s360_next_steps";  // toutes les actions à faire

// ── Helpers storage ──────────────────────────────────────────
function loadData(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ── Génère un ID unique ───────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Appel Gemini ─────────────────────────────────────────────
async function callGemini(systemPrompt, userContent) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json"
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userContent }]
        }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini error ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(raw);
}

// ── Prompt principal d'analyse ───────────────────────────────
const SYSTEM_PROMPT = `
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
    "notes": "2-3 phrases résumant le profil et contexte du prospect"
  },
  "callSummary": {
    "duration": "durée estimée si mentionnée sinon 'N/A'",
    "sentiment": "positif" | "neutre" | "négatif",
    "keyPoints": ["point 1", "point 2", "point 3"],
    "objections": ["objection 1"] ou [],
    "outcome": "résultat de l'appel en 1 phrase"
  },
  "nextSteps": [
    {
      "title": "Titre court de l'action",
      "description": "Description précise de ce qu'il faut faire",
      "type": "urgent" | "follow-up" | "opportunity" | "risk",
      "dueDate": "YYYY-MM-DD",
      "priority": "high" | "medium" | "low",
      "estimatedValue": nombre entier en euros
    }
  ],
  "pipelineStage": "Prospection" | "Qualification" | "Proposition" | "Négociation" | "Conclue"
}

Règles :
- nextSteps doit contenir entre 2 et 5 actions concrètes et actionnables.
- Les dates dueDate sont relatives à aujourd'hui (${new Date().toISOString().slice(0,10)}).
- Si une information est manquante, déduis-la du contexte ou laisse la valeur vide/0.
- Réponds UNIQUEMENT avec le JSON, sans texte autour.
`;

// ── Fonction principale : analyser un transcript ─────────────
async function analyzeTranscript(transcriptText, callerId = "") {
  if (!transcriptText || transcriptText.trim().length < 20) {
    throw new Error("Le transcript est trop court pour être analysé.");
  }

  const userContent = callerId
    ? `Interlocuteur connu : ${callerId}\n\n---\n${transcriptText}`
    : transcriptText;

  const result = await callGemini(SYSTEM_PROMPT, userContent);

  // ── Persiste l'appel ─────────────────────────────────────
  const callRecord = {
    id:         uid(),
    date:       new Date().toISOString(),
    transcript: transcriptText,
    analysis:   result,
    callerId
  };

  const calls = loadData(STORAGE_CALLS);
  calls.unshift(callRecord);
  saveData(STORAGE_CALLS, calls);

  // ── Crée ou met à jour le prospect ──────────────────────
  const contactId = upsertContact(result.prospect, callRecord.id);

  // ── Persiste les next steps ──────────────────────────────
  const steps = (result.nextSteps || []).map(s => ({
    ...s,
    id:        uid(),
    callId:    callRecord.id,
    contactId,
    contactName: result.prospect?.name || "Inconnu",
    done:      false,
    createdAt: new Date().toISOString()
  }));

  const allSteps = loadData(STORAGE_NEXT_STEPS);
  allSteps.unshift(...steps);
  saveData(STORAGE_NEXT_STEPS, allSteps);

  return { callId: callRecord.id, contactId, analysis: result, nextSteps: steps };
}

// ── Crée ou met à jour un contact ────────────────────────────
function upsertContact(prospectData, callId) {
  if (!prospectData?.name) return null;

  const contacts = loadData(STORAGE_CONTACTS);
  const nameNorm = prospectData.name.toLowerCase().trim();

  // Cherche si le contact existe déjà
  const idx = contacts.findIndex(c =>
    c.name.toLowerCase().trim() === nameNorm ||
    (prospectData.email && c.email === prospectData.email)
  );

  const now = new Date().toISOString();

  if (idx >= 0) {
    // Met à jour le contact existant
    contacts[idx] = {
      ...contacts[idx],
      ...prospectData,
      lastCallId:   callId,
      lastCallDate: now,
      callCount:    (contacts[idx].callCount || 0) + 1
    };
    saveData(STORAGE_CONTACTS, contacts);
    return contacts[idx].id;
  } else {
    // Crée un nouveau contact
    const newContact = {
      id:          uid(),
      ...prospectData,
      callCount:   1,
      lastCallId:  callId,
      lastCallDate: now,
      createdAt:   now,
      source:      "Appel analysé"
    };
    contacts.unshift(newContact);
    saveData(STORAGE_CONTACTS, contacts);
    return newContact.id;
  }
}

// ── Marquer un next step comme fait ──────────────────────────
function markStepDone(stepId) {
  const steps = loadData(STORAGE_NEXT_STEPS);
  const idx   = steps.findIndex(s => s.id === stepId);
  if (idx >= 0) {
    steps[idx].done      = true;
    steps[idx].doneAt    = new Date().toISOString();
    saveData(STORAGE_NEXT_STEPS, steps);
    return true;
  }
  return false;
}

// ── Supprimer un next step ───────────────────────────────────
function deleteStep(stepId) {
  const steps = loadData(STORAGE_NEXT_STEPS);
  saveData(STORAGE_NEXT_STEPS, steps.filter(s => s.id !== stepId));
}

// ── Supprimer un contact ──────────────────────────────────────
function deleteContact(contactId) {
  const contacts = loadData(STORAGE_CONTACTS);
  saveData(STORAGE_CONTACTS, contacts.filter(c => c.id !== contactId));
}

// ── Stats globales ────────────────────────────────────────────
function getStats() {
  const calls    = loadData(STORAGE_CALLS);
  const contacts = loadData(STORAGE_CONTACTS);
  const steps    = loadData(STORAGE_NEXT_STEPS);

  const pending = steps.filter(s => !s.done);
  const urgent  = pending.filter(s => s.type === "urgent");
  const followUp = pending.filter(s => s.type === "follow-up");
  const opps    = pending.filter(s => s.type === "opportunity");

  return {
    totalCalls:     calls.length,
    totalContacts:  contacts.length,
    pendingSteps:   pending.length,
    urgentSteps:    urgent.length,
    followUpSteps:  followUp.length,
    opportunities:  opps.length
  };
}

// ── Expose globalement ────────────────────────────────────────
window.S360AI = {
  analyzeTranscript,
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
