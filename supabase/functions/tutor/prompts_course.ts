// =====================================================================
// Speak Up · Prompts del curso, la escucha y las correcciones puntuales
// =====================================================================

const STUDENT = `The student is David, a Spanish/Catalan-speaking IT systems administrator from Mataró (Barcelona).
His interests: servers, backups and IT incidents, triathlon and cycling (indoor training with Rouvy), football,
family (partner and a young daughter), travel. He learns English to reach B2 and to speak at work.
All explanations for him must be in Spanish (Spain), short, clear and practical. Avoid unnecessary grammar jargon.`;

// ---------------------------------------------------------------------
// LECCIONES
// ---------------------------------------------------------------------
export interface UnitSpec {
  id: string; level: string; title: string; kind: string;
  grammar: string; vocab: string; speaking: string; pron: string;
}

export function lessonSystem(u: UnitSpec): string {
  const isExam = u.kind === "exam";
  return `You are an expert EFL teacher writing ONE lesson of a personal English course (CEFR ${u.level}).
${STUDENT}

${isExam ? `This is the END-OF-LEVEL EXAM for ${u.level}. It reviews ALL the ${u.level} grammar and vocabulary.
- "explanation": 3-4 very short review sections summarising the key ${u.level} points (a quick revision sheet).
- "quiz": exactly 15 questions mixing every ${u.level} grammar point, increasing difficulty.
- "drills": 8 sentences covering different ${u.level} structures.` :
`UNIT ${u.id}: "${u.title}"
- Grammar: ${u.grammar}
- Vocabulary: ${u.vocab}
- Speaking goal: ${u.speaking}
- Pronunciation focus: ${u.pron}`}

Rules:
- Every English example must be natural, correct, and use only ${u.level} (or lower) language, except the target grammar.
- Personalise examples and drills to David's life (IT work, triathlon, family, Mataró, travel). Vary them.
- "explanation": 2-4 sections. Each body_es: max 4 short sentences in Spanish, can include a simple formula
  like "I + am / he + is". Each section has 2-4 examples with Spanish translation.
- "common_mistakes": 2-4 typical mistakes of SPANISH speakers with this topic (literal translations, missing subject, etc.).
- "vocab": 8-12 useful items related to the unit, each with a short example sentence.
- "pronunciation": a practical tip in Spanish (how to place the mouth, what sound is NOT like Spanish)
  and 5-6 words or short phrases to repeat.
- "drills": ${isExam ? "8" : "6-8"} Spanish sentences for him to say in English. Short (max 12 words), using the target grammar
  and vocabulary. "en" is the most natural translation; "alt" up to 2 other correct versions.
- "quiz": ${isExam ? "15" : "8"} multiple-choice questions, 4 options each, only ONE correct. Mix: choose the correct form,
  find the mistake, choose the right word, short dialogue completion. "explanation_es" says why in one sentence.
- "speaking_task": an open speaking task that practises the unit in a real situation of his life.
Always answer by calling the tool "lesson". Never write outside the tool.`;
}

export const LESSON_TOOL = {
  name: "lesson",
  description: "Return the full lesson content.",
  input_schema: {
    type: "object",
    properties: {
      intro_es: { type: "string", description: "1-2 sentences in Spanish: what he will learn and what for." },
      explanation: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title_es: { type: "string" },
            body_es: { type: "string" },
            examples: {
              type: "array",
              items: { type: "object", properties: { en: { type: "string" }, es: { type: "string" } }, required: ["en", "es"] },
            },
          },
          required: ["title_es", "body_es", "examples"],
        },
      },
      common_mistakes: {
        type: "array",
        items: {
          type: "object",
          properties: { wrong: { type: "string" }, right: { type: "string" }, why_es: { type: "string" } },
          required: ["wrong", "right", "why_es"],
        },
      },
      vocab: {
        type: "array",
        items: {
          type: "object",
          properties: { term: { type: "string" }, es: { type: "string" }, example: { type: "string" } },
          required: ["term", "es", "example"],
        },
      },
      pronunciation: {
        type: "object",
        properties: { tip_es: { type: "string" }, words: { type: "array", items: { type: "string" } } },
        required: ["tip_es", "words"],
      },
      drills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            es: { type: "string" },
            en: { type: "string" },
            alt: { type: "array", items: { type: "string" } },
          },
          required: ["es", "en"],
        },
      },
      quiz: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            answer_index: { type: "integer" },
            explanation_es: { type: "string" },
          },
          required: ["question", "options", "answer_index", "explanation_es"],
        },
      },
      speaking_task: {
        type: "object",
        properties: {
          prompt_es: { type: "string" },
          prompt_en: { type: "string" },
          example_answer: { type: "string" },
        },
        required: ["prompt_es", "prompt_en", "example_answer"],
      },
    },
    required: ["intro_es", "explanation", "common_mistakes", "vocab", "pronunciation", "drills", "quiz", "speaking_task"],
  },
};

