const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_AUDIO = process.env.GEMINI_MODEL_AUDIO || 'gemini-2.0-flash';
const GEMINI_MODEL_TEXT = process.env.GEMINI_MODEL_TEXT || 'gemini-2.0-flash';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/ogg',
  'audio/ogg;codecs=opus'
]);

const AUDIO_PROMPT = `Analyse cet appel commercial.

1. Transcris l’appel de manière fidèle
2. Résume les points clés
3. Identifie les besoins du prospect
4. Identifie les objections éventuelles
5. Donne les prochaines étapes concrètes

Retourne uniquement un JSON valide avec cette structure :

{
  "transcript": "",
  "summary": "",
  "needs": [],
  "objections": [],
  "next_steps": []
}`;

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
- Les dates dueDate sont relatives à aujourd'hui (${new Date().toISOString().slice(0, 10)}).
- Si une information est manquante, déduis-la du contexte ou laisse la valeur vide/0.
- Réponds UNIQUEMENT avec le JSON, sans texte autour.
`;

function sanitizeArray(input) {
  return Array.isArray(input) ? input.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
}

function extractJsonText(rawText = '') {
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return cleaned.slice(first, last + 1);
}

function parseJsonSafe(rawText, fallback) {
  const jsonText = extractJsonText(rawText);
  if (!jsonText) return fallback;
  try {
    return JSON.parse(jsonText);
  } catch {
    return fallback;
  }
}

function validateAudioInsights(parsed) {
  return {
    transcript: typeof parsed?.transcript === 'string' ? parsed.transcript.trim() : '',
    summary: typeof parsed?.summary === 'string' ? parsed.summary.trim() : '',
    needs: sanitizeArray(parsed?.needs),
    objections: sanitizeArray(parsed?.objections),
    next_steps: sanitizeArray(parsed?.next_steps)
  };
}

function validateCrmAnalysis(parsed) {
  const fallback = {
    prospect: {
      name: '',
      company: '',
      email: '',
      phone: '',
      status: 'Prospect',
      estimatedValue: 0,
      notes: ''
    },
    callSummary: {
      duration: 'N/A',
      sentiment: 'neutre',
      keyPoints: [],
      objections: [],
      outcome: ''
    },
    nextSteps: [],
    pipelineStage: 'Prospection'
  };

  if (!parsed || typeof parsed !== 'object') return fallback;

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
    nextSteps: Array.isArray(parsed.nextSteps)
      ? parsed.nextSteps.map((step) => ({
          title: String(step?.title || 'Action à préciser'),
          description: String(step?.description || ''),
          type: ['urgent', 'follow-up', 'opportunity', 'risk'].includes(step?.type) ? step.type : 'follow-up',
          dueDate: String(step?.dueDate || new Date().toISOString().slice(0, 10)),
          priority: ['high', 'medium', 'low'].includes(step?.priority) ? step.priority : 'medium',
          estimatedValue: Number(step?.estimatedValue) || 0
        }))
      : [],
    pipelineStage: String(parsed.pipelineStage || fallback.pipelineStage)
  };
}

async function callGemini(model, payload, timeoutMs = 70000) {
  if (!GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY est manquante sur le serveur.');
    err.statusCode = 500;
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(data?.error?.message || `Gemini error ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }

    const textPart = data?.candidates?.[0]?.content?.parts?.find((p) => typeof p?.text === 'string')?.text || '';

    if (!textPart) {
      const err = new Error('Réponse Gemini vide ou invalide.');
      err.statusCode = 502;
      throw err;
    }

    return textPart;
  } catch (error) {
    if (error.name === 'AbortError') {
      const err = new Error('Timeout: Gemini met trop de temps à répondre.');
      err.statusCode = 504;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/analyze-transcript', async (req, res) => {
  try {
    const transcriptText = String(req.body?.transcriptText || '').trim();
    const callerId = String(req.body?.callerId || '').trim();

    if (!transcriptText || transcriptText.length < 20) {
      return res.status(400).json({ error: 'Le transcript est trop court.' });
    }

    const prompt = callerId
      ? `Interlocuteur connu : ${callerId}\n\n---\n${transcriptText}`
      : transcriptText;

    const rawText = await callGemini(GEMINI_MODEL_TEXT, {
      systemInstruction: { parts: [{ text: CRM_PROMPT }] },
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const parsed = parseJsonSafe(rawText, null);
    if (!parsed) {
      return res.status(502).json({ error: 'Réponse IA invalide: JSON non parsable.' });
    }

    return res.json({ analysis: validateCrmAnalysis(parsed) });
  } catch (error) {
    console.error('[POST /api/analyze-transcript] error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Erreur serveur.' });
  }
});

app.post('/api/analyze-call-audio', upload.single('audio'), async (req, res) => {
  try {
    const audio = req.file;
    const callerId = String(req.body?.callerId || '').trim();

    if (!audio) {
      return res.status(400).json({ error: 'Fichier audio manquant (champ: audio).' });
    }

    if (!audio.buffer || audio.size === 0) {
      return res.status(400).json({ error: 'Le fichier audio est vide.' });
    }

    const mimeType = String(audio.mimetype || '').toLowerCase();
    if (!mimeType.startsWith('audio/') || !ALLOWED_AUDIO_MIME.has(mimeType)) {
      return res.status(400).json({ error: `Type audio non supporté: ${mimeType || 'inconnu'}` });
    }

    const audioB64 = audio.buffer.toString('base64');

    const audioRaw = await callGemini(GEMINI_MODEL_AUDIO, {
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: AUDIO_PROMPT },
            { inlineData: { mimeType, data: audioB64 } }
          ]
        }
      ]
    }, 90000);

    const audioParsed = parseJsonSafe(audioRaw, {});
    const audioAnalysis = validateAudioInsights(audioParsed);

    if (!audioAnalysis.transcript) {
      return res.status(502).json({ error: 'Impossible de récupérer un transcript valide depuis Gemini.' });
    }

    const crmPrompt = callerId
      ? `Interlocuteur connu : ${callerId}\n\n---\n${audioAnalysis.transcript}`
      : audioAnalysis.transcript;

    const crmRaw = await callGemini(GEMINI_MODEL_TEXT, {
      systemInstruction: { parts: [{ text: CRM_PROMPT }] },
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      },
      contents: [{ role: 'user', parts: [{ text: crmPrompt }] }]
    });

    const crmParsed = parseJsonSafe(crmRaw, null);
    if (!crmParsed) {
      return res.status(502).json({ error: 'Analyse CRM invalide: JSON non parsable.' });
    }

    return res.json({
      audioAnalysis,
      crmAnalysis: validateCrmAnalysis(crmParsed)
    });
  } catch (error) {
    console.error('[POST /api/analyze-call-audio] error:', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Erreur serveur.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'sales360-api' });
});

app.listen(port, () => {
  console.log(`Sales360 server running on http://localhost:${port}`);
});
