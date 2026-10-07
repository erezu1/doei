// ---------------------------------------------------------------------------
// Gives every word more than one sentence — and a sentence per question.
//
// The deck is built with one example each, picked for the WORD. A card asks
// about something narrower, and the sentence usually knows nothing about it:
// of 1,259 nouns with a gender, 337 had a sentence showing the article; of 332
// verbs, 11 showed the participle; of 1,104 plurals, 16 showed the plural. The
// app now declines to show a sentence that doesn't contain what was asked
// (session/prompts.ts), which is honest and leaves most of those cards bare.
//
// The sentences exist. build-deck.mjs reads 85,000 Tatoeba pairs, keeps the
// best three per word and writes one. This adds the rest, and chooses them for
// the questions the deck will ask:
//
//   de or het?          a sentence containing "de hond", not "hond"
//   the past participle a sentence containing "gelopen"
//   the plural          a sentence containing "honden"
//   everything else     a sentence containing the word, in any of its forms
//
// then fills what's left with variety, so a word that comes round twenty times
// is not read the same way twenty times.
//
// Separate from build-deck.mjs because a full rebuild needs the Wiktionary
// dump and the frequency list; this needs the sentences alone, and runs
// against the deck as it stands — curated examples included, which are kept
// first and never replaced. Re-running is safe: it only ever adds, and it adds
// the same ones. Run apply-curation.mjs after a rebuild and then this.
//
// Every sentence the app can say is recorded by scripts/make-audio.py, which
// records only what is new — so run that afterwards or the new sentences will
// be read by the phone's own voice.
//
// Run:  node scripts/more-sentences.mjs <data-dir>   # holding nld.txt, nl_50k.txt
// ---------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DATA = process.argv[2]
if (!DATA) {
  console.error('usage: node scripts/more-sentences.mjs <data-dir>')
  process.exit(1)
}

const DECK = 'src/content/deck-core.json'

/** Sentences per note. Three is two more than it had, and one more than the
 *  duties below can claim; past that the audio costs more than the variety
 *  is worth. */
const CAP = 3
/** Words outside the frequency list, treated as rarer than anything in it. */
const UNKNOWN = 60000

