// Single source of truth for MCQ bulk-upload parsing.
// MCQ Practice and Mock Import must both call this parser so identical text
// always produces identical structured question rows.
//
// Extensions (non-breaking):
//  • Optional `Difficulty:` line — values Normal | Medium | Hard
//    (Normal maps to the existing "easy" enum). Difficulty is fully optional;
//    when missing the import behaves exactly as before.
//  • True/False questions written in the labeled "Question:/True/False/Answer:"
//    layout are parsed into the existing `true_false` question_type.
//  • Labeled layout where `Question:`, `Answer:`, `Difficulty:` and
//    `Explanation:` headings may live on their own lines.
// All previously supported formats keep parsing identically.

export type ParsedMcq = {
  question: string;
  question_type: "mcq" | "true_false";
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  explanation: string;
  /** Optional difficulty parsed from a `Difficulty:` line. Undefined when absent. */
  difficulty?: "easy" | "medium" | "hard";
  /** 1-based block position in the source text — assigned by parseMcqText. */
  sourceIndex?: number;
};

export type ParsedMcqInvalidBlock = { raw: string; reason: string; sourceIndex: number };

export type ParsedMcqResult = {
  cards: ParsedMcq[];
  invalidBlocks: ParsedMcqInvalidBlock[];
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// Recognise question-block starts. Accepts:
//  • numbered prefixes (1.  Q1.  Q.1)  — must have text on the same line
//  • Q:/Question: — text on same line OR label alone on its line
//  • TF:/True_False: shorthand prefix
const QUESTION_START_RE =
  /^\s*(?:(?:q(?:uestion)?\s*\.?\s*)?\d{1,4}[).:-]\s+\S|(?:q|question)\s*[:.)-](?:\s+\S|\s*$)|(?:tf|true[_\s/-]?false|t\/f)\s*[:.)-]\s+\S)/i;

function splitBlocks(input: string): string[] {
  const text = input.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (QUESTION_START_RE.test(line) && current.some((l) => l.trim())) {
      blocks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.some((l) => l.trim())) blocks.push(current.join("\n").trim());

  if (blocks.length > 1) return blocks.filter(Boolean);

  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const completeParagraphs = paragraphs.filter(looksLikeCompleteMcqBlock);
  if (paragraphs.length > 1 && completeParagraphs.length === paragraphs.length) return paragraphs;

  return [text];
}

function looksLikeCompleteMcqBlock(block: string): boolean {
  return (
    /(^|\n)\s*\(?A\)?\s*[).:-]/i.test(block) &&
    /(^|\n)\s*\(?B\)?\s*[).:-]/i.test(block) &&
    /(^|\n)\s*\(?C\)?\s*[).:-]/i.test(block) &&
    /(^|\n)\s*\(?D\)?\s*[).:-]/i.test(block) &&
    /(^|\n)\s*(?:answer|ans|correct(?:\s+answer)?|correct\s+option)\s*[:.)-]/i.test(block)
  );
}

function parseDifficulty(raw: string | undefined): "easy" | "medium" | "hard" | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase().trim();
  if (!t) return undefined;
  if (t.startsWith("normal") || t.startsWith("easy")) return "easy";
  if (t.startsWith("medium")) return "medium";
  // "Hard", "Difficult", "Tough" all map to the existing "hard" enum value.
  // We never create a new "difficult" enum — it is normalized here.
  if (t.startsWith("hard") || t.startsWith("difficult") || t.startsWith("tough")) return "hard";
  return undefined;
}

/**
 * Labeled-section parser. Handles the new layouts where headings such as
 * `Question:`, `Answer:`, `Difficulty:`, `Explanation:` may sit on their own
 * line and where True/False options are written as plain `True` / `False`
 * lines instead of `A./B.` markers.
 *
 * Returns null when the block doesn't look labeled — the caller then falls
 * back to the legacy parser so existing formats keep their exact behavior.
 */
