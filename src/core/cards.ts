import { compoundFor, valueOf } from './numbers'
import type { Note } from './types'

// ---------------------------------------------------------------------------
// One note expands into several cards. A card is a *question type* about a
// note, not a question itself — the wording lives in session/prompts.ts so the
// UI can present the same card however it likes.
// ---------------------------------------------------------------------------

export type CardType =
  | 'recognize' // nl -> en
  | 'recall' // en -> nl
  | 'gender' // de or het?
  | 'plural' // what's the plural?
  | 'participle' // past participle
  | 'auxiliary' // hebben or zijn?
  | 'cloze' // which word fills this gap?
  | 'number' // the digits, said in Dutch
  | 'compound' // and the two-digit ones, which run backwards

export interface Card {
  id: string
  noteId: string
  type: CardType
}

/** Cards that introduce a word. Everything else is gated behind these. */
export const CORE_TYPES: CardType[] = ['recognize', 'recall']

export function cardId(noteId: string, type: CardType): string {
  return `${noteId}::${type}`
}

/**
 * Matches the word only as a whole word, so blanking "in" doesn't gut
 * "binnen". \P{L} is "not a letter", which handles Dutch accents correctly
 * where \b and [a-z] would not.
 */
function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\P{L})(${escaped})(\\P{L}|$)`, 'iu')
}

/**
 * The example sentence a gap-fill card is built from — the word's own
 * sentence, with the word appearing in exactly the form we'd blank out.
 */
export function clozeSource(note: Note): { nl: string; en: string } | null {
  for (const ex of note.examples ?? []) {
    if (wordPattern(note.nl).test(ex.nl)) return ex
  }
  return null
}

export function blankOut(sentence: string, word: string): string {
  return sentence.replace(wordPattern(word), (_m, before, _w, after) => `${before}____${after}`)
}

/** The sentence split around the word, so the UI can fill it back in place. */
export function splitAroundWord(
  sentence: string,
  word: string,
): { before: string; match: string; after: string } | null {
  const m = wordPattern(word).exec(sentence)
  if (!m) return null
  const start = m.index + m[1].length
  const end = start + m[2].length
  return {
    before: sentence.slice(0, start),
    match: sentence.slice(start, end),
    after: sentence.slice(end),
  }
}

/**
 * Deterministic: the same note always produces the same cards with the same
 * ids, so regenerating after a content edit never disturbs saved progress.
 *
 * Deliberately conservative — we only add a grammar card when the answer is
 * genuinely unpredictable. Drilling regular plurals is busywork.
 */
export function cardsForNote(note: Note): Card[] {
  const types: CardType[] = ['recognize', 'recall']

  if (note.pos === 'noun') {
    if (note.gender) types.push('gender')
    if (note.plural && note.irregularPlural) types.push('plural')
  }

  if (note.verb) {
    if (note.verb.irregular || note.verb.separable) types.push('participle')
    // "hebben" is the default and "both" is too conditional to drill, so only
    // the zijn verbs get asked — and only where the auxiliary is known.
    if (!note.verb.auxiliaryUnknown && note.verb.auxiliary === 'zijn') types.push('auxiliary')
  }

  // A number word also teaches the number. Knowing that `zeven` means seven
  // is not the same as being able to say 7 when it is in front of you, and
  // the second one is what you need at a till.
  if (note.pos === 'num') {
    const value = valueOf(note.nl)
    if (value !== null) {
      types.push('number')
      // And each tens word carries its own decade's compound, which is where
      // the rule lives: 47 is seven-and-forty, backwards from English.
      if (compoundFor(value) !== null) types.push('compound')
    }
  }

  // A gap-fill needs a sentence containing the word itself, and a word whose
  // gap the sentence can actually decide.
  if (!note.noCloze && clozeSource(note)) types.push('cloze')

  return types.map((type) => ({ id: cardId(note.id, type), noteId: note.id, type }))
}

export function allCards(notes: Note[]): Card[] {
  return notes.flatMap(cardsForNote)
}
