import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { allCards, type Card } from '../core/cards'
import { coatById, DEFAULT_COAT, type CoatId } from '../core/cat'
import { db, forgetRetaught, getMeta, setMeta, type CardStateRow } from '../core/db'
import { DEFAULT_VOICE, setVoice as speechVoice, voiceById } from '../core/speech'
import { buildQueue, DEFAULTS, isUnlocked, type QueueOptions } from '../core/queue'
import { applyGrade, emptyState, isNew, Rating, State, type Grade } from '../core/scheduler'
import { awardFor, type Award } from '../core/score'
import { rungAt, type Rung } from '../core/ladder'
import { DEFAULT_LEVEL, levelById, type LevelOption } from '../core/levels'
import {
  DEFAULT_WEEK_START,
  dayKey,
  weekDays,
  weekStartDay,
  type WeekDay,
  type WeekStartDay,
} from '../core/week'
import {
  applyAppearance,
  DEFAULT_MODE,
  DEFAULT_THEME,
  modeById,
  onSystemModeChange,
  resolveMode,
  themeById,
  wasNightScheme,
  type Mode,
  type Resolved,
  type Theme,
} from '../core/themes'
import type { Deck, Note } from '../core/types'
import { SELECT_DELAY } from '../ui/motion'
import { buildPrompt, type Prompt } from './prompts'

// ---------------------------------------------------------------------------
// All session logic, no rendering. The UI gets a prompt and four functions.
// A swipe layer in Phase 3 calls exactly the same grade() a button does.
// ---------------------------------------------------------------------------

export type SessionStatus = 'loading' | 'idle' | 'reviewing' | 'done'

/** How many scoring answers go by between point bursts. */
const BURST_EVERY = 3

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime()

/** Local calendar day, as a key we can compare. */
const today = () => new Date().toLocaleDateString('sv')

/**
 * What the day's allowance has already been spent on. Without this the daily
 * budget was a per-*session* budget: finish the five new words and the next
 * five were immediately waiting, so the app never reached the end of a day and
 * "done" only ever meant the whole deck was exhausted.
 */
interface Intake {
  day: string
  words: number
  follows: number
}

const EMPTY_INTAKE: Intake = { day: '', words: 0, follows: 0 }

const spentToday = (intake: Intake): Intake =>
  intake.day === today() ? intake : { day: today(), words: 0, follows: 0 }

export interface SessionStats {
  reviewed: number
  correct: number
  /** Questions the next session would ask. */
  waiting: number
  /** Questions one more round would find, once the day's are done. */
  extraWaiting: number
  /** Words whose recognise card has reached the review stage. */
  known: number
  total: number
  /** Cards answered since midnight. */
  doneToday: number
  /**
   * The round still in memory: how far into it, and how long it is.
   *
   * It survives the round it describes — nothing clears it until the next
   * round is built — so between rounds it is the last one you did. Zero only
   * when the app has been opened since, because a queue is never reloaded.
   */
  roundDone: number
  roundSize: number
}

/** How many finished days are kept. Long enough to survive a holiday. */
const KEEP_DAYS = 60

/**
 * A round, written down so it survives the page being reloaded.
 *
 * The cards themselves are not stored — they are rebuilt from the deck by id,
 * which is the only honest way to save a queue: a card is a note and a
 * question type, and both of those belong to the build, not to the round.
 * What is actually round-shaped is the order, the place in it, and the tally
 * the finishing screen reads out.
 */
interface SavedRound {
  day: string
  ids: string[]
  index: number
  reviewed: number
  correct: number
  points: number
}

/** A level crossed, and what the ring needs to draw it closing. */
export interface LevelCrossing {
  from: Rung
  to: Rung
  /** The answer that did it, which is what the count runs up by. */
  points: number
  /** A new one every time, so the same level twice still plays twice. */
  key: number
}