function tryLabeledParse(text: string): { mcq: ParsedMcq | null; reason?: string } | null {
  const hasQuestionLabel =
    /^\s*(?:q|question)\s*[:.)-]\s*$/im.test(text) ||
    /^\s*(?:q|question)\s*[:.)-]\s+\S/im.test(text);
  const hasTrueLine = /^\s*true\s*$/im.test(text);
  const hasFalseLine = /^\s*false\s*$/im.test(text);
  const hasAnswerLabel = /^\s*(?:correct\s+answer|correct\s+option|answer|ans)\s*[:.)-]/im.test(
    text,
  );
  const looksTF = hasTrueLine && hasFalseLine;
  if (!hasAnswerLabel) return null;
  if (!hasQuestionLabel && !looksTF) return null;

  const lines = text.split("\n");
  const buckets: Record<"prelude" | "question" | "answer" | "explanation", string[]> = {
    prelude: [],
    question: [],
    answer: [],
    explanation: [],
  };
  const options: { letter: "A" | "B" | "C" | "D"; lines: string[] }[] = [];
  let current: { kind: "bucket" | "option"; ref: string[] } = {
    kind: "bucket",
    ref: buckets.prelude,
  };

  const labelMatchers: Array<{ key: keyof typeof buckets; re: RegExp }> = [
    { key: "question", re: /^\s*(?:q|question)\s*[:.)-]\s*(.*)$/i },
    {
      key: "answer",
      re: /^\s*(?:correct\s+answer|correct\s+option|answer|ans)\s*[:.)-]\s*(.*)$/i,
    },
    { key: "explanation", re: /^\s*(?:explanation|explain|solution|reason)\s*[:.)-]\s*(.*)$/i },
  ];

  for (const rawLine of lines) {
    let consumed = false;

    for (const lm of labelMatchers) {
      const m = lm.re.exec(rawLine);
      if (m) {
        buckets[lm.key] = [];
        current = { kind: "bucket", ref: buckets[lm.key] };
        if (m[1] && m[1].trim()) current.ref.push(m[1]);
        consumed = true;
        break;
      }
    }
    if (consumed) continue;

    const abcdM = /^\s*\(?([A-Da-d])\)?\s*[).:-]\s*(.*)$/.exec(rawLine);
    if (abcdM) {
      const letter = abcdM[1].toUpperCase() as "A" | "B" | "C" | "D";
      const entry = { letter, lines: [abcdM[2]] };
      options.push(entry);
      current = { kind: "option", ref: entry.lines };
      continue;
    }

    // Standalone True/False option lines — recognise whenever we're not
    // collecting the answer / explanation. Each TF line always starts a fresh
    // option (so `False` never gets appended to the previous `True` option).
    if (current.ref !== buckets.answer && current.ref !== buckets.explanation) {
      const tfM = /^\s*(true|false)\s*$/i.exec(rawLine);
      if (tfM) {
        const isTrue = tfM[1].toLowerCase() === "true";
        const entry = {
          letter: (isTrue ? "A" : "B") as "A" | "B" | "C" | "D",
          lines: [isTrue ? "True" : "False"],
        };
        options.push(entry);
        current = { kind: "option", ref: entry.lines };
        continue;
      }
    }

    current.ref.push(rawLine);
  }

  const questionText = norm(
    (buckets.question.length ? buckets.question : buckets.prelude).join("\n"),
  );
  if (!questionText) return { mcq: null, reason: "Missing question text" };

  const answerRaw = norm(buckets.answer.join(" "));
  if (!answerRaw) return { mcq: null, reason: "Missing answer" };

  const explanationText = buckets.explanation
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
    .trimEnd();
  const explanationOut = explanationText ? explanationText.slice(0, 4000) : "";

  // T/F detection
  const tfOptions =
    options.length === 2 && options.every((o) => /^(true|false)$/i.test(o.lines.join(" ").trim()));
  if (tfOptions) {
    const a = answerRaw.toLowerCase().replace(/[^a-z]/g, "");
    let correct: "A" | "B" | null = null;
    if (a === "true" || a === "t" || a === "a") correct = "A";
    else if (a === "false" || a === "f" || a === "b") correct = "B";
    if (!correct)
      return { mcq: null, reason: `Could not resolve True/False answer "${answerRaw}"` };
    return {
      mcq: {
        question: questionText.slice(0, 4000),
        question_type: "true_false",
        option_a: "True",
        option_b: "False",
        option_c: "",
        option_d: "",
        correct_option: correct,
        explanation: explanationOut,
      },
    };
  }

  // MCQ — need exactly 4 options A–D, in order.
  const opts: Record<"A" | "B" | "C" | "D", string> = { A: "", B: "", C: "", D: "" };
  for (const o of options) {
    if (!opts[o.letter]) opts[o.letter] = norm(o.lines.join("\n"));
  }
  if (!opts.A || !opts.B || !opts.C || !opts.D) {
    return { mcq: null, reason: "Need 4 options A–D" };
  }

  let correct: "A" | "B" | "C" | "D" | null = null;
  const letterMatch = answerRaw.match(/^(?:\(|\[)?([A-Da-d])(?:\)|\]|[.:])?$/);
  if (letterMatch) {
    correct = letterMatch[1].toUpperCase() as "A" | "B" | "C" | "D";
  } else {
    const ans = answerRaw.toLowerCase();
    for (const k of ["A", "B", "C", "D"] as const) {
      if (opts[k].toLowerCase() === ans) {
        correct = k;
        break;
      }
    }
  }
  if (!correct) return { mcq: null, reason: `Could not resolve answer "${answerRaw}"` };

  return {
    mcq: {
      question: questionText.slice(0, 4000),
      question_type: "mcq",
      option_a: opts.A.slice(0, 1000),
      option_b: opts.B.slice(0, 1000),
      option_c: opts.C.slice(0, 1000),
      option_d: opts.D.slice(0, 1000),
      correct_option: correct,
      explanation: explanationOut,
    },
  };
}