// ---------------------------------------------------------------------
// COMPROBAR UNA FRASE HABLADA (drills del curso)
// ---------------------------------------------------------------------
export const CHECK_SYSTEM = `You check one sentence that a Spanish-speaking English learner SAID (it comes from speech recognition).
${STUDENT}
He was asked to say in English the Spanish sentence given. Compare what he said with the expected answer.
- Ignore capitalisation, punctuation, fillers ("uh", "um") and obvious speech-recognition errors.
- ok = true if his sentence is correct English AND means the same, even if it is different from the expected answer.
- If not ok: list max 2 corrections and give the best version for what he tried to say.
- feedback_es: one short, encouraging sentence in Spanish.
Always answer by calling the tool "check".`;

export const CHECK_TOOL = {
  name: "check",
  description: "Evaluate the spoken sentence.",
  input_schema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      feedback_es: { type: "string" },
      better: { type: ["string", "null"] },
      corrections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" },
            correct: { type: "string" },
            type: { type: "string", enum: ["grammar", "vocabulary", "preposition", "pronunciation"] },
            explanation_es: { type: "string" },
          },
          required: ["original", "correct", "type", "explanation_es"],
        },
      },
    },
    required: ["ok", "feedback_es", "better", "corrections"],
  },
};

// ---------------------------------------------------------------------
// ESCUCHA
// ---------------------------------------------------------------------
const LISTENING_LENGTH: Record<string, string> = {
  A1: "60-90 words in total. Very short sentences (max 8 words), present simple, very common words.",
  A2: "100-140 words. Short sentences, present and past simple, going to, common words.",
  B1: "150-200 words. Natural sentences, present perfect, conditionals, some phrasal verbs.",
  B2: "220-280 words. Natural, fluent English with idioms and connected ideas, as native speakers talk.",
};

export function listeningSystem(level: string, topic: string): string {
  return `You write a short LISTENING exercise for a CEFR ${level} English learner.
${STUDENT}
Topic: ${topic}.
- Length: ${LISTENING_LENGTH[level] ?? LISTENING_LENGTH.A2}
- Choose "dialogue" (2 speakers, A and B, with English first names) or "monologue" (1 speaker). Prefer dialogues ~60% of the time.
- Realistic situations: phone calls, meetings, travel, shops, sport, family, radio messages, voicemails.
- Each line is ONE or TWO sentences (it is played with text-to-speech, line by line). No stage directions, no emojis.
- "context_es": one sentence in Spanish describing the situation, WITHOUT giving the answers.
- "questions": 4 open questions in English about specific information in the audio (who, what, when, where, why, how much).
  They must be answerable with a short spoken answer. "question_es" is the Spanish translation.
  "expected_answer": short reference answer.
- "dictation_index": index of one line that is good for dictation (6-14 words, clear).
- "key_vocab": 4-6 useful words or expressions from the audio.
Always answer by calling the tool "listening".`;
}

export const LISTENING_TOOL = {
  name: "listening",
  description: "Return the listening exercise.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      kind: { type: "string", enum: ["dialogue", "monologue"] },
      context_es: { type: "string" },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: { speaker: { type: "string", enum: ["A", "B"] }, name: { type: "string" }, text: { type: "string" } },
          required: ["speaker", "name", "text"],
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_en: { type: "string" },
            question_es: { type: "string" },
            expected_answer: { type: "string" },
          },
          required: ["question_en", "question_es", "expected_answer"],
        },
      },
      dictation_index: { type: "integer" },
      key_vocab: {
        type: "array",
        items: { type: "object", properties: { term: { type: "string" }, es: { type: "string" } }, required: ["term", "es"] },
      },
    },
    required: ["title", "kind", "context_es", "lines", "questions", "dictation_index", "key_vocab"],
  },
};

export const ANSWER_SYSTEM = `You evaluate a learner's SPOKEN answer to a comprehension question about an audio he listened to.
${STUDENT}
You receive the transcript of the audio, the question, the reference answer and his answer (from speech recognition).
- "understood": "yes" if his answer shows he understood the information (even with bad English or very short),
  "partly" if it is incomplete or half right, "no" if wrong or he did not answer.
- Do not penalise grammar in "understood". Grammar goes in "corrections" (max 2, only important ones).
- Ignore fillers and obvious speech-recognition errors. If he answers in Spanish, evaluate comprehension anyway
  and give him the English version in "model_answer".
- "feedback_es": one or two short sentences in Spanish. If not understood, point to the part of the audio
  WITHOUT quoting the full answer, e.g. "Vuelve a escuchar la parte en la que Tom habla del vuelo".
- "model_answer": a natural, short English answer he could give.
Always answer by calling the tool "answer".`;

export const ANSWER_TOOL = {
  name: "answer",
  description: "Evaluate the answer.",
  input_schema: {
    type: "object",
    properties: {
      understood: { type: "string", enum: ["yes", "partly", "no"] },
      feedback_es: { type: "string" },
      model_answer: { type: "string" },
      corrections: CHECK_TOOL.input_schema.properties.corrections,
    },
    required: ["understood", "feedback_es", "model_answer", "corrections"],
  },
};
