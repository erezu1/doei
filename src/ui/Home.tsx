import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { CoatId } from '../core/cat'
import { reachedLevel, type LevelOption } from '../core/levels'
import type { Resolved, Theme } from '../core/themes'
import type { SessionStats } from '../session/useSession'
import { Button } from './Button'
import { promptInstall } from '../core/install'
import { Cat } from './Cat'
import type { SceneName } from '../core/cat-rig'
import { CoatPicker } from './CoatPicker'
import { Paw } from './Paw'
import { useCanInstall } from './useCanInstall'
import { ThemePicker } from './ThemePicker'
import { UpdateButton } from './UpdateButton'
import { afterRing, pressable, ringGrow } from './motion'
import { WeekStrip } from './WeekStrip'
import { rungAt } from '../core/ladder'
import { weekMood, type WeekDay } from '../core/week'
import { TITLE, WORDMARK } from './type'

interface Props {
  stats: SessionStats
  score: number
  level: LevelOption
  week: WeekDay[]
  onOpenSettings: () => void
  theme: Theme
  coat: CoatId
  onChangeCoat: (coat: CoatId) => void
  resolvedMode: Resolved
  onStart: (extra: boolean) => void
  onChangeLevel: () => void
  onChangeTheme: (theme: Theme) => void
}

