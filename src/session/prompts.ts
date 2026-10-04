import { blankOut, clozeSource, type Card, type CardType } from '../core/cards'
import { compoundFor, nearNumbers, spell, valueOf } from '../core/numbers'
import type { Note } from '../core/types'

// ---------------------------------------------------------------------------
// A Prompt is everything the UI needs to show one question, in a shape that
// says nothing about *how* it looks. Swiping cards, buttons, a 3D flip — they
// all render the same Prompt. This is the seam the Phase 3 UI rewrite runs
// along, so nothing below this file should ever import from ../ui.
// ---------------------------------------------------------------------------

export type PromptShape =
  /** show question, tap to reveal, self-grade */
  | 'reveal'
  /** pick one of a few options; the app knows whether it was right */
  | 'choice'

export interface Prompt {
  cardId: string
  noteId: string
  cardType: CardType
  shape: PromptShape

  /** Small label: "wat betekent dit?", "de of het?" */
  instruction: string
  question: string
  questionLang: 'nl' | 'en'
  /** A sentence needs smaller type than a single word. */
  display?: 'word' | 'sentence'
  /** Disambiguates when a question alone is ambiguous, e.g. "(zelfstandig nw.)" */
  subtitle?: string

  answer: string
  answerLang: 'nl' | 'en'
  /**
   * The question as it reads once it has been answered — "tijd" becomes
   * "de tijd", "geweest" becomes "zijn geweest", a gapped sentence becomes
   * the whole one. Cards that have this complete their own question in place
   * instead of stating a separate answer underneath it, because the answer
   * only means anything attached to what was asked.
   *
   * It must contain `answer` as a whole word: that is the part picked out.
   */
  completion?: string
  /**
   * The answer written out, when what had to be matched was a shortened form
   * of it: one of a word's senses, picked from four options. The card states
   * this instead of the answer, rather than stating the answer and then
   * repeating it inside a fuller version underneath.
   */
  answerInFull?: string
  /**
   * The word's *other* senses — never the one that was asked. Asking "what is
   * 'little, few' in Dutch?" reads like a riddle; asking for "little" and then
   * saying it also means "few" teaches the same thing without the question
   * looking odd.
   */
  meaning?: string
  /** Extra context shown once revealed, e.g. an example sentence. */
  detail?: string
  detailTranslation?: string

  choices?: string[]
  /** What TTS should read out. Undefined when nothing Dutch is worth hearing. */
  speak?: string
  note: Note
}

// The interface is in English: the Dutch on screen should be the thing you're
// learning, not the furniture around it.
const posLabel: Record<string, string> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  phrase: 'phrase',
  num: 'numeral',
  pron: 'pronoun',
  det: 'determiner',
  conj: 'conjunction',
}

function example(note: Note) {
  const ex = note.examples?.[0]
  return { detail: ex?.nl, detailTranslation: ex?.en }
}

/**
 * The example sentence, but only when it contains the form the card is about.
 *
 * A word's example is written for the word, not for the question being asked
 * about it: of the 286 verbs with both a participle and a sentence, exactly 2
 * sentences contain the participle. So "What is the past participle? / zijn /
 * geweest" came with "Ik ben moe." underneath — a present-tense sentence, set
 * larger than anything else on the card, that shows neither the participle nor
 * the perfect tense and reads as if it were the point. Better nothing than a
 * sentence that contradicts the question.
 *
 * Kept for the cards where the sentence really is about the answer: knowing a
 * noun's gender is helped by seeing the noun in a sentence, whether or not the
 * article happens to be next to it.
 */
