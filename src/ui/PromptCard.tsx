import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState, type ReactNode } from 'react'
import type React from 'react'
import { splitAroundWord } from '../core/cards'
import type { Prompt } from '../session/prompts'
import { speak as say } from '../core/speech'
import { glide, pressable, swapVariants, tap } from './motion'
import { FOCUS } from './type'
import { ICON, SpeakButton, STEP } from './SpeakButton'

// ---------------------------------------------------------------------------
// The presentation of one question. Phase 3 replaces this file (full-bleed,
// swipeable, animated) without touching any logic — it only ever reads a
// Prompt and calls the callbacks it is handed.
//
// Layout is two equal zones. The question sits at the bottom of the upper
// zone, just above the optical centre, and everything that appears afterwards
// grows downward into the lower one. Centring the whole lot instead would make
// the question jump upward the moment an answer appeared beneath it.
// ---------------------------------------------------------------------------

interface Props {
  prompt: Prompt
  revealed: boolean
  picked: string | null
  correct: boolean | null
  onReveal: () => void
  onChoose: (value: string) => void
  /**
   * Called when anything on the card has been asked for out loud — the word,
   * the sentence, either speaker. The screen above uses it to stop the
   * countdown, which is its business rather than this card's.
   */
  onSpeak: () => void
}

/**
 * The largest size a word can be set at and still fit across the screen.
 *
 * A Dutch word can be very long — ziekenhuis, achteruitgaan, tevoorschijn —
 * and a single word cannot wrap, so a fixed size overflows silently. This
 * scales with the longest unbreakable run: roughly, a character is half an em
 * wide, so the run fits when the size is about twice the width available per
 * character. Clamped so short words don't become enormous and long ones stay
 * readable.
 */
function fitSize(text: string | string[], max: string, min = '1.6rem', whole = false): string {
  // Several strings when one size has to fit them all — a question and the
  // answer that takes its place.
  const texts = (Array.isArray(text) ? text : [text]).map(withoutNote)
  // A phrase that has to stay on one line is measured entire; anything that
  // may wrap is measured by its longest unbreakable run. For a single word
  // the two are the same.
  const run = Math.max(
    ...texts.map((t) => (whole ? t.length : Math.max(...t.split(/\s+/).map((w) => w.length), 1))),
    1,
  )
  // 80vw, not the full width: the speaker hangs off the word's right edge
  // and needs somewhere to be.
  return `clamp(${min}, calc(80vw / ${run} * 1.85), ${max})`
}

/**
 * "you (formal)" without its clarifier. Gloss sets that part small and out of
 * the way, so letting it decide how big the word is shrinks the word for the
 * sake of its own footnote.
 */
const withoutNote = (text: string) => text.replace(/\s*\([^)]*\)\s*$/, '').trim() || text

/**
 * Renders "you (formal)" with the clarifying part played down, so the word
 * itself is what sits in the middle rather than the word plus its footnote.
 *
 * On a button the note hangs off the right at a fraction of the size. At the
 * question's size that same note is large enough to run off the screen, so
 * there it drops underneath instead — still out of the way of centring, but
 * with somewhere to go.
 */
function Gloss({ text, stacked = false }: { text: string; stacked?: boolean }) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(text)
  if (!m) return <>{text}</>

  if (stacked) {
    return (
      <span className="inline-flex flex-col items-center leading-tight">
        <span>{m[1]}</span>
        <span className="mt-1 font-sans text-base font-normal text-on-surface-dim">({m[2]})</span>
      </span>
    )
  }

  return (
    <span className="relative inline-block">
      {m[1]}
      <span className="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 font-sans text-[0.55em] font-normal whitespace-nowrap opacity-50">
        ({m[2]})
      </span>
    </span>
  )
}

