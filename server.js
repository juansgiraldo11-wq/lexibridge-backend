import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Habilitar CORS para permitir solicitudes externas (ej. App móvil o Render)
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

const taxonomy = `
VERBS:
1.1 Thoughts and Mental Processes (Cognition)
1.2 Emotions and Feelings (Affect)
1.3 Possession and Belonging
1.4 Sensory Perception
1.5 Measures, State and Value Relations
1.6 Dual Verbs / Exceptions (Stative <-> Action)
2.1 Physical Movement and Displacement
2.2 Communication and Verbal Expression
2.3 Creation, Production and Alteration
2.4 Voluntary Perception and Active Observation
2.5 Daily Tasks and Care Work
2.6 Social Interaction and Events

NOUNS:
N1 People/Living Beings; N2 Places/Locations; N3 Objects/Things;
N4 Ideas/Concepts/States; N5 Events/Activities; N6 Collective;
N7 Substances/Materials; N8 Proper Names; N9 Compound/Derived.

ADJECTIVES:
ADJ1 Descriptive/Qualitative; ADJ2 Relational; ADJ3 Participial;
ADJ4 Evaluative; ADJ5 Quantitative/Amount; ADJ6 Determinative use;
ADJ7 Gradable/Non-gradable.

ADVERBS:
ADV1 Manner; ADV2 Frequency; ADV3 Time; ADV4 Place/Direction;
ADV5 Degree/Intensity; ADV6 Certainty/Probability; ADV7 Focusing;
ADV8 Viewpoint/Sentence; ADV9 Linking/Conjunctive; ADV10 Interrogative/Relative.

MODALS:
MOD1 Ability/Possibility; MOD2 Permission; MOD3 Obligation/Necessity;
MOD4 Advice/Recommendation; MOD5 Prediction/Expectation;
MOD6 Deduction/Probability; MOD7 Willingness/Refusal; MOD8 Hypothetical/Conditional.

PRONOUNS:
PRO1 Personal; PRO2 Reflexive; PRO3 Possessive; PRO4 Demonstrative;
PRO5 Interrogative; PRO6 Relative; PRO7 Indefinite; PRO8 Reciprocal;
PRO9 Distributive; PRO10 Dummy/Expletive.

DETERMINERS:
DET1 Articles; DET2 Demonstrative; DET3 Possessive; DET4 Quantifying;
DET5 Distributive; DET6 Interrogative; DET7 Numeral.

PREPOSITIONS:
PREP1 Place/Position; PREP2 Movement/Direction; PREP3 Time;
PREP4 Manner/Means; PREP5 Cause/Purpose; PREP6 Relation/Association;
PREP7 Complex Preposition.

CONJUNCTIONS: CONJ1 Coordinating; CONJ2 Subordinating; CONJ3 Correlative.
INTERJECTIONS: INT1 Emotion/Reaction; INT2 Greeting/Social; INT3 Attention/Command.
PHRASAL VERBS: PH1 Literal; PH2 Idiomatic; PH3 Transitive Separable;
PH4 Transitive Inseparable; PH5 Intransitive.
`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    word: { type: Type.STRING },
    pronunciation: {
      type: Type.OBJECT,
      properties: { ipa: { type: Type.STRING }, note: { type: Type.STRING } },
      required: ["ipa", "note"]
    },
    entries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: { type: Type.STRING },
          meaning_en: { type: Type.STRING },
          translation_es: { type: Type.STRING },
          translation_it: { type: Type.STRING },
          subcategory: {
            type: Type.OBJECT,
            properties: {
              block: { type: Type.STRING },
              code: { type: Type.STRING },
              name: { type: Type.STRING },
              purpose: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["block", "code", "name", "purpose", "explanation"]
          },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                english: { type: Type.STRING },
                spanish: { type: Type.STRING },
                italian: { type: Type.STRING }
              },
              required: ["english", "spanish", "italian"]
            }
          },
          details: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.STRING }
              },
              required: ["label", "value"]
            }
          },
          usage_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
          exceptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.STRING }
        },
        required: [
          "partOfSpeech",
          "meaning_en",
          "translation_es",
          "translation_it",
          "subcategory",
          "examples",
          "details",
          "usage_notes",
          "exceptions",
          "confidence"
        ]
      }
    },
    reliability_note: { type: Type.STRING }
  },
  required: ["word", "pronunciation", "entries", "reliability_note"]
};

function compact(data) {
  if (!Array.isArray(data)) return [];
  return data.map((e) => ({
    word: e.word,
    phonetic: e.phonetic || "",
    phonetics: (e.phonetics || []).slice(0, 8).map((p) => ({ text: p.text || "", audio: p.audio || "" })),
    meanings: (e.meanings || []).map((m) => ({
      partOfSpeech: m.partOfSpeech || "",
      definitions: (m.definitions || []).slice(0, 8).map((d) => ({
        definition: d.definition || "",
        example: d.example || "",
        synonyms: (d.synonyms || []).slice(0, 8),
        antonyms: (d.antonyms || []).slice(0, 8)
      }))
    }))
  }));
}

async function dictionary(word) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word), {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!r.ok) return [];
    return compact(await r.json());
  } catch (err) {
    console.warn("Dictionary API unavailable, using Gemini directly.");
    return [];
  }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function analyze(word, evidence) {
  if (!ai) throw new Error("GEMINI_API_KEY is missing in .env");

  const prompt = `You are a meticulous English lexicography and grammar assistant.
Analyze "${word}". Use the supplied dictionary evidence if available, or analyze from your own comprehensive linguistic knowledge.

Rules:
- A word can have multiple parts of speech and senses; separate them.
- Spanish and Italian translations must match each sense.
- Examples must demonstrate the exact sense.
- For verbs, decide stative, action/dynamic, or dual/context-dependent and use the exact 1.1-2.6 taxonomy.
- For 1.6 dual verbs, explain the state use and action use and whether -ing is natural.
- For modals, do not invent a conventional tense. Explain time reference, function, negative, question and exceptional uses.
- If a property is not applicable, say "Not applicable".
- Give confidence high/medium/low based on analysis.

TAXONOMY:
${taxonomy}

DICTIONARY EVIDENCE:
${JSON.stringify(evidence, null, 2)}

Return only valid JSON matching the schema.`;

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Analyzing "${word}" with ${MODEL_NAME} (Attempt ${attempt}/${maxRetries})...`);
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });

      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt} failed (${err.status || err.message}).`);
      
      if (attempt < maxRetries) {
        console.log("Waiting 1.5s before retrying...");
        await delay(1500);
      }
    }
  }

  throw lastError || new Error("Failed to reach Gemini API after retries.");
}

app.get("/api/search", async (req, res) => {
  try {
    const word = String(req.query.word || "").trim().toLowerCase();
    if (!word) return res.status(400).json({ error: "Enter a word." });
    if (word.length > 80) return res.status(400).json({ error: "The search is too long." });

    const evidence = await dictionary(word);
    const data = await analyze(word, evidence);

    data.sources = [
      { name: "LexiBridge AI Engine", url: "#", role: "Grammar taxonomy, senses, Italian & Spanish translations." },
      { name: "WordReference", url: "https://www.wordreference.com/definition/" + encodeURIComponent(word), role: "Manual cross-check link." }
    ];
    data.evidence = evidence;
    res.json(data);
  } catch (e) {
    console.error("SERVER ERROR:", e);
    res.status(500).json({ error: e.message || "Unexpected error." });
  }
});

app.use((req, res) => res.sendFile("index.html", { root: "public" }));
app.listen(PORT, () => console.log(`LexiBridge running at http://localhost:${PORT}`));