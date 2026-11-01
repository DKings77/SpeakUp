// =====================================================================
// Temario Speak Up · A1 → C2
// Progresión basada en el MCER (CEFR) y en los temarios habituales de
// cursos generales (tipo English File / Cambridge), adaptada a David:
// IT, trabajo, triatlón, familia y viajes.
//
// Cada unidad: id, level, title (español), grammar, vocab, speaking, pron.
// Las unidades "exam" cierran cada nivel.
// El contenido de cada lección lo genera Claude la primera vez y se guarda.
// =====================================================================

const u = (id, title, grammar, vocab, speaking, pron) => ({
  id, level: id.slice(0, 2).toUpperCase(), title, grammar, vocab, speaking, pron, kind: "unit",
});
const exam = (level, title) => ({
  id: `${level.toLowerCase()}-exam`, level, title, kind: "exam",
  grammar: `review of all ${level} grammar`, vocab: `${level} vocabulary`,
  speaking: `talk for 1-2 minutes about yourself using ${level} structures`, pron: "general review",
});

export const LEVELS = [
  { id: "A1", name: "A1 · Principiante", goal: "Presentarte, hablar de tu día a día y pedir cosas básicas." },
  { id: "A2", name: "A2 · Elemental", goal: "Contar lo que hiciste, tus planes y resolver situaciones de viaje y trabajo sencillas." },
  { id: "B1", name: "B1 · Intermedio", goal: "Hablar de tu experiencia, dar opiniones y explicar procesos de trabajo." },
  { id: "B2", name: "B2 · Intermedio alto", goal: "Participar en reuniones, argumentar, negociar y conversar con fluidez." },
  { id: "C1", name: "C1 · Avanzado", goal: "Expresarte con matices, sonar natural, liderar reuniones y entender a nativos sin esfuerzo." },
  { id: "C2", name: "C2 · Maestría", goal: "El nivel más alto: precisión casi nativa, humor, ironía y cualquier registro." },
];

