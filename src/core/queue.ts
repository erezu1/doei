import type { Card } from './cards'
import { cardId } from './cards'
import type { CardStateRow } from './db'
import { isNew, State } from './scheduler'

// ---------------------------------------------------------------------------
// What to study right now. Two jobs: pick the due cards, and hold back the
// grammar cards until the word itself is familiar — otherwise day one buries
// you under four questions per word.
// ---------------------------------------------------------------------------

export interface QueueOptions {
  /** New *words* per day. Counted in words, not cards — see buildQueue. */
  newPerDay: number
  /** Follow-up cards per day: the second questions about words you know. */
  followPerDay: number
  maxSession: number
  now: Date
  /**
   * Frequency rank of each note, 1 = most common. New words are introduced in
   * this order, so you learn useful words before obscure ones.
   */
  rankOf: Map<string, number>
  /**
   * Where in the frequency list new words start. Not a filter: words in front
   * of it come first, and the ones behind it follow once you catch up.
   */
  startRank: number
}

export const DEFAULTS: Pick<QueueOptions, 'newPerDay' | 'followPerDay' | 'maxSession'> = {
  newPerDay: 5,
  followPerDay: 11,
  maxSession: 32,
}

/**
 * A grammar card (de/het, plural, participle) only becomes eligible once the
 * word's own recognise card is out of learning. Knowing a noun's gender is
 * pointless before you know the noun.
 */
export function isUnlocked(card: Card, states: Map<string, CardStateRow>): boolean {
  if (card.type === 'recognize') return true
  const recognize = states.get(cardId(card.noteId, 'recognize'))
  if (card.type === 'recall') {
    // The reverse direction opens as soon as you've seen the word once.
    return !!recognize && recognize.reps > 0
  }
  return !!recognize && recognize.state === State.Review
}

/**
 * The daily budget is counted in *words*, not cards, and the follow-up
 * questions get their own. Counting cards meant a word's four questions all
 * came out of the same eight, so you met barely two new words a day — and the
 * de/het and plural cards, which sit behind every word's core cards in rank
 * order, were pushed back by months. Splitting the budgets means the grammar
 * questions arrive shortly after the word they are about.
 *
 * Within the follow-ups, the grammar cards go first: there are few of them and
 * each teaches something unpredictable, while almost every word has a gap-fill.
 */
const FOLLOW_ORDER: Record<Card['type'], number> = {
  recognize: 0,
  gender: 1,
  plural: 1,
  participle: 1,
  auxiliary: 1,
  // Few of them, and each teaches something you cannot guess — the same
  // reason the grammar cards go first.
  number: 1,
  compound: 1,
  recall: 2,
  cloze: 3,
}

export interface Queue {
  cards: Card[]
  dueCount: number
  newCount: number
}

export function buildQueue(
  cards: Card[],
  states: Map<string, CardStateRow>,
  opts: QueueOptions,
): Queue {
  const nowMs = opts.now.getTime()
  const eligible = cards.filter((c) => isUnlocked(c, states))
  const rank = (c: Card) => opts.rankOf.get(c.noteId) ?? Number.MAX_SAFE_INTEGER

  /**
   * How far ahead of your starting point a word sits. Everything in front
   * comes first, in frequency order; everything behind follows, in frequency
   * order, once you've caught up. Starting at 'Confident' used to mean the
   * fifteen hundred commonest words were never offered again — a permanent
   * hole in the middle of your vocabulary, and one you could only fill by
   * declaring yourself a beginner again. Deferring rather than excluding also
   * means raising your level mid-course doesn't strand the words you were
   * already working on.
   */
  const BEHIND = 1_000_000
  const distance = (c: Card) =>
    rank(c) >= opts.startRank ? rank(c) - opts.startRank : rank(c) + BEHIND

  const due: Card[] = []
  /** First meeting with a word. */
  const fresh: Card[] = []
  /** A second question about a word already met — grammar, gap-fill, reverse. */
  const follow: Card[] = []

  for (const card of eligible) {
    const state = states.get(card.id)
    if (isNew(state)) (card.type === 'recognize' ? fresh : follow).push(card)
    else if (state!.due <= nowMs) due.push(card)
  }

  due.sort((a, b) => states.get(a.id)!.due - states.get(b.id)!.due)
  // Most common words first, counting from where your level starts.
  fresh.sort((a, b) => distance(a) - distance(b))
  follow.sort((a, b) => FOLLOW_ORDER[a.type] - FOLLOW_ORDER[b.type] || rank(a) - rank(b))

  // The day's new words and follow-ups are reserved first and the reviews
  // fill what's left. The other way round — reviews first, new cards from the
  // remainder — stalls completely as soon as the backlog reaches the session
  // cap: you stop meeting new words entirely. A review deferred a day is still
  // due tomorrow, so trimming that end costs far less.
  const newToday = fresh.slice(0, opts.newPerDay)
  const followToday = follow.slice(0, opts.followPerDay)
  const room = Math.max(0, opts.maxSession - newToday.length - followToday.length)
  const dueToday = due.slice(0, room)
  const picked = [...dueToday, ...followToday, ...newToday]

  return {
    cards: interleave(picked, states),
    dueCount: dueToday.length,
    newCount: newToday.length,
  }
}

/**
 * Mix reviews and new cards instead of front-loading all the reviews, and
 * avoid showing two cards about the same word back to back.
 */
function interleave(cards: Card[], states: Map<string, CardStateRow>): Card[] {
  const reviews = cards.filter((c) => !isNew(states.get(c.id)))
  const fresh = cards.filter((c) => isNew(states.get(c.id)))
  const out: Card[] = []
  const ratio = fresh.length ? Math.max(1, Math.round(reviews.length / fresh.length)) : Infinity

  let r = 0
  let f = 0
  while (r < reviews.length || f < fresh.length) {
    for (let i = 0; i < ratio && r < reviews.length; i++) out.push(reviews[r++])
    if (f < fresh.length) out.push(fresh[f++])
  }
  return spread(out)
}

/** Push apart cards that belong to the same note. */
function spread(cards: Card[]): Card[] {
  const out = [...cards]
  for (let i = 1; i < out.length; i++) {
    if (out[i].noteId !== out[i - 1].noteId) continue
    const swap = out.findIndex((c, j) => j > i && c.noteId !== out[i - 1].noteId)
    if (swap > -1) [out[i], out[swap]] = [out[swap], out[i]]
  }
  return out
}
