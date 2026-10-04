import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import type { CoatId } from '../core/cat'
import { nextTrick, type Trick } from '../core/cat-tricks'
import type { Rung } from '../core/ladder'
import { Button } from './Button'
import { Cat } from './Cat'
import { LevelRing } from './LevelRing'
import { TITLE } from './type'

// ---------------------------------------------------------------------------
// A level finished, the moment it finishes.
//
// It used to wait for the end of the round and take the round's own screen
// with it: you crossed the line on the fourth card of thirty-two and heard
// about it twenty minutes later, instead of the finishing screen you had
// earned. Two different things happened, so there are two screens, and each
// arrives when the thing it is about actually happened.
//
// Which is why there are no round numbers on this one. Nothing is over: the
// cards are still underneath it, and the button says so.
// ---------------------------------------------------------------------------

/**
 * How long after the ring bursts the cat's trick begins: her first delight has
 * had its moment, and the confetti is still coming down.
 */
const TRICK_AFTER = 1900

interface Props {
  from: Rung
  to: Rung
  /** The answer that crossed it, which is what the count runs up by. */
  points: number
  /** Cards still to come in this round. Zero when it was the last one. */
  left: number
  coat: CoatId
  dark: boolean
  onContinue: () => void
  onHome: () => void
  /** The trick a new level gets. One at random when not given. */
  trick?: Trick
}

/**
 * The ring you watch fill on the home screen closes here, bursts into confetti
 * in the cat's colours, and rolls over to the new level — and only then does
 * the screen say so, because the ring closing is the news and the headline is
 * its caption. Then the cat does something she does for nothing else: one of
 * her tricks, a different one from the last level's.
 */
export function LevelUp({ from, to, points, left, coat, dark, onContinue, onHome, trick }: Props) {
  const [burst, setBurst] = useState(false)
  // One object for the one beat. A fresh one on every render reads as a new
  // beat to the cat, and the render that starts the trick would have her
  // leap up and celebrate the ring all over again in the middle of it.
  const beat = useMemo(() => (burst ? { scene: 'levelUp' as const, key: 1 } : null), [burst])
  // Chosen on arrival, once.
  const [chosen] = useState(() => trick ?? nextTrick())
  const [playing, setPlaying] = useState<{ name: Trick; key: number } | null>(null)

  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setPlaying({ name: chosen, key: 1 }), TRICK_AFTER)
    return () => clearTimeout(t)
  }, [burst, chosen])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-6 text-center">
      <div className="flex flex-col items-center">
        <Cat
          coat={coat}
          rim={dark}
          size={104}
          scene="waiting"
          // Her beat waits for the ring: she reacts to it closing, with you.
          beat={beat}
          trick={playing}
          label="The cat, pleased with you"
        />
        {/* Clamped to the level's own span: one answer can carry you well
            past the line — sixty points for a word learned against the ten
            that were still owed — and a ring that counts "470 / 420" is
            arithmetic rather than a finish. What spilled over is not lost; it
            is sitting in the new level's ring on the home screen. */}
        <LevelRing
          from={from}
          to={to}
          coat={coat}
          total={Math.min(from.into + points, from.span)}
          onBurst={() => setBurst(true)}
        />
      </div>

      <motion.div
        initial={false}
        animate={burst ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.8, y: 10 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <h1 className={`text-4xl ${TITLE}`}>Level {to.level}!</h1>
        {/* What is left of the round, because that is the only thing this
            screen is standing in the way of. Nothing when it was the last
            card: the round is over, and the next screen says so itself. */}
        {left > 0 && (
          <p className="mt-2 text-on-surface-dim">
            {left} {left === 1 ? 'card' : 'cards'} left in the round
          </p>
        )}
      </motion.div>

      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button onClick={onContinue} className="w-full">
          {left > 0 ? 'Finish the round' : 'See how it went'}
        </Button>
        <Button tone="neutral" onClick={onHome} className="px-12">
          Not now
        </Button>
      </div>
    </div>
  )
}