function exampleOf(note: Note, form: string | undefined) {
  if (!form) return {}
  const pattern = new RegExp(`\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  const ex = note.examples?.find((e) => pattern.test(e.nl))
  return ex ? { detail: ex.nl, detailTranslation: ex.en } : {}
}

export interface PromptContext {
  /** The whole deck, so we can draw plausible wrong answers from it. */
  notes: Note[]
  /**
   * True while the word is still being learned. Multiple choice is easier than
   * recalling from nothing, so we use it to introduce a word and switch to
   * free recall once it sticks.
   */
  introduce: boolean
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Wrong answers have to be plausible or the question answers itself. Prefer
 * words of the same kind and topic; fall back to same kind, then anything.
 */
/**
 * "this" and "this (het-word)" are different strings but the same option to
 * anyone reading them, so options are compared without their clarifier.
 */
const bare = (text: string) => text.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()

/**
 * Every sense a note can be read as, stripped down for comparing: "angry /
 * mad" and "very" become {angry, mad} and {very}.
 */
function senses(note: Note): Set<string> {
  const out = new Set<string>()
  for (const gloss of note.en) {
    // Clarifiers first, whole: "well (as in: well, …)" has a comma inside.
    for (const part of gloss.replace(/\([^)]*\)/g, '').split(/\s*[/;,]\s*/)) {
      const s = part
        .replace(/^(a|an|the)\s+/i, '')
        .trim()
        .toLowerCase()
      if (s) out.add(s)
    }
  }
  return out
}

/**
 * Two words that share a sense can't both be wrong answers to each other.
 * "zeer", "heel" and "erg" all mean "very": offered "Dat is ___ goed" with
 * "That is very good" underneath, all three are right, and whichever one the
 * card happens to be about, the other two are marked wrong.
 */
function overlaps(a: Note, b: Note): boolean {
  const mine = senses(a)
  for (const s of senses(b)) if (mine.has(s)) return true
  return false
}

/** How far along the course a wrong option may come from, either way. */
const NEARBY = 400

function distractors(
  note: Note,
  ctx: PromptContext,
  render: (n: Note) => string,
  count = 3,
): string[] {
  const correct = render(note)
  const candidates = ctx.notes.filter(
    (n) => n.id !== note.id && bare(render(n)) !== bare(correct) && !overlaps(note, n),
  )
  const tag = note.tags?.[0]

  // Options of wildly different lengths give the answer away — a distractor
  // three times longer than the rest is discarded on sight, without knowing
  // any Dutch. Keep them in the same rough size band as the answer.
  const maxLength = Math.max(18, correct.length * 2)
  const sized = candidates.filter((n) => render(n).length <= maxLength)

  // And words from about the same stretch of the course, so the options are
  // words at your level rather than anything in the deck: a card about "vlag"
  // in your first month shouldn't offer you the film vocabulary from the end.
  const near = (n: Note) => Math.abs((n.rank ?? 0) - (note.rank ?? 0)) <= NEARBY

  const tiers = [
    sized.filter((n) => n.pos === note.pos && tag && n.tags?.includes(tag)),
    sized.filter((n) => n.pos === note.pos && near(n)),
    sized.filter((n) => n.pos === note.pos),
    sized.filter(near),
    sized,
    candidates,
  ]

  const picked: string[] = []
  const taken = new Set([bare(correct)])
  for (const tier of tiers) {
    for (const n of shuffle(tier)) {
      const text = render(n)
      if (taken.has(bare(text))) continue
      taken.add(bare(text))
      picked.push(text)
      if (picked.length === count) return picked
    }
  }
  return picked
}

const firstGloss = (n: Note) => n.en[0]
const dutch = (n: Note) => n.nl

export function buildPrompt(card: Card, note: Note, ctx: PromptContext): Prompt {
  const base = {
    cardId: card.id,
    noteId: note.id,
    cardType: card.type,
    note,
  }

  switch (card.type) {
    case 'recognize': {
      const choice = ctx.introduce
      return {
        ...base,
        shape: choice ? 'choice' : 'reveal',
        instruction: 'What does this mean?',
        question: note.nl,
        questionLang: 'nl',
        subtitle: posLabel[note.pos],
        answer: choice ? firstGloss(note) : note.en.join(' · '),
        // Both shapes end up saying the same thing: every sense the word has.
        // One of them had to ask for a single sense to have something to put
        // on a button.
        answerInFull: note.en.length > 1 ? note.en.join(' · ') : undefined,
        answerLang: 'en',
        choices: choice
          ? shuffle([firstGloss(note), ...distractors(note, ctx, firstGloss)])
          : undefined,
        speak: note.nl,
        ...example(note),
      }
    }

    case 'recall': {
      const choice = ctx.introduce
      return {
        ...base,
        shape: choice ? 'choice' : 'reveal',
        instruction: 'How do you say this in Dutch?',
        // Only the main sense is asked. The rest comes after the answer.
        question: firstGloss(note),
        questionLang: 'en',
        subtitle: posLabel[note.pos],
        // Free recall shows the article too; multiple choice must not, or the
        // options would give away the gender answer elsewhere in the deck.
        answer: choice ? note.nl : note.gender ? `${note.gender} ${note.nl}` : note.nl,
        answerLang: 'nl',
        // The senses that weren't asked for. The one that was is the question
        // at the top of the card, so listing it again says nothing.
        meaning: note.en.length > 1 ? `also ${note.en.slice(1).join(' · ')}` : undefined,
        choices: choice ? shuffle([dutch(note), ...distractors(note, ctx, dutch)]) : undefined,
        speak: note.nl,
        ...example(note),
      }
    }

    case 'gender':
      return {
        ...base,
        shape: 'choice',
        instruction: 'de or het?',
        question: note.nl,
        questionLang: 'nl',
        answer: note.gender!,
        completion: `${note.gender} ${note.nl}`,
        answerLang: 'nl',
        choices: ['de', 'het'],
        speak: `${note.gender} ${note.nl}`,
        ...example(note),
      }

    case 'plural':
      return {
        ...base,
        shape: 'reveal',
        instruction: 'What is the plural?',
        question: `${note.gender ?? ''} ${note.nl}`.trim(),
        questionLang: 'nl',
        // Every Dutch plural is a de-word, whatever the singular was. Showing
        // "het huis" and answering "huizen" hides that, and reads as if the
        // article had simply been dropped; "het huis" answered "de huizen"
        // teaches the rule in passing, every time a het-word comes up.
        answer: note.gender ? `de ${note.plural}` : note.plural!,
        answerLang: 'nl',
        speak: note.gender ? `de ${note.plural}` : note.plural,
        ...exampleOf(note, note.plural),
      }

    case 'participle':
      return {
        ...base,
        shape: 'reveal',
        instruction: 'What is the past participle?',
        question: note.nl,
        questionLang: 'nl',
        // Which verb it is, since the sentence that used to say so is gone.
        subtitle: note.verb?.separable ? `separable · ${note.en[0]}` : note.en[0],
        // Just the participle. The question asks for one word, so answering
        // with "hebben gedaan" answers a question that wasn't asked — and the
        // helper is drilled by its own card anyway.
        answer: note.verb!.participle,
        answerLang: 'nl',
        speak: note.verb!.participle,
        ...exampleOf(note, note.verb!.participle),
      }

    case 'number':
    case 'compound': {
      // The question is the digits, which belong to no language: there is
      // nothing to read out and nothing to translate, only something to say.
      const value = valueOf(note.nl)!
      const n = card.type === 'compound' ? compoundFor(value)! : value
      const said = spell(n)
      const choice = ctx.introduce
      return {
        ...base,
        shape: choice ? 'choice' : 'reveal',
        instruction: 'How do you say this number?',
        question: String(n),
        questionLang: 'en',
        answer: said,
        answerLang: 'nl',
        // The mistakes you would actually make: the same digits the other way
        // round, a neighbouring ten, a neighbouring unit. Which also means
        // the options cannot be told apart by length or by shape.
        choices: choice ? shuffle([said, ...nearNumbers(n).map(spell)]) : undefined,
        speak: said,
        // Said with the answer, where it explains what just happened rather
        // than giving it away beforehand.
        meaning: card.type === 'compound' ? 'units first, then the ten' : undefined,
      }
    }

    case 'cloze': {
      const ex = clozeSource(note)!
      const choice = ctx.introduce
      return {
        ...base,
        shape: choice ? 'choice' : 'reveal',
        display: 'sentence',
        instruction: 'Which word fits the gap?',
        question: blankOut(ex.nl, note.nl),
        questionLang: 'nl',
        answer: note.nl,
        completion: ex.nl,
        answerLang: 'nl',
        // What the sentence means, from the start. Without it the gap is a
        // riddle with several answers: "___ huis is te duur" takes "dat",
        // "dit", "het", "mijn", "ons" and the card wants one of them. With
        // "That house is too expensive" under it, it takes one — and the
        // exercise becomes the useful one, finding the Dutch word for a
        // meaning you are given, in a sentence that shows how it is used.
        subtitle: ex.en,
        choices: choice ? shuffle([dutch(note), ...distractors(note, ctx, dutch)]) : undefined,
        // The full sentence gives the answer away, so it is only spoken once
        // the card has been answered.
        speak: ex.nl,
      }
    }

    case 'auxiliary': {
      const aux = note.verb!.auxiliary === 'both' ? 'hebben' : note.verb!.auxiliary
      return {
        ...base,
        shape: 'choice',
        instruction: 'hebben or zijn?',
        question: note.verb!.participle,
        questionLang: 'nl',
        subtitle: note.en[0],
        answer: aux,
        // The point of the card is the pair, so the pair is what you see.
        completion: `${aux} ${note.verb!.participle}`,
        answerLang: 'nl',
        choices: ['hebben', 'zijn'],
        speak: `${aux} ${note.verb!.participle}`,
        ...exampleOf(note, note.verb!.participle),
      }
    }
  }
}
