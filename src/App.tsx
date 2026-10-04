import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import deckCore from './content/deck-core.json'
import type { Deck } from './core/types'
import { setAtRest } from './core/update'
import { useSession } from './session/useSession'
import { Done } from './ui/Done'
import { LevelUp } from './ui/LevelUp'
import { Home } from './ui/Home'
import { InstallPrompt } from './ui/InstallPrompt'
import { LevelPicker } from './ui/LevelPicker'
import { glide, screenVariants } from './ui/motion'
import { ReviewScreen } from './ui/ReviewScreen'
import { Settings } from './ui/Settings'
import { UpdateToast } from './ui/UpdateToast'
import { Welcome } from './ui/Welcome'

const deck = deckCore as Deck

/**
 * Every screen enters and leaves the same way, so no change is abrupt.
 *
 * The key belongs on this component where it is used, not on the motion.div
 * inside it: AnimatePresence tracks the identity of its own direct children,
 * so a key hidden one level down is invisible to it and no exit ever runs.
 */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={screenVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={glide}
      // The window, exactly — not "at least the window".
      //
      // At least meant the column grew to whatever was inside it, and a
      // screen laid out against a column taller than the glass puts things
      // off the top of it: the card page's cat is drawn above the header,
      // in room the header makes for her, and that room is only in the right
      // place if the header is where it thinks it is. A definite height also
      // means flex-1 is the remainder rather than a negotiation with the
      // content, so the card is whatever is left over and nothing overflows.
      //
      // Screens longer than the glass scroll inside themselves instead.
      className="flex h-full flex-col"
    >
      {children}
    </motion.div>
  )
}

type ScreenName = 'home' | 'review' | 'level' | 'settings'

/**
 * Screen changes go through the browser history, so the phone's back gesture
 * steps back through the app instead of closing it.
 *
 * Leaving a screen from inside the app calls history.back() rather than
 * setting the screen directly — otherwise every visit would leave an entry
 * behind and you would have to press back several times to get out.
 */
/**
 * Screens that survive a reload.
 *
 * All three are places you can be in the middle of something, so losing them
 * to a refresh is losing your place. The round is here because the queue is
 * written down now and comes back with it; if it ever doesn't — a round from
 * yesterday, a card that has left the deck — the session comes back idle and
 * this falls through to home, which is why the guard below exists.
 */
const RESTORE = new Set(['settings', 'level', 'review'])

const fromHash = (): ScreenName => {
  const h = window.location.hash.slice(1)
  return RESTORE.has(h) ? (h as ScreenName) : 'home'
}

/**
 * One screen, one history entry, and the entry is in the URL.
 *
 * Every screen but home pushes, so the phone's back button always walks back
 * exactly one screen — and home pushes nothing, which is what makes back from
 * home leave the app rather than unwinding a stack of states nobody made.
 */