export interface Session {
  status: SessionStatus
  prompt: Prompt | null
  revealed: boolean
  /** For a 'choice' prompt: what was picked, and whether it was right. */
  picked: string | null
  correct: boolean | null
  position: number
  length: number
  stats: SessionStats
  /** Lifetime points. Only ever increases. */
  score: number
  /** What today has earned, which is what the ring on the home screen holds. */
  pointsToday: number
  /** Points earned in this session, for the finishing screen. */
  sessionPoints: number
  /** The most recent award, for the animation. Null between sessions. */
  award: (Award & { key: number }) | null
  /**
   * A level finished, waiting to be celebrated. Set the moment the answer
   * that crossed it is left behind, and cleared when the screen is dismissed.
   */
  levelUp: LevelCrossing | null
  clearLevelUp: () => void
  /** Set for a choice prompt once answered: the grade the app will apply. */
  autoGrade: Grade | null
  /** This week, for the strip under the button. */
  week: WeekDay[]
  /** Which day the strip starts on. 0 is Sunday. */
  weekStartsOn: WeekStartDay
  setWeekStartsOn: (day: WeekStartDay) => void
  level: LevelOption
  /** False until the level has been picked, so we can ask on first run. */
  levelChosen: boolean
  setLevel: (option: LevelOption) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Which cat you have. Independent of the colour scheme on purpose. */
  coat: CoatId
  setCoat: (coat: CoatId) => void
  /** Which recorded voice speaks the Dutch, or the phone's own. */
  voice: string
  setVoice: (voice: string) => void
  /** What was asked for: light, dark, or whatever the phone is doing. */
  mode: Mode
  /** What that comes out as right now. */
  resolvedMode: Resolved
  setMode: (mode: Mode) => void
  autoContinue: boolean
  setAutoContinue: (next: boolean) => void

  /** `extra` asks for one more round past the day's allowance. */
  start: (extra?: boolean) => void
  /** Reloads the app if the calendar day has changed since it opened. */
  checkDay: () => void
  reveal: () => void
  choose: (value: string) => void
  grade: (grade: Grade) => void
  /** Moves on without recording — a choice card is recorded when answered. */
  advance: () => void
  undo: () => void
  canUndo: boolean
}

interface UndoEntry {
  previous: CardStateRow | undefined
  reviewId: number
  index: number
  wasCorrect: boolean | null
  /** Points awarded for this answer, so undoing takes them back. */
  earned: number
}

