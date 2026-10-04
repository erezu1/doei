// ---------------------------------------------------------------------------
// Saying numbers.
//
// The deck teaches number WORDS — zeven, veertig — the way it teaches any
// other vocabulary. What it never taught is how to say a number you are
// looking at, which is a different skill and the one you need at a till.
//
// Dutch builds the two-digit ones backwards from English: 47 is
// zevenenveertig, seven-and-forty, units first, joined by `en`, written as one
// word. That is where everyone stalls mid-sentence, and because it is a rule
// rather than a list, every card here is generated from the deck's own number
// words rather than written out.
// ---------------------------------------------------------------------------

const UNITS = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen']

/** Ten to nineteen, which are their own words rather than a pattern. */
const TEENS: Record<number, string> = {
  10: 'tien',
  11: 'elf',
  12: 'twaalf',
  // Not "drietien" and "viertien": the stems shorten, and these two are the
  // ones people get wrong.
  13: 'dertien',
  14: 'veertien',
  15: 'vijftien',
  16: 'zestien',
  17: 'zeventien',
  18: 'achttien',
  19: 'negentien',
}

/** The tens. Eighty is the odd one — tachtig, with no `-en-`, and no `acht`. */
const TENS: Record<number, string> = {
  20: 'twintig',
  30: 'dertig',
  40: 'veertig',
  50: 'vijftig',
  60: 'zestig',
  70: 'zeventig',
  80: 'tachtig',
  90: 'negentig',
}

/**
 * A number, written the way it is said.
 *
 * The trema is the one piece of spelling here: `twee` and `drie` end in the
 * vowel that `en` begins with, and Dutch marks the join so the pair is not
 * read as one sound — tweeëntwintig, drieënveertig. Every other unit joins
 * plainly: vierenveertig, zesenzestig.
 */
export function spell(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n)
  if (n < 10) return UNITS[n]
  if (n < 20) return TEENS[n]
  const tens = Math.floor(n / 10) * 10
  const unit = n % 10
  if (unit === 0) return TENS[tens]
  const joined = unit === 2 ? 'tweeën' : unit === 3 ? 'drieën' : `${UNITS[unit]}en`
  return `${joined}${TENS[tens]}`
}

/**
 * What number a note IS, worked out by spelling every number and seeing which
 * one the note's own word matches.
 *
 * Derived rather than written down beside the word: the deck says `twintig`
 * and `pos: 'num'`, and anything else would be the same fact kept in two
 * places. It also quietly declines to match `derde` and `ene`, which are
 * tagged as numerals and are not numbers.
 */
export function valueOf(nl: string): number | null {
  const word = nl.trim().toLowerCase()
  for (let n = 0; n <= 99; n++) if (spell(n) === word) return n
  return null
}

/**
 * The compound each tens word teaches.
 *
 * Fixed rather than random, so the card is the same card every time it comes
 * round. Twenty and thirty take the two units that need a trema, because that
 * is the spelling worth meeting early; the rest spread across the units so
 * that between them they cover nearly all of them.
 */
const TEACHES: Record<number, number> = { 20: 2, 30: 3, 40: 7, 50: 1, 60: 4, 70: 8, 80: 5, 90: 9 }

/** The two-digit number a tens word is responsible for, or null if it isn't one. */
export function compoundFor(value: number): number | null {
  const unit = TEACHES[value]
  return unit ? value + unit : null
}

/**
 * Three wrong answers for a number, chosen to be the mistakes you would
 * actually make: the same digits the other way round, which is the whole
 * trap, then a neighbouring ten and a neighbouring unit.
 */
export function nearNumbers(n: number): number[] {
  const tens = Math.floor(n / 10)
  const unit = n % 10
  const swapped = unit * 10 + tens
  const wrongTen = n >= 20 ? (tens === 9 ? n - 10 : n + 10) : n + 10
  const wrongUnit = unit === 9 ? n - 1 : n + 1
  const seen = new Set([n])
  const out: number[] = []
  for (const candidate of [swapped, wrongTen, wrongUnit, n + 11, n - 11, n + 2]) {
    if (candidate < 0 || candidate > 99 || seen.has(candidate)) continue
    seen.add(candidate)
    out.push(candidate)
    if (out.length === 3) break
  }
  return out
}
