import { headPath, lidPaths, EAR_TURN, type Mood } from './cat'

// ---------------------------------------------------------------------------
// On her back: the half turn onto her crown, the things she does while she is
// down there, and the half turn back.
//
// This is the one move the rest of the rig cannot express. Every other pose is
// a set of numbers handed to CSS, and CSS walks her there — but a half turn
// about her middle takes the flat of her head from her chin to her crown, her
// paws round the outside of her head rather than through the floor, and the
// light on her the other way from the turn. None of that is a channel. So for
// as long as she is over, one frame loop drives the parts directly, and when
// she is back up it hands every one of them back exactly as it found them.
//
// One number, p, runs from 0 (upright) to 1 (on her back), and everything is a
// function of it plus the clock — so the move can be played either way, and a
// reaction laid over the top of it composes with wherever the turn has got to.
// ---------------------------------------------------------------------------

type Path = { cmds: string[]; nums: number[][] }
const parse = (d: string): Path => {
  const cmds: string[] = [],
    nums: number[][] = []
  for (const m of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
    cmds.push(m[1])
    nums.push((m[2].match(/-?\d*\.?\d+/g) ?? []).map(Number))
  }
  return { cmds, nums }
}
const write = (p: Path) =>
  p.cmds.map((c, i) => c + p.nums[i].map((v) => v.toFixed(2)).join(' ')).join('')
const lerpPath = (a: Path, b: Path, t: number): Path => ({
  cmds: a.cmds,
  nums: a.nums.map((row, i) => row.map((v, j) => v + (b.nums[i][j] - v) * t)),
})
const map = (a: Path, f: (x: number, y: number) => [number, number]): Path => ({
  cmds: a.cmds,
  nums: a.nums.map((row) => row.flatMap((_, j) => (j % 2 ? [] : f(row[j], row[j + 1])))),
})

// She turns about her own middle: halfway between the crown (14.95) and the
// floor (100), so a half turn lands her crown exactly where her chin was.
const CX = 60,
  CY = 57.5
const REST = parse(headPath(0.85))
// Off the floor and turning, a head has no flat on it anywhere: the round
// head, moved down three so its centre is the centre she turns about.
const ROUND = map(parse(headPath(0)), (x, y) => [x, y + 3])
// What she arrives at is the shape that, turned half round, reads on screen as
// a head resting on its crown — flat on the floor, domed where it is free. It
// is a resting head turned half round in her own frame, not one mirrored top
// for bottom: mirrored, every point is on the wrong side and the blend folds
// the head flat halfway. Turning keeps the points in order, and a circle about
// the centre she turns on is the same circle turned, so the switch from one
// half of the blend to the other lands on the one frame it cannot show.
//
// Halfway to the flat, lying-down head rather than the resting one: landing on
// her crown spreads her more than sitting on her chin does.
const turned = (a: Path) => map(a, (x, y) => [2 * CX - x, 2 * CY - y])
// Where a shape meets the floor, left and right: the ends of its flat. A head
// resting on a flat rocks on those corners, not about its middle — rocked
// about the middle, one side of the flat went into the carpet and the other
// came off it.
const feet = (a: Path): [number, number, number] => {
  // Sampled along the curves themselves, not read off the control points —
  // a control point can sit on the floor line well out past where the curve
  // has already lifted off it.
  const pts: [number, number][] = []
  let x0 = a.nums[0][0],
    y0 = a.nums[0][1]
  for (let i = 1; i < a.cmds.length; i++) {
    const r = a.nums[i]
    if (a.cmds[i] !== 'C') continue
    for (let k = 0; k <= 24; k++) {
      const t = k / 24,
        u = 1 - t
      const x = u * u * u * x0 + 3 * u * u * t * r[0] + 3 * u * t * t * r[2] + t * t * t * r[4]
      const y = u * u * u * y0 + 3 * u * u * t * r[1] + 3 * u * t * t * r[3] + t * t * t * r[5]
      pts.push([x, y])
    }
    x0 = r[4]
    y0 = r[5]
  }
  // What counts as on the floor is everything within a unit and a half of the
  // lowest point — the base is a very shallow curve, and what it rocks on is
  // the width that visibly sits on the carpet, not the sliver that touches it.
  const floor = Math.max(...pts.map((q) => q[1]))
  const xs = pts.filter((q) => q[1] >= floor - 1.5).map((q) => q[0])
  return [Math.min(...xs), Math.max(...xs), floor]
}
// Upright she stands on her chin; upside down, on her crown — which, turned
// half round, is the flat of the shape she lands in, back on screen.
const FEET_UP = feet(REST)
const FEET_DOWN = feet(parse(headPath(0.99)))
const ROUND_T = turned(ROUND)
const REST_T = turned(parse(headPath(0.99)))

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a))
const smooth = (t: number) => t * t * (3 - 2 * t)
const bump = (p: number, a: number, b: number) => Math.sin(Math.PI * seg(p, a, b))
// Overshoots by a little and comes back: weight arriving, not a value
// reaching a target.
const land = (t: number, k = 1.5) => {
  const u = t - 1
  return 1 + (k + 1) * u * u * u + k * u * u
}

