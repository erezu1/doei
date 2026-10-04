import { useEffect, useRef } from 'react'
import { catSvg, paint, type CoatId } from '../core/cat'
import { CatRig, idle, SCENE, type Beats, type SceneName } from '../core/cat-rig'
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
   * Only across a screen, now that a coat is paint: she is on the home screen
   * and on the card screen, and walking between them is still a new element.
   * React runs the old effect's cleanup before the new effect's body, so the
   * previous rig is already gone by the time the new one exists — the state
   * has to be caught on the way out and handed over on the way in.
   */
  const carried = useRef<ReturnType<CatRig['snapshot']> | null>(null)
  /**
   * And how long each of her idle beats still had to wait, for the same
   * reason: a drawing that starts its own stagger blinks and glances at times
   * the cat you were watching had not chosen.
   */
  const beats = useRef<Beats | null>(null)

  // Built once, for the size she is drawn at, and never again: the coat and
  // the rim are custom properties on the element, so changing either is
  // `paint` rather than a new cat.
  //
  // It used to be a new cat, faded out and in, and everything else in this
  // file was the consequence — her pose, her idle clock and a roll in mid-air
  // caught on the way out and handed back on the way in. The fade is gone
  // with it: there is nothing to fade BETWEEN, only an element whose colours
  // changed.
  useEffect(() => {
    const box = host.current
    if (!box) return
    const holder = document.createElement('div')
    holder.innerHTML = catSvg({ coat, mood: 'idle', rim, size, rig: true })
    const svg = holder.querySelector('svg')
    if (!svg) return
    svg.classList.add('cat-rig')
    svg.removeAttribute('width')
    svg.setAttribute('height', String(size))
    box.prepend(svg)

    const r = new CatRig(svg, { flips })
    rig.current = r
    if (carried.current) r.restore(carried.current)
    const loop = idle(svg, { resume: beats.current ?? undefined })
    return () => {
      // Mid-trick, the trick goes with her: its props are drawn in her.
      stopTrick(r)
      carried.current = r.snapshot()
      beats.current = loop.pending()
      loop.stop()
      r.destroy()
      rig.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  // Her coat, and the rim of light a dark page needs behind her. Both are
  // paint on an element that stays exactly as it was.
  useEffect(() => {
    const svg = host.current?.querySelector('svg')
    if (svg) paint(svg, coat, { rim })
  }, [coat, rim])

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