function Choices({
  prompt,
  picked,
  correct,
  onChoose,
}: {
  prompt: Prompt
  picked: string | null
  correct: boolean | null
  onChoose: (v: string) => void
}) {
  const choices = prompt.choices!
  // Two options are the grammar pairs (de/het, hebben/zijn) and sit side by
  // side. Four vocabulary options stack, so longer glosses fit. Same button
  // either way — only the width differs.
  const pair = choices.length === 2

  return (
    <div className={`w-full ${pair ? 'flex gap-3' : 'flex flex-col gap-2.5'}`}>
      {choices.map((choice, i) => {
        // Between the tap and the answer appearing, the option you pressed
        // shows its own result, so you see what you chose before the view
        // moves on.
        const isPicked = picked === choice
        const isAnswer = picked !== null && choice === prompt.answer
        // The options are a right-and-wrong readout, so they are green and red
        // in every scheme — that is what those colours mean, and a green that
        // changed hue with the decoration would stop meaning it. The stated
        // answer below is a different job: it is the thing being taught, so it
        // takes the scheme's colour.
        const resultTone = isPicked
          ? correct
            ? 'bg-good text-good-ink'
            : 'bg-bad text-bad-ink'
          : isAnswer
            ? 'bg-good text-good-ink'
            : ''

        return (
          <motion.button
            key={choice}
            {...(picked === null ? pressable : {})}
            initial={{ opacity: 0, y: 12 }}
            animate={{
              opacity: picked !== null && !isPicked && !isAnswer ? 0.35 : 1,
              y: 0,
              scale: isPicked ? 1.03 : 1,
            }}
            transition={{ ...glide, delay: picked === null ? 0.04 * i : 0 }}
            onClick={() => onChoose(choice)}
            translate="no"
            className={`notranslate rounded-3xl px-5 py-4 text-xl shadow-2 transition-shadow active:shadow-press ${
              pair ? 'flex-1' : ''
            } ${resultTone || 'bg-surface-1'}`}
          >
            <Gloss text={choice} />
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * Centres the text on the frame and hands the caller a speaker to put at the
 * end of its text.
 *
 * The icon rides in the text's own flow, in a marker with no width, with the
 * icon itself overflowing to the right of it. That way it follows the end of
 * the last line wherever it happens to fall — and contributes nothing to
 * centring, so the word still sits in the middle of the frame rather than the
 * word-and-icon pair sitting there with the word pushed left.
 *
 * Hanging it off the right edge of the text's *box* instead put it 60px clear
 * of a centred sentence's short first line, while a single word got 8px:
 * the same rule, but only because a word's box is its text.
 */
function WithSpeaker({
  speak: phrase,
  size,
  onSpeak,
  children,
}: {
  speak?: string
  /** The font size of the text inside, so the icon can be placed in its terms. */
  size: string
  onSpeak: () => void
  children: (speaker: ReactNode) => ReactNode
}) {
  // True while the voice is talking, so the waves run for the length of the
  // word or sentence instead of a fixed beat. Shared, so tapping the word
  // animates the icon exactly as tapping the icon does.
  const [speaking, setSpeaking] = useState(false)
  const startedAt = useRef(0)

  const trigger = () => {
    if (!phrase) return
    onSpeak()
    startedAt.current = performance.now()
    setSpeaking(true)
    void say(phrase).finally(() => {
      // Don't cut a wave off mid-flight. The icon is exactly its resting self
      // every STEP seconds — one wave on the inner arc, one on the outer — so
      // run on to the next of those and stop there.
      //
      // The remaining time is read from the animation's own clock rather than
      // from when the tap happened: the element mounts a render later, and
      // that drift is enough to stop it short of the boundary.
      const step = STEP * 1000
      const wave = document.querySelector('.speaker-wave')
      const clock = wave?.getAnimations?.()[0]?.currentTime
      const elapsed = typeof clock === 'number' ? clock : performance.now() - startedAt.current
      setTimeout(() => setSpeaking(false), step - (elapsed % step))
    })
  }

  const speaker = phrase ? (
    <span className="relative inline-block w-0 align-baseline">
      {/* Fades rather than appearing: it follows the text, so it arrives
          somewhere else on a question that has just been completed. */}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.24 } }}
        // Half an x-height above the baseline: the middle of the lower-case
        // letters, which is where the eye puts the middle of a line. Half the
        // line box sits lower, because most words leave the descender space
        // empty. flex, so the box is the icon and not an inherited line.
        style={{ bottom: `calc(0.5ex - ${ICON / 2}px)` }}
        className="absolute left-2 flex"
      >
        <SpeakButton text={phrase} speaking={speaking} onActivate={trigger} />
      </motion.span>
    </span>
  ) : null

  // The same elements whether or not there is anything to hear. Returning the
  // children bare when there isn't moves everything inside up a level of the
  // tree, which unmounts whatever was animating in there — that is what
  // stopped a gap-fill's sentence from ever animating, since the sentence only
  // becomes speakable at the moment it changes.
  return (
    <div className="flex justify-center" style={{ fontSize: size }}>
      {/* The text itself is the button — tapping the word or the sentence is
          the obvious way to hear it, and the icon is only a hint that you can.
          Stops propagation so it doesn't also flip the card. */}
      <motion.div
        {...(phrase
          ? {
              role: 'button',
              tabIndex: 0,
              whileTap: { scale: 0.97 },
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation()
                trigger()
              },
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  trigger()
                }
              },
            }
          : {})}
        transition={tap}
        className={phrase ? 'cursor-pointer' : undefined}
      >
        {children(speaker)}
      </motion.div>
    </div>
  )
}

