import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { CoatId } from '../core/cat'
import type { SceneName } from '../core/cat-rig'
import { warm } from '../core/speech'
import type { Session } from '../session/useSession'
import { ContinueBar, GradeBar } from './GradeBar'
import { cardVariants, glide, quiet, swapVariants, tap, turn } from './motion'
import { PromptCard } from './PromptCard'
import { Cat } from './Cat'
import { ScorePop } from './ScorePop'

/**
 * Both header icons are drawn to fill the same 13-unit box inside a 24-unit
 * viewBox, at the same stroke width. Text glyphs (✕, ↺) are set at very
 * different optical sizes, and scaling one icon to match the other scales its
 * stroke too, which makes it visibly thinner — so both are drawn at native
 * size instead.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const headerButton =
  'grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-dim transition-[color,background-color,opacity]'

interface Props {
  session: Session
  coat: CoatId
  dark: boolean
  onExit: () => void
}

export function ReviewScreen({ session, coat, dark, onExit }: Props) {
  const { prompt, revealed, picked, correct, position, length } = session
  const [spins, setSpins] = useState(0)

  // One beat per answer. Keyed on the card so the same verdict twice in a row
  // still plays twice — and fired from `correct` flipping off null, which is
  // the moment the app knows, rather than from the render that shows it.
  const [beat, setBeat] = useState<{ scene: SceneName; key: number } | null>(null)
  const beats = useRef(0)
  useEffect(() => {
    if (correct === null) return
    beats.current += 1
    setBeat({ scene: correct ? 'correct' : 'wrong', key: beats.current })
  }, [correct, prompt?.cardId])

  // A right answer moves on by itself, once there has been time to see it was
  // right — the completed sentence, the cat, the points. A wrong one waits for
  // Continue: that is the answer worth reading.
  //
  // The clock belongs to the button rather than to this screen: it is the
  // thing you pause, and a timer up here with nothing on screen to show for
  // it was a card leaving while you were still looking at it.
  // The card's own recording, fetched while the question is being read, so
  // the speaker plays the moment it is tapped rather than after a download.
  // One file of a few kilobytes per card, and the service worker keeps it.
  const clip = prompt?.speak
  useEffect(() => {
    if (clip) void warm(clip)
  }, [clip])

  // Asking to hear something is asking to stay a moment, so the countdown
  // stops — the same stop a tap on the button makes. Counted rather than
  // flagged: the second tap has to say as much as the first, and a flag that
  // was already true says nothing.
  const [heard, setHeard] = useState(0)
  const listened = useCallback(() => setHeard((n) => n + 1), [])

  const counting = session.autoContinue && correct === true

  if (!prompt) return null

  return (
    // `min-h-0` here is what actually holds the question still. A flex item's
    // automatic minimum is its own content, so this screen grew to whatever
    // the card wanted and the page went over the window — then the answer
    // replaced four choices with two lines, the page came back to the window,
    // and everything above slid up by the difference. The screen takes the
    // window and the card takes what is left, always.
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* The bar is pushed down to leave her somewhere to lie. She is not a
          decoration above it — she is resting ON it, which only reads if the
          bar is the thing under her paws rather than a line she floats over. */}
      {/* Same rule as the home screen: the vertical numbers have smaller twins
          for a short phone. Here it is not only about scrolling — a card whose
          contents are taller than the window made the page shrink the moment
          an answer replaced the four choices with two lines, and everything
          above it slid up by the difference while you were reading it. */}
      <header className="relative z-10 flex items-center gap-3 px-4 pt-[calc(var(--cat-perch)+0.6rem)]">
        <motion.button
          onClick={onExit}
          aria-label="Stop"
          whileTap={{ scale: 0.82 }}
          transition={tap}
          className={`${headerButton} active:bg-surface-2`}
        >
          <Icon>
            <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />
          </Icon>
        </motion.button>
        <div className="relative flex-1">
          {/* Above the bar with air between them. She is resting near it, not
              welded to it — the gap is what stops the bar reading as a shelf
              bolted to her chin. */}
          <div className="cat-perch pointer-events-none absolute inset-x-0 bottom-full mb-2.5 flex justify-center">
            <Cat
              coat={coat}
              rim={dark}
              size={101}
              scene="reading"
              beat={beat}
              label="The cat. She is watching you work."
              className="pointer-events-auto"
              // Here too, on the card screen's own terms: as a reward for a run
              // of right answers, or out of boredom at a card left too long —
              // never on her own clock, and never for long.
              flips
            />
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${length ? (position / length) * 100 : 0}%` }}
              transition={quiet}
            />
          </div>
        </div>
        <motion.button
          onClick={() => {
            setSpins((n) => n - 1)
            session.undo()
          }}
          disabled={!session.canUndo}
          aria-label="Undo"
          whileTap={{ scale: 0.82 }}
          transition={tap}
          // Faded by the element's own opacity rather than by a translucent
          // ink. The icon is two strokes that meet at the top left, and a
          // translucent stroke composites twice where they overlap — a dark
          // notch on the corner of an otherwise even icon.
          className={`${headerButton} active:bg-surface-2 disabled:opacity-25`}
        >
          {/* The icon turns a full circle each time, so the button visibly
              does something rather than just recolouring. */}
          <motion.span animate={{ rotate: spins * 360 }} transition={turn} className="grid">
            <Icon>
              {/* Scaled to fill the same 13-unit box as the cross, with the
                  stroke width pre-divided by that scale so it still renders at
                  2 — scaling a group scales its stroke, which is what made
                  this read heavier and smaller than the cross beside it. */}
              <g transform="translate(3.33 3.33) scale(0.7222)" strokeWidth={2 / 0.7222}>
                {/* The tail starts short of due west, so the ring is visibly
                    open rather than a circle with a nick in it: about 290
                    degrees of turn, against the 313 it was drawn with. The
                    arrowhead end is untouched — it is the end that reads as
                    the gesture, and moving it would move the whole icon. */}
                <path d="M3.66 15.37a9 9 0 1 0 8.34-12.37 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </g>
            </Icon>
          </motion.span>
        </motion.button>
      </header>

      {/* Keyed on the card, so moving to the next one animates rather than
          swapping the text in place. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={prompt.cardId}
          variants={cardVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={glide}
          // Pulled back up. Giving her room above the bar pushed the bar down
          // and the whole card with it, and the card is the thing you are
          // here to read — she can have the space above the bar without the
          // question paying for it.
          // `min-h-0`, or the card is as tall as whatever is inside it and the
          // flex column re-solves every time that changes. A wrong answer adds
          // two lines — what you chose, and the word in a sentence — and the
          // card grew, the column overflowed, and everything above the new
          // content slid up to make room. The question is the one thing on
          // this screen that must not move while you are reading it.
          className="-mt-14 flex min-h-0 flex-1 flex-col"
        >
          <PromptCard
            prompt={prompt}
            revealed={revealed}
            picked={picked}
            correct={correct}
            onReveal={session.reveal}
            onChoose={session.choose}
            onSpeak={listened}
          />
        </motion.div>
      </AnimatePresence>

      <ScorePop award={session.award} />

      {/* The bar rises into place the way the answer above it does, rather
          than appearing fully formed the instant the card is answered. */}
      <div className="flex min-h-[7.5rem] items-end [@media(max-height:780px)]:min-h-[5.5rem]">
        <AnimatePresence initial={false}>
          {revealed && (
            <motion.div
              key="bar"
              variants={swapVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={glide}
              className="w-full"
            >
              {session.autoGrade !== null ? (
                // Multiple choice: already graded, just move on.
                // Already recorded when the option was chosen; this only moves on.
                <ContinueBar onContinue={session.advance} countdown={counting} heard={heard} />
              ) : (
                <GradeBar onGrade={session.grade} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