// The turn is one steep curve. She starts slowly — a lean you could mistake
// for curiosity — then nearly all of the half turn goes by at once, and she
// arrives slowly. A logistic does exactly that with no seams in it.
const K = 30
const S = (t: number, k: number) => {
  const f = (x: number) => 1 / (1 + Math.exp(-k * (x - 0.5)))
  return (f(clamp(t)) - f(0)) / (f(1) - f(0))
}
// How fast the turn is going, as a 0..1 pulse centred on the whip: the
// logistic's own derivative, so it is exactly as sharp as the turn.
const whipAt = (t: number, k: number) => {
  const e = Math.exp(-k * (clamp(t) - 0.5))
  return (4 * e) / ((1 + e) * (1 + e))
}
// The whip at a third of the way through rather than halfway, so the lean
// before it is a lean and not a wait; the time it gives up goes to the landing.
const rollOf = (p: number) => {
  const raw = seg(p, 0.03, 0.86)
  return raw < 0.34 ? raw * (0.5 / 0.34) : 0.5 + (raw - 0.34) * (0.5 / 0.66)
}

export type FlipMood = 'happy' | 'yawn' | 'up' | 'down' | 'swat'
/**
 * What she is doing on her back when nothing in particular is happening —
 * held, not a one-shot. Content on the home screen; on the card screen she is
 * still reading with you, upside down, and her eyes go across the card the
 * way they do the right way up: left, middle, right, settling into one and
 * staying a while.
 */
export type FlipRest = 'content' | 'downL' | 'downC' | 'downR'
const REST_GAZE: Record<FlipRest, [number, number]> = {
  content: [0, 0],
  downL: [-4.5, 4.5],
  downC: [0, 5],
  downR: [4.5, 4.5],
}
// A little lean after her eyes, as the upright reading looks have.
const REST_ROCK: Record<FlipRest, number> = { content: 0, downL: 3, downC: 0, downR: -3 }
/** The numbers of an upright mood that the roll back has to arrive at. */
export interface Landing {
  squash: number
  rise: number
  tilt: number
  earTurn: number
  earOut: number
  earDown: number
}
export const landingOf = (m: Mood): Landing => ({
  squash: m.squash ?? 0.85,
  rise: m.rise ?? 0,
  tilt: m.tilt ?? 0,
  earTurn: m.ear ? (EAR_TURN[m.ear] ?? 0) : 0,
  earOut: m.earOut ?? 0,
  earDown: m.earDown ?? 0,
})
const MOOD_MS: Record<FlipMood, number> = {
  happy: 1900,
  yawn: 2800,
  up: 2200,
  down: 2200,
  swat: 1150,
}
const envelope = (t: number, a = 0.18, r = 0.28) =>
  t <= 0 || t >= 1 ? 0 : Math.min(smooth(clamp(t / a)), smooth(clamp((1 - t) / r)))

// How long a replaced reaction takes to let go.
const LET_GO = 260
const OVER_MS = 1600
const BACK_MS = 1500
const JUMP_MS = 1050

interface MoodRun {
  name: FlipMood
  at: number
  side: number
  endAt: number
}
interface Saved {
  el: SVGElement
  transform: string
  origin: string
  box: string
  transition: string
}

export class Flip {
  svg: SVGSVGElement
  /** 0 upright, 1 on her back. */
  p = 0
  /**
   * Still cross. Set for the jump back up after a swat, so the glare and the
   * flat ears go all the way up with her instead of being dropped the instant
   * the swipe is over — the swat was the point she decided you were done.
   */
  sulk = false
  #from = 0
  #to = 0
  #t0 = 0
  #dur = 1
  #raf = 0
  #then: (() => void) | null = null
  /**
   * What she is doing on her back, newest last. A reaction that is replaced
   * is not dropped: it lets go over a quarter of a second while the new one
   * comes in, so nothing she was doing — a yawn's stretch, a lean, a reach —
   * vanishes in a frame. One slot, replaced outright, was what made a touch
   * mid-yawn snap her into the next thing.
   */
  #moods: MoodRun[] = []
  #side = 1
  #rest: FlipRest = 'content'
  #restW: Record<FlipRest, number> = { content: 1, downL: 0, downC: 0, downR: 0 }
  #last = 0
  /** The upright mood she is getting up into, and when to hand her face over to it. */
  #land: Landing | null = null
  #landShape: Path | null = null
  #onShadow: (() => void) | null = null
  #faceHeld = false
  #face: (eyes: string, mouth: string) => void
  #shown = ''
  #saved: Saved[] = []
  #skullD: { el: SVGElement; d: string; transition: string }[] = []
  #contactOpacity = ''
  #contactTf: (string | null)[] = []

