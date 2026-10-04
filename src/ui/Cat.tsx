import { useEffect, useRef } from 'react'
import { catSvg, type CoatId } from '../core/cat'
import { CatRig, idle, SCENE, type SceneName } from '../core/cat-rig'
import { playTrick, stopTrick, type Trick } from '../core/cat-tricks'

// ---------------------------------------------------------------------------
// The mascot, as one element the rest of the app talks to in situations.
//
// She is built once and then never re-rendered: her moods are drawings that
// are all present from the start and hidden by attribute, and her poses are
// numbers in custom properties. A React re-render would restart her breath and
// drop every scheduled beat of the idle loop mid-flight, so the component
// deliberately does almost nothing after mounting — it hands the DOM node to
// the rig and gets out of the way.
//
// `scene` is the only thing that crosses the boundary. Screens name what is
// happening, never an expression, so the mapping can change here without any
// screen being touched.
// ---------------------------------------------------------------------------

interface Props {
  coat: CoatId
  /** The resting situation. Changing it moves her; it never re-renders her. */
  scene: SceneName
  /** A one-off, keyed so the same event twice still plays twice. */
  beat?: { scene: SceneName; key: number } | null
  /** A trick to play, keyed the same way. Nothing interrupts it but her going. */
  trick?: { name: Trick; key: number } | null
  /** Light or dark, for the rim of light she needs on a dark page. */
  rim?: boolean
  className?: string
  /** Height in px. The width follows from the drawing's own proportions. */
  size?: number
  label?: string
  /** Whether she may roll onto her back here. Only where she is at rest and in no one's way. */
  flips?: boolean
}

/**
 * Copy where every running animation had got to, element for element.
 *
 * The two trees are built by the same generator from the same arguments, so
 * they have the same shape and walking them together lines each animation up
 * with its own counterpart.
 */
function carryPhase(from: Element, to: Element) {
  const a = from.getAnimations()
  const b = to.getAnimations()
  for (let i = 0; i < Math.min(a.length, b.length); i++) b[i].currentTime = a[i].currentTime
  const ax = [...from.children]
  const bx = [...to.children]
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) carryPhase(ax[i], bx[i])
}

export function Cat({
  coat,
  scene,
  beat,
  trick,
  rim = false,
  className = '',
  size = 96,
  label,
  flips = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const rig = useRef<CatRig | null>(null)
  /**
   * What she was doing when the last drawing was torn down.
   *
   * React runs the old effect's cleanup before the new effect's body, so the
   * previous rig is already gone by the time the new one exists — the state
   * has to be caught on the way out and handed over on the way in.
   */
  const carried = useRef<ReturnType<CatRig['snapshot']> | null>(null)

  // Rebuilt only when the drawing itself changes — a different cat, or a
  // different ramp to stand on. Never for a mood.
  //
  // Changing coat fades out and then in, rather than cutting or crossing.
  //
  // Crossing was the obvious thing and it was wrong: two cats at half opacity
  // on top of each other show through one another, and every line that does
  // not line up between two coats — an ear patch, a goatee, a nose — is
  // briefly visible twice. One out, then one in, and only ever one cat on
  // screen.
  //
  // The old one goes out of flow rather than the new one, because the new one
  // has to hold the layout open: absolutely positioning the incoming cat
  // would collapse the row and everything below it would jump.
  useEffect(() => {
    const box = host.current
    if (!box) return
    const outgoing = box.firstElementChild as SVGElement | null

    const holder = document.createElement('div')
    holder.innerHTML = catSvg({ coat, mood: 'idle', rim, size, rig: true })
    const svg = holder.querySelector('svg')
    if (!svg) return
    svg.classList.add('cat-rig')
    svg.removeAttribute('width')
    svg.setAttribute('height', String(size))
    box.prepend(svg)

    if (outgoing) {
      outgoing.style.cssText = 'position:absolute;inset:0;margin:auto;pointer-events:none'
      const fade = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 150,
        easing: 'ease-out',
        fill: 'forwards',
      })
      fade.finished.then(() => outgoing.remove()).catch(() => outgoing.remove())
      // `backwards`, so she holds at nought through the delay instead of
      // sitting there at full strength waiting for her turn.
      //
      // She starts coming in forty milliseconds before the old one is quite
      // gone. Waiting for the gap left a frame with no cat in it at all,
      // which is the blink; overlapping only where both are under a fifth of
      // a strength is not the double image that crossing properly was.
      svg.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 190,
        delay: 110,
        easing: 'ease-in',
        fill: 'backwards',
      })
    }

    const r = new CatRig(svg, { flips })
    rig.current = r
    if (carried.current) r.restore(carried.current)
    const stopIdle = idle(svg)
    // And the loops themselves, AFTER the idle loop has started them — there
    // is nothing to line up with until it has. The breath and the knead begin
    // at zero on a new element, so without this the two cats breathe out of
    // step in front of each other, which is the one moment both are on screen
    // and the only moment it could show.
    if (outgoing) carryPhase(outgoing, svg)
    return () => {
      // Mid-trick, the trick goes with her: its props are drawn in her.
      stopTrick(r)
      carried.current = r.snapshot()
      stopIdle()
      r.destroy()
      rig.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coat, rim, size])

  useEffect(() => {
    if (rig.current) SCENE[scene](rig.current)
  }, [scene])

  useEffect(() => {
    if (beat && rig.current) SCENE[beat.scene](rig.current)
  }, [beat])

  useEffect(() => {
    if (trick && rig.current) void playTrick(rig.current, trick.name)
  }, [trick])

  return (
    <div
      ref={host}
      className={`relative flex justify-center ${className}`}
      // She answers a poke, so she is a button — but a decorative one, and the
      // label says which cat and nothing about what pressing her achieves,
      // because pressing her achieves nothing.
      role="button"
      tabIndex={0}
      aria-label={label ?? 'The cat'}
      onClick={() => rig.current?.tap()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          rig.current?.tap()
        }
      }}
    />
  )
}