export function useSession(deck: Deck): Session {
  const notes = useMemo(() => new Map(deck.notes.map((n) => [n.id, n] as const)), [deck])
  const cards = useMemo(() => allCards(deck.notes), [deck])
  // Hand-written notes have no frequency rank; fall back to deck order.
  const rankOf = useMemo(
    () => new Map(deck.notes.map((n, i) => [n.id, n.rank ?? i] as const)),
    [deck],
  )

  const [states, setStates] = useState<Map<string, CardStateRow>>(new Map())
  const [level, setLevelState] = useState<LevelOption>(DEFAULT_LEVEL)
  const [levelChosen, setLevelChosen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [coat, setCoatState] = useState<CoatId>(DEFAULT_COAT)
  const [voice, setVoiceState] = useState<string>(DEFAULT_VOICE)
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE)
  const [resolvedMode, setResolvedMode] = useState<Resolved>(() => resolveMode(DEFAULT_MODE))
  const [score, setScore] = useState(0)
  const [levelUp, setLevelUp] = useState<LevelCrossing | null>(null)
  /**
   * What today has earned.
   *
   * Kept next to the day it belongs to, because a number with no date on it
   * cannot be told from yesterday's the next morning — the app is opened, put
   * down and opened again, and the only thing that reliably marks the turn of
   * a day is finding a different key than the one that was written.
   */
  const [pointsToday, setPointsToday] = useState(0)
  /** Which day the count above belongs to. */
  const pointsDay = useRef('')
  /** Off by default: moving on by itself is a preference, not an assumption. */
  const [autoContinue, setAutoContinueState] = useState(false)
  /** The most recent award, with a key so the same amount re-animates. */
  const [award, setAward] = useState<(Award & { key: number }) | null>(null)
  const [sessionPoints, setSessionPoints] = useState(0)
  const [status, setStatus] = useState<SessionStatus>('loading')
  const [queue, setQueue] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  /**
   * Whether this card's answer is in. Not the same as `revealed`: on a card
   * you grade yourself, revealing is asking to SEE the answer, which happens
   * before you have said anything about it. The bar used to move on the
   * reveal, so on every free-recall card it stepped forward a question early.
   */
  const [answered, setAnswered] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [doneToday, setDoneToday] = useState(0)
  const [intake, setIntake] = useState<Intake>(EMPTY_INTAKE)
  /** Days with any answer on them, and days that were seen through to the end. */
  const [studied, setStudied] = useState<Set<string>>(() => new Set())
  const [finished, setFinished] = useState<Set<string>>(() => new Set())
  /** The day of the first ever answer. Days before it can't have been missed. */
  const [firstDay, setFirstDay] = useState<string | null>(null)
  const [weekStartsOn, setWeekStartsOnState] = useState<WeekStartDay>(DEFAULT_WEEK_START)

  const shownAt = useRef<number>(Date.now())
  /**
   * Points earned since the last burst. A burst on every single answer turns
   * the reward into wallpaper — and it covers the screen each time. Holding
   * three answers' worth back makes each one land, and the number is bigger.
   */
  const pending = useRef<{ amount: number; answers: number }>({ amount: 0, answers: 0 })
  const undoStack = useRef<UndoEntry[]>([])
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Guards against scoring the same card twice — once on answer, once on Continue. */
  const recorded = useRef(false)
  /** The live queue, so advancing can see a card requeued a moment earlier. */
  const queueRef = useRef<Card[]>([])
  const promptRef = useRef<Prompt | null>(null)
  /** The live states, so advancing can see an answer recorded a moment ago. */
  const statesRef = useRef(states)
  statesRef.current = states
  /** The live score, so recording an answer can see what it was worth. */
  const scoreRef = useRef(score)
  scoreRef.current = score
  /**
   * A level crossed by the answer being recorded, held back until the card is
   * left behind. Celebrating it the instant the points land would take the
   * screen away from the answer you are still reading — and a wrong answer is
   * exactly when you are reading it.
   */
  const crossing = useRef<LevelCrossing | null>(null)

  const clearRevealTimer = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current)
      revealTimer.current = null
    }
  }, [])

  useEffect(() => clearRevealTimer, [clearRevealTimer])

  // Load saved progress and the chosen level once.
  useEffect(() => {
    let cancelled = false
    // Words whose meaning was corrected lose their progress first, so what is
    // loaded below is already the state after the correction.
    forgetRetaught(deck.resets ?? [])
      .catch(() => {})
      .then(() =>
        Promise.all([
          db.states.toArray(),
          db.reviews.where('at').aboveOrEqual(startOfToday()).count(),
          getMeta<Intake>('intake', EMPTY_INTAKE),
          // Nine days rather than this week: which day the week starts on is a
          // setting, and it is loaded by this same call. Days outside the week on
          // screen are simply never looked up.
          db.reviews
            .where('at')
            .aboveOrEqual(Date.now() - 9 * 24 * 60 * 60 * 1000)
            .toArray(),
          getMeta<string[]>('finishedDays', []),
          getMeta<unknown>('weekStart', DEFAULT_WEEK_START),
          db.reviews.orderBy('at').first(),
          getMeta<string | null>('level', null),
          getMeta<string | null>('theme', null),
          getMeta<string | null>('coat', null),
          getMeta<string | null>('mode', null),
          getMeta<number>('score', 0),
          getMeta<{ day: string; points: number } | null>('pointsToday', null),
          getMeta<boolean>('autoContinue', false),
          getMeta<SavedRound | null>('round', null),
          getMeta<string | null>('voice', null),
        ]),
      )
      .then(
        ([
          rows,
          done,
          savedIntake,
          thisWeek,
          savedFinished,
          savedWeekStart,
          earliest,
          savedLevel,
          savedTheme,
          savedCoat,
          savedMode,
          savedScore,
          savedPointsToday,
          savedAuto,
          savedRound,
          savedVoice,
        ]) => {
          if (cancelled) return
          setStates(new Map(rows.map((r) => [r.cardId, r] as const)))
          setDoneToday(done)
          setIntake(spentToday(savedIntake))
          setStudied(new Set(thisWeek.map((r) => dayKey(new Date(r.at)))))
          setFinished(new Set(savedFinished))
          setFirstDay(earliest ? dayKey(new Date(earliest.at)) : null)
          setWeekStartsOnState(weekStartDay(savedWeekStart))
          setLevelState(levelById(savedLevel))
          setLevelChosen(savedLevel !== null)
          setScore(savedScore)
          pointsDay.current = savedPointsToday?.day ?? ''
          setPointsToday(savedPointsToday?.day === today() ? savedPointsToday.points : 0)
          setAutoContinueState(savedAuto)
          const t = themeById(savedTheme)
          // Nacht used to be one of the colours. Anyone who was using it wanted a
          // dark app, so that is what they get — in whichever colour they land on.
          const m = savedMode === null && wasNightScheme(savedTheme) ? 'dark' : modeById(savedMode)
          setThemeState(t)
          setCoatState(coatById(savedCoat))
          setVoiceState(voiceById(savedVoice).id)
          speechVoice(voiceById(savedVoice).id)
          setModeState(m)
          setResolvedMode(resolveMode(m))
          applyAppearance(t, m)

          // Back into the round, if there was one and it is still today's. A
          // reload in the middle of a round used to lose it: the queue lived
          // only in memory, so the app came back with nothing in hand and the
          // work you had done was somewhere behind you rather than in front.
          // Nothing is re-graded — every answer was written down as it was
          // given — this only puts the same cards back in the same order at the
          // same place.
          const by = new Map(cards.map((c) => [c.id, c] as const))
          const q =
            savedRound?.day === today()
              ? savedRound.ids.map((cid) => by.get(cid)).filter((c): c is Card => !!c)
              : []
          if (savedRound && q.length === savedRound.ids.length && savedRound.index < q.length) {
            queueRef.current = q
            setQueue(q)
            setIndex(savedRound.index)
            setReviewed(savedRound.reviewed)
            setCorrectCount(savedRound.correct)
            setSessionPoints(savedRound.points)
            shownAt.current = Date.now()
            setStatus('reviewing')
            return
          }
          setStatus('idle')
        },
      )
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A new day, noticed. Everything that is "today" — the round in hand, the
   * count of answers since midnight, the day's allowance of new words, the
   * week — was worked out on the day the app opened, and a phone keeps an app
   * alive in the background for days. Resumed the next morning it carried on
   * from yesterday: yesterday's half round offered as the one to finish, and
   * yesterday still reading as a day in progress.
   *
   * The app already starts every day correctly from cold — a saved round from
   * another day is dropped, the counts are made from the log — so the honest
   * fix is to start from cold. Checked whenever she comes back into view and
   * once a minute while she is on screen, which is all the precision a day
   * boundary needs.
   */
  const openedOn = useRef(today())
  // Also asked by the app on every arrival at the home screen, which is where
  // the day is on show: arriving there is the moment a stale one would be
  // seen, and the minute-by-minute check can be up to a minute late for it.
  const checkDay = useCallback(() => {
    if (!document.hidden && today() !== openedOn.current) window.location.reload()
  }, [])
  useEffect(() => {
    const check = checkDay
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    const id = setInterval(check, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      clearInterval(id)
    }
  }, [checkDay])

  const setAutoContinue = useCallback((next: boolean) => {
    setAutoContinueState(next)
    void setMeta('autoContinue', next).catch(() => {})
  }, [])

  const setCoat = useCallback((next: CoatId) => {
    setCoatState(next)
    void setMeta('coat', next).catch(() => {})
  }, [])

  const setVoice = useCallback((next: string) => {
    setVoiceState(next)
    speechVoice(next)
    void setMeta('voice', next).catch(() => {})
  }, [])

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next)
      applyAppearance(next, mode, true)
      void setMeta('theme', next.id).catch(() => {})
    },
    [mode],
  )

  const setMode = useCallback(
    (next: Mode) => {
      setModeState(next)
      setResolvedMode(resolveMode(next))
      applyAppearance(theme, next, true)
      void setMeta('mode', next).catch(() => {})
    },
    [theme],
  )

  // Following the phone means following it as it changes, not only at startup.
  useEffect(() => {
    if (mode !== 'system') return
    return onSystemModeChange(() => {
      setResolvedMode(resolveMode('system'))
      applyAppearance(theme, 'system', true)
    })
  }, [mode, theme])

  const setLevel = useCallback((option: LevelOption) => {
    // Update first, persist after. Waiting on the write means a storage
    // hiccup leaves the app stuck on the level screen with no way forward.
    setLevelState(option)
    setLevelChosen(true)
    void setMeta('level', option.id).catch(() => {
      /* The choice still applies this session; it just won't be remembered. */
    })
  }, [])

  /**
   * The day's allowance, less what it has already been spent on. An extra
   * round ignores that and takes a fresh allowance — the point of asking for
   * one is to go past the day's shape, not to be told there is nothing left.
   */
  const optionsFor = useCallback(
    (extra: boolean): QueueOptions => ({
      ...DEFAULTS,
      newPerDay: extra ? DEFAULTS.newPerDay : Math.max(0, DEFAULTS.newPerDay - intake.words),
      followPerDay: extra
        ? DEFAULTS.followPerDay
        : Math.max(0, DEFAULTS.followPerDay - intake.follows),
      now: new Date(),
      rankOf,
      startRank: level.startRank,
    }),
    [intake, rankOf, level],
  )

  const preview = useMemo(
    () => buildQueue(cards, states, optionsFor(false)),
    [cards, states, optionsFor],
  )

  /** What one more round would hold, so the button can offer it honestly. */
  const extraPreview = useMemo(
    () => buildQueue(cards, states, optionsFor(true)),
    [cards, states, optionsFor],
  )

  /**
   * How many of this round are behind you, not which one you are on.
   *
   * It was `index + 1`, so the bar was full while the last card was still on
   * screen unanswered — a round that looks finished one question before it is.
   * `index` alone is the count moved past, and the answer in hand is added to
   * it so the bar moves when you answer rather than when you press on: empty
   * on the first question, full the moment the last one is in.
   *
   * Counted from the answer, not the reveal. On a multiple-choice card those
   * are the same moment; on one you grade yourself, revealing is asking to see
   * the answer before you have given one, and the bar used to move then.
   */
  const position = Math.min(index + (answered ? 1 : 0), queue.length)

  const stats: SessionStats = useMemo(() => {
    let known = 0
    for (const note of deck.notes) {
      const s = states.get(`${note.id}::recognize`)
      if (s && s.state === State.Review) known++
    }
    return {
      reviewed,
      correct: correctCount,
      known,
      total: deck.notes.length,
      // Everything the next session would ask, not just the due and the new:
      // the follow-up questions are questions too, and leaving them out made
      // the day look shorter than it was.
      waiting: preview.cards.length,
      extraWaiting: extraPreview.cards.length,
      doneToday,
      roundDone: position,
      roundSize: queue.length,
    }
  }, [deck, states, preview, extraPreview, reviewed, correctCount, doneToday, position, queue])

  /**
   * The round on disk, kept level with the round in hand.
   *
   * Written on every answer, which is the same rhythm the review log is
   * written at, and cleared the moment there is no round to be in the middle
   * of — a finished round is not something to come back to.
   */
  useEffect(() => {
    if (status === 'loading') return
    const round: SavedRound | null =
      status === 'reviewing' && queue.length
        ? {
            day: today(),
            ids: queue.map((c) => c.id),
            index,
            reviewed,
            correct: correctCount,
            points: sessionPoints,
          }
        : null
    void setMeta('round', round).catch(() => {})
  }, [status, queue, index, reviewed, correctCount, sessionPoints])

  /**
   * A day is finished when you have finished a round on it, or when there is
   * nothing left waiting either way.
   *
   * A round IS the day's duty — that is what the app asks of you and what the
   * end-of-round screen congratulates you for — so the dot fills when you
   * finish one. Waiting for the queue to empty meant a day you had worked
   * through still read as merely started, because a wrong answer comes back
   * round and the deck always has more to offer.
   *
   * Written down as it happens rather than worked out later: the review log
   * knows how many questions you answered, but not how many the day was
   * asking for, and by tomorrow that number is gone.
   */
  useEffect(() => {
    if (status === 'loading' || doneToday === 0) return
    if (status !== 'done' && preview.cards.length > 0) return
    const key = today()
    setFinished((was) => {
      if (was.has(key)) return was
      const next = [...was, key].sort().slice(-KEEP_DAYS)
      void setMeta('finishedDays', next).catch(() => {})
      return new Set(next)
    })
  }, [status, doneToday, preview])

  // Rebuilt when the days change rather than on a timer: the app is opened,
  // looked at, and put down, so midnight passing while it sits on screen is
  // not a case worth code.
  const week = useMemo(
    () => weekDays(new Date(), studied, finished, firstDay ?? today(), weekStartsOn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studied, finished, firstDay, weekStartsOn, doneToday],
  )

  const setWeekStartsOn = useCallback((day: WeekStartDay) => {
    setWeekStartsOnState(day)
    void setMeta('weekStart', day).catch(() => {})
  }, [])

  const start = useCallback(
    (extra = false) => {
      clearRevealTimer()
      // A round already in hand goes on rather than being replaced. The button
      // says "Keep going" and the bar under it is that round's own progress —
      // build a new queue here and the bar the button was showing belongs to a
      // round that no longer exists, which is exactly what it looked like: a
      // button two-ninths full opening a card screen at nothing.
      //
      // An extra round is the exception: it is asked for on purpose, past the
      // day's shape, and it is a new round by definition.
      if (!extra && status === 'reviewing' && index < queueRef.current.length) return
      const q = buildQueue(cards, states, optionsFor(extra))
      undoStack.current = []
      pending.current = { amount: 0, answers: 0 }
      // A crossing belongs to the round that earned it, celebrated or not.
      crossing.current = null
      setLevelUp(null)
      queueRef.current = q.cards
      recorded.current = false
      setQueue(q.cards)
      setIndex(0)
      setAnswered(false)
      setReviewed(0)
      setCorrectCount(0)
      setSessionPoints(0)
      setAward(null)
      setRevealed(false)
      setPicked(null)
      shownAt.current = Date.now()
      setStatus(q.cards.length ? 'reviewing' : 'done')
    },
    [cards, states, optionsFor, clearRevealTimer, status, index],
  )

  const card = queue[index] ?? null
  const note: Note | null = card ? (notes.get(card.noteId) ?? null) : null

  // Memoised on the card, not the render: multiple-choice options are shuffled
  // when they are built, so rebuilding on every render would reorder the
  // buttons under the user's finger.
  const prompt = useMemo(() => {
    if (!card || !note) return null
    const saved = states.get(card.id)
    return buildPrompt(card, note, {
      notes: deck.notes,
      // Multiple choice while learning, free recall once the word sticks.
      introduce: !saved || saved.state !== State.Review,
      // Which of the word's sentences to show: the next one each time.
      seen: saved?.reps ?? 0,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, note?.id, deck])

  promptRef.current = prompt

  const correct = useMemo(() => {
    if (!prompt || prompt.shape !== 'choice' || picked === null) return null
    return picked === prompt.answer
  }, [prompt, picked])

  const reveal = useCallback(() => setRevealed(true), [])

  /** Records the answer: persists it, scores it, and requeues a failure. */
  const record = useCallback(
    async (g: Grade) => {
      if (!card || recorded.current) return
      recorded.current = true
      setAnswered(true)
      const previous = states.get(card.id)
      const base = previous ?? emptyState(card.id)
      const now = new Date()
      const next = applyGrade(base, g, now)

      const earned = awardFor(g, base, next)

      const reviewId = await db.reviews.add({
        cardId: card.id,
        at: now.getTime(),
        rating: g,
        elapsedMs: Date.now() - shownAt.current,
      })
      await db.states.put(next)

      undoStack.current.push({
        previous,
        reviewId: reviewId as number,
        index,
        wasCorrect: correct,
        earned: earned.amount,
      })

      statesRef.current = new Map(statesRef.current).set(card.id, next)
      setStates(statesRef.current)
      // Worked out here rather than at the end of the round: the ladder is
      // crossed by one answer, and that is the moment worth marking.
      const before = rungAt(scoreRef.current)
      const after = rungAt(scoreRef.current + earned.amount)
      if (after.level > before.level) {
        crossing.current = { from: before, to: after, points: earned.amount, key: Date.now() }
      }
      setScore((s) => {
        const total = s + earned.amount
        void setMeta('score', total).catch(() => {})
        return total
      })
      setPointsToday((was) => {
        const key = today()
        // Anything earned before midnight belongs to the day it was earned on,
        // so the first answer after it starts the count again rather than
        // adding to yesterday's.
        const base = pointsDay.current === key ? was : 0
        pointsDay.current = key
        const next = base + earned.amount
        void setMeta('pointsToday', { day: key, points: next }).catch(() => {})
        return next
      })
      setSessionPoints((p) => p + earned.amount)
      setDoneToday((n) => n + 1)
      setStudied((was) => (was.has(today()) ? was : new Set(was).add(today())))
      setFirstDay((was) => was ?? today())

      // A card only counts against the day's allowance the first time it is
      // seen. Reviews are not intake — they are the debt the intake created.
      if (!previous) {
        setIntake((was) => {
          const now = spentToday(was)
          const next =
            card.type === 'recognize'
              ? { ...now, words: now.words + 1 }
              : { ...now, follows: now.follows + 1 }
          void setMeta('intake', next).catch(() => {})
          return next
        })
      }

      // A word graduating is worth interrupting for, whenever it happens.
      // Anything else waits its turn, and carries the banked points with it.
      pending.current.amount += earned.amount
      pending.current.answers += earned.amount > 0 ? 1 : 0
      if (earned.milestone || pending.current.answers >= BURST_EVERY) {
        if (pending.current.amount > 0) {
          setAward({
            amount: pending.current.amount,
            milestone: earned.milestone,
            key: Date.now(),
          })
        }
        pending.current = { amount: 0, answers: 0 }
      }
      setReviewed((n) => n + 1)
      if (g !== Rating.Again) setCorrectCount((n) => n + 1)

      // A failed card comes back later in the same session.
      if (g === Rating.Again) {
        queueRef.current = [...queueRef.current, card]
        setQueue(queueRef.current)
      }
    },
    [card, states, index, correct],
  )

  const choose = useCallback(
    (value: string) => {
      if (revealTimer.current || recorded.current) return // already answered
      setPicked(value)
      // The answer is known the instant it is given, so score it now — the
      // points belong to the moment you got it right, not to pressing Continue
      // afterwards.
      void record(value === promptRef.current?.answer ? Rating.Good : Rating.Again)
      // Then hold, so the option you pressed is visibly the one you pressed and
      // the points have the screen, before the answer takes their place.
      revealTimer.current = setTimeout(() => {
        revealTimer.current = null
        setRevealed(true)
      }, SELECT_DELAY)
    },
    [record],
  )

  /**
   * A multiple-choice answer is graded by the app, not by you — it already
   * knows whether you were right. Wrong becomes Again, right becomes Good.
   */
  const autoGrade: Grade | null = useMemo(() => {
    if (correct === null) return null
    return correct ? Rating.Good : Rating.Again
  }, [correct])

  /** Moves to the next card. Separate, so recording can happen earlier. */
  const advance = useCallback(() => {
    clearRevealTimer()
    // The next card is set up underneath either way; the level screen sits
    // over it until it is dismissed, so nothing has to be advanced twice.
    if (crossing.current) {
      setLevelUp(crossing.current)
      crossing.current = null
    }
    recorded.current = false
    setAnswered(false)
    setRevealed(false)
    setPicked(null)
    shownAt.current = Date.now()
    setIndex((i) => {
      // The queue was decided at the start of the session, but failing a word
      // partway through locks its other cards again — being asked to fill a
      // gap with a word you just got wrong is a question you can't answer.
      // Those are stepped over rather than asked.
      const q = queueRef.current
      let nextIndex = i + 1
      while (nextIndex < q.length && !isUnlocked(q[nextIndex], statesRef.current)) nextIndex++
      if (nextIndex >= q.length) setStatus('done')
      return nextIndex
    })
  }, [clearRevealTimer])

  /** Self-graded cards do both at once: you judge, then it moves on. */
  const grade = useCallback(
    async (g: Grade) => {
      await record(g)
      advance()
    },
    [record, advance],
  )

  const clearLevelUp = useCallback(() => setLevelUp(null), [])

  const undo = useCallback(async () => {
    clearRevealTimer()
    // The card is answerable again, so the guard that stops one card being
    // scored twice has to be lifted — without this, undo left every option
    // dead, because choose() saw the card as already answered.
    recorded.current = false
    const last = undoStack.current.pop()
    if (!last) return
    await db.reviews.delete(last.reviewId)
    const cardAt = queue[last.index]
    if (last.previous) await db.states.put(last.previous)
    else if (cardAt) await db.states.delete(cardAt.id)

    setStates((prev) => {
      const copy = new Map(prev)
      if (last.previous) copy.set(last.previous.cardId, last.previous)
      else if (cardAt) copy.delete(cardAt.id)
      return copy
    })
    setIndex(last.index)
    setReviewed((n) => Math.max(0, n - 1))
    setDoneToday((n) => Math.max(0, n - 1))
    if (last.earned) {
      pending.current = {
        amount: Math.max(0, pending.current.amount - last.earned),
        answers: Math.max(0, pending.current.answers - 1),
      }
      setScore((v) => {
        const total = Math.max(0, v - last.earned)
        void setMeta('score', total).catch(() => {})
        return total
      })
      setSessionPoints((p) => Math.max(0, p - last.earned))
    }
    setAnswered(false)
    setRevealed(false)
    setPicked(null)
    setStatus('reviewing')
    shownAt.current = Date.now()
  }, [queue])

  return {
    status,
    prompt,
    revealed,
    picked,
    correct,
    position,
    length: queue.length,
    stats,
    score,
    pointsToday,
    sessionPoints,
    award,
    levelUp,
    clearLevelUp,
    autoGrade,
    week,
    weekStartsOn,
    setWeekStartsOn,
    level,
    levelChosen,
    setLevel,
    theme,
    setTheme,
    coat,
    setCoat,
    voice,
    setVoice,
    mode,
    resolvedMode,
    setMode,
    autoContinue,
    setAutoContinue,
    start,
    checkDay,
    reveal,
    choose,
    grade,
    advance,
    undo,
    canUndo: undoStack.current.length > 0,
  }
}

export { isNew, Rating, type Grade }
