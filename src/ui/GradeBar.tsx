import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnimationPlaybackControls } from 'framer-motion'
import { Rating, type Grade } from '../core/scheduler'
import { Button, wash } from './Button'

// ---------------------------------------------------------------------------
// Two buttons. The only judgement that has to be honest is "did I know it or
// not", and asking for a finer one on every card invites dishonest grading,
// which would poison the scheduler.
//
// No mention of when the card comes back: the scheduling is the app's job.
// ---------------------------------------------------------------------------

export function GradeBar({ onGrade }: { onGrade: (grade: Grade) => void }) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 px-4 pb-4">
      <Button tone="bad" onClick={() => onGrade(Rating.Again)} className="px-4">
        Didn&rsquo;t know
      </Button>
      <Button tone="good" onClick={() => onGrade(Rating.Good)} className="px-4">
        Knew it
      </Button>
    </div>
  )
}

/**
 * The clock, in milliseconds: the same wait a right answer used to sit through
 * with no button on screen at all.
 */
const COUNTDOWN = 1400
/**
 * Under this, a press is a tap. Android's own long-press is 500ms, which would
 * eat a third of the clock before the word had changed.
 */
const HOLD = 220
/** The clock running back to nothing once a tap has stopped it, in seconds. */
const DRAIN = 0.2
/** How long after a press its own click may still arrive, in ms. */
const AFTER_PRESS = 400

/**
 * running — the clock is going, and the button says so.
 * held    — a finger is down past the threshold; the clock is frozen.
 * stopped — a tap has ended the clock for good. An ordinary Continue.
 */
type Phase = 'running' | 'held' | 'stopped'

const LABEL: Record<Phase, string> = {
  running: 'Tap to pause',
  held: 'Release to continue',
  stopped: 'Continue',
}

/**
 * Shown after a multiple-choice answer. The app already knows whether you were
 * right, so there is nothing to grade — just carry on.
 *
 * It always wears the accent, never a right-or-wrong colour: whether you got
 * it is already said by the answer above, and a button that changes colour for
 * a reason you have to work out is worse than one that doesn't change at all.
 * That holds through all three phases here too — the clock and the word carry
 * everything, and the button's colour never moves.
 *
 * With "Continue automatically" on, a right answer gets the clock; a wrong one
 * waits here for as long as you want to look at what the answer was, which is
 * the card worth staying on.
 *
 * The press is what matters, not the click, and the two gestures part company
 * only after the threshold — so the clock pauses on the way down, before it
 * knows which it is. A tap can therefore never carry you off the card by
 * accident, and a hold freezes the moment you touch it rather than a fifth of
 * a second later.
 */
export function ContinueBar({
  onContinue,
  countdown = false,
}: {
  onContinue: () => void
  countdown?: boolean
}) {
  const [phase, setPhase] = useState<Phase>(countdown ? 'running' : 'stopped')
  /** Nought to one. Drives the wash, and nothing re-renders while it runs. */
  const clock = useMotionValue(0)
  const left = useTransform(clock, (t) => `${Math.max(0, Math.min(1, 1 - t)) * 100}%`)
  const running = useRef<AnimationPlaybackControls | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pressing, setPressing] = useState(false)
  /**
   * When the press we have already answered ended. The click that a tap fires
   * afterwards has to be ignored, but only that one: a release that happens
   * off the button sends no click at all, and an armed flag left standing
   * would swallow the next real tap instead.
   */
  const answered = useRef(0)

  useEffect(() => {
    if (!countdown) return
    clock.set(0)
    const run = animate(clock, 1, {
      duration: COUNTDOWN / 1000,
      ease: 'linear',
      // Only when it runs out on its own: pausing and stopping don't fire it.
      onComplete: onContinue,
    })
    running.current = run
    return () => {
      run.stop()
      running.current = null
    }
  }, [countdown, clock, onContinue])

  useEffect(() => () => void (holdTimer.current && clearTimeout(holdTimer.current)), [])

  /** A tap: the clock ends, and the button becomes the one a mistake gets. */
  const stop = useCallback(() => {
    running.current?.stop()
    running.current = null
    setPhase('stopped')
    animate(clock, 0, { duration: DRAIN, ease: 'easeOut' })
  }, [clock])

  const down = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (phase === 'stopped' || event.button !== 0) return
    running.current?.pause()
    setPressing(true)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      setPhase('held')
    }, HOLD)
  }

  // On the window, not the button: a finger that wanders off the button and
  // lets go there still ends the press, rather than leaving it held for ever.
  useEffect(() => {
    if (!pressing) return
    const finish = () => {
      setPressing(false)
      answered.current = performance.now()
      if (holdTimer.current) {
        clearTimeout(holdTimer.current)
        holdTimer.current = null
      }
      if (phase === 'held') onContinue()
      else stop()
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [pressing, phase, onContinue, stop])

  const click = () => {
    // The press has already said what it meant.
    if (performance.now() - answered.current < AFTER_PRESS) return
    // Which leaves the keyboard, where there is no press to read: Enter on a
    // running clock stops it, exactly as a tap does.
    if (phase === 'stopped') onContinue()
    else stop()
  }

  return (
    <div className="w-full px-4 pb-4">
      <Button
        tone="accent"
        onClick={click}
        onPointerDown={down}
        className="w-full"
        overlay={
          countdown ? (
            // The same wash the home screen's button wears, over the time that
            // is LEFT rather than the time that is gone: the button finishes
            // by simply being itself. Frozen where it stands while held, and
            // run back to nothing by a tap.
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-0 right-0"
              style={{ background: wash('accent'), width: left }}
            />
          ) : null
        }
      >
        {/* Stacked in one cell so the words cross-fade in place: the button is
            full width and never resizes, but the label's own box would
            collapse between the two during the swap. */}
        <span className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
          <AnimatePresence initial={false}>
            <motion.span
              key={phase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {LABEL[phase]}
            </motion.span>
          </AnimatePresence>
        </span>
      </Button>
    </div>
  )
}