/**
 * A sentence with the word it is teaching picked out, so the eye lands on it
 * rather than having to search the line.
 */
function Sentence({
  sentence,
  word,
  className = '',
  highlight = 'font-semibold text-on-surface',
  as: Tag = 'p',
  trailing,
}: {
  sentence: string
  word: string
  className?: string
  highlight?: string
  as?: 'p' | 'span'
  /** Rides at the end of the last line — the speaker, when there is one. */
  trailing?: ReactNode
}) {
  const parts = splitAroundWord(sentence, word)
  return (
    <Tag lang="nl" translate="no" className={`notranslate ${className}`}>
      {parts ? (
        <>
          {parts.before}
          <span className={highlight}>{parts.match}</span>
          {parts.after}
        </>
      ) : (
        sentence
      )}
      {trailing}
    </Tag>
  )
}

/**
 * The answer wears the colour of the scheme you chose, not green. It is shown
 * whether you got the card right or wrong, so it isn't a verdict — it is the
 * thing the card is pointing at, which is exactly what the accent is for.
 *
 * Green and red stay where a verdict is actually being given: on the option
 * you pressed, and on the line saying what you pressed.
 */
const ANSWER_COLOUR = 'text-primary'

/** What you picked, when it wasn't the answer. */
function YouChose({ picked }: { picked: string }) {
  return (
    <p className="flex items-center gap-1.5 text-base text-bad-ink/80">
      <svg
        viewBox="0 0 24 24"
        // Drawn to about the weight of the text beside it: the stroke scales
        // with the box, so a mark this small needs a wide nominal width to
        // come out at a hairline — 2.4 of 24 units across 0.8em is ~1.3px,
        // which is what the letters are.
        className="h-[0.8em] w-[0.8em] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
      you chose &ldquo;{picked}&rdquo;
    </p>
  )
}

