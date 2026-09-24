// Where to cut live speech text into caption pieces, so each piece can be
// translated while the person keeps talking. Cuts only happen between whole
// words, right after punctuation the transcription already added, and only
// once a couple more words have come (so that part of the text is settled).

// Words that must follow a cut before we trust the text before it
const SETTLED_WORDS = 2;
// A comma/semicolon piece needs at least this many words (avoids "Olá,")
const MIN_CLAUSE_WORDS = 4;
// No punctuation for this long: cut anyway, between words...
const MAX_PIECE_WORDS = 14;
// ...but never leave a piece hanging on a small word like "de" or "para"
const MIN_FORCED_WORDS = 8;
// Portuguese and Spanish articles, prepositions and conjunctions
const LINKING_WORDS = new Set(
  (
    "a o as os um uma uns umas de da do das dos em na no nas nos para " +
    "pra por pelo pela com que e ou mas se el la los las un unos unas " +
    "del al en y con sin lo le les mi tu su muy más sobre entre até sem " +
    "como quando porque pois hasta cuando pero ni muito mais menos este " +
    "esta esse essa meu minha seu sua nosso nossa"
  ).split(" "),
);

// "Dra." or "Sr." end with a dot but don't end a sentence
const ABBREVIATION =
  /^(dr|dra|sr|sra|srta|prof|profa|av|lic|ing|ud|uds|etc)\.$/i;
const SENTENCE_END = /[.?!…]["')»]*$/;
const CLAUSE_END = /[,;:]["')»]*$/;

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

// How many of the unsent words make up the next piece (0 = not yet)
export function findCut(words: string[]): number {
  let cut = 0;
  for (let i = 0; i < words.length - SETTLED_WORDS; i++) {
    const word = words[i];
    const size = i + 1;
    const endsSentence =
      SENTENCE_END.test(word) && !ABBREVIATION.test(word) && size >= 2;
    const endsClause = CLAUSE_END.test(word) && size >= MIN_CLAUSE_WORDS;
    if (endsSentence || endsClause) cut = size;
  }
  if (cut === 0 && words.length >= MAX_PIECE_WORDS) {
    cut = words.length - SETTLED_WORDS;
    while (
      cut > MIN_FORCED_WORDS &&
      LINKING_WORDS.has(words[cut - 1].toLowerCase())
    ) {
      cut--;
    }
  }
  return cut;
}