  heads: SVGElement[]
  earsL: SVGElement[]
  earsR: SVGElement[]
  pawsL: SVGElement[]
  pawsR: SVGElement[]
  skulls: SVGElement[]
  shade: Element | null
  contact: SVGElement[]
  whiskers: SVGElement[]
  #whiskerTf: string[] = []
  contactClip: SVGElement | null
  glints: { el: SVGElement; cx: number; cy: number }[]
  lids: {
    mask: SVGPathElement
    lash: SVGPathElement | null
    cx: number
    cy: number
    rx: number
    ry: number
    t0: number
  }[]

  constructor(svg: SVGSVGElement, face: (eyes: string, mouth: string) => void) {
    this.svg = svg
    this.#face = face
    const q = <T extends Element>(s: string) => [...svg.querySelectorAll<T>(s)]
    // Every part is drawn twice — the outline pass, then the fills — and both
    // copies have to move as one or the union silhouette tears.
    this.heads = q('.cat-head')
    this.earsL = q('.cat-ear-l')
    this.earsR = q('.cat-ear-r')
    this.pawsL = q('.cat-paw-l')
    this.pawsR = q('.cat-paw-r')
    this.skulls = q('.cat-skull, .cat-skull-line, .cat-shade')
    // The coat's clip turns with the head; the contact shadow's does not — it
    // lives on screen, where the outline ends up the resting one anyway.
    const coatClip = svg.querySelector<SVGElement>('clipPath[id$="s"] .cat-skull-clip')
    if (coatClip) this.skulls.push(coatClip)
    this.shade = svg.querySelector('radialGradient[id$="v"]')
    this.contact = q('.cat-contact ellipse')
    // The paws' shadows are cut with an outline of their own, on screen. It
    // has to be her outline as it is right now — turned, lifted, flattened —
    // or upside down the shadow is cut to a head that is not there.
    this.contactClip = svg.querySelector<SVGElement>('clipPath[id$="body"] .cat-skull-clip')
    if (this.contactClip) this.skulls.push(this.contactClip)
    this.whiskers = q('.cat-whiskers')
    // Only the glints turn back against her, about the pupil's own centre: the
    // pupil sits toward her nose, and turning all of it back about the eye's
    // centre carried it across the eye, so she looked past you.
    this.glints = q<SVGGElement>('.cat-pupil').flatMap((g) => {
      const e = g.querySelector('ellipse')
      if (!e) return []
      const cx = +e.getAttribute('cx')!,
        cy = +e.getAttribute('cy')!
      return [...g.querySelectorAll<SVGElement>('circle')].map((el) => ({ el, cx, cy }))
    })
    this.lids = q<SVGPathElement>('.cat-lidmask').map((mask) => {
      const d = mask.dataset
      const lash = mask.closest('[data-eyes]')?.querySelector<SVGPathElement>('.cat-lash') ?? null
      return { mask, lash, cx: +d.cx!, cy: +d.cy!, rx: +d.rx!, ry: +d.ry!, t0: +d.t0! }
    })
  }

  /** Anywhere but upright, or on the way. */
  get engaged() {
    return this.#raf !== 0 || this.p > 0
  }
  /** All the way over and not moving. */
  get down() {
    return this.p === 1 && this.#to === 1
  }
  get turning() {
    return this.p !== this.#to
  }

  over(then?: () => void) {
    this.#land = null
    this.#onShadow = null
    this.#faceHeld = false
    this.#go(1, OVER_MS, then)
  }
  /**
   * Back up — into a particular upright mood. The last stretch of the roll
   * blends her head's shape, lift, lean and ears to that mood's own numbers,
   * and just before, `shadow` lets the rig put on that mood's face and
   * channels, so that when she is handed back the rig's drawing of her is
   * the frame after the last one drawn here rather than a new move.
   */
  back(
    { quick = false, land, shadow }: { quick?: boolean; land?: Landing; shadow?: () => void } = {},
    then?: () => void,
  ) {
    this.#land = land ?? null
    this.#landShape = land ? parse(headPath(land.squash)) : null
    this.#onShadow = shadow ?? null
    this.#faceHeld = false
    this.#go(0, quick ? JUMP_MS : BACK_MS, then)
  }
  setRest(r: FlipRest) {
    this.#rest = r
  }
  get rest() {
    return this.#rest
  }
  /** The strongest thing she is doing right now: a reaction if one is under way, else her rest. */
  dominant(): FlipMood | FlipRest {
    const now = performance.now()
    let best: MoodRun | null = null,
      bw = 0.15
    for (const m of this.#moods) {
      if (Number.isFinite(m.endAt)) continue
      const w = envelope((now - m.at) / MOOD_MS[m.name])
      if (w > bw) {
        bw = w
        best = m
      }
    }
    return best?.name ?? this.#rest
  }
  /** How long the newest reaction of this kind has left to run. */
  remaining(name: FlipMood) {
    const m = this.#moods.filter((x) => x.name === name).at(-1)
    return m ? Math.max(0, MOOD_MS[name] - (performance.now() - m.at)) : 0
  }
  /** Straight onto her back with no move — for a redraw that happens while she is already there. */
  set(p: number) {
    this.#take()
    this.p = this.#from = this.#to = p
    this.#run()
  }