export function PromptCard({
  prompt,
  revealed,
  picked,
  correct,
  onReveal,
  onChoose,
  onSpeak,
}: Props) {
  const isChoice = prompt.shape === 'choice'
  // "de or het?" is answered with one word; what you should walk away with is
  // "de man". Cards that differ this way say so, and the rest answer as asked.
  const isSentence = prompt.display === 'sentence'
  // Some questions finish themselves: "tijd" becomes "de tijd", a gapped
  // sentence becomes the whole one. Those don't state an answer underneath —
  // the completed question is the answer.
  const completes = !!prompt.completion
  const headline = completes && revealed ? prompt.completion! : prompt.question
  // Sized from the completed form throughout, so nothing resizes mid-card.
  const headlineClass = `notranslate text-balance ${FOCUS} ${
    isSentence ? 'max-w-[17rem] leading-snug' : 'leading-none'
  }`
  // One size for the question and for the answer beneath it. They are two
  // forms of the same thing — "het huis" and "de huizen", "gaan" and "gegaan"
  // — and setting the second smaller than the first makes it read as a
  // footnote to the question rather than the other half of a pair. Big enough
  // for the longer of the two, so neither has to be shrunk on its own.
  const answerShown = prompt.answerInFull ?? prompt.answer
  const focalSize = isSentence
    ? fitSize(prompt.completion ?? prompt.question, '2.05rem', '1.35rem')
    : fitSize([prompt.completion ?? prompt.question, answerShown], '4rem', '1.6rem', true)

  return (
    <div
      onClick={!isChoice && !revealed ? onReveal : undefined}
      // `min-h-0` on a flex child, or its automatic minimum is its content
      // and the whole column re-solves whenever the content changes size. The
      // two rows are halves of whatever space there is, and they stay halves
      // whatever is put in them — which is the only way the question can be
      // guaranteed not to move while you are reading it.
      className="grid min-h-0 flex-1 grid-rows-2 gap-7 px-5 text-center [@media(max-height:780px)]:gap-4"
    >
      {/* Upper zone: the question, resting on the centre line. It stays put
          from the moment the card appears until it leaves — a gap-fill has its
          blank filled in place rather than the sentence being taken away and
          put back somewhere else. */}
      <div className="flex flex-col items-center justify-end gap-3">
        <p className="text-base font-medium text-on-surface-dim">{prompt.instruction}</p>

        <WithSpeaker
          onSpeak={onSpeak}
          size={focalSize}

          // Speaking a gap-fill before it's answered would read out the answer.
          // A question that hasn't been completed yet must not be read out —
          // for a gap-fill that would speak the answer.
          speak={
            completes
              ? revealed
                ? prompt.speak
                : undefined
              : prompt.questionLang === 'nl'
                ? prompt.question
                : undefined
          }
        >
          {/* One fades out, then the other fades in — nothing slides, and
              nothing changes size underneath. The three elements share a
              single grid cell, and the hidden one holds that cell at the size
              of the finished question for the whole card, so neither version
              has to move to make room for the other. */}
          {(speaker) => (
            <div className="grid place-items-center [&>*]:col-start-1 [&>*]:row-start-1">
              {prompt.completion && (
                <span
                  aria-hidden="true"
                  style={{ fontSize: focalSize }}
                  className={`invisible ${headlineClass}`}
                >
                  {prompt.completion}
                </span>
              )}
              <AnimatePresence initial={false}>
                <motion.h1
                  // Keyed on the words it shows: a question that changes is
                  // replaced by the new one, and a question that doesn't keeps
                  // its key and never animates at all.
                  key={headline}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.3, delay: 0.24 } }}
                  exit={{ opacity: 0, transition: { duration: 0.22 } }}
                  lang={prompt.questionLang}
                  translate="no"
                  style={{ fontSize: focalSize }}
                  className={headlineClass}
                >
                  {completes && revealed ? (
                    // Only the part that was missing is coloured: the article,
                    // the helper, the word that went in the gap.
                    <Sentence
                      as="span"
                      sentence={prompt.completion!}
                      word={prompt.answer}
                      highlight={ANSWER_COLOUR}
                    />
                  ) : prompt.questionLang === 'en' ? (
                    <Gloss text={prompt.question} stacked />
                  ) : (
                    prompt.question
                  )}
                  {speaker}
                </motion.h1>
              </AnimatePresence>
            </div>
          )}
        </WithSpeaker>

        {prompt.subtitle && (
          <p className="max-w-xs text-base text-balance text-on-surface-dim">{prompt.subtitle}</p>
        )}
      </div>

      {/* Lower zone: the options, or the answer once it is given. */}
      {/* A scroll container clips on every side, so the padding-and-negative-
          margin pair runs both ways: without the vertical half, the top
          option's shadow is sliced off along the container's edge. */}
      <div className="no-scrollbar -mx-3 -my-2 flex flex-col items-center gap-3 overflow-y-auto px-3 py-2">
        <AnimatePresence mode="wait" initial={false}>
          {!revealed && !isChoice && (
            <motion.p
              key="hint"
              variants={swapVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={glide}
              // Standing exactly where the answer will: the same box, so the
              // line doesn't shift when one replaces the other. Set in the
              // body face — it is an instruction, not something to learn.
              style={{ height: focalSize }}
              className="flex items-center text-xl text-on-surface-dim/70"
            >
              tap to reveal
            </motion.p>
          )}

          {!revealed && isChoice && (
            <motion.div
              key="choices"
              className="w-full"
              variants={swapVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={glide}
            >
              <Choices prompt={prompt} picked={picked} correct={correct} onChoose={onChoose} />
            </motion.div>
          )}

          {revealed && (
            <motion.div
              key="answer"
              variants={swapVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={glide}
              className="flex flex-col items-center gap-3"
            >
              {/* A question that completed itself is already answered above,
                  so all that is left is what it means and what you picked if
                  it wasn't that. Repeating the word underneath would be the
                  third time of saying it. */}
              {completes ? (
                <>
                  {/* Unless the example *is* the completed question, as it is
                      for a gap-fill — then it's already up there. */}
                  {prompt.detail && prompt.detail !== prompt.completion && (
                    <WithSpeaker speak={prompt.detail} size="1.125rem" onSpeak={onSpeak}>
                      {(speaker) => (
                        <Sentence
                          sentence={prompt.detail!}
                          word={prompt.note.nl}
                          trailing={speaker}
                          className={`max-w-[17rem] text-lg leading-snug text-on-surface/85 ${FOCUS}`}
                        />
                      )}
                    </WithSpeaker>
                  )}
                  {prompt.detailTranslation && (
                    <p className="max-w-xs text-base text-on-surface-dim select-text">
                      {prompt.detailTranslation}
                    </p>
                  )}
                  {correct === false && picked && <YouChose picked={picked} />}
                </>
              ) : (
                <>
                  {/* Every other card states its answer here: the thing you
                      were meant to arrive at, in the serif — written out, when
                      what you had to pick was a shortened form of it. */}
                  <WithSpeaker
                    onSpeak={onSpeak}
                    speak={prompt.answerLang === 'nl' ? answerShown : undefined}
                    size={focalSize}
                  >
                    {(speaker) => (
                      <p
                        lang={prompt.answerLang}
                        translate="no"
                        style={{ fontSize: focalSize }}
                        className={`notranslate leading-none ${FOCUS} ${ANSWER_COLOUR}`}
                      >
                        {prompt.answerLang === 'en' ? (
                          <Gloss text={answerShown} stacked />
                        ) : (
                          answerShown
                        )}
                        {speaker}
                      </p>
                    )}
                  </WithSpeaker>

                  {correct === false && picked && <YouChose picked={picked} />}

                  {prompt.meaning && (
                    <p className="max-w-xs text-base text-on-surface-dim select-text">
                      {prompt.meaning}
                    </p>
                  )}

                  {/* And the sentence it lives in. Plain text: a surface with
                      a shadow is what the things you press look like. */}
                  {prompt.detail && (
                    <div className="mt-6 max-w-[17rem] space-y-1">
                      <WithSpeaker speak={prompt.detail} size="1.125rem" onSpeak={onSpeak}>
                        {(speaker) => (
                          <Sentence
                            sentence={prompt.detail!}
                            word={prompt.note.nl}
                            trailing={speaker}
                            className={`text-lg leading-snug text-on-surface/85 ${FOCUS}`}
                          />
                        )}
                      </WithSpeaker>
                      {prompt.detailTranslation && (
                        <p className="text-base text-on-surface-dim select-text">
                          {prompt.detailTranslation}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