const norm = (s) => s.toLowerCase().normalize('NFC')
const tokenize = (s) =>
  norm(s)
    .replace(/[^a-zà-ÿ' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** \P{L} rather than \b: Dutch has accents, and \b doesn't know about them. */
const shows = (sentence, form) =>
  new RegExp(`(^|\\P{L})${escape(form)}(\\P{L}|$)`, 'iu').test(sentence)

/**
 * Tatoeba is one fifth Tom: 18,429 of its 85,000 Dutch sentences are about
 * him, Mary or Boston. One here and there is fine — a hundred of them read
 * like a soap opera, and none of them teach a word you need. Pushed to the
 * back rather than thrown away, so a word whose only sentence has Tom in it
 * still gets one.
 */
const CAST = /(^|\P{L})(tom|mary|maria|john|jim|ken|boston|johnny)(\P{L}|$)/iu

/**
 * What the word means, in the shape the English side of a sentence would say
 * it: "to walk" and "a house" are how a dictionary writes them, "walk" and
 * "house" are how a sentence does.
 */
function glosses(note) {
  const out = []
  for (const gloss of note.en) {
    for (const part of gloss.replace(/\([^)]*\)/g, '').split(/\s*[/;,]\s*/)) {
      const head = part
        .trim()
        .toLowerCase()
        .replace(/^(to|a|an|the)\s+/, '')
      if (head) out.push(head)
    }
  }
  return out
}

/**
 * Whether the English of a sentence says what the word means.
 *
 * Dutch spellings carry more than one word: "zijn" is both "his" and "to be",
 * "weer" is "again" and "weather", "bank" is a bench and a bank. Matching on
 * the Dutch alone, "his" collected "Ze zijn er niet." — a sentence that is not
 * about his anything. The English is the check, and it is free: every pair is
 * a translation, so if the sentence meant "his", its English says "his".
 *
 * Loosely, because English inflects too: four letters of the stem, so "walk"
 * finds "walks" and "walking", and short words have to match whole or "on"
 * would find "once".
 */
function mentions(english, heads) {
  const text = english.toLowerCase()
  for (const head of heads) {
    const word = head.split(/\s+/).pop()
    const stem = word.length > 5 ? word.slice(0, word.length - 2) : word
    const pattern =
      word.length > 5
        ? new RegExp(`(^|\\P{L})${escape(stem)}`, 'u')
        : new RegExp(`(^|\\P{L})${escape(word)}(\\P{L}|$)`, 'u')
    if (pattern.test(text)) return true
  }
  return false
}

async function loadRanks() {
  const raw = await readFile(path.join(DATA, 'nl_50k.txt'), 'utf8')
  const rank = new Map()
  let i = 0
  for (const line of raw.split('\n')) {
    const word = line.split(' ')[0]
    if (word) rank.set(norm(word), ++i)
  }
  return rank
}

/**
 * Every usable sentence, indexed by every word in it.
 *
 * "Usable" is the same test build-deck.mjs makes — three to eight words — and
 * the same ordering: easiest first, where a sentence is as hard as its rarest
 * word. A sentence you can almost read teaches the one word you can't.
 */
async function loadSentences(rank) {
  const raw = await readFile(path.join(DATA, 'nld.txt'), 'utf8')
  const byWord = new Map()
  const all = []

  for (const line of raw.split('\n')) {
    const [en, nl] = line.split('\t')
    if (!en || !nl) continue
    const words = tokenize(nl)
    if (words.length < 3 || words.length > 8) continue
    let hardest = 0
    for (const w of words) hardest = Math.max(hardest, rank.get(w) ?? UNKNOWN)
    const entry = {
      nl: nl.trim(),
      en: en.trim(),
      words: new Set(words),
      // Tom costs about as much as one unknown word, which is enough to lose
      // every contest he isn't the only entrant in.
      score: hardest + (CAST.test(nl) ? UNKNOWN : 0) + words.length,
    }
    const at = all.push(entry) - 1
    for (const w of entry.words) {
      const list = byWord.get(w)
      if (list) list.push(at)
      else byWord.set(w, [at])
    }
  }
  for (const list of byWord.values()) list.sort((a, b) => all[a].score - all[b].score)
  return { all, byWord }
}

/**
 * Two sentences count as the same lesson when most of their words are shared:
 * "Ik ga naar huis" and "Ik ga naar huis toe" are not variety.
 */
function tooAlike(a, b) {
  const shared = [...a].filter((w) => b.has(w)).length
  return shared / Math.min(a.size, b.size) > 0.7
}

async function main() {
  const rank = await loadRanks()
  const { all, byWord } = await loadSentences(rank)
  const deck = JSON.parse(await readFile(DECK, 'utf8'))

  const counts = { article: 0, participle: 0, plural: 0, variety: 0, unchecked: 0 }
  /** How many notes each spelling belongs to, for the ambiguous ones. */
  const spellings = new Map()
  for (const n of deck.notes) spellings.set(norm(n.nl), (spellings.get(norm(n.nl)) ?? 0) + 1)
  const before = { 0: 0, 1: 0, 2: 0, 3: 0 }
  const after = { 0: 0, 1: 0, 2: 0, 3: 0 }

  for (const note of deck.notes) {
    const existing = note.examples ?? []
    before[Math.min(existing.length, 3)]++

    const chosen = existing.map((e) => ({ ...e, words: new Set(tokenize(e.nl)) }))
    const taken = new Set(chosen.map((c) => norm(c.nl)))

    const heads = glosses(note)
    // A spelling two notes in the deck both claim is one the English must
    // settle: there is a card for each sense, and a sentence about the other
    // one is simply wrong on it.
    const ambiguous = (spellings.get(norm(note.nl)) ?? 0) > 1

    /** The best sentence showing `form` that isn't already here. */
    const add = (form, why) => {
      if (!form || chosen.length >= CAP) return false
      // Indexed by single words, so a phrase is looked up by its last word —
      // "de hond" by "hond" — and then matched whole.
      const key = norm(form.split(/\s+/).pop())
      let fallback = null
      for (const at of byWord.get(key) ?? []) {
        const s = all[at]
        if (taken.has(norm(s.nl))) continue
        if (!shows(s.nl, form)) continue
        if (chosen.some((c) => tooAlike(c.words, s.words))) continue
        // Sorted easiest first, so the first sentence whose English says what
        // the word means is both the plainest and the one on the right sense.
        if (mentions(s.en, heads)) {
          chosen.push({ nl: s.nl, en: s.en, words: s.words })
          taken.add(norm(s.nl))
          counts[why]++
          return true
        }
        fallback ??= s
      }
      if (!fallback || ambiguous) return false
      chosen.push({ nl: fallback.nl, en: fallback.en, words: fallback.words })
      taken.add(norm(fallback.nl))
      counts[why]++
      counts.unchecked++
      return true
    }

    // What the cards about this word will ask for, hardest to find first.
    const has = (form) => form && chosen.some((c) => shows(c.nl, form))
    const article = note.gender ? `${note.gender} ${note.nl}` : null
    const participle = note.verb?.participle ?? null
    const plural = note.plural ?? null

    if (article && !has(article)) add(article, 'article')
    if (participle && !has(participle)) add(participle, 'participle')
    if (plural && !has(plural)) add(plural, 'plural')

    // And then simply more of the word, for the cards that ask about the word
    // itself — which are the ones you see most.
    while (chosen.length < CAP && add(note.nl, 'variety'));

    after[Math.min(chosen.length, 3)]++
    if (chosen.length) note.examples = chosen.map(({ nl, en }) => ({ nl, en }))
  }

  const sentences = new Set(deck.notes.flatMap((n) => (n.examples ?? []).map((e) => e.nl)))
  console.log('sentences per note, before:', before, '\n                    after: ', after)
  console.log('added:', counts)
  console.log('distinct sentences in the deck:', sentences.size)

  await writeFile(DECK, JSON.stringify(deck, null, 1) + '\n')
}

main()