export function Home({
  stats,
  score,
  level,
  week,
  theme,
  coat,
  onChangeCoat,
  resolvedMode,
  onStart,
  onChangeLevel,
  onChangeTheme,
  onOpenSettings,
}: Props) {
  const canInstall = useCanInstall()
  /**
   * Flipped one tick after mount, and the ring and the numbers below animate
   * because it changed rather than because they appeared. The app's screen
   * switcher suppresses entrance animations on the very first render — which
   * is exactly the render this is, when the app is opened cold — so an
   * `initial` here would be ignored precisely when it matters most.
   */
  const [arrived, setArrived] = useState(false)

  /**
   * How she takes the week, said every time you arrive here.
   *
   * Every time, not once per visit: coming back from a round is an arrival
   * too, and it is the arrival where the week has just changed — you came
   * here to see what it did. This screen is unmounted for the length of a
   * round, so its own mount is exactly the event, and the reaction is chosen
   * from the same reading of the week as the line under the dots.
   */
  const [hello, setHello] = useState<{ scene: SceneName; key: number } | null>(null)
  useEffect(() => {
    // After the entrance, not during it: she fades in along with everything
    // else, and a face that has already changed by the time it is visible
    // never changed as far as anyone watching is concerned.
    const id = setTimeout(() => {
      setHello({ scene: weekMood(week), key: Date.now() })
    }, 700)
    return () => clearTimeout(id)
    // Deliberately once, on the first mount of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // A timer rather than a frame callback: a frame callback is at the mercy
    // of how often the page is being painted, and this only has to happen
    // after the first paint, not on it.
    const id = setTimeout(() => setArrived(true), 30)
    return () => clearTimeout(id)
  }, [])

  const waiting = stats.waiting
  // Once the day is done there is always more deck, so there is no reason to
  // stop anyone who wants to carry on — the day's shape is a suggestion, not
  // a gate. Only a finished deck disables the button.
  const another = waiting === 0 && stats.extraWaiting > 0
  // The ring is today: it empties overnight and closes when the day's cards
  // are done. It used to show words known out of the whole two thousand, which
  // on any real day is a sliver that never visibly moves — it read as broken
  // because nothing you did changed it.
  // Two goals, two objects. The ring is the long one — how far through the
  // level you are — and the day is on the button you press to do it, with the
  // week's dots saying whether you finished.
  const rung = rungAt(score)
  const progress = rung.part
  /**
   * The number under the level, counted up rather than printed.
   *
   * It is the same quantity the ring is drawing, so it moves on the same curve
   * over the same time: the arc sweeping round and the figure climbing are one
   * event seen twice, and a total that was simply already there would say the
   * ring had nothing to do with it.
   */
  const counted = useMotionValue(0)
  const shown = useTransform(counted, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    if (!arrived) return
    const run = animate(counted, rung.into, ringGrow)
    return () => run.stop()
  }, [arrived, counted, rung.into])
  /**
   * Whether there is a round to go back to, as opposed to one to begin.
   *
   * The queue lives until the next round is built, so this is true from the
   * moment you leave a round part-way through until you finish it — and it is
   * what the button both says and does, since a round in hand is resumed.
   */
  const inHand = stats.roundSize > 0 && stats.roundDone < stats.roundSize
  /**
   * What the bar holds: the round, and nothing else.
   *
   * A round in hand shows how far through it you are. Any other press begins
   * a round, and a round that has not begun is empty — it was showing the day
   * for a while, which meant "Keep going" could sit over a full bar the
   * moment before it started you at nothing. Full is kept for the two states
   * where there is nothing outstanding at all.
   */
  const part = inHand ? Math.min(1, stats.roundDone / stats.roundSize) : waiting > 0 ? 0 : 1

  // The level you've reached, not the one you claimed on the first run. The
  // claim only decides where the deck starts handing out words; this moves as
  // the words go by, which is what a level is for.
  const reached = reachedLevel(stats.known, level)

  // One screen, always. The home page is a glance — the ring, the cat and the
  // week in one look — and a glance you have to scroll for is not one. Every
  // vertical number below has a smaller twin that takes over on a short phone,
  // so nothing is ever under the fold; on a tall one the layout is untouched.
  return (
    <div className="flex flex-1 flex-col justify-between px-6 py-10 [@media(max-height:780px)]:py-4">
      <div>
        <div className="flex items-center justify-between gap-4">
          {/* The paw is sized against the word's cap height, not against its
              line box, and the gap is set from the mark's own edge — which is
              why these are exact numbers rather than the spacing scale. */}
          <div className="flex items-center gap-3">
            <Paw className="h-[38px] w-[38px] text-primary" />
            <h1 className={`text-[2.6rem] leading-none ${WORDMARK}`}>Doei!</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Only while the browser will actually install it. The one-time
              card is easy to dismiss, so this stays as the way back. */}
            {canInstall && (
              <motion.button
                {...pressable}
                onClick={() => void promptInstall()}
                aria-label="Add to home screen"
                className="grid h-8 w-8 place-items-center rounded-full bg-surface-1 text-on-surface-dim shadow-1"
              >
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
                  <path d="M12 4.5v11" />
                  <path d="M7.5 11 12 15.5 16.5 11" />
                  <path d="M5 19h14" />
                </svg>
              </motion.button>
            )}

            <motion.button
              {...pressable}
              onClick={onChangeLevel}
              className="rounded-full bg-surface-1 px-3 py-1.5 text-xs font-medium text-on-surface-dim shadow-1"
            >
              {reached.name}
            </motion.button>

            <UpdateButton />

            <motion.button
              {...pressable}
              onClick={onOpenSettings}
              aria-label="Settings"
              className="grid h-8 w-8 place-items-center rounded-full bg-surface-1 text-on-surface-dim shadow-1"
            >
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03Z" />
              </svg>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Wide, and it has to stay wide. The ring is the biggest thing on the
          page and the button is the loudest; with less between them the two
          read as one control, and the eye goes straight past the ring. */}
      <div className="flex flex-col items-center gap-14 [@media(max-height:780px)]:gap-9">
        <div className="flex flex-col items-center gap-3">
          {/* On the ring, exactly as she is on the progress bar while you
              review. The ring is what this screen measures, so it is the thing
              she rests on — and being in the same relationship to the same kind
              of object on both screens is what makes her one cat rather than
              two decorations.

              In the column's flow rather than floating above the ring on an
              absolute layer. Out of flow she cost the layout nothing, so the
              column could not account for her: she ended up crammed four
              pixels off the ring with sixty pixels of slack going spare at the
              bottom. In flow she is simply the top of this block, and
              justify-between gives the space above her and the space below the
              week the same size without either being named.

              She waits for the ring to finish drawing. Arriving with it, there
              would be two things moving and nowhere to look. */}
          <div className="flex flex-col items-center">
            <motion.div
              initial={false}
              animate={{ opacity: arrived ? 1 : 0 }}
              transition={afterRing(0.12)}
              // Centred in the gap between the header and the ring rather
              // than perched on the ring's edge. Because the column is
              // justify-between, the space above her is whatever is left over
              // — so the way to move her down is to push the ring away from
              // her, which takes half of it back off the top. This margin is
              // the number that makes the two gaps match.
              className="mb-9 [@media(max-height:780px)]:mb-4"
            >
              <Cat
                coat={coat}
                rim={resolvedMode === 'dark'}
                size={101}
                scene={waiting > 0 ? 'waiting' : 'nothingDue'}
                beat={hello}
                label="The cat"
                // The one place she is at rest and in nobody's way, so the one
                // place she may roll onto her back.
                flips
              />
            </motion.div>
            <div className="relative grid h-48 w-48 place-items-center [@media(max-height:780px)]:h-40 [@media(max-height:780px)]:w-40">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="var(--color-surface-3)"
                  strokeWidth="8"
                />
                {/* Nothing at all when nothing has been done: a round cap on an
                  arc of zero length still draws a dot, and a dot on the ring
                  reads as a score. */}
                {progress > 0 && (
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    // Drawn in from nothing every time the screen arrives, rather
                    // than being there already. The ring is the day, and watching
                    // it close is the closest the app gets to a reward.
                    initial={false}
                    animate={{ strokeDasharray: arrived ? `${progress * 283} 283` : '0 283' }}
                    transition={ringGrow}
                  />
                )}
              </svg>
              {/* The numbers wait for the ring: arriving together, the eye has
                nowhere to start. */}
              <motion.div
                initial={false}
                animate={{ opacity: arrived ? 1 : 0 }}
                // With the ring rather than after it, and almost instantly:
                // everything else on this screen waits for the ring to finish,
                // but this is the ring's own reading. A fade of its own length
                // would hide the early part of the count behind it, which is
                // exactly the part that shows it starting from nothing.
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="text-center"
              >
                {/* The ring fills with today's questions, so today's questions
                  are what stands in it. A lifetime total inside a ring that
                  only ever measures one day is two facts pretending to be one,
                  and the line underneath existed to explain that they are not
                  — which is a caption apologising for its own illustration. */}
                {/* The bare number needs saying what it is. Above rather than
                  below, because the line underneath is already spoken for and
                  a label under a number reads as its unit. */}
                <p className="text-xs tracking-wide text-on-surface-dim">level</p>
                <p className={`text-5xl leading-tight ${TITLE}`}>{rung.level}</p>
                {/* What you have, not what you owe. "To go" is the same fact
                  read backwards, but it counts down to nothing and shrinks as
                  you do well — the ring fills, so the number under it fills
                  too, and the denominator says where full is. */}
                <p className="text-sm tabular-nums text-on-surface-dim">
                  <motion.span>{shown}</motion.span> / {rung.span.toLocaleString()}
                </p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* The week sits a little apart from the button: it's a record, not
            a second thing to press. */}
        <div className="flex w-full flex-col items-center gap-10 [@media(max-height:780px)]:gap-5">
          {/* Narrower than the column, but the same height and type as every
              other button in the app. This screen is not only its button — the
              ring above it and the cat on that ring are the reason you are
              looking, and a full-width block of accent under them takes the
              eye straight back down. Width is the part that can vary; a button
              that is also a different size is just a different button. */}
          <Button
            onClick={() => onStart(another && !inHand)}
            disabled={!inHand && waiting === 0 && !another}
            // Today, on the thing you press to do today — the day until the
            // day is done, the current round after that. Nothing to draw on a
            // button there is nothing left to press.
            progress={part}
            className="px-14 font-plain"
          >
            {/* What the press actually does, in four words or fewer. A round
                left part-way through is resumed rather than rebuilt, so that
                case says so — the bar under the word is that round's, and a
                button that said "Start" over a bar two-ninths full would be
                describing something else. The others each begin a round: the
                day's first, the day's next, or one more than the day asked
                for. */}
            {inHand
              ? 'Finish the round!'
              : waiting > 0
                ? stats.doneToday > 0
                  ? 'Keep going'
                  : 'Start'
                : another
                  ? 'Another round?'
                  : 'Nothing left'}
          </Button>

          <WeekStrip week={week} arrived={arrived} />
        </div>
      </div>

      {/* Two rows of the same control: which cat, then which colour. The cat
          comes first because she is the thing you just looked at. */}
      <div className="flex flex-col items-center gap-3 [@media(max-height:780px)]:gap-2">
        <CoatPicker current={coat} onPick={onChangeCoat} />
        <ThemePicker current={theme} resolved={resolvedMode} onPick={onChangeTheme} />
      </div>
    </div>
  )
}
