// ---------------------------------------------------------------------------
// Picking up a new build.
//
// Three things have to happen, and a service worker only does the first by
// itself: fetch the new build, take over from the old one, and tell the page
// that is still running the old code. The middle step is the one everybody
// gets wrong, this app included until now.
//
// A new worker installs into the cache and then WAITS. It will not take over
// while any page is open on the old one — that is the whole point of waiting,
// because swapping the code under a running page is how you get half of one
// build and half of another. It takes over when the last tab closes, so on a
// phone the new build arrives on the launch after the launch after the deploy.
// The only way to hurry it is to tell it to, which is the `SKIP_WAITING`
// message the generated worker listens for.
//
// So: the check asks the server, the worker installs in the background, and
// the message is sent at the one moment a reload costs nothing — sitting on
// the home screen, having pressed nothing. Not mid-card, where it would throw
// away the session, and not in Settings, where it would lose the row you were
// reading. Then it reloads, with a note for the page that comes back, because
// a build arriving silently reads as a glitch rather than as an event.
//
// The registration is ours rather than the one vite-plugin-pwa injects, for
// one reason: `updateViaCache: 'none'`. The spec only bypasses the browser's
// own cache for a worker script when the last fetch was over 24 hours ago, and
// Pages serves sw.js with `max-age=600` — so a check made within ten minutes
// of a deploy would be answered by the cached copy of the OLD worker, and the
// app would report itself up to date when it isn't.
// ---------------------------------------------------------------------------

const MARK = 'took-update'
const BASE = import.meta.env.BASE_URL

let registration: ServiceWorkerRegistration | null = null
/** A worker that has finished installing and is waiting to be let in. */
let pending: ServiceWorker | null = null
/** True while a reload would pass unnoticed: the home screen, doing nothing. */
let atRest = false

/**
 * Reload, having left a note for the page that comes back.
 *
 * sessionStorage because it wants exactly this scope — this tab, across this
 * one navigation — and because it is gone by the next launch whether or not
 * anyone read it.
 */
function take(): void {
  try {
    sessionStorage.setItem(MARK, '1')
  } catch {
    /* private browsing; the reload still happens, just unannounced */
  }
  location.reload()
}

/**
 * Read once, at module load, because reading it consumes it: the note is for
 * the first page after the reload and nobody else. A getter that cleared as a
 * side effect would answer differently depending on who asked first.
 */
const arrivedOnUpdate = ((): boolean => {
  try {
    const yes = sessionStorage.getItem(MARK) === '1'
    if (yes) sessionStorage.removeItem(MARK)
    return yes
  } catch {
    return false
  }
})()

/** Did this page load because a new build took over? */
export function tookUpdate(): boolean {
  return arrivedOnUpdate
}

/** Let the waiting worker in, and reload onto it once it is actually in. */
function letItIn(): void {
  if (!pending || !atRest) return
  const worker = pending
  pending = null
  worker.addEventListener('statechange', () => {
    // Not `controllerchange`: this worker does not claim the pages that are
    // already open, so that event never comes. Its own activation does.
    if (worker.state === 'activated') take()
  })
  worker.postMessage({ type: 'SKIP_WAITING' })
}

/**
 * Told by the UI whether this is a moment a reload would pass unnoticed.
 * Anything already waiting is let in on the way past.
 */
export function setAtRest(next: boolean): void {
  atRest = next
  if (atRest) letItIn()
}

/** Notice a worker that has installed and is waiting, whenever it appears. */
function watch(reg: ServiceWorkerRegistration): void {
  if (reg.waiting && navigator.serviceWorker.controller) {
    pending = reg.waiting
    letItIn()
  }
  reg.addEventListener('updatefound', () => {
    const fresh = reg.installing
    if (!fresh) return
    fresh.addEventListener('statechange', () => {
      // A worker reaching 'installed' with nothing controlling the page is a
      // first install, not an update: there is nothing to replace and nothing
      // to announce.
      if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
        pending = fresh
        letItIn()
      }
    })
  })
}

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  // After the first paint, like the registration this replaces: the worker is
  // for the visit after this one, and it can wait its turn behind the app.
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${BASE}sw.js`, { scope: BASE, updateViaCache: 'none' })
      .then((reg) => {
        registration = reg
        watch(reg)
      })
      .catch(() => {
        /* No worker: no offline, no updates, and the app still runs. */
      })
  })
}

/** What a check found. */
export type UpdateCheck = 'latest' | 'found' | 'failed'

/** Whether there is a worker at all — and so whether to offer the button. */
export function canCheckForUpdates(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Ask the server, now, whether there is a newer build.
 *
 * A found update needs nothing more from anyone: it installs in the
 * background, and `setAtRest` lets it in. All this returns is what the button
 * should say in the meantime.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!canCheckForUpdates()) return 'failed'
  const reg = registration ?? (await navigator.serviceWorker.getRegistration(BASE)) ?? null
  if (!reg) return 'failed'
  if (reg !== registration) {
    registration = reg
    watch(reg)
  }

  // A worker already on its way in is an update already found, so the check
  // can be a no-op and still have the right answer.
  let found = !!(reg.installing || reg.waiting)
  const noticed = () => {
    found = true
  }
  reg.addEventListener('updatefound', noticed)
  try {
    await reg.update()
  } catch {
    return 'failed'
  } finally {
    reg.removeEventListener('updatefound', noticed)
  }
  return found || !!reg.installing || !!reg.waiting ? 'found' : 'latest'
}