function useScreenHistory(): [ScreenName, (next: ScreenName) => void] {
  const [screen, setScreen] = useState<ScreenName>(fromHash)

  useEffect(() => {
    // Landed directly on a screen, by reload or by link. The entry underneath
    // it is the one the browser made, so back would leave — put home there
    // first, so back from a reloaded Settings goes where it goes every other
    // time.
    const h = window.location.hash
    if (h && RESTORE.has(h.slice(1))) {
      const bare = window.location.pathname + window.location.search
      window.history.replaceState({ screen: 'home' }, '', bare)
      window.history.pushState({ screen: h.slice(1) }, '', h)
    }
  }, [])

  useEffect(() => {
    const onPop = () => setScreen(fromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = useCallback((next: ScreenName) => {
    if (next === 'home') {
      // popstate sets the screen, so the button and the gesture stay identical.
      if (window.location.hash) window.history.back()
      else setScreen('home')
      return
    }
    window.history.pushState({ screen: next }, '', `#${next}`)
    setScreen(next)
  }, [])

  return [screen, go]
}

export default function App() {
  const session = useSession(deck)
  const [screen, setScreen] = useScreenHistory()
  // Only ever seen before a level is chosen, which is stored, so it shows once.
  const [greeted, setGreeted] = useState(false)

  // Every arrival at home asks whether the day has turned over under it.
  const { checkDay } = session
  useEffect(() => {
    if (screen === 'home') checkDay()
  }, [screen, checkDay])

  // A new build waits for the home screen before it takes the screen. The
  // home screen is the whole test: a round in progress is kept in the
  // database, not in this page, so landing back here with one half done and
  // reloading costs nothing — and asking for an idle session as well would
  // park the update until the round was finished, which could be days.
  useEffect(() => {
    setAtRest(screen === 'home')
  }, [screen])

  // Reloaded onto #review with no round to show — the saved one was yesterday's,
  // or its cards are no longer in the deck. Send the URL back to home rather
  // than leaving a history entry pointing at a screen that isn't there.
  useEffect(() => {
    if (screen !== 'review') return
    if (session.status === 'reviewing' || session.status === 'done') return
    if (session.status === 'loading') return
    setScreen('home')
  }, [screen, session.status, setScreen])

  if (session.status === 'loading') {
    return <div className="grid h-full place-items-center text-on-surface-dim">…</div>
  }

  const firstRun = !session.levelChosen
  const showWelcome = firstRun && !greeted
  // Asked once, after the welcome.
  const showLevel = (firstRun && greeted) || screen === 'level'
  // A level finished takes the screen the moment it finishes, whether the
  // round is over or not — and when it was the last card of the round, it goes
  // first and the round's own ending follows it.
  const leveling = !showLevel && screen === 'review' && session.levelUp !== null
  const reviewing = !leveling && !showLevel && screen === 'review' && session.status === 'reviewing'
  const finished = !leveling && !showLevel && screen === 'review' && session.status === 'done'

  return (
    <>
      <UpdateToast />
      <InstallPrompt />
      <AnimatePresence mode="wait" initial={false}>
        {showWelcome ? (
          <Screen key="welcome">
            <Welcome
              coat={session.coat}
              dark={session.resolvedMode === 'dark'}
              onBegin={() => setGreeted(true)}
            />
          </Screen>
        ) : showLevel ? (
          <Screen key="level">
            <LevelPicker
              current={session.levelChosen ? session.level : undefined}
              known={session.stats.known}
              onPick={(option) => {
                session.setLevel(option)
                setScreen('home')
              }}
              onCancel={session.levelChosen ? () => setScreen('home') : undefined}
            />
          </Screen>
        ) : leveling ? (
          <Screen key={`level-up-${session.levelUp!.key}`}>
            <LevelUp
              from={session.levelUp!.from}
              to={session.levelUp!.to}
              points={session.levelUp!.points}
              left={Math.max(0, session.length - session.position)}
              coat={session.coat}
              dark={session.resolvedMode === 'dark'}
              onContinue={session.clearLevelUp}
              onHome={() => {
                session.clearLevelUp()
                setScreen('home')
              }}
            />
          </Screen>
        ) : reviewing ? (
          <Screen key="review">
            <ReviewScreen
              session={session}
              coat={session.coat}
              dark={session.resolvedMode === 'dark'}
              onExit={() => setScreen('home')}
            />
          </Screen>
        ) : screen === 'settings' ? (
          <Screen key="settings">
            <Settings
              voice={session.voice}
              onVoice={session.setVoice}
              weekStartsOn={session.weekStartsOn}
              onWeekStartsOn={session.setWeekStartsOn}
              autoContinue={session.autoContinue}
              onAutoContinue={session.setAutoContinue}
              mode={session.mode}
              onMode={session.setMode}
              onBack={() => setScreen('home')}
            />
          </Screen>
        ) : finished ? (
          <Screen key="done">
            <Done
              stats={session.stats}
              points={session.sessionPoints}
              coat={session.coat}
              dark={session.resolvedMode === 'dark'}
              onHome={() => setScreen('home')}
              onMore={(extra) => {
                session.start(extra)
                setScreen('review')
              }}
            />
          </Screen>
        ) : (
          <Screen key="home">
            <Home
              stats={session.stats}
              score={session.score}
              level={session.level}
              week={session.week}
              theme={session.theme}
              coat={session.coat}
              onChangeCoat={session.setCoat}
              resolvedMode={session.resolvedMode}
              onChangeTheme={session.setTheme}
              onChangeLevel={() => setScreen('level')}
              onOpenSettings={() => setScreen('settings')}
              onStart={(extra) => {
                session.start(extra)
                setScreen('review')
              }}
            />
          </Screen>
        )}
      </AnimatePresence>
    </>
  )
}