function legacyParseBlock(raw: string): { mcq: ParsedMcq | null; reason?: string } {
  const stripped = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*(?:q|question)\s*[:.)-]\s*/i, "")
    .replace(/^\s*Q(?:uestion)?\s*\.?\s*\d{1,4}[).:-]?\s*/i, "")
    .replace(/^\s*\d{1,4}[).:-]\s*/i, "")
    .trim();
  if (!stripped) return { mcq: null, reason: "Empty question block" };

  const tfHead = stripped.match(/^\s*(?:tf|true[_\s/-]?false|t\/f)\s*[:.)-]\s*([\s\S]+)$/i);
  if (tfHead) {
    const body = tfHead[1];
    const ansM = body.match(
      /(?:^|\n)\s*(?:answer|ans|correct(?:\s+answer)?|correct\s+option)\s*[:.)-]\s*([^\n]+)/i,
    );
    const expM = body.match(
      /(?:^|\n)\s*(?:explanation|explain|solution|reason)\s*[:.)-]\s*([\s\S]*)$/i,
    );
    if (!ansM) return { mcq: null, reason: "True/False missing answer" };
    const cuts = [ansM.index, expM?.index].filter((x): x is number => typeof x === "number");
    const tfQuestion = norm(body.slice(0, cuts.length ? Math.min(...cuts) : body.length));
    const a = ansM[1].toLowerCase().replace(/[^a-z]/g, "");
    const correct: "A" | "B" =
      a === "true" || a === "t" || a === "a"
        ? "A"
        : a === "false" || a === "f" || a === "b"
          ? "B"
          : "A";
    if (!["true", "t", "a", "false", "f", "b"].includes(a))
      return { mcq: null, reason: `Could not resolve True/False answer "${ansM[1].trim()}"` };
    return {
      mcq: {
        question: tfQuestion.slice(0, 4000),
        question_type: "true_false",
        option_a: "True",
        option_b: "False",
        option_c: "",
        option_d: "",
        correct_option: correct,
        explanation: norm(expM?.[1] ?? "").slice(0, 4000),
      },
    };
  }

  const optRe = /(^|\n)[ \t]*\(?([A-Da-d])\)?[ \t]*[).:-][ \t]*/g;
  const markers: { letter: "A" | "B" | "C" | "D"; index: number; matchLen: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = optRe.exec(stripped)) !== null) {
    markers.push({
      letter: match[2].toUpperCase() as "A" | "B" | "C" | "D",
      index: match.index + match[1].length,
      matchLen: match[0].length - match[1].length,
    });
  }

  const firstOf = (letter: "A" | "B" | "C" | "D") => markers.find((m) => m.letter === letter);
  const mA = firstOf("A");
  const mB = firstOf("B");
  const mC = firstOf("C");
  const mD = firstOf("D");
  if (
    !mA ||
    !mB ||
    !mC ||
    !mD ||
    !(mA.index < mB.index && mB.index < mC.index && mC.index < mD.index)
  ) {
    return { mcq: null, reason: "Need 4 options A–D" };
  }

  const question = norm(stripped.slice(0, mA.index));
  if (!question) return { mcq: null, reason: "Missing question text" };

  const afterD = stripped.slice(mD.index + mD.matchLen);
  const ansRe =
    /(?:^|\n)[ \t]*(?:answer|ans|correct(?:\s+answer)?|correct\s+option)\s*[:.)-]?\s*(.+?)(?=\n\s*(?:explanation|explain|solution|reason)\s*[:.)-]|$)/i;
  const expRe = /(?:^|\n)\s*(?:explanation|explain|solution|reason)\s*[:.)-]\s*([\s\S]*)$/i;
  const ansMatch = ansRe.exec(afterD);
  const expMatch = expRe.exec(afterD);
  if (!ansMatch) return { mcq: null, reason: "Missing answer" };

  const cuts = [ansMatch.index, expMatch?.index].filter((x): x is number => typeof x === "number");
  const optionD = afterD.slice(0, cuts.length ? Math.min(...cuts) : afterD.length);
  const between = (a: typeof mA, b: typeof mA) => stripped.slice(a.index + a.matchLen, b.index);
  const opts = {
    A: norm(between(mA, mB)),
    B: norm(between(mB, mC)),
    C: norm(between(mC, mD)),
    D: norm(optionD),
  };
  if (!opts.A || !opts.B || !opts.C || !opts.D) return { mcq: null, reason: "Need 4 options A–D" };

  let correct: "A" | "B" | "C" | "D" | null = null;
  const answer = norm(ansMatch[1]);
  const letter = answer.match(/^(?:\(|\[)?([A-Da-d])(?:\)|\]|[.:])?$/);
  if (letter) {
    correct = letter[1].toUpperCase() as "A" | "B" | "C" | "D";
  } else {
    const a = answer.toLowerCase();
    for (const k of ["A", "B", "C", "D"] as const) {
      if (opts[k].toLowerCase() === a) {
        correct = k;
        break;
      }
    }
  }
  if (!correct) return { mcq: null, reason: `Could not resolve answer "${answer}"` };

  return {
    mcq: {
      question: question.slice(0, 4000),
      question_type: "mcq",
      option_a: opts.A.slice(0, 1000),
      option_b: opts.B.slice(0, 1000),
      option_c: opts.C.slice(0, 1000),
      option_d: opts.D.slice(0, 1000),
      correct_option: correct,
      explanation: norm(expMatch?.[1] ?? "").slice(0, 4000),
    },
  };
}

