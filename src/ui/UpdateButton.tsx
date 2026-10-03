import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { canCheckForUpdates, checkForUpdate } from '../core/update'
import { glide, pressable } from './motion'

// ---------------------------------------------------------------------------
// "Is there a new one?", asked out loud.
//
// The app already picks up a new build by itself, but only when the browser
// happens to look — which can be a day. This is the way to ask now, and the
// only thing it has to report is the answer to that question: a spin while it
// asks, a tick for no, and nothing at all for yes.
//
// Nothing for yes, because a found update needs no announcement here: the
// worker fetches it in the background and the app reloads itself onto it as
// soon as the home screen is sitting still, which is the moment this button is
// pressed. The toast on the far side says what happened. A second message
// before it would be the same news twice.
// ---------------------------------------------------------------------------

/** Long enough to read a tick without it becoming part of the furniture. */
const LINGER = 1800

type State = 'idle' | 'checking' | 'latest' | 'failed'

/**
 * Two arrows chasing each other: refresh, as every other app on the phone
 * draws it. It replaced a single arc, which was the undo button from the card
 * screen mirrored — one glyph doing two unrelated jobs in the same app, which
 * is a thing you only notice once and then cannot stop noticing.
 */
const REFRESH = [
  'M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
  'M3 3v5h5',
  'M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16',
  'M16 16h5v5',
]
const TICK = 'M5.5 12.5 9.5 16.5 18.5 7.5'
const CROSS = 'M7.5 7.5l9 9M16.5 7.5l-9 9'

function Glyph({ state }: { state: State }) {
  const paths = state === 'latest' ? [TICK] : state === 'failed' ? [CROSS] : REFRESH
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

export function UpdateButton() {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  if (!canCheckForUpdates()) return null

  const ask = async () => {
    if (state === 'checking') return
    if (timer.current) clearTimeout(timer.current)
    setState('checking')
    const answer = await checkForUpdate()
    // On 'found' it keeps spinning: the download is under way and the reload
    // is coming, and a button that went back to idle would look like a no.
    if (answer === 'found') return
    setState(answer === 'latest' ? 'latest' : 'failed')
    timer.current = setTimeout(() => setState('idle'), LINGER)
  }

  return (
    <motion.button
      {...pressable}
      onClick={() => void ask()}
      aria-label="Check for a new version"
      className="grid h-8 w-8 place-items-center rounded-full bg-surface-1 text-on-surface-dim shadow-1"
    >
      {/* The glyphs cross-fade in one cell; only the arrow turns, and it turns
          for exactly as long as the asking takes. */}
      <span className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
        <AnimatePresence initial={false}>
          <motion.span
            key={state === 'latest' || state === 'failed' ? state : 'arrow'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={glide}
            className="grid"
          >
            <motion.span
              className="grid"
              animate={state === 'checking' ? { rotate: 360 } : { rotate: 0 }}
              transition={
                state === 'checking'
                  ? { duration: 0.9, ease: 'linear', repeat: Infinity }
                  : { duration: 0 }
              }
            >
              <Glyph state={state} />
            </motion.span>
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  )
}