  /**
   * Where she is in a roll, so a redraw can pick it up.
   *
   * Everything here is either a number or a reaction stamped with the clock
   * both drawings read, which is what lets the new one carry on rather than
   * start again: a cat caught a third of the way over used to be redrawn on
   * her feet, and for a moment you saw a different cat in a different mood.
   */
  reading() {
    return {
      p: this.p,
      to: this.#to,
      rest: this.#rest,
      side: this.#side,
      sulk: this.sulk,
      moods: this.#moods.map((m) => ({ ...m })),
    }
  }

  /** Put a fresh drawing exactly where the last one was. The move itself is
   *  re-issued by the rig, which owns what happens when it lands. */
  place(was: ReturnType<Flip['reading']>) {
    this.#rest = was.rest
    this.#side = was.side
    this.sulk = was.sulk
    this.#moods = was.moods.map((m) => ({ ...m }))
    this.set(was.p)
  }

  react(name: FlipMood) {
    if (name === 'swat') this.#side = -this.#side
    const now = performance.now()
    for (const m of this.#moods) if (!Number.isFinite(m.endAt)) m.endAt = now
    this.#moods.push({ name, at: now, side: this.#side, endAt: Infinity })
    this.#run()
  }
  get mood() {
    const m = this.#moods.at(-1)
    return m && !Number.isFinite(m.endAt) ? m.name : null
  }
  static ms(name: FlipMood) {
    return MOOD_MS[name]
  }

  destroy() {
    cancelAnimationFrame(this.#raf)
    this.#raf = 0
    if (this.#saved.length) this.#give()
  }

  #go(to: number, ms: number, then?: () => void) {
    this.#take()
    this.#from = this.p
    this.#to = to
    this.#t0 = performance.now()
    this.#dur = ms * Math.max(0.35, Math.abs(to - this.p))
    this.#then = then ?? null
    this.#run()
  }

  #run() {
    if (this.#raf) return
    const step = (now: number) => {
      this.#raf = 0
      // Every frame drawn is drawn over parts that have been written down, so
      // there is always something exact to hand back.
      this.#take()
      if (this.p !== this.#to) {
        const k = clamp((now - this.#t0) / this.#dur)
        this.p = k >= 1 ? this.#to : this.#from + (this.#to - this.#from) * k
      }
      this.#moods = this.#moods.filter(
        (m) => now - m.at < MOOD_MS[m.name] && now - m.endAt < LET_GO,
      )
      this.#pose(now)
      const then = this.p === this.#to ? this.#then : null
      if (then) this.#then = null
      // Back up with nothing left to do: hand every part back and stop, and
      // only then say so — whatever happens next poses the rig's own drawing.
      if (this.p === 0 && this.#to === 0 && !this.#moods.length) {
        this.#give()
        then?.()
        return
      }
      then?.()
      // `then` may have started the loop itself — a reaction on landing — and
      // one loop is the most there can be. Two drew over each other, and the
      // second went on drawing after the first had handed her parts back.
      if (!this.#raf) this.#raf = requestAnimationFrame(step)
    }
    this.#raf = requestAnimationFrame(step)
  }

  // Everything this drives has a value the rest of the rig owns. It is
  // written down on the way in and put back on the way out, so being upright
  // again is the rig's own drawing, not an approximation of it.
  #take() {
    if (this.#saved.length) return
    const els = [
      ...this.heads,
      ...this.earsL,
      ...this.earsR,
      ...this.pawsL,
      ...this.pawsR,
      ...this.glints.map((g) => g.el),
      ...(this.contactClip ? [this.contactClip] : []),
    ]
    this.#saved = els.map((el) => ({
      el,
      transform: el.style.transform,
      origin: el.style.transformOrigin,
      box: el.style.transformBox,
      transition: el.style.transition,
    }))
    for (const el of els) {
      el.style.transformBox = 'view-box'
      el.style.transition = 'none'
    }
    this.#skullD = this.skulls.map((el) => ({
      el,
      d: el.style.getPropertyValue('d'),
      transition: el.style.transition,
    }))
    for (const el of this.skulls) el.style.transition = 'none'
    this.#contactOpacity =
      (this.contact[0]?.parentNode as SVGElement | null)?.getAttribute('opacity') ?? ''
    this.#contactTf = this.contact.map((c) => c.getAttribute('transform'))
    this.#whiskerTf = this.whiskers.map((w) => w.style.transform)
    this.#shown = ''
    this.svg.dataset.flip = '1'
  }

  #give() {
    for (const s of this.#saved) {
      s.el.style.transform = s.transform
      s.el.style.transformOrigin = s.origin
      s.el.style.transformBox = s.box
      s.el.style.transition = s.transition
    }
    // The head's outline is left as the last frame drew it, which is the shape
    // of the mood she is landing in — putting back the shape from before she
    // went over and letting the rig's transition walk it to the new one was a
    // second, smaller move after the landing.
    for (const s of this.#skullD) {
      if (!this.#land) s.el.style.setProperty('d', s.d)
      s.el.style.transition = s.transition
    }
    this.contact.forEach((c, i) => {
      const t = this.#contactTf[i]
      if (t === null) c.removeAttribute('transform')
      else c.setAttribute('transform', t)
    })
    const g = this.contact[0]?.parentNode as SVGElement | null
    if (g && this.#contactOpacity) g.setAttribute('opacity', this.#contactOpacity)
    this.shade?.removeAttribute('gradientTransform')
    this.svg.style.removeProperty('--gaze-x')
    this.svg.style.removeProperty('--gaze-y')
    for (const l of this.lids) {
      const lp = lidPaths(l.cx, l.cy, l.rx, l.ry, l.t0)
      l.mask.setAttribute('d', lp.mask)
      l.lash?.setAttribute('d', lp.lash)
    }
    this.whiskers.forEach((w, i) => {
      w.style.transform = this.#whiskerTf[i]
    })
    this.#saved = []
    this.#skullD = []
    this.sulk = false
    delete this.svg.dataset.flip
  }

  #show(eyes: string, mouth: string) {
    if (this.#faceHeld) return
    const key = eyes + '/' + mouth
    if (key === this.#shown) return
    this.#shown = key
    this.#face(eyes, mouth)
  }

  #pose(now: number) {
    const p = this.p,
      time = now / 1000
    // Each reaction's weight is its own envelope, times how far it has let go
    // if something has replaced it. Each keeps its own clock, so the parts of
    // it that move through time — a reach, a lean — carry on while it fades.
    const weight = (m: MoodRun) =>
      envelope((now - m.at) / MOOD_MS[m.name]) *
      (Number.isFinite(m.endAt) ? 1 - smooth(clamp((now - m.endAt) / LET_GO)) : 1)
    const is = (n: FlipMood) =>
      Math.min(
        1,
        this.#moods.reduce((a, m) => a + (m.name === n ? weight(m) : 0), 0),
      )
    const clockOf = (n: FlipMood) => {
      const m = this.#moods.filter((x) => x.name === n).at(-1)
      return m ? (now - m.at) / MOOD_MS[n] : 1
    }
    const md = this.#moods.at(-1)
    // Her rest moves between its looks the way a held gaze does: eased there
    // over a quarter of a second, never switched.
    const dt = this.#last ? Math.min(0.1, (now - this.#last) / 1000) : 0
    this.#last = now
    const k = 1 - Math.exp(-dt / 0.25)
    for (const r of Object.keys(this.#restW) as FlipRest[])
      this.#restW[r] += ((r === this.#rest ? 1 : 0) - this.#restW[r]) * k
    const rw = this.#restW
    // Getting up into a mood: the last fifth of the way back is where her
    // head takes on that mood's shape, lift, lean and ears. Just before it
    // starts, the rig is told, and puts the mood's face and channels on.
    const L = this.#land
    if (L && this.#to === 0 && this.p < 0.3 && this.#onShadow) {
      const f = this.#onShadow
      this.#onShadow = null
      this.#faceHeld = true
      f()
    }
    const u = L && this.#to === 0 ? smooth(1 - seg(this.p, 0, 0.22)) : 0
    const happy = is('happy'),
      yawn = is('yawn'),
      up = is('up'),
      down = is('down')
    const side = md?.side ?? this.#side

    // The swat: the face goes first, then one paw — back and up, fast, then
    // down at you, faster, past where it started, then back. The strike is a
    // tenth of a second; the wind-up and the glare around it are what read.
    const angry = is('swat')
    const cross = Math.max(angry, this.sulk ? 1 : 0)
    // Flat ears are a thing she does on her back. The grumpy she lands in
    // keeps its ears up, so on the way up hers come up with her, and are
    // already where that mood has them by the time it takes over.
    const crossEars = Math.max(angry, this.sulk ? smooth(seg(p, 0, 0.45)) : 0)
    const sm = clamp(clockOf('swat'))
    const wind = smooth(seg(sm, 0.12, 0.3))
    const strike = Math.pow(seg(sm, 0.3, 0.4), 2)
    const recover = smooth(seg(sm, 0.46, 0.8))
    const swatY = (-15 * wind + 32 * strike) * (1 - recover)
    const swatA = (-28 * wind + 66 * strike) * (1 - recover)
    const jolt = strike * (1 - recover)

    const rollT = rollOf(p)
    const turn = S(rollT, K)
    const whip = whipAt(rollT, K)
    // Before the whip she gathers: a little lower, a little tighter.
    const gather = bump(rollT, 0.05, 0.48)
    // Past the half turn and back — her weight arriving on her crown — and a
    // smaller swing the other way as it settles.
    const settle = 9 * bump(rollT, 0.5, 0.86) - 2.5 * bump(rollT, 0.82, 1)
    // A pure logistic sits almost still for its first stretch, which reads as
    // a pause. A lean of her own leads into it and hands over as it takes off.
    const creep = 15 * smooth(seg(rollT, 0.04, 0.44)) * (1 - turn)
    // Only the half turn itself is about her middle — it is the one part of
    // the move made off the floor. The lean into it and the settle out of it
    // happen with her head on the carpet, so they are rocks, and go with the
    // sway below.
    const theta = 180 * turn
    const lift = 11 * whip - 2 * gather + happy * 2.5 * Math.abs(Math.sin(time * 7))
    const held = smooth(seg(p, 0.86, 1))
    // The rig's own breath, read from the same channel it breathes on, so the
    // frame she is handed back on breathes exactly as the frame before it.
    const BREATH = 'var(--breath, 0)'
    const sway =
      held * 2.2 * Math.sin(time * 0.9) +
      happy * 5 * Math.sin(time * 11) +
      yawn * 4 * Math.sin(Math.PI * clamp(clockOf('yawn'))) +
      (down - up) * 2.5 * Math.sign(Math.cos(Math.PI * turn)) +
      // The wind-up has to let go too: held at the end of a swat, it left
      // her leaning three degrees one way or the other until the next one.
      side * (-3 * wind * (1 - recover) + 9 * jolt) +
      held * (REST_ROCK.downL * rw.downL + REST_ROCK.downR * rw.downR)
    // The sway is a rock, and a rock pivots on whichever corner of her flat is
    // on the side she is rocking toward: the right one clockwise, the left one
    // the other way. Where the pivot swaps sides the angle is nought, so the
    // swap cannot show.
    // Both belong to a direction of travel. Going over, the lean comes before
    // the whip and the settle after it, both clockwise; coming back the same
    // curve runs backwards in time, which puts the settle first and the lean
    // last — so both have to turn anticlockwise with her, or getting up began
    // with her swinging nine degrees further the way she had gone over.
    const dir = this.#to === 1 || this.p === 1 ? 1 : -1
    const rock = (dir * (creep + settle) + sway) * (1 - u)
    const spin = theta + rock

    // --- skull: resting, round in the air, resting again the other way up.
    const m = turn
    const upright = this.#landShape && u > 0 ? lerpPath(REST, this.#landShape, u) : REST
    const shape =
      m < 0.5
        ? lerpPath(upright, ROUND, smooth(m * 2))
        : lerpPath(ROUND_T, REST_T, smooth((m - 0.5) * 2))
    const d = `path('${write(shape)}')`
    for (const s of this.skulls) s.style.setProperty('d', d)

    // --- head: turned about its middle, breathing about whichever point is on
    // the floor, crouched as she gathers, puffed for the instant of the whip.
    const oy = 100 + (15 - 100) * m
    const puff = 1 + 0.04 * whip
    const sx = (1 + 0.03 * gather) * puff
    const sy = (1 - 0.06 * gather) * puff * (1 + 0.05 * yawn)
    // Upright, a resting head sits three quarters of a unit up off the floor —
    // the rig's lift at its resting squash — and the loop starts and ends
    // there, not at nought, so there is no step either side of it.
    const REST_LIFT = (1 - 0.85) * 5
    const footL = FEET_UP[0] + (FEET_DOWN[0] - FEET_UP[0]) * m
    const footR = FEET_UP[1] + (FEET_DOWN[1] - FEET_UP[1]) * m
    const px = rock >= 0 ? footR : footL
    const py = FEET_UP[2] + (FEET_DOWN[2] - FEET_UP[2]) * m
    // The rig's head: lifted by its squash and rise, turned by its tilt about
    // the middle of her chin. Blended in over the landing, so its numbers are
    // exactly the rig's by the frame she is handed back.
    const landLift = L ? (1 - L.squash) * 5 + L.rise : REST_LIFT
    const landTilt = L ? L.tilt * u : 0
    const baseLift = (REST_LIFT * (1 - u) + landLift * u) * (1 - m)
    const head =
      `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotate(${rock.toFixed(2)}deg) translate(${(-px).toFixed(2)}px, ${(-py).toFixed(2)}px) ` +
      `translate(0px, ${(-lift * (1 - u) - baseLift).toFixed(2)}px) ` +
      `translate(60px, 100px) rotate(${landTilt.toFixed(2)}deg) translate(-60px, -100px) ` +
      `translate(${CX}px, ${CY}px) rotate(${theta.toFixed(2)}deg) translate(${-CX}px, ${-CY}px) ` +
      `translate(${CX}px, ${oy}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) ` +
      `scale(calc(1 - ${BREATH} * 0.006), calc(1 + ${BREATH} * 0.013)) translate(${-CX}px, ${-oy}px)`
    for (const h of this.heads) {
      h.style.transformOrigin = '0 0'
      h.style.transform = head
    }
    if (this.contactClip) {
      this.contactClip.style.transformOrigin = '0 0'
      this.contactClip.style.transform = head
    }

    // --- ears: back and short as she gathers, shortest through the whip —
    // on her side, out is down, and the ear nearest the floor is the one being
    // leant on — then out along the carpet with a spring in them. Angry is
    // flat back, the one thing every cat does before it swipes.
    const fold = Math.max(0.55 * gather, whip)
    const earLand = land(seg(rollT, 0.58, 0.96), 2.2)
    const flick = held * Math.max(0, Math.sin(time * 2.7 + 1.3)) ** 24
    const earA = -(24 * earLand - 7 * flick + 16 * crossEars)
    const earS =
      (1 - 0.12 * earLand) *
      (1 - 0.42 * fold) *
      (1 - 0.22 * yawn) *
      (1 + 0.08 * up) *
      (1 - 0.34 * crossEars)
    const earW = 1 + 0.05 * earLand
    // The rig's ear pose, blended in over the landing: nudged out and down by
    // the head's lift and the mood's own offsets, and turned for perk or flat.
    const eLift = L ? 1 - L.squash : 0
    const ear = (out: number, a: number, turn: number) =>
      `translate(${(u * (eLift * 2.5 * out + (L?.earOut ?? 0) * out)).toFixed(2)}px, ${(u * (eLift * -4 + (L?.earDown ?? 0))).toFixed(2)}px) ` +
      `rotate(${(a * (1 - u) + turn * u).toFixed(2)}deg) scale(${(1 + (earW - 1) * (1 - u)).toFixed(3)}, ${(1 + (earS - 1) * (1 - u)).toFixed(3)})`
    const turnL = L?.earTurn ?? 0
    for (const e of this.earsL) {
      e.style.transformOrigin = '28px 40px'
      e.style.transform = ear(1, earA, turnL)
    }
    for (const e of this.earsR) {
      e.style.transformOrigin = '92px 40px'
      e.style.transform = ear(-1, -earA, -turnL)
    }

    // --- paws: they end where turning the whole of her half round would put
    // them — the upright pose upside down, toes up. Half a turn about her
    // middle takes a paw through the floor, so each goes round its own side
    // instead, turning over as it goes, a moment behind the head.
    const pr = seg(rollT, 0.06, 1)
    const pq = S(pr, K * 0.9)
    const pw = whipAt(pr, K * 0.9)
    const flop = 0.06 * bump(rollT, 0.62, 0.9)
    const out = 24 * Math.sin(Math.PI * pq)
    // Air biscuits, and quicker ones when she is pleased. Two steady rhythms
    // blended, not one rhythm whose speed changes: speeding up a sine by
    // changing its frequency moves its phase by the frequency times the whole
    // time the page has been open — minutes of it — so as the mood faded in
    // the paws jumped all over their cycle and buzzed.
    const knead = held * ((1 - happy) * Math.sin(time * 3.2) + happy * 2.2 * Math.sin(time * 6.4))
    const reach = yawn * Math.sin(Math.PI * clamp(clockOf('yawn')))
    const dy = -69 * (pq + flop) - 3 * gather * (1 - pq)
    const turnP = 180 * pq
    const reachY = 8 * reach * Math.cos(Math.PI * pq)
    const pawL = {
      x: -out - 8 * reach,
      y: dy + held * 1.3 * knead + reachY,
      a: turnP + 5 * knead - 14 * reach,
    }
    const pawR = {
      x: out + 8 * reach,
      y: dy - held * 1.3 * knead + reachY,
      a: -turnP + 5 * knead + 14 * reach,
    }
    // One paw swats; the other braces. The paw keeps its size — the strike is
    // in the speed and the arc, not in the paw growing.
    const hit = side > 0 ? pawL : pawR,
      brace = side > 0 ? pawR : pawL
    const outward = side > 0 ? -1 : 1
    hit.y += swatY
    hit.a += outward * swatA
    hit.x += outward * 6 * jolt
    brace.y += 3 * angry
    const pawS = 1 + 0.05 * pw
    for (const e of this.pawsL) {
      e.style.transformOrigin = '27px 92px'
      e.style.transform = `translate(${pawL.x.toFixed(2)}px, ${pawL.y.toFixed(2)}px) rotate(${pawL.a.toFixed(2)}deg) scale(${pawS.toFixed(3)})`
    }
    for (const e of this.pawsR) {
      e.style.transformOrigin = '93px 92px'
      e.style.transform = `translate(${pawR.x.toFixed(2)}px, ${pawR.y.toFixed(2)}px) rotate(${pawR.a.toFixed(2)}deg) scale(${pawS.toFixed(3)})`
    }
    // The shadows the paws cast on her face follow them, and are gone while
    // the paws are in the air.
    const [cl, cr] = this.contact
    if (cl && cr) {
      const sh = dy + 16 * pq
      cl.setAttribute('transform', `translate(${pawL.x.toFixed(2)} ${sh.toFixed(2)})`)
      cr.setAttribute('transform', `translate(${pawR.x.toFixed(2)} ${sh.toFixed(2)})`)
      ;(cl.parentNode as SVGElement).setAttribute(
        'opacity',
        (0.26 * (1 - Math.sin(Math.PI * pq))).toFixed(3),
      )
    }

    // --- whiskers: they fan out and down from her cheeks, and turned half
    // round with her they fan up — the one part that says "upside down"
    // wrong, because whiskers hang the way they hang whichever way up the head
    // is. Mirrored top for bottom as she turns, they keep their set on screen.
    // About the middle of their own roots (y 68, the three strands start at
    // 62, 68 and 74), not the group's pivot at 78: mirrored about that, the
    // roots slid ten units down her face and the whiskers came out of her
    // forehead. About 68 the three roots land on each other's places.
    const wf = 1 - 2 * smooth(turn)
    this.whiskers.forEach((w, i) => {
      w.style.transform = `${this.#whiskerTf[i]} translate(0px, -10px) scale(1, ${wf.toFixed(3)}) translate(0px, 10px)`
    })

    // --- light: the room does not turn over with her.
    this.shade?.setAttribute('gradientTransform', `rotate(${(-spin).toFixed(2)} .5 .5)`)
    for (const { el, cx, cy } of this.glints) {
      el.style.transformOrigin = `${cx}px ${cy}px`
      el.style.transform = `rotate(${(-spin).toFixed(2)}deg)`
    }

    // --- gaze: asked for on screen, turned into her frame.
    // Her rest's look and any reaction's look add, as the rig's own gaze and
    // glance do; over the landing they give way to the mood she lands in,
    // which the rig is drawing through its own gaze channel by then.
    const restOn = held * (1 - Math.max(up, down))
    const sgx = restOn * (REST_GAZE.downL[0] * rw.downL + REST_GAZE.downR[0] * rw.downR)
    const sgy =
      restOn *
        (REST_GAZE.downL[1] * rw.downL +
          REST_GAZE.downC[1] * rw.downC +
          REST_GAZE.downR[1] * rw.downR) +
      4.2 * (down - up)
    const a = -(spin * Math.PI) / 180,
      fade = 1 - u
    this.svg.style.setProperty(
      '--gaze-x',
      (fade * (sgx * Math.cos(a) - sgy * Math.sin(a))).toFixed(2) + 'px',
    )
    this.svg.style.setProperty(
      '--gaze-y',
      (fade * (sgx * Math.sin(a) + sgy * Math.cos(a))).toFixed(2) + 'px',
    )

    // --- faces, swapped at the top of each envelope.
    this.#show(
      cross > 0.2 ? 'angry' : happy > 0.35 ? 'happy' : yawn > 0.3 ? 'sleepy' : 'open',
      angry > 0.2
        ? 'open'
        : this.sulk
          ? 'neutral'
          : happy > 0.35
            ? 'smile'
            : yawn > 0.25
              ? 'yawn'
              : 'neutral',
    )

    // --- eyes: squeezed shut for the whip, then slow blinks, content.
    const squeeze = Math.max(bump(rollT, 0.36, 0.7), 0.6 * gather) * (this.sulk ? 0.35 : 1)
    const phase = (time % 4.6) / 4.6
    const lazy = held * (phase > 0.9 ? Math.sin((Math.PI * (phase - 0.9)) / 0.1) : 0)
    // The content half-lid is the content rest's; reading, her eyes are open.
    const shut =
      Math.max(
        squeeze,
        lazy * 0.95 * (1 - up - down),
        held * 0.28 * rw.content * (1 - Math.max(up, down, cross)),
      ) *
      (1 - u)
    for (const l of this.lids) {
      const lp = lidPaths(l.cx, l.cy, l.rx, l.ry, l.t0 + (1 - l.t0) * shut)
      l.mask.setAttribute('d', lp.mask)
      l.lash?.setAttribute('d', lp.lash)
    }
  }
}