function parseBlock(raw: string): { mcq: ParsedMcq | null; reason?: string } {
  let text = raw.replace(/\r\n?/g, "\n");

  // Pull out an optional `Difficulty:` line — supports value on same line or
  // on the following line. Removing it from the text means downstream parsers
  // (legacy + labeled) keep their existing answer/explanation handling intact.
  let difficulty: "easy" | "medium" | "hard" | undefined;
  const sameLineDiff = /(^|\n)([ \t]*difficulty[ \t]*[:.)-][ \t]*)([^\n]*)(\n?)/i.exec(text);
  if (sameLineDiff) {
    const valueOnLine = sameLineDiff[3].trim();
    if (valueOnLine) {
      difficulty = parseDifficulty(valueOnLine);
      const startCut = sameLineDiff.index + (sameLineDiff[1] ? 1 : 0);
      const endCut = sameLineDiff.index + sameLineDiff[0].length;
      text = text.slice(0, startCut) + text.slice(endCut);
    } else {
      // Value is on the next non-empty line ("Difficulty:\nNormal")
      const afterLabelIdx = sameLineDiff.index + sameLineDiff[0].length;
      const rest = text.slice(afterLabelIdx);
      const nextLineM = /^\s*\n*([^\n]+)\n?/.exec(rest);
      if (nextLineM) {
        difficulty = parseDifficulty(nextLineM[1].trim());
        const startCut = sameLineDiff.index + (sameLineDiff[1] ? 1 : 0);
        const endCut = afterLabelIdx + nextLineM[0].length;
        text = text.slice(0, startCut) + text.slice(endCut);
      }
    }
  }

  const labeled = tryLabeledParse(text);
  if (labeled && labeled.mcq) {
    if (difficulty) labeled.mcq.difficulty = difficulty;
    return labeled;
  }

  const legacy = legacyParseBlock(text);
  if (legacy.mcq && difficulty) legacy.mcq.difficulty = difficulty;
  return legacy;
}

export function parseMcqText(input: string): ParsedMcqResult {
  const blocks = splitBlocks(input ?? "");
  const cards: ParsedMcq[] = [];
  const invalidBlocks: ParsedMcqInvalidBlock[] = [];
  blocks.forEach((b, idx) => {
    const sourceIndex = idx + 1;
    const { mcq, reason } = parseBlock(b);
    if (mcq) {
      mcq.sourceIndex = sourceIndex;
      cards.push(mcq);
    } else {
      invalidBlocks.push({ raw: b, reason: reason ?? "Unparseable", sourceIndex });
    }
  });
  return { cards, invalidBlocks };
}

/**
 * Normalize text for duplicate detection.
 *
 * The duplicate rule is intentionally strict: only whitespace, blank-line and
 * line-ending differences are ignored. Punctuation, symbols, Bengali vowel
 * marks, Roman numerals and all other text content must remain part of the
 * identity so similar-looking questions do not collide.
 */
function normalizeForFingerprint(s: string): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Normalize a question for duplicate detection.
 *
 * Back-compat overload: callers that only have the question text still work,
 * but new code should pass the full MCQ shape so duplicates are based on the
 * exact question + A/B/C/D identity after whitespace normalization.
 */
export function fingerprintQuestion(
  input:
    | string
    | {
        question: string;
        option_a?: string | null;
        option_b?: string | null;
        option_c?: string | null;
        option_d?: string | null;
      },
): string {
  if (typeof input === "string") return normalizeForFingerprint(input);
  const parts = [
    input.question,
    input.option_a ?? "",
    input.option_b ?? "",
    input.option_c ?? "",
    input.option_d ?? "",
  ];
  return JSON.stringify(parts.map(normalizeForFingerprint));
}