export const UNITS = [
  // ---------------- A1 ----------------
  u("a1-01", "Presentarte: el verbo to be", "to be (am/is/are): affirmative, negative, questions and short answers", "countries, nationalities, jobs, numbers 1-20", "introduce yourself: name, city, job", "contractions I'm, you're, he's, it's"),
  u("a1-02", "Mi familia y mi casa", "possessive adjectives (my, your, his...), possessive 's, have got", "family members, rooms of the house", "describe your family and your home", "the sound /ð/: this, mother, brother"),
  u("a1-03", "Números, horas y fechas", "numbers to 1000, telling the time, prepositions of time at/on/in", "days, months, ordinal numbers", "say the time, your birthday and your timetable", "thirteen vs thirty (word stress)"),
  u("a1-04", "Mi rutina", "present simple affirmative (he/she/it + -s), adverbs of frequency", "daily routine verbs, always/usually/sometimes/never", "describe a normal working day", "-s endings /s/ /z/ /ɪz/"),
  u("a1-05", "Preguntas en presente", "present simple questions and negatives with do/does, don't/doesn't; wh- questions", "question words, work and free time", "ask and answer personal questions", "intonation of yes/no vs wh- questions"),
  u("a1-06", "Gustos y tiempo libre", "like/love/enjoy/hate + -ing, object pronouns (me, him, it...)", "hobbies, sports, music, TV", "talk about what you like and don't like", "/ɪ/ vs /iː/: live vs leave, ship vs sheep"),
  u("a1-07", "¿Dónde está?", "there is / there are, a/an/some/any, prepositions of place", "office objects, places in town", "describe your office and your neighbourhood", "the sound /θ/: three, think, bathroom"),
  u("a1-08", "Habilidades y peticiones", "can / can't (ability, permission, requests), imperatives", "action verbs, computer and office verbs", "say what you can do and ask for things politely", "can /kən/ vs can't /kɑːnt/"),
  u("a1-09", "Ahora mismo", "present continuous; present continuous vs present simple", "clothes, weather", "describe what is happening now", "-ing endings and linking"),
  u("a1-10", "Comida y compras", "countable/uncountable nouns, how much / how many, I'd like / Can I have", "food, drinks, prices, shops", "order in a bar or café and buy things", "weak forms of 'of', 'a', 'some'"),
  exam("A1", "Examen de nivel A1"),

  // ---------------- A2 ----------------
  u("a2-01", "¿Dónde estabas? was / were", "past simple of be (was/were), time expressions: yesterday, last, ago", "feelings adjectives, places", "say where you were and how you felt", "weak forms of was /wəz/ and were /wə/"),
  u("a2-02", "El fin de semana pasado", "past simple of regular verbs: affirmative", "free-time activities, weekend", "tell what you did last weekend", "-ed endings /t/ /d/ /ɪd/"),
  u("a2-03", "Verbos irregulares", "past simple of common irregular verbs (go-went, have-had, take-took, buy-bought...)", "travel and holidays", "tell the story of a trip", "went, bought, thought, caught"),
  u("a2-04", "Preguntas en pasado", "past simple questions and negatives with did / didn't", "IT incidents: crash, fail, fix, restart, restore", "explain an incident at work step by step", "did you /dɪdʒə/"),
  u("a2-05", "Comparar", "comparative and superlative adjectives; as ... as", "adjectives: fast, cheap, reliable, expensive, quiet", "compare products, cities and bikes", "schwa /ə/ in -er and than"),
  u("a2-06", "Mis planes", "be going to; present continuous for future arrangements", "calendar, appointments, travel plans", "talk about your plans for the weekend and the year", "gonna (informal) and sentence rhythm"),
  u("a2-07", "Decisiones y predicciones", "will for decisions, offers, promises and predictions; will vs going to", "technology and the future", "offer help and make predictions", "'ll contraction: I'll, it'll"),
  u("a2-08", "¿Has estado alguna vez...?", "present perfect with ever / never for experiences", "experiences, places, food", "talk about experiences in your life", "have/has contractions; been /bɪn/"),
  u("a2-09", "Normas y consejos", "have to / don't have to / must / mustn't / should", "work rules, health, security policies", "explain rules at work and give advice", "must /məst/, should /ʃəd/"),
  u("a2-10", "Describir personas", "look like vs be like; adjective order; too / enough", "appearance and personality", "describe a colleague or a family member", "word stress in adjectives"),
  u("a2-11", "Llamadas y emails", "polite requests: could you, would you mind + -ing, can I speak to", "phone and email phrases", "call technical support and leave a message", "spelling: the letters A, E, I, G, J, R, Y"),
  u("a2-12", "Viajes y direcciones", "prepositions of movement; giving directions; at the airport/hotel phrases", "transport, airport, hotel", "check in at a hotel and ask for directions", "stress in compound nouns: boarding pass, check-in"),
  u("a2-13", "Salud y deporte", "adverbs of manner; how often; play / go / do + sport", "body, training, triathlon, injuries", "talk about your training and how you feel", "the sound /h/: heart, hand, hill"),
  u("a2-14", "Contar una historia", "linkers: and, but, because, so, then, after that, first, finally", "storytelling expressions", "tell a short story in order", "sentence stress: content words"),
  exam("A2", "Examen de nivel A2"),

  // ---------------- B1 ----------------
  u("b1-01", "Present perfect vs past simple", "present perfect vs past simple; for/since; already/yet/just", "work achievements, career", "talk about your professional experience", "contractions 've and 's"),
  u("b1-02", "¿Cuánto tiempo llevas...?", "present perfect continuous: how long have you been ...?", "projects, habits, hobbies", "explain what you have been working on", "been /bɪn/ in fast speech"),
  u("b1-03", "Estaba haciendo... cuando", "past continuous; past continuous vs past simple (when/while)", "incidents and accidents", "tell a story with background and action", "was /wəz/ in connected speech"),
  u("b1-04", "Antes solía...", "used to and would for past habits", "childhood, life changes", "compare your life before and now", "used to /juːstə/"),
  u("b1-05", "Si pasa esto...", "first conditional; time clauses with when / unless / as soon as / until", "IT risks, backups, planning", "talk about consequences and contingency plans", "intonation in conditional sentences"),
  u("b1-06", "¿Qué harías si...?", "second conditional: if I had..., I would...", "dreams, hypothetical situations", "talk about imaginary situations", "would /wʊd/ and the 'd contraction"),
  u("b1-07", "La voz pasiva", "present simple and past simple passive; by + agent", "processes, technology, manufacturing", "explain how a process works (e.g. a backup)", "was/were + participle in fast speech"),
  u("b1-08", "Phrasal verbs de trabajo", "common phrasal verbs and their grammar (separable/inseparable)", "set up, back up, shut down, log in, figure out, run out of, turn on/off", "explain technical tasks in simple English", "stress on the particle: set UP, back UP"),
  u("b1-09", "Contar lo que dijo alguien", "reported speech: say/tell/ask, backshift of tenses", "meetings, messages", "report what someone said in a meeting", "told /təʊld/, said /sed/"),
  u("b1-10", "Gerundio o infinitivo", "verb patterns: enjoy doing, want to do, stop doing / stop to do, remember/try", "goals, hobbies", "talk about goals and preferences", "linking -ing to the next word"),
  u("b1-11", "Explicar qué es algo", "defining relative clauses: who, which, that, where, whose", "definitions, tech terms", "explain what something is or does", "linking words in a relative clause"),
  u("b1-12", "Puede que...", "may / might / could for possibility; probably / definitely", "uncertain plans, forecasts", "speculate about the future", "might /maɪt/"),
  u("b1-13", "Opinar y debatir", "giving opinions; agreeing and disagreeing; so do I / neither do I", "opinion phrases, meetings", "give your opinion in a meeting", "polite intonation"),
  u("b1-14", "Cuantificadores", "a lot of, much/many, few/little, a few/a little, too much / too many, enough", "resources, problems, city life", "describe problems and resources at work", "weak forms in quantifiers"),
  u("b1-15", "Preguntar con educación", "indirect questions: Could you tell me where...? Do you know if...?", "customer service, offices", "ask questions politely to a supplier or a stranger", "rising intonation in polite questions"),
  u("b1-16", "Contar una anécdota", "past perfect for sequence (had done); narrative tenses introduction", "anecdotes, emotions", "tell a complete anecdote", "had /həd/ and 'd"),
  exam("B1", "Examen de nivel B1"),

  // ---------------- B2 ----------------
  u("b2-01", "Tiempos narrativos", "past simple, past continuous, past perfect and past perfect continuous together", "storytelling, emotions", "tell a rich story with background and sequence", "contractions and weak forms in narratives"),
  u("b2-02", "Plazos y objetivos", "future continuous, future perfect, be about to, be due to", "projects, deadlines, migrations", "talk about deadlines and project milestones", "will have /wɪləv/"),
  u("b2-03", "Si hubiera...", "third conditional: if I had known, I would have...", "mistakes, incidents, post-mortems", "analyse what could have gone better after an incident", "would've /wʊdəv/, wouldn't have"),
  u("b2-04", "Ojalá...", "mixed conditionals; wish / if only + past simple / past perfect / would", "regrets, wishes, complaints", "talk about wishes and regrets", "wish /wɪʃ/ and sentence stress"),
  u("b2-05", "Deducir: must have / can't have", "modals of deduction in the present and past: must / might / can't (have done)", "troubleshooting, causes", "deduce the cause of a system failure", "must have /mʌstəv/, can't have"),
  u("b2-06", "Pasiva avanzada y causativa", "have/get something done; passive with modals; it is said that...", "services, maintenance, contracts", "explain what you had done by a supplier", "sentence stress in passives"),
  u("b2-07", "Verbos para resumir", "reporting verbs: suggest, recommend, warn, deny, admit, agree + patterns", "meetings, clients", "summarise a meeting for your boss", "word stress in reporting verbs"),
  u("b2-08", "Descripciones complejas", "non-defining relative clauses; participle clauses (reduced relatives)", "systems, people, companies", "describe a system or a person in detail", "pausing with commas"),
  u("b2-09", "Argumentar", "linkers of contrast and cause: although, despite, however, whereas, due to, therefore", "pros and cons, decisions", "argue for and against a proposal", "linking and pausing"),
  u("b2-10", "Phrasal verbs avanzados", "phrasal verbs for work: bring up, carry out, come up with, deal with, put off, look into, get back to", "management, suppliers", "manage a problem with a supplier", "stress in three-part phrasal verbs"),
  u("b2-11", "Inglés de reuniones", "collocations: make a decision, meet a deadline, take into account, raise an issue", "business meetings, negotiation", "negotiate in a meeting", "chunking: saying expressions as one unit"),
  u("b2-12", "Enfatizar", "cleft sentences (What I need is...), do/does for emphasis, basic inversion (Not only..., Never have I...)", "presentations, proposals", "present a proposal with emphasis", "contrastive stress"),
  u("b2-13", "Sonar natural y diplomático", "softening and vague language: sort of, kind of, I'd say, it seems that, tend to", "natural conversation, diplomacy", "disagree diplomatically and sound natural", "fillers and hesitation in natural speech"),
  u("b2-14", "Acostumbrarse", "used to vs be used to vs get used to; keep doing", "change, adaptation", "talk about adapting to a new job or place", "used to vs be used to"),
  u("b2-15", "Presentaciones técnicas", "signposting (firstly, moving on, to sum up); describing graphs and trends", "presentations, data, trends", "present a technical report", "intonation in lists"),
  u("b2-16", "Conversación fluida", "interrupting politely, turn-taking, common idioms and expressions", "discussion, everyday idioms", "keep a 5-minute discussion going", "rhythm and connected speech"),
  exam("B2", "Examen de nivel B2"),

  // ---------------- C1 ----------------
  u("c1-01", "Matices de los tiempos verbales", "nuances of tenses: future in the past (was going to, was about to), present perfect simple vs continuous for emphasis, narrative present", "career, life events", "tell experiences with nuance and precision", "weak forms in complex verb phrases"),
  u("c1-02", "Inversión y énfasis", "inversion after negative adverbials (Rarely, Under no circumstances, Little did I know, Not until); fronting", "formal speech, presentations", "add emphasis when presenting an idea", "stress and rhythm in inverted sentences"),
  u("c1-03", "Condicionales avanzados", "inverted conditionals (Had I known, Should you need, Were it not for); provided that, as long as, supposing, otherwise", "contracts, negotiation", "negotiate conditions with a supplier", "intonation in conditional clauses"),
  u("c1-04", "Modales para criticar y lamentar", "should have / needn't have / could have; will/would for habits and assumptions; be bound to, be likely to", "decisions, evaluation", "evaluate past decisions with tact", "contracted modal perfects: should've, needn't've"),
  u("c1-05", "Pasiva impersonal y estilo de noticia", "impersonal passive (It is thought that..., He is believed to have...); get-passive; passive infinitives and gerunds", "news, reports, rumours", "report information with distance, like the news", "sentence stress in long passives"),
  u("c1-06", "Registro formal y sustantivación", "nominalisation, formal vs informal register, formal linking (furthermore, consequently, with regard to)", "reports, formal emails", "give a formal report out loud", "word stress shifts: decide/decision, analyse/analysis"),
  u("c1-07", "Phrasal verbs con varios significados", "phrasal verbs with multiple meanings (pick up, come across, turn out, take on, put across) and idioms at work", "work and everyday idioms", "speak naturally using idiomatic language", "linking in phrasal verbs"),
  u("c1-08", "Colocaciones avanzadas", "strong collocations: adverb + adjective (heavily dependent, bitterly disappointed), verb + noun (pose a threat, bridge the gap)", "precise vocabulary", "describe situations with precise vocabulary", "chunking collocations"),
  u("c1-09", "Lenguaje diplomático", "hedging and softening: it would appear, to some extent, arguably, I'm not entirely convinced; diplomatic disagreement", "management, feedback", "give difficult feedback tactfully", "tone and intonation for politeness"),
  u("c1-10", "Argumentar y rebatir", "concession and counter-argument: admittedly, granted, be that as it may, nonetheless, on the contrary; rhetorical questions", "debate", "defend a position and rebut objections", "intonation in contrast"),
  u("c1-11", "Cláusulas de participio", "participle clauses (Having finished..., Not knowing...), absolute clauses, reduced adverbial clauses", "processes, technical descriptions", "explain complex processes fluently", "pausing and chunking long sentences"),
  u("c1-12", "Contar lo que dicen otros con matices", "reporting with nuance: reportedly, allegedly, claimed, insisted, implied; reporting attitudes and opinions", "meetings, news", "summarise and evaluate what others said", "verb stress in reporting"),
  u("c1-13", "Hipótesis y preferencias", "it's high time, would rather / would sooner, suppose/imagine, as if / as though + unreal past", "future of technology, preferences", "speculate about the future of IT", "weak forms in unreal past"),
  u("c1-14", "Presentaciones que enganchan", "rhetorical devices: rule of three, signposting, contrast, engaging openings and closings", "presentations, storytelling", "give an engaging 5-minute talk", "pace, pause and emphasis"),
  u("c1-15", "Negociación avanzada", "persuading, handling objections, conditional offers, bargaining language", "negotiation, sales, support contracts", "negotiate a support contract renewal", "intonation for persuasion"),
  u("c1-16", "Acentos y habla rápida", "British vs American vs other accents; informal register and slang; understanding fast native speech", "culture, media, accents", "understand and adapt to different accents", "connected speech: elision and assimilation"),
  exam("C1", "Examen de nivel C1"),

  // ---------------- C2 ----------------
  u("c2-01", "Precisión gramatical total", "subjunctive (I suggest he be...), were to, mixed time reference; ellipsis and substitution (so, not, do so)", "formal and legal language", "express yourself with total grammatical precision", "rhythm in elliptical speech"),
  u("c2-02", "Registro, tono e ironía", "shifting register (formal, neutral, colloquial), understatement, irony and tone", "communication styles", "adapt your register to any situation", "intonation for irony and understatement"),
  u("c2-03", "Modismos y expresiones nativas", "idioms, proverbs, fixed expressions and metaphor", "culture, everyday native speech", "use and understand native idioms naturally", "stress in idiomatic expressions"),
  u("c2-04", "La palabra exacta", "near-synonyms (reluctant/unwilling, imply/infer), connotation, word formation with prefixes and suffixes", "precise vocabulary", "choose the exact word for each nuance", "word stress across word families"),
  u("c2-05", "Discurso largo y cohesión", "cohesive devices, referencing, thematisation and information structure", "long talks, explanations", "structure and deliver a long, coherent talk", "prosody across sentences"),
  u("c2-06", "Humor, ironía y sarcasmo", "understanding and using humour, sarcasm and wordplay", "social conversation", "understand native humour and joke naturally", "intonation and timing in humour"),
  u("c2-07", "Debate de alto nivel", "persuasion, rebuttal, steelmanning, managing aggressive interlocutors", "debate: AI, privacy, technology", "debate complex topics at a high level", "assertive but polite tone"),
  u("c2-08", "Explicar lo técnico a cualquiera", "explaining complex technical concepts to non-experts, analogies, precise technical register", "IT architecture, management", "explain an infrastructure project to the board", "clarity at natural speed"),
  u("c2-09", "Escuchar a nativos sin filtro", "fast speech, overlapping talk, reductions (gonna, wanna, dunno, gotta), regional accents", "podcasts, films, real conversations", "follow real native conversations", "reductions and weak forms"),
  u("c2-10", "Pragmática y cultura", "politeness strategies, indirectness, cultural references, mastering small talk", "cross-cultural communication", "move comfortably in any social situation", "pragmatic intonation"),
  u("c2-11", "Mediar y reformular", "paraphrasing, summarising, mediating between people, explaining others' points of view", "meetings, mediation", "summarise and mediate in a discussion", "fluent paraphrasing"),
  u("c2-12", "Fluidez nativa", "spontaneity, discourse markers (mind you, as it happens, come to think of it), holding long turns", "free discussion", "hold a 10-minute conversation without pauses", "natural rhythm and connected speech"),
  exam("C2", "Examen de nivel C2"),
];

export const UNIT_BY_ID = Object.fromEntries(UNITS.map((x) => [x.id, x]));
export const unitIndex = (id) => UNITS.findIndex((x) => x.id === id);
export const PASS_SCORE = 70; // % para aprobar el test de una unidad
