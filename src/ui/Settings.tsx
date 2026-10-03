import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { eraseEverything } from '../core/db'
import {
  disableNudge,
  enableNudge,
  nudgeState,
  type NudgeState,
  type NudgeTrouble,
} from '../core/nudge'
import { onVoicesReady, speak, VOICES, voiceReport, type VoiceReport } from '../core/speech'
import { MODES, type Mode } from '../core/themes'
import { DAY_NAMES, type WeekStartDay } from '../core/week'
import { Button } from './Button'
import { BackHeader } from './BackHeader'
import { glide, pressable, swapVariants, tap } from './motion'
import { Switch } from './Switch'

interface Props {
  voice: string
  onVoice: (id: string) => void
  autoContinue: boolean
  onAutoContinue: (next: boolean) => void
  mode: Mode
  onMode: (next: Mode) => void
  weekStartsOn: WeekStartDay
  onWeekStartsOn: (day: WeekStartDay) => void
  onBack: () => void
}

/**
 * Three choices where a switch would only offer two. The selected one is
 * marked by a pill that slides between them rather than by three buttons that
 * each change colour, so it stays obvious which is on at a glance.
 */
function ModePicker({ mode, onMode }: { mode: Mode; onMode: (next: Mode) => void }) {
  return (
    <div className="mt-4 flex rounded-full bg-surface-2 p-1">
      {MODES.map((option) => {
        const active = option.id === mode
        return (
          <motion.button
            key={option.id}
            {...pressable}
            onClick={() => onMode(option.id)}
            aria-pressed={active}
            className="relative flex-1 rounded-full px-3 py-2 text-sm font-medium"
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                transition={tap}
                className="absolute inset-0 rounded-full bg-surface-1 shadow-1"
              />
            )}
            <span className={`relative ${active ? '' : 'text-on-surface-dim'}`}>{option.name}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** What the sample says: the same sentence in every voice, so they can be compared. */
const SAMPLE = 'Goedemorgen, hoe gaat het met je?'

/**
 * Who speaks the Dutch. Four recorded voices and the phone's own; tapping one
 * chooses it and says the sample in it, so you choose by ear rather than by
 * name.
 *
 * The phone's voice keeps its note about what to do if it's silent, from when
 * it was the only voice. That note is careful: Android often reports no voices
 * at all and then speaks perfectly well, because the app asks for Dutch by
 * language and the system engine answers. An empty list is not evidence of
 * silence, so it only says where to look, never that nothing is there.
 */
function VoicePicker({ voice, onVoice }: { voice: string; onVoice: (id: string) => void }) {
  const [phone, setPhone] = useState<VoiceReport>(voiceReport)
  useEffect(() => onVoicesReady(() => setPhone(voiceReport())), [])

  const choose = (id: string) => {
    onVoice(id)
    void speak(SAMPLE, 0.9, id)
  }

  return (
    <div className="rounded-3xl bg-surface-1 px-5 py-4 shadow-2">
      <p className="font-semibold">Voice</p>
      <p className="mt-0.5 text-sm text-on-surface-dim">Tap one to hear it.</p>

      <div role="radiogroup" aria-label="Voice" className="mt-3 -mx-2 flex flex-col">
        {VOICES.map((option) => {
          const active = option.id === voice
          return (
            <motion.button
              key={option.id}
              {...pressable}
              role="radio"
              aria-checked={active}
              aria-label={`${option.name}: ${option.note}`}
              onClick={() => choose(option.id)}
              className="relative flex items-center justify-between gap-4 rounded-2xl px-3 py-2.5 text-left"
            >
              {active && (
                <motion.span
                  layoutId="voice-pill"
                  transition={tap}
                  className="absolute inset-0 rounded-2xl bg-surface-2"
                />
              )}
              <span className="relative">
                <span className="block font-medium">{option.name}</span>
                <span className="block text-sm text-on-surface-dim">{option.note}</span>
              </span>
              <span
                aria-hidden
                className={`relative grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                  active ? 'border-primary' : 'border-on-surface-dim/40'
                }`}
              >
                {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
            </motion.button>
          )
        })}
      </div>

      {voice === 'phone' &&
        (phone.supported ? (
          <p className="mt-3 text-sm text-on-surface-dim">
            {phone.found ? (
              <>
                Using {phone.name}
                {phone.local ? '.' : ', which needs a connection.'}
              </>
            ) : (
              <>
                Silent? Install it once and it works offline:{' '}
                <span className="text-on-surface">
                  Settings → System → Languages &amp; input → Text-to-speech → Nederlands
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="mt-3 text-sm text-on-surface-dim">This browser can&rsquo;t speak.</p>
        ))}
    </div>
  )
}

/** What the switch's subtitle says, for each way this can fail. */
const TROUBLE: Record<NudgeTrouble, string> = {
  unsupported: 'Only Chrome on Android can do this.',
  blocked: 'Notifications are off in your phone’s settings.',
  'not-allowed': 'Add Doei to your home screen first.',
}

/**
 * One reminder, on days nothing has been answered.
 *
 * Android decides when it actually fires — the app asks for no more often
 * than every twelve hours and checks the time itself when it is woken — so
 * this is honestly an evening, not an alarm. It is worth saying so on the
 * screen where it is switched on, because a reminder that doesn't arrive at
 * eight o'clock is only broken if it promised to.
 */
function DailyNudge() {
  const [state, setState] = useState<NudgeState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void nudgeState().then((next) => !cancelled && setState(next))
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      setState(await (next ? enableNudge() : disableNudge()))
    } finally {
      setBusy(false)
    }
  }

  const on = state?.on ?? false
  const trouble = state?.trouble

  return (
    <div className="flex items-center justify-between gap-5 rounded-3xl bg-surface-1 px-5 py-4 shadow-2">
      <div>
        <p className="font-semibold">Evening nudge</p>
        <p className="mt-0.5 text-sm text-on-surface-dim">
          {trouble ? TROUBLE[trouble] : 'One reminder, on evenings you’ve done nothing.'}
        </p>
      </div>
      <Switch
        checked={on}
        onChange={(next) => void toggle(next)}
        disabled={busy || trouble === 'unsupported' || trouble === 'blocked'}
        label="Evening nudge"
      />
    </div>
  )
}

/**
 * Where to cut the week for the strip on the home screen. Seven initials in
 * the order the days come in, drawn like the strip itself so it is obvious
 * what is being set — and the line underneath names the day in full, because
 * two of those letters are T and two are S.
 */
function WeekStartPicker({
  value,
  onChange,
}: {
  value: WeekStartDay
  onChange: (day: WeekStartDay) => void
}) {
  return (
    <>
      <div className="mt-3 flex rounded-full bg-surface-2 p-1">
        {DAY_NAMES.map((name, i) => {
          const day = i as WeekStartDay
          const active = day === value
          return (
            <motion.button
              key={name}
              {...pressable}
              onClick={() => onChange(day)}
              aria-label={name}
              aria-pressed={active}
              className="relative flex-1 rounded-full py-2 text-sm font-medium"
            >
              {active && (
                <motion.span
                  layoutId="week-start-pill"
                  transition={tap}
                  className="absolute inset-0 rounded-full bg-surface-1 shadow-1"
                />
              )}
              <span className={`relative ${active ? '' : 'text-on-surface-dim'}`}>{name[0]}</span>
            </motion.button>
          )
        })}
      </div>
      <p className="mt-3 text-sm text-on-surface-dim">
        {DAY_NAMES[value]} to {DAY_NAMES[(value + 6) % 7]}.
      </p>
    </>
  )
}

/**
 * Erasing everything, behind one deliberate step. Not a browser confirm box —
 * those are easy to dismiss without reading and belong to a different app —
 * and not a single tap either, which is the wrong amount of friction for the
 * one thing here that cannot be undone.
 */
function StartOver() {
  const [asking, setAsking] = useState(false)
  const [erasing, setErasing] = useState(false)

  const erase = async () => {
    setErasing(true)
    try {
      await eraseEverything()
    } finally {
      // Reload either way: a half-erased app is worse than a reloaded one,
      // and the reload is what shows whether it worked.
      location.reload()
    }
  }

  return (
    <div className="mt-2 rounded-3xl bg-surface-1 px-5 py-4 shadow-2">
      <p className="font-semibold">Start over</p>
      <p className="mt-0.5 text-sm text-on-surface-dim">
        Erases everything. Can&rsquo;t be undone.
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {asking ? (
          <motion.div
            key="asking"
            variants={swapVariants}
            initial="enter"
            animate="center"
            exit="exit"
            // Quick: this is the answer to a tap, and the card's spring took
            // well over a second to get the question on screen.
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="mt-4 flex flex-col gap-2"
          >
            <p className="text-sm font-semibold text-bad-ink">
              Erase everything and start from nothing?
            </p>
            <div className="flex gap-2">
              <Button
                tone="bad"
                onClick={() => void erase()}
                disabled={erasing}
                className="flex-1 px-4 py-3 text-base"
              >
                {erasing ? 'Erasing…' : 'Erase it all'}
              </Button>
              <Button
                tone="neutral"
                onClick={() => setAsking(false)}
                disabled={erasing}
                className="flex-1 px-4 py-3 text-base"
              >
                Keep it
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            variants={swapVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="mt-4"
          >
            <Button tone="bad" onClick={() => setAsking(true)} className="px-5 py-3 text-base">
              Start over
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Settings({
  voice,
  onVoice,
  autoContinue,
  onAutoContinue,
  mode,
  onMode,
  weekStartsOn,
  onWeekStartsOn,
  onBack,
}: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 py-10">
      <BackHeader title="Settings" onBack={onBack} />

      <div className="mt-8 flex flex-col gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={glide}
          className="flex items-center justify-between gap-5 rounded-3xl bg-surface-1 px-5 py-4 shadow-2"
        >
          <div>
            <p className="font-semibold">Continue automatically</p>
            <p className="mt-0.5 text-sm text-on-surface-dim">
              After a right answer, go straight on.
            </p>
          </div>
          <Switch checked={autoContinue} onChange={onAutoContinue} label="Continue automatically" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...glide, delay: 0.05 }}
          className="rounded-3xl bg-surface-1 px-5 py-4 shadow-2"
        >
          <p className="font-semibold">Appearance</p>
          <p className="mt-0.5 text-sm text-on-surface-dim">System follows your phone.</p>
          <ModePicker mode={mode} onMode={onMode} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...glide, delay: 0.08 }}
          className="rounded-3xl bg-surface-1 px-5 py-4 shadow-2"
        >
          <p className="font-semibold">Week starts on</p>
          <WeekStartPicker value={weekStartsOn} onChange={onWeekStartsOn} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...glide, delay: 0.11 }}
        >
          <DailyNudge />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...glide, delay: 0.14 }}
        >
          <VoicePicker voice={voice} onVoice={onVoice} />
        </motion.div>

        {/* Apart from the rest, and last: the one thing on this screen that
            takes something away. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...glide, delay: 0.17 }}
        >
          <StartOver />
        </motion.div>

        {/* The page's own bottom padding is below this; what it can't give is
            the phone's gesture inset, which lives on the body and so sits
            inside a box the content has already overflowed. Zero on anything
            without one. */}
        <div aria-hidden className="h-[env(safe-area-inset-bottom)] shrink-0" />
      </div>
    </div>
  )
}
