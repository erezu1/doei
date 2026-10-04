// ---------------------------------------------------------------------------
// The state machine.
//
// Borrowed in shape from how Rive does it — named states, one-shot triggers,
// the app setting values rather than calling play() — and none of its runtime.
// A 200KB WASM player for one cat would also have baked her colours into the
// file, which is the thing that cannot happen here: her coats have to survive
// seven schemes in two ramps.
//
// The split that makes it work:
//
//   continuous  tilt, squash, ear turn, gaze. Numbers. They live in custom
//               properties, CSS transitions them, and two moods can therefore
//               be halfway between each other.
//   discrete    which eyes, which mouth, which brows. Drawings. All rendered
//               once and all but one hidden, so switching is an attribute
//               rather than a re-render — a fresh SVG would restart the breath
//               and drop every scheduled beat of the idle loop.
// ---------------------------------------------------------------------------

import { HEART, headPath, lidPaths, MOODS, EAR_TURN, STAR, ZED, type Mood } from './cat'
import { Flip, landingOf, type FlipMood, type FlipRest } from './cat-flip'

// --- what each mood is FOR -------------------------------------------------
// Three jobs, and every mood holds at least one. A mood with no job is a
// drawing nobody asked for, and it will drift out of step with the rest
// because nothing exercises it.
//
//   base      she rests here. The app chooses it from what is on screen.
//   drift     she wanders into it by herself and comes back. Never announced.
//   reaction  the app fires it at something that happened.
//   poke      she does it because you touched her.
//
// The two that needed a real answer:
//
// SAD is not for a wrong answer. Making a cat look hurt when you miss a Dutch
// word is how an app becomes something you avoid opening, and the miss is
// already on the card — she does not need to score it too. It is for coming
// back after a long absence, where the feeling is true and is about the gap,
// not about you.
//
// ANGRY is not for anything the app does. It is earned by pestering her: poke
// her four times inside a few seconds and she has had enough. That makes it
// the one mood the user can actually cause, which is worth more than using it
// as punishment, and it is self-limiting — stop poking and it never appears.
export const ROLE = {
  idle: { jobs: ['base'], when: 'cards are waiting' },
  lookDownC: { jobs: ['base'], when: 'a card is on screen — she reads it' },
  lookDownL: { jobs: ['drift'], when: 'glancing across what she is reading' },
  lookDownR: { jobs: ['drift'], when: 'glancing across what she is reading' },
  sleepy: { jobs: ['base'], when: 'nothing is due' },
  yawn: { jobs: ['drift'], when: 'on the way down, just before she settles' },
  stretch: { jobs: ['drift'], when: 'the end of a nap, and sometimes only most of one' },
  lookUpL: { jobs: ['drift', 'reaction'], when: 'an idle glance up; the first run' },
  lookUpR: { jobs: ['drift'], when: 'an idle glance up' },
  curious: { jobs: ['drift', 'reaction'], when: 'an idle glance; a wrong answer' },
  happy: {
    jobs: ['base', 'reaction', 'poke'],
    when: 'a right answer; being touched kindly; after a new level',
  },
  surprised: { jobs: ['reaction', 'poke'], when: 'the first poke startles her' },
  startled: { jobs: ['poke'], when: 'something wakes her — the one time she leaves the ground' },
  celebrate: { jobs: ['reaction'], when: 'the day is finished; a new level' },
  sad: { jobs: ['reaction'], when: 'you have been away and the pile has grown' },
  grumpy: { jobs: ['poke'], when: 'poked once too often' },
}

/**
 * Where she wanders from each resting state, and back.
 *
 * Looking up is in every list on purpose. A mascot that only ever looks at
 * the content is furniture; the glance up is the moment she is looking at
 * YOU, and it is worth more than any single expression because it is the one
 * that implies she knows you are there.
 */
const DRIFT: Record<string, string[]> = {
  idle: ['lookUpL', 'lookUpR', 'curious', 'lookDownC'],
  lookDownC: ['lookUpL', 'lookUpR', 'curious'],
  lookDownL: ['lookUpL', 'curious'],
  lookDownR: ['lookUpR', 'curious'],
  // A yawn out of sleep is the stretching one. The drowsy yawn belongs to the
  // wind-down, which schedules it itself on the way down.
  sleepy: ['stretch'],
}

/**
 * How likely a drift tick is to actually do anything, per resting state.
 *
 * Asleep she is mostly still. The tick runs every six to thirteen seconds and
 * a cat yawning on that cadence is not sleeping, it is performing sleeping —
 * so most ticks pass over her and the yawn arrives every minute or so, which
 * is what it is for: proof she is still there, not a metronome.
 */
// A sleeping cat mostly stays asleep — but at one drift in eight she stayed
// under for minutes at a time, and a stretch is now usually the end of a nap
// rather than a punctuation mark inside one, so it can afford to come round
// more often.
const DRIFT_CHANCE: Record<string, number> = { sleepy: 0.28 }

/**
 * Moods that are the same job pointed different ways. She settles into any of
 * them and stays — unlike a drift, which is a visit and comes back.
 *
 * Reading is three directions rather than one because a gaze that holds a
 * single point is a stare, and a stare at the thing you are trying to read is
 * worse than no cat at all.
 */
const FAMILY = [['lookDownC', 'lookDownL', 'lookDownR']]
const familyOf = (name: string) => FAMILY.find((f) => f.includes(name))

/**
 * She cannot go straight from cross to pleased. Real irritation has a tail,
 * and a face that jumps the gap is just two drawings in sequence — the same
 * fault as a reaction with no floor, one level up.
 *
 * So being cross leaves a cooldown behind it. Anything warm asked for inside
 * that window comes out as the cooler thing instead: she will look at you, she
 * will not be delighted yet. She has to spend time ordinary — idling, reading,
 * bored — before she can be won back, which is the whole point.
 */
const WRONG = ['curious', 'surprised', 'lookUpL', 'lookUpR', 'sad']
const WRONG_WEIGHT: Record<string, number> = {
  curious: 46,
  surprised: 18,
  lookUpL: 11,
  lookUpR: 11,
  sad: 14,
}

const SULK = 5200
const WARM = new Set(['happy', 'celebrate'])
const COOLED = 'curious'

// Left alone she gets bored, and then she gets sleepy. Nothing in the app has
// to ask for this: a mascot that holds one pose forever is a sticker, and the
// second most useful thing she can do after reacting is visibly stop expecting
// anything.
//
// These are ranges rather than numbers. A cat that yawns at exactly three
// seconds every single time is a countdown, and you learn it in two cards —
// after which she is not dozing off, she is ticking. Drawn fresh on every
// stir, so no two waits are the same length.
//
// The first numbers were far too short. At three seconds to a yawn and seven
// to sleep, and a drift tick that averaged nine and a half, she was asleep
// before she had done a single thing — so the twelve waking moods were all
// but unreachable and the two sleeping ones were most of what anyone saw.
//
// Eleven to twenty seconds gives her two or three drifts before she goes
// under, which is what it takes for looking up to be something she does
// rather than something she might.
const YAWN_AFTER = [7000, 12000] as const // ~9s
const SLEEP_AFTER = [4000, 8000] as const // ~15s all in

// --- the marks that rise off her ------------------------------------------
// Each z and each heart is its own element with its own animation, spawned
// when a mood calls for one and removing itself when it has finished.
//
// A mood starts and stops the SPAWNING. It has no authority over a mark that
// is already in the air — those finish rising whatever she does next, the way
// a breath you have already let out does not come back when you change your
// mind. Gating them as a group meant waking her deleted the thought she was
// halfway through having.
const SVG_NS = 'http://www.w3.org/2000/svg'
// Narrower than they were: the column has moved out past her ear, and the
// spread has to fit between her and the edge of what the frame can show.
const LANES = [-2.2, 2.2, 0]

interface Mark {
  d: string
  /** Where it starts, before its own jitter. */
  at: [number, number]
  scale: [number, number]
  rise: number
  drift: number
  ms: [number, number]
  peak: number
  /** Hearts are filled; a z is drawn. */
  stroke?: number
  fill?: string
}

// `at` is where a mark is born, and it has to be clear of her. Her ear reaches
// x = 116 near the top and her head x = 112 at its widest, so anything
// starting left of about 117 begins inside her and looks stuck to her face
// rather than rising off it. The frame's right edge is 134, which is what caps
// how large they can get: a heart at 2.4 is fourteen units across, and that is
// the whole of the room there is.
const MARKS: Record<string, Mark> = {
  // Both start clear of her and stay clear of her.
  //
  // Her rightmost point is the tip of the right ear at x 113.9, and the
  // outline puts another 2.6 outside that — so nothing may begin left of
  // about 119, once the lane offset, the jitter and the centred scale have
  // all been taken off the starting x. They used to begin at 112 and 117,
  // which is inside the ear, and the ear is at its widest at exactly the
  // height the marks are born. They rise away from her afterwards, so only
  // the first moment of one was ever in danger — and the first moment is
  // the one you notice, because it is the one that appears.
  z: {
    d: ZED,
    at: [124, 10],
    scale: [1.1, 1.55],
    rise: -26,
    drift: 4,
    ms: [2400, 3000],
    peak: 0.7,
    stroke: 1.8,
  },
  heart: {
    d: HEART,
    at: [124, 24],
    scale: [1.9, 2.4],
    rise: -30,
    drift: 2,
    ms: [1900, 2400],
    peak: 0.92,
    fill: '#EE8E96',
  },
}

/** Which brow set a mood wants. Only two moods have any. */
const browOf = (m: Mood) => (m.eyes === 'sad' ? 'up' : m.eyes === 'angry' ? 'down' : 'none')
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pickOne = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
/** A coin that comes up true with probability p. */
const chance = (p: number) => Math.random() < p

export class CatRig {
  svg: SVGSVGElement
  base: string
  wanted: string
  lastActive: number
  onPose?: (name: string, mood: Mood) => void
  current = ''
  holding: ReturnType<typeof setTimeout> | null = null
  /**
   * Whether the hold in flight is something the app is saying, as opposed to
   * her own yawn. The wind-down waits for the first and is made of the second,
   * so it has to be able to tell them apart.
   */
  holdLoud = false
  drifting: ReturnType<typeof setTimeout> | null = null
  dozing: ReturnType<typeof setTimeout> | null = null
  dozeMark: ReturnType<typeof setTimeout> | null = null
  emitter: ReturnType<typeof setInterval> | null = null
  emitting: string | null = null
  emitSeq = 0
  groups: Record<string, SVGElement[]>
  pokes = 0
  lastPoke = 0
  locked = 0
  sulkUntil = 0
  /** How many times she has been made cross without once cooling off. */
  cross = 0
  steady: ReturnType<typeof setTimeout> | null = null
  /**
   * Stars are on, so hearts are off.
   *
   * Both mean "she is pleased", and running them together would say it twice
   * in the same corner of the frame. Hearts are for being fussed over; stars
   * are for having finished something, which is the bigger of the two and
   * gets the moment to itself.
   */
  starring = false
  /**
   * She has started going under: the wind-down's yawn has been and gone and
   * the sleep behind it is already scheduled.
   *
   * Nothing unprompted may happen to her in that window. A cat who jumps at
   * a noise and is asleep two seconds later did not hear anything — and the
   * jump is the loudest thing she does, so it is the one that makes the
   * contradiction obvious.
   */
  settling = false
  lastWrong = ''
  /**
   * On her back. Only where she is allowed to lie down — the home screen —
   * and only when she has been left alone long enough to be comfortable.
   */
  flip: Flip
  flips: boolean
  flipHold: ReturnType<typeof setTimeout> | null = null
  /** Touches since she went over, and when the last one was. */
  flipTaps = 0
  lastFlipTap = 0
  /** Right answers in a row, for the roll she sometimes does as a reward. */
  correctRun = 0
  /** She has already rolled over out of boredom at this card. */
  stuckRolled = false

  constructor(
    svg: SVGSVGElement,
    {
      base = 'idle',
      drift = true,
      onPose,
      flips = false,
    }: {
      base?: string
      drift?: boolean
      onPose?: (name: string, mood: Mood) => void
      flips?: boolean
    } = {},
  ) {
    this.svg = svg
    this.base = base
    this.wanted = base // what the screen asked for
    this.lastActive = performance.now()
    this.onPose = onPose
    this.holding = null
    this.drifting = null
    this.groups = {
      eyes: [...svg.querySelectorAll<SVGElement>('[data-eyes]')],
      mouth: [...svg.querySelectorAll<SVGElement>('[data-mouth]')],
      brow: [...svg.querySelectorAll<SVGElement>('[data-brow]')],
    }
    this.flips = flips && !matchMedia('(prefers-reduced-motion: reduce)').matches
    // While she is over, her face is chosen by the flip — through the same
    // switch every mood uses, so the parts it shows are the parts a mood shows.
    this.flip = new Flip(svg, (eyes, mouth) => {
      this.#choose('eyes', eyes)
      this.#choose('mouth', mouth)
      this.#choose('brow', browOf({ eyes } as Mood))
    })
    this.pose(base)
    if (drift) this.#scheduleDrift()
    this.#scheduleDoze()
  }

  /**
   * Show one variant of a discrete part and hide its siblings.
   *
   * Via `display`, not the `hidden` property: `hidden` is honoured through a
   * UA stylesheet rule scoped to HTML elements and has no effect on an SVG
   * group, which left every variant drawn on top of every other one.
   */
  #choose(part: string, want: string) {
    for (const el of this.groups[part]) {
      el.setAttribute('display', el.dataset[part] === want ? 'inline' : 'none')
    }
  }

  /**
   * Everything about her that is not the drawing.
   *
   * Changing coat rebuilds the SVG and therefore the rig, and without this the
   * new cat starts the way every cat starts — awake, unbothered, idle — which
   * makes a colour swap a reset. She was asleep before it and she should be
   * asleep after it: the markings changed, not the animal.
   */
  snapshot() {
    return {
      base: this.base,
      wanted: this.wanted,
      current: this.current,
      lastActive: this.lastActive,
      pokes: this.pokes,
      lastPoke: this.lastPoke,
      locked: this.locked,
      sulkUntil: this.sulkUntil,
      cross: this.cross,
      starring: this.starring,
      settling: this.settling,
      lastWrong: this.lastWrong,
      emitting: this.emitting,
      emitSeq: this.emitSeq,
      flip: this.flip.reading(),
    }
  }

  /** Put her back exactly where the drawing before this one left her. */
  restore(was: ReturnType<CatRig['snapshot']>) {
    const { flip, ...rest } = was
    Object.assign(this, rest, { emitting: null })
    // Redrawn anywhere in a roll: put the new drawing exactly where the old
    // one was and let the move carry on from there. Only the finished state
    // used to be carried, so a cat caught halfway over came back on her feet
    // — a different cat in a different mood, for a moment, which is the one
    // thing a change of coat should never look like.
    if (this.flips && (flip.p > 0 || flip.to > 0)) {
      this.flip.place(flip)
      // Still going over: finish the turn, and then the same long lie-in the
      // roll itself would have ended with.
      if (flip.to === 1 && flip.p < 1) {
        this.flip.over(() => {
          if (chance(0.7)) this.flip.react('yawn')
          this.flipHold = setTimeout(() => this.flipBack(), rand(12000, 24000))
        })
        return
      }
      // On her way back up: the rig's own way up, which knows what mood she
      // lands in — and starts from where she already is, not from flat.
      if (flip.to === 0) {
        this.flipBack()
        return
      }
      // Settled on her back: she is simply still there, and gets up in her
      // own time.
      this.flipHold = setTimeout(() => this.flipBack(), rand(5000, 10000))
      return
    }
    // The pose applies to an element that has never had one, so nothing
    // transitions: she is simply already in it when she fades in.
    this.pose(was.current || was.base)
    // `pose` restarts the wait before the first z, which is right for a cat
    // falling asleep and wrong for one that has been asleep for a minute. If
    // marks were already rising, they carry on rising.
    if (was.emitting) {
      clearTimeout(this.dozeMark ?? undefined)
      this.dozeMark = null
      this.#emit(was.emitting)
    }
  }

  /**
   * Put her in a mood. The drawings change now; the numbers are handed to CSS,
   * which walks them there over the transition — so calling this mid-move
   * redirects from wherever she currently is rather than snapping to the start.
   */
  pose(name: string, { during = false } = {}) {
    const m = MOODS[name]
    if (!m) return
    // On her back the flip is drawing her, and a mood's numbers would fight
    // it. The one exception is the landing: the flip asks for the mood she is
    // getting up into just before she is up, so its face and its channels are
    // already on when the flip hands her back.
    if (this.flip?.engaged && !during) return
    this.current = name
    const s = this.svg.style
    const turn = m.ear ? (EAR_TURN[m.ear] ?? 0) : 0
    const [gx, gy] = m.gaze ?? [0, 0]
    s.setProperty('--tilt', `${m.tilt ?? 0}deg`)
    s.setProperty('--sq', String(m.squash ?? 0.85))
    s.setProperty('--rise', String(m.rise ?? 0))
    s.setProperty('--ear-out', String(m.earOut ?? 0))
    s.setProperty('--ear-down', String(m.earDown ?? 0))
    s.setProperty('--face-down', String(m.faceDown ?? 0))
    // The head's own shape. Not a scale — a scale keeps whatever proportions
    // it was handed, and the two shapes wanted here are a circle and a
    // flat-bottomed wedge, which no scale of one path can be both of. Every
    // copy of the outline gets the same `d`, and CSS walks them there
    // together: the skull, the line around it, the two clips the markings and
    // the contact shadow are cut with, and the shading on top.
    const shape = `path('${headPath(m.squash ?? 0.85)}')`
    for (const el of this.svg.querySelectorAll<SVGElement & { style: CSSStyleDeclaration }>(
      '.cat-skull, .cat-skull-line, .cat-skull-clip, .cat-shade',
    ))
      el.style.setProperty('d', shape)
    // The hair lags the head. She turns, and for a moment the whiskers are
    // still pointing where she was — so the swing runs against the tilt, and
    // a mood with no tilt lets them fall back to level.
    const swing = -(m.tilt ?? 0) * 0.55
    for (let i = 0; i < 3; i++) s.setProperty(`--whisk-${i}`, `${swing}deg`)
    s.setProperty('--ear-l', `${turn}deg`)
    s.setProperty('--ear-r', `${-turn}deg`)
    s.setProperty('--gaze-px', `${gx}px`)
    s.setProperty('--gaze-py', `${gy}px`)
    this.#choose('eyes', m.eyes)
    this.#choose('mouth', m.mouth)
    this.#choose('brow', browOf(m))
    // Cross once and she only pulls a face. Cross again while she is still
    // coming down from the last time, and it reaches her paws — losing your
    // temper is a thing that builds, and a cat who shakes at the first
    // annoyance has nowhere left to go when you keep at it.
    //
    // Read before the clock is reset, because resetting it is what would make
    // every temper look like a second one.
    const again = name === 'grumpy' && performance.now() < this.sulkUntil
    if (name === 'grumpy') {
      // Lapse and it starts over. She forgives you for stopping, which is the
      // only thing that keeps an escalating mascot from being an unpleasant
      // one — every step up is undone by leaving her alone for five seconds.
      this.cross = again ? this.cross + 1 : 0
      this.sulkUntil = performance.now() + SULK
    }
    // Two moods reach the paws. Toggled by class rather than written into the
    // pose, because they are loops and the pose is a destination.
    this.svg.classList.toggle('cat-delighted', name === 'celebrate')
    // A stretch trembles and so does a temper that has already been lost
    // once. Same channel: both are a whole-body thing, and leaving her paws
    // perfectly still under a furious face is what made the anger read as a
    // mask. The drowsy yawn is deliberately not in here — she is going to
    // sleep, and a cat settling does not shake.
    this.svg.classList.toggle('cat-shake', name === 'stretch' || again)
    // Past shaking. Three tempers inside one sulk and it comes out of her
    // paws — a face and a tremble have both already been spent by then, and
    // a mood with no further step reads as a mood that was never listening.
    if (name === 'grumpy' && this.cross >= 2) this.stamp()
    // Only while she is actually settled — a yawn is a moment on the way there
    // and on the way back, and zzz flickering on either side of it would read
    // as a fault — and not until she has been settled a second.
    //
    // She has to visibly stop first. Arriving with the pose, the two read as
    // one switch being thrown rather than as a cat falling asleep and then
    // being asleep. Coming back is not symmetrical: waking is a single event,
    // so the class goes the instant anything else happens.
    clearTimeout(this.dozeMark ?? undefined)
    if (name === 'sleepy') {
      // She has to visibly stop, and then stay stopped, before the first one
      // appears. Arriving with the pose they read as one switch being thrown;
      // arriving straight after it they read as a cat falling asleep. Three
      // seconds is what it takes to read as a cat that is already asleep,
      // which is the thing the z is actually reporting.
      this.dozeMark = setTimeout(() => this.#emit('z'), 2950)
    } else {
      this.dozeMark = null
      this.#emit(name === 'celebrate' && !this.starring ? 'heart' : null)
    }
    // A gesture the mood cannot carry itself. Arriving at curious is a sniff:
    // she has noticed something and is checking it, which the face alone only
    // says statically.
    if (name === 'curious' && this.current !== name) this.gesture('sniff')
    this.onPose?.(name, m)
    // The idle loop reads this so a blink closes whatever is still open rather
    // than opening her eyes first to do it.
    this.svg.dataset.lid = String(m.lid ?? 0)
    // The mood she is actually wearing, where it can be seen from outside —
    // by CSS, and by anyone checking that what she is doing is what the app
    // asked for.
    this.svg.dataset.mood = name
  }

  /**
   * Awake, under her own steam. Not `setBase`, because the screen has not
   * changed its mind about anything — she has. If the screen wanted her
   * asleep she comes up to idle anyway, and the wind-down that follows will
   * put her back in its own time.
   */
  #rouse() {
    this.base = this.wanted === 'sleepy' ? 'idle' : this.wanted
    this.pose(this.base)
    this.#scheduleDoze()
  }

  /** The mood she falls back to. Takes effect at the end of any current hold. */
  setBase(name: string) {
    // Sent somewhere awake while she is asleep. She stretches on the way,
    // rather than simply being a different cat in the next frame — this is
    // the other half of the same gesture, and it is the half you see when
    // you come back to the app and she is where you left her.
    const rousing = this.current === 'sleepy' && name !== 'sleepy'
    this.wanted = this.base = name
    this.lastActive = performance.now()
    // A new situation restarts the wind-down: arriving at a card should give
    // her the full three seconds before she starts yawning at you, not
    // whatever was left over from the last one.
    this.#scheduleDoze()
    if (this.holding) return
    if (rousing) this.react('stretch', { ms: 1500, quiet: true, min: 0 })
    else this.pose(name)
  }

  /** Anything that means she is being paid attention to. Wakes her up. */
  #stir() {
    this.lastActive = performance.now()
    this.stuckRolled = false
    this.#scheduleDoze()
    // Settling on a different direction within the same family is not
    // something to correct — the screen asked her to read, and she is still
    // reading, just not at the same spot.
    const family = familyOf(this.wanted)
    if (this.base !== this.wanted && !(family && family.includes(this.base))) {
      this.base = this.wanted
    }
  }

  /**
   * A one-shot. She holds the mood, then returns to base on her own.
   * Calling it again mid-react replaces the first rather than queueing: a
   * mascot working through a backlog of reactions is answering questions you
   * have stopped asking.
   */
  react(
    name: string,
    {
      ms = 1500,
      then,
      quiet = false,
      min = 450,
    }: { ms?: number; then?: () => void; quiet?: boolean; min?: number } = {},
  ) {
    // On her back, nothing she does on her own interrupts it — and anything the
    // app has to say gets her up first, quickly, and then gets said.
    if (this.flip.engaged) {
      // Mid-roll it waits for the roll to finish rather than being lost: an
      // answer given while she is going over still gets its reaction.
      if (!quiet) {
        if (this.flip.turning) setTimeout(() => this.react(name, { ms, then, quiet, min }), 150)
        else
          this.flipBack({ quick: true, into: name }, () =>
            this.react(name, { ms, then, quiet, min }),
          )
      }
      return
    }
    const now = performance.now()
    // Still coming down. Acknowledge, do not celebrate.
    if (WARM.has(name) && now < this.sulkUntil) name = COOLED
    // A reaction gets to finish saying what it is. Until its floor has passed
    // nothing else may replace it — except itself, which is how a mood extends
    // rather than restarts. Without this she flickers between contradictory
    // states on rapid input and reads as having nothing behind the face.
    if (this.locked > now && name !== this.current) return
    // Woken. Anything the app or a finger does to her while she is asleep
    // gets her off the ground first — a cat that opens her eyes and is
    // simply awake never was asleep. The drift is exempt because it is
    // quiet: shifting in her sleep is not being woken by anything.
    if (!quiet && this.current === 'sleepy' && name !== 'sleepy') this.hop()
    this.locked = now + Math.min(min, ms)
    if (!quiet) this.#stir()
    clearTimeout(this.holding ?? undefined)
    this.pose(name)
    this.holdLoud = !quiet
    this.holding = setTimeout(() => {
      this.holding = null
      this.holdLoud = false
      if (then) then()
      else this.pose(this.base)
      // The wind-down starts from when she stopped reacting, not from when she
      // started: a long reaction should not be followed instantly by a yawn.
      // Her own yawn is exempt, or it would keep restarting the clock that
      // produced it and she would never get to sleep.
      if (!quiet) this.#scheduleDoze()
    }, ms)
  }

  /**
   * Being touched. The first poke startles her and she recovers into pleased;
   * keep poking and she runs out of patience. Counting inside a window rather
   * than forever means she forgives you as soon as you stop.
   */
  tap() {
    // Except in the middle of a trick: her face is being worked by the scene,
    // and a poke would pull it out from under it. Not queued — a tap is for
    // now, and she will be free again in a few seconds.
    if (this.svg.dataset.trick !== undefined) return
    // A poke always lands. The floor exists to stop reactions flickering past
    // each other, not to make her ignore you — and the thing it was most
    // likely to swallow was a tap arriving during a drift, which is a beat
    // nobody asked for blocking one somebody did.
    this.locked = 0
    this.#stir()
    const now = performance.now()
    // On her back. Mid-turn there is nothing to touch — she is going over.
    // Settled there, a touch is a coin toss between a belly she is happy to
    // show you and a belly that was never an invitation — unless it follows
    // the last one too closely, which is prodding, and always the second. A
    // swat is the end of it: she is up straight after.
    if (this.flip.engaged || (this.flipHold && !this.flip.engaged)) {
      if (!this.flip.engaged || this.flip.turning || this.flip.mood === 'swat') return
      this.flipTaps += 1
      // Each touch on its own is a coin toss. Touches that come hard on each
      // other's heels are not: two inside ~0.7s is being prodded, and that is
      // always the swat.
      const rushed = this.flipTaps > 1 && now - this.lastFlipTap < 700
      this.lastFlipTap = now
      const nice = !rushed && chance(0.5)
      if (nice) {
        this.flip.react('happy')
        // Being pleased with you buys a little more time down there.
        clearTimeout(this.flipHold ?? undefined)
        this.flipHold = setTimeout(() => this.flipBack(), rand(6000, 11000))
      } else {
        this.flip.react('swat')
        clearTimeout(this.flipHold ?? undefined)
        // Up still cross, and still cross once she is up: a sulk on her feet,
        // through the same grumpy the rig always uses — so it counts as a
        // temper, cools off the same way, and poking her again only extends it.
        this.flipHold = setTimeout(
          () => {
            this.flip.sulk = true
            this.flipBack({ quick: true, into: 'grumpy' }, () =>
              this.react('grumpy', { ms: 2600, min: 1800 }),
            )
          },
          Flip.ms('swat') - 120,
        )
      }
      return
    }
    this.pokes = now - this.lastPoke < 2600 ? this.pokes + 1 : 1
    this.lastPoke = now
    // Sometimes the first touch, instead of a startle, is what sends her over:
    // she was comfortable, and being paid attention to made her more so.
    if (this.pokes === 1 && this.#comfy(0) && chance(0.4)) return this.flipOver()
    // Keep at her and it was always going to end in a temper. Not always now:
    // by the third touch in a row, about half the time, she decides the
    // attention is a game and rolls over for more of it instead — which is a
    // cat, and which gives the fourth touch somewhere better to land.
    if (
      this.pokes === 3 &&
      this.flips &&
      this.base === 'idle' &&
      this.current !== 'grumpy' &&
      now > this.sulkUntil &&
      !this.settling &&
      chance(0.55)
    )
      return this.flipOver()
    // Once she is cross, more poking does not cheer her up — it extends it.
    // Any other reading means she goes from angry to delighted in one frame,
    // which is not a mood change, it is two unrelated drawings in sequence.
    if (this.current === 'grumpy' || this.pokes >= 4) {
      // Poked while already cross. The expression cannot say anything new —
      // she is wearing it — so the answer is a gesture: a hard huff through
      // the nose. It is also the only way a held mood can acknowledge input
      // at all without abandoning itself.
      this.huff()
      return this.react('grumpy', { ms: 2800, min: 2800 })
    }
    // The first poke is the big one. Meeting somebody is worth more than the
    // fourth time they prod you, so she is delighted once and merely pleased
    // after that — and the difference is what makes the first one feel like a
    // greeting rather than a response.
    //
    // The startle stays either way, short, as anticipation: something small
    // before something large is what stops the large thing arriving from
    // nowhere. The warm half goes through react, so the cooling-off period
    // still catches it — poke her just after a sulk and she startles and then
    // merely looks at you.
    const warm = this.pokes === 1 ? 'celebrate' : 'happy'
    // Prodding someone awake is not the same as prodding someone. The startle
    // is the bigger one and it is given room to land before the warm half.
    const woken = this.current === 'sleepy'
    this.react(woken ? 'startled' : 'surprised', {
      ms: woken ? 760 : 520,
      min: woken ? 760 : 520,
      then: () => this.react(warm, { ms: warm === 'celebrate' ? 2100 : 1600, min: 900 }),
    })
  }

  /**
   * She wanders off on her own and comes back. Without it one loop goes stale
   * in about a minute and a half — long enough that you stop noticing her, and
   * then notice that you stopped.
   */
  /**
   * Her own clock for winding down, on its own timers rather than polled by
   * the drift tick. The tick runs every six to thirteen seconds, so anything
   * it checks cannot resolve faster than that — a three-second yawn tested
   * against it simply never happened on time.
   */
  #scheduleDoze() {
    clearTimeout(this.dozing ?? undefined)
    // The clock is starting over, which means something woke her or kept her
    // up. Whatever she had begun to do about going to sleep, she has stopped.
    this.settling = false
    // Already down. The test is what she is doing, not what the screen asked
    // for: a cat who has woken herself up out of a nap on a screen that still
    // wants her asleep has to be able to wind back down, and testing `wanted`
    // left her sitting up for good.
    if (this.base === 'sleepy') return
    // Nor while she is resting pleased, which she only does under a new level:
    // nodding off beneath "Level 6!" would say the opposite of the screen.
    if (this.base === 'happy') return
    this.dozing = setTimeout(
      () => {
        // On her back she is not going to sleep; the clock starts over when she is up.
        if (this.flip.engaged) return
        // `quiet`, so a yawn does not count as being paid attention to and reset
        // the very clock that produced it.
        this.settling = true
        if (!this.holding) this.react('yawn', { ms: 2400, quiet: true, min: 0 })
        this.dozing = setTimeout(
          () => {
            this.dozing = null
            if (this.base === 'sleepy') return
            // Mid-reaction. Falling asleep behind it would mean opening her eyes
            // on a face she never chose — wait, and start the clock over.
            if (this.holdLoud) return this.#scheduleDoze()
            this.base = 'sleepy'
            if (!this.holding) this.pose('sleepy')
          },
          rand(...SLEEP_AFTER),
        )
      },
      rand(...YAWN_AFTER),
    )
  }

  #scheduleDrift() {
    this.drifting = setTimeout(
      () => {
        // On her back she drifts in her own way: a look up the phone or down it,
        // now and then a wriggle of pleasure at nothing.
        if (this.flip.engaged) {
          if (this.flip.down && !this.flip.mood) {
            if (this.#onCard()) {
              // Reading upside down: her eyes resettle across the card like
              // they do the right way up, and now and then she looks up at you.
              if (chance(0.5))
                this.flip.setRest(
                  pickOne<FlipRest>(
                    ['downL', 'downC', 'downR'].filter((r) => r !== this.flip.rest) as FlipRest[],
                  ),
                )
              else if (chance(0.25)) this.flip.react('up')
            } else if (chance(0.55)) {
              this.flip.react(pickOne<FlipMood>(['up', 'down', 'up', 'down', 'happy']))
            }
          }
          return this.#scheduleDrift()
        }
        // Stuck on a card: twenty seconds and nothing, and she gets bored enough
        // to roll over. Once per card — any answer, touch or new card resets it.
        if (
          !this.holding &&
          this.#onCard() &&
          !this.stuckRolled &&
          performance.now() - this.lastActive > 20000 &&
          this.#comfy(0)
        ) {
          this.stuckRolled = true
          this.flipOver()
          return this.#scheduleDrift()
        }
        // Now and then, when she has been left alone long enough to be at ease,
        // she rolls over. Rare enough to be a thing you catch rather than a
        // thing she does.
        if (!this.holding && !this.#onCard() && this.#comfy(25000) && chance(0.08)) {
          this.flipOver()
          return this.#scheduleDrift()
        }
        // Never over a reaction: the app is saying something and she is not.
        if (!this.holding) {
          // Once in a while something she can hear and you cannot. It is the
          // only movement she makes that nothing on the screen asked for, which
          // is exactly what stops the rest of them reading as a machine
          // answering inputs — rare enough (one drift in fourteen, so a couple
          // of minutes apart at best) that it stays an event.
          //
          // Not while she is asleep: waking for no reason undoes the one mood
          // that is meant to look like nothing is happening, and a start out of
          // sleep is what the app's own beats are for.
          if (this.base !== 'sleepy' && !this.settling && chance(0.07)) {
            this.hop()
            this.react('startled', { ms: 900, quiet: true, min: 0 })
          } else {
            const family = familyOf(this.base)
            // Half the time she resettles somewhere else in the same family and
            // stays there; the rest of the time she pays a visit and returns.
            // Only resettling makes her restless, only visiting makes her a
            // metronome pointed at one spot.
            if (family && Math.random() < 0.5) {
              const to = pickOne(family.filter((f) => f !== this.base))
              this.base = to
              this.pose(to)
            } else {
              const options = DRIFT[this.base]
              if (options && chance(DRIFT_CHANCE[this.base] ?? 1)) {
                const to = pickOne(options)
                // A stretch is mostly how a nap ends. Not always — a cat who
                // stretches, thinks better of it and goes back under is the
                // most cat thing in here — but a stretch that never once led
                // anywhere made the whole gesture punctuation.
                const up = to === 'stretch' && chance(0.7)
                // Looking up is not a glance. Something up there has her
                // attention and she gives it a while — and about half the time
                // she decides it is actually over the other way, which is the
                // difference between watching something and having noticed it.
                const gazing = to === 'lookUpL' || to === 'lookUpR'
                const other = to === 'lookUpL' ? 'lookUpR' : 'lookUpL'
                this.react(to, {
                  ms: gazing ? rand(4500, 9000) : rand(1400, 2800),
                  quiet: true,
                  min: 0,
                  then: up
                    ? () => this.#rouse()
                    : gazing && chance(0.45)
                      ? () => this.react(other, { ms: rand(3000, 6500), quiet: true, min: 0 })
                      : undefined,
                })
              }
            }
          }
        }
        this.#scheduleDrift()
        // Faster than the wind-down, or she never drifts at all before the
        // wind-down takes her: the tick has to fit inside the waking window
        // two or three times over.
      },
      rand(4500, 9000),
    )
  }

  /**
   * At ease enough to lie on her back: awake, resting in her plain idle, not
   * cross or cooling off from it, not on her way to sleep, and nobody has
   * touched her for a while.
   */
  #comfy(quietFor: number) {
    const now = performance.now()
    // At rest is idle at home, and reading on the card screen.
    const resting = (m: string) =>
      this.#onCard() ? familyOf(m) === familyOf('lookDownC') : m === 'idle'
    return (
      this.flips &&
      !this.flip.engaged &&
      resting(this.base) &&
      resting(this.current) &&
      !this.settling &&
      now > this.sulkUntil &&
      this.cross === 0 &&
      now - this.lastPoke >= quietFor
    )
  }

  /** Whether she is on the card screen — the screen asked her to read. */
  #onCard() {
    return familyOf(this.wanted) === familyOf('lookDownC')
  }

  /** Over onto her back. Usually she yawns as she lands; she stays a while, then gets up. */
  flipOver() {
    if (!this.flips || this.flip.engaged) return
    clearTimeout(this.holding ?? undefined)
    this.holding = null
    clearTimeout(this.dozing ?? undefined)
    this.dozing = null
    this.flipTaps = 0
    const card = this.#onCard()
    // On the card screen she is still reading with you, upside down, and does
    // not stay long — the card is the point. At home she is content, and in
    // no hurry.
    this.flip.setRest(card ? pickOne<FlipRest>(['downL', 'downC', 'downR']) : 'content')
    const go = () =>
      this.flip.over(() => {
        if (chance(0.7)) this.flip.react('yawn')
        this.flipHold = setTimeout(
          () => this.flipBack(),
          card ? rand(4000, 7000) : rand(12000, 24000),
        )
      })
    // The turn is drawn from her resting pose. Asked mid-reaction — the third
    // poke lands on a surprised or pleased face — she settles into it first,
    // or the turn starts from a head shape and a tilt that are not hers.
    if (this.current === 'idle') return go()
    this.pose('idle')
    this.flipHold = setTimeout(go, 320)
  }

  /**
   * The upright mood that continues what she was doing on her back: the same
   * reaction the right way up, or her rest's upright twin — so getting up
   * never drops her into a face she was not wearing.
   */
  #landing(): { name: string; oneShot: boolean; ms: number } {
    const d = this.flip.dominant()
    const left = (n: FlipMood) => Math.max(900, this.flip.remaining(n) + 500)
    switch (d) {
      case 'happy':
        return { name: 'happy', oneShot: true, ms: left('happy') }
      case 'yawn':
        return { name: 'yawn', oneShot: true, ms: left('yawn') }
      case 'up':
        return { name: chance(0.5) ? 'lookUpL' : 'lookUpR', oneShot: true, ms: left('up') + 600 }
      case 'down':
        return this.#onCard()
          ? { name: 'lookDownC', oneShot: false, ms: 0 }
          : { name: 'lookDownC', oneShot: true, ms: left('down') }
      case 'swat':
        return { name: 'grumpy', oneShot: true, ms: 2600 }
      case 'downL':
        return { name: 'lookDownL', oneShot: false, ms: 0 }
      case 'downC':
        return { name: 'lookDownC', oneShot: false, ms: 0 }
      case 'downR':
        return { name: 'lookDownR', oneShot: false, ms: 0 }
      default:
        return { name: this.base, oneShot: false, ms: 0 }
    }
  }

  /**
   * Back onto her front, in the state she was in just before: whatever she
   * was doing on her back continues the right way up, and the roll itself
   * finishes on that mood's own pose, so there is no second move after it.
   * `into` overrides the choice — a swat always lands cross.
   */
  flipBack({ quick = false, into }: { quick?: boolean; into?: string } = {}, then?: () => void) {
    clearTimeout(this.flipHold ?? undefined)
    this.flipHold = null
    const l = into ? { name: into, oneShot: true, ms: 2600 } : this.#landing()
    const mood = MOODS[l.name] ?? MOODS[this.base]
    // A rest lands as her base, when it is a direction of what the screen
    // asked for — reading left instead of reading middle is still reading.
    if (!l.oneShot && familyOf(l.name) && familyOf(l.name) === familyOf(this.wanted))
      this.base = l.name
    this.flip.back(
      {
        quick,
        land: landingOf(mood),
        shadow: () => this.pose(l.name, { during: true }),
      },
      () => {
        this.flipTaps = 0
        if (then) then()
        else if (l.oneShot) this.react(l.name, { ms: l.ms, min: Math.min(900, l.ms), quiet: true })
        else this.pose(this.base)
        this.#scheduleDoze()
      },
    )
  }

  /**
   * An answer on the card screen. Right is pleased — and on her back, pleased
   * without getting up; three right in a row, now and then, she rolls over for
   * it. Wrong is one of the misses, and gets her up for it first: puzzled
   * reads better the right way up.
   */
  answered(right: boolean) {
    this.correctRun = right ? this.correctRun + 1 : 0
    if (right && this.flip.engaged) {
      if (this.flip.turning) {
        this.correctRun -= 1
        setTimeout(() => this.answered(true), 150)
        return
      }
      {
        this.#stir()
        this.flip.react('happy')
        clearTimeout(this.flipHold ?? undefined)
        this.flipHold = setTimeout(() => this.flipBack(), rand(3000, 5000))
      }
      return
    }
    if (right && this.correctRun >= 3 && this.#comfy(0) && chance(0.3)) {
      this.#stir()
      this.correctRun = 0
      return this.flipOver()
    }
    if (right) this.react('happy', { ms: 1600, min: 900 })
    else this.react(this.pickWrong(), { ms: 1500, min: 900 })
  }

  /**
   * The huff: ears flat, nose working, whiskers back. Three sharp pulses, not
   * one swell — a sniff is curiosity and this is not.
   *
   * It lives here rather than in the idle loop because it is a response to
   * input, and the idle loop stops itself whenever the tab is hidden. A
   * reaction that only works while she happens to be idling is not a
   * reaction. The loop keeps the beats nobody asked for; the rig keeps the
   * ones somebody did.
   */
  huff() {
    const pulse = (prop: string, ms: number) =>
      this.svg.animate(
        [
          { [prop]: 0 },
          { [prop]: 1, offset: 0.13 },
          { [prop]: 0.12, offset: 0.3 },
          { [prop]: 0.95, offset: 0.46 },
          { [prop]: 0.08, offset: 0.63 },
          { [prop]: 0.72, offset: 0.79 },
          { [prop]: 0 },
        ],
        { duration: ms, easing: 'ease-out', fill: 'none' },
      )

    // The nose goes every time — it is the part that says "again?" and the
    // huff would not be a huff without it.
    pulse('--huff', 680)

    // The ears are optional and independent: neither, one, or both. A tic
    // that repeats exactly is a mechanism rather than a mood, and the ears
    // are the cheapest place to buy that variation.
    const ears = pickOne([[], ['l'], ['r'], ['l', 'r'], ['l', 'r']])
    // Slightly different lengths, so even "both" is never quite symmetrical.
    for (const side of ears) pulse(`--huff-${side}`, rand(560, 760))
  }

  /** How she takes a miss. Weighted, and never the same twice running. */
  pickWrong(): string {
    const pool = WRONG.filter((m) => m !== this.lastWrong)
    const roll = Math.random() * pool.reduce((n, m) => n + WRONG_WEIGHT[m], 0)
    let seen = 0
    const chosen = pool.find((m) => (seen += WRONG_WEIGHT[m]) >= roll) ?? pool[0]
    this.lastWrong = chosen
    return chosen
  }

  /** One mark, launched and then on its own. */
  #spawn(kind: string) {
    const m = MARKS[kind]
    const host = this.svg.querySelector<SVGElement>('.cat-emit')
    if (!m || !host) return
    const g = document.createElementNS(SVG_NS, 'g')
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', m.d)
    if (m.fill) path.setAttribute('fill', m.fill)
    else {
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', host.dataset.ink ?? '#000')
      path.setAttribute('stroke-width', String(m.stroke ?? 1.8))
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
    }
    g.append(path)
    g.style.transformBox = 'fill-box'
    g.style.transformOrigin = 'center'
    host.append(g)

    // Consecutive marks take turns across three lanes rather than each
    // picking at random. Random placement in a space this narrow keeps
    // producing pairs that sit on top of each other, and two z's overlapping
    // read as one badly drawn z. Taking turns guarantees the separation that
    // randomness only tends towards.
    //
    // The timing does the other half: each is spawned after the one before it
    // has risen further than a mark is tall, so they are apart vertically even
    // when the lanes bring them back into line.
    const lane = LANES[this.emitSeq++ % LANES.length]
    const x = m.at[0] + lane + rand(-0.8, 0.8)
    const y = m.at[1] + rand(-2, 2)
    const s = rand(m.scale[0], m.scale[1])
    const at = (px: number, py: number, ps: number) =>
      `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) scale(${ps.toFixed(3)})`
    const anim = g.animate(
      [
        { opacity: 0, transform: at(x, y, s * 0.6) },
        { opacity: m.peak, offset: 0.24, transform: at(x, y + m.rise * 0.2, s) },
        { opacity: 0, transform: at(x + m.drift, y + m.rise, s * 1.1) },
      ],
      { duration: rand(m.ms[0], m.ms[1]), easing: 'ease-out', fill: 'none' },
    )
    anim.finished.then(() => g.remove()).catch(() => g.remove())
  }

  /** Start or stop spawning. Never touches what is already rising. */
  #emit(kind: string | null) {
    if (this.emitting === kind) return
    this.emitting = kind
    clearInterval(this.emitter ?? undefined)
    this.emitter = null
    if (!kind || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    this.#spawn(kind)
    // Long enough that the last one has climbed clear. Below that they stack
    // up in the same few units of sky and stop reading as separate marks.
    this.emitter = setInterval(() => this.#spawn(kind), kind === 'heart' ? 1150 : 1500)
  }

  /** A gesture the idle loop owns. It may not be listening. */
  /**
   * A start: she comes off the ledge and settles back onto it.
   *
   * One channel, `--hop`, which the head and the paws each read at their own
   * gain — so it composes with whatever mood she is in instead of fighting it,
   * and a one-shot that returns to zero leaves nothing behind for the next
   * mood to undo.
   */
  /**
   * One vertical move, as a shape both halves of her follow at their own
   * size and their own moment.
   *
   * The shape says when; the gains say how much of it each half takes; the
   * delays say which half goes first. That is the whole difference between
   * being startled and losing your temper — a start is the body going and
   * the legs being dragged after it, and a stamp is the legs going first and
   * the body arriving on top of them.
   */
  #leap(
    shape: { v: number; at: number; ease?: string }[],
    duration: number,
    head: { gain: number; delay: number },
    paw: { gain: number; delay: number },
  ) {
    // Nothing else moves her paws while this is running. A tremble under a
    // stamp is two movements in one place, and the one that was just asked
    // for is the one that should be legible.
    this.svg.classList.add('cat-steady')
    clearTimeout(this.steady ?? undefined)
    const over = duration + Math.max(head.delay, paw.delay)
    this.steady = setTimeout(() => {
      this.steady = null
      this.svg.classList.remove('cat-steady')
    }, over + 120)

    const frames = (prop: string, gain: number) =>
      shape.map((k) => ({ [prop]: k.v * gain, offset: k.at, easing: k.ease })) as Keyframe[]
    this.svg.animate(frames('--hop', head.gain), {
      duration,
      easing: 'linear',
      delay: head.delay,
    })
    this.svg.animate(frames('--hop-paw', paw.gain), {
      duration,
      easing: 'linear',
      delay: paw.delay,
    })
  }

  /**
   * A start: she comes off the ledge and settles back onto it.
   *
   * Up is muscle and down is gravity, so up is the shorter half — about
   * 130ms of rise against 220ms of fall, decelerating into the apex and
   * accelerating out of it. Equal halves read as a bounce on a spring rather
   * than as something that jumped.
   *
   * She crouches before she goes and absorbs when she lands. Neither is the
   * jump, and both are small, but without them she arrives at the top of the
   * move with nothing having led up to it — which is the whole of what
   * "abrupt" means in a drawing that is otherwise this soft. The whole thing
   * is over in six hundred milliseconds: a start is something that has
   * happened to her, not something she is doing.
   */
  hop() {
    this.#leap(
      [
        { v: 0, at: 0, ease: 'ease-out' },
        { v: -0.12, at: 0.13, ease: 'cubic-bezier(.18,.9,.36,1)' },
        { v: 1, at: 0.34, ease: 'cubic-bezier(.45,0,.75,.62)' },
        { v: 0, at: 0.7, ease: 'ease-out' },
        { v: -0.09, at: 0.82, ease: 'ease-out' },
        { v: 0, at: 1 },
      ],
      600,
      { gain: 1, delay: 0 },
      { gain: 1, delay: 60 },
    )
  }

  /**
   * Temper, once shaking has stopped being enough: she comes down on the
   * ledge twice, hard.
   *
   * The same shape as the jump turned inside out. It is the paws that carry
   * it — two and a half times what the head does, where a start gives them a
   * fifth — and they go first, with the body following. Every beat ends
   * below the line she started on rather than back at it, because a stamp is
   * a thing that finishes downward.
   */
  stamp() {
    this.#leap(
      [
        { v: 0, at: 0, ease: 'cubic-bezier(.2,.85,.3,1)' },
        { v: 0.55, at: 0.16, ease: 'cubic-bezier(.7,0,.9,.4)' },
        { v: -0.42, at: 0.32, ease: 'cubic-bezier(.2,.85,.3,1)' },
        { v: 0.34, at: 0.5, ease: 'cubic-bezier(.7,0,.9,.4)' },
        { v: -0.26, at: 0.64, ease: 'ease-out' },
        { v: 0, at: 1 },
      ],
      560,
      { gain: 0.38, delay: 55 },
      { gain: 2.5, delay: 0 },
    )
  }

  /**
   * Three gold stars off the top of her head — one left, one straight up,
   * one right.
   *
   * A burst, not an emitter: it happens once, at a moment, and is gone. The
   * zzz and the hearts are weather and go on for as long as the mood does;
   * this is punctuation on a thing that just finished.
   *
   * They start above her crown rather than on it, between the ears and clear
   * of both, and every one of them travels further up than out — so nothing
   * ever crosses her, and the burst reads as coming off her head rather than
   * as three stars that happen to be nearby.
   */
  spark() {
    const host = this.svg.querySelector<SVGElement>('.cat-emit')
    if (!host) return
    // From just above the crown, out to the upper left, straight up, and out
    // to the upper right.
    const flight: [number, number][] = [
      [-40, -18],
      [0, -32],
      [40, -18],
    ]
    flight.forEach(([dx, dy], i) => {
      const g = document.createElementNS(SVG_NS, 'g')
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', STAR)
      path.setAttribute('fill', '#F0B429')
      g.append(path)
      g.style.transformBox = 'fill-box'
      g.style.transformOrigin = 'center'
      host.append(g)

      // The star is ten units across and drawn from its own corner, so half
      // of it comes off both numbers to put its centre where it is aimed.
      const x0 = 60 - 5,
        y0 = 2 - 5
      // Out quickly, then slower, but never stopped. Something thrown that
      // comes to a dead halt in mid-air is the one thing that cannot happen,
      // and holding still for most of the shot read as exactly that. It keeps
      // going the whole way — a fifth of the speed by the end, and turning —
      // which is also the stretch of time the eye needs to arrive at it.
      const [jx, jy] = [rand(-5, 5), rand(-4, 4)]
      const tx = x0 + dx + jx,
        ty = y0 + dy + jy
      const spin = rand(150, 260) * (dx < 0 ? -1 : 1)
      const at = (px: number, py: number, sc: number, rot: number) =>
        `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`
      const anim = g.animate(
        [
          { opacity: 0, transform: at(x0, y0, 0.25, 0) },
          {
            opacity: 1,
            offset: 0.14,
            transform: at(x0 + dx * 0.62, y0 + dy * 0.62, 1.95, spin * 0.12),
          },
          { opacity: 1, offset: 0.32, transform: at(tx, ty, 1.8, spin * 0.28) },
          {
            opacity: 1,
            offset: 0.66,
            transform: at(tx + dx * 0.2, ty + dy * 0.22 - 2, 1.62, spin * 0.62),
          },
          { opacity: 0, transform: at(tx + dx * 0.38, ty + dy * 0.42 - 5, 1.15, spin) },
        ],
        {
          duration: rand(1450, 1600),
          // Thrown, not carried: most of the distance is covered early, and
          // the rest of the time is spent turning where it landed.
          easing: 'linear',
          // Staggered, so it sparkles rather than pops.
          delay: i * 90,
          fill: 'none',
        },
      )
      anim.finished.then(() => g.remove()).catch(() => g.remove())
    })
  }

  gesture(name: string) {
    this.svg.dispatchEvent(new CustomEvent(`cat:${name}`))
  }

  destroy() {
    clearTimeout(this.flipHold ?? undefined)
    this.flip.destroy()
    clearTimeout(this.steady ?? undefined)
    clearTimeout(this.holding ?? undefined)
    clearTimeout(this.drifting ?? undefined)
    clearTimeout(this.dozing ?? undefined)
    clearTimeout(this.dozeMark ?? undefined)
    clearInterval(this.emitter ?? undefined)
    this.holding = this.drifting = this.dozing = this.dozeMark = null
    this.emitter = null
  }
}

/**
 * What the app actually says to her. Screens name a situation, never an
 * expression, so the mapping can change without touching a screen.
 */
export type SceneName =
  | 'waiting'
  | 'reading'
  | 'nothingDue'
  | 'correct'
  | 'wrong'
  | 'finished'
  | 'levelUp'
  | 'greeting'
  // How she takes the week when you walk in. One of these fires once per
  // visit, and only ever on arrival.
  | 'arriveProud'
  | 'arriveGlad'
  | 'arriveBehind'
  | 'arriveAway'

export const SCENE: Record<SceneName, (r: CatRig) => void> = {
  waiting: (r: CatRig) => r.setBase('idle'),
  reading: (r: CatRig) => r.setBase('lookDownC'),
  nothingDue: (r: CatRig) => r.setBase('sleepy'),
  // Every hold is long enough to be read at a glance and then some. Under
  // about a second a reaction registers as a flicker: you see that something
  // happened without seeing what, which is worse than not reacting at all.
  correct: (r: CatRig) => r.answered(true),
  // A miss is not one fixed face. Mostly she is puzzled — that is the honest
  // reading of a wrong answer, and it keeps the weight on the word rather
  // than on you. Sometimes she is caught out by it, sometimes she looks up at
  // you instead of at the card, and once in a while it does land as a small
  // disappointment. Sad earns its place here precisely because it is rare:
  // every time would be an app that tells you off, and never at all would be
  // an app that does not notice.
  //
  // Never the same one twice running, which matters more than the weights: a
  // repeat reads as a fixed response even when the set is varied.
  wrong: (r: CatRig) => r.answered(false),
  // The two beats big enough to come off the ledge for. Everything else she
  // does sitting down — a mascot who jumps at every right answer has nothing
  // left for the end of the round.
  finished: (r: CatRig) => {
    r.hop()
    // Set before the react, because posing celebrate is what decides whether
    // hearts start, and the react is what poses it.
    r.starring = true
    r.react('celebrate', {
      // Longer than any other reaction, because three bursts have to land
      // inside it — stars still in the air after she has gone back to idle
      // belong to nothing.
      ms: 4200,
      min: 1600,
      then: () => {
        r.starring = false
        r.pose(r.base)
      },
    })
    // Three times, a second apart. One burst is a thing you find you have
    // missed; three at a spacing you can count is a celebration. They still
    // overlap — a burst is in the air for a second and a half — so there are
    // never no stars, but each one gets to be its own event rather than
    // arriving while you are still looking at the last. Each star jitters
    // its own destination, so no round retraces the one before.
    setTimeout(() => r.spark(), 150)
    setTimeout(() => r.spark(), 1150)
    setTimeout(() => r.spark(), 2150)
  },
  // A new level: the confetti is the ring's, and she is delighted with it —
  // celebrating, hearts and all, for as long as it is coming down, and then
  // pleased for as long as you stay on the screen. Pleased rather than back to
  // idle: the news is still up there on the screen, and a cat who has gone
  // blank again under "Level 6!" has already forgotten it.
  levelUp: (r: CatRig) => {
    r.hop()
    // Pleased is set first, not after: whatever takes over from the
    // celebration — the trick a new level gets — hands her back to pleased
    // rather than to wherever she was before the ring closed.
    r.setBase('happy')
    r.react('celebrate', { ms: 3600, min: 1600 })
  },
  greeting: (r: CatRig) => r.react('lookUpL', { ms: 2200, min: 1200 }),
  // Arrival is the one moment she is not reacting to something you just did,
  // so it is also the one moment nothing else is competing for your eye. These
  // hold about twice as long as an in-round reaction: you are still finding
  // your bearings on a screen you have just opened, and a face that has
  // finished making its point before you have finished arriving made no point
  // at all. The wind-down cannot cut them short — a loud hold defers the doze
  // clock and restarts it when it ends.
  arriveProud: (r: CatRig) => r.react('celebrate', { ms: 3600, min: 2600 }),
  arriveGlad: (r: CatRig) => r.react('happy', { ms: 3400, min: 2400 }),
  arriveBehind: (r: CatRig) => r.react('curious', { ms: 3400, min: 2400 }),
  arriveAway: (r: CatRig) => r.react('sad', { ms: 4200, min: 3200 }),
}
// ---------------------------------------------------------------------------
// The idle loop: what she does when nothing is happening.
//
// Three rules from how this is done properly, all of which change the code:
//
// 1. The blink must NOT run on the same clock as the breath. Two loops of
//    fixed length, however well chosen, resolve into one long pattern and the
//    whole thing reads as a machine. So the breath is a CSS loop and every
//    other beat is scheduled on its own random interval.
// 2. One base loop goes stale after roughly a minute and a half. It needs
//    secondary idles — the ear flick, the nose twitch, the glance — fired far
//    enough apart that you never learn their rhythm.
// 3. Parts cascade rather than moving together. An ear that twitches at the
//    same instant as the head reads as one rigid object.
//
// Everything is driven through registered custom properties, so it composes
// with whatever pose the mood has set instead of overwriting it.
// ---------------------------------------------------------------------------

/** How long each of her idle beats has left to wait. */
export type Beats = Partial<Record<'blink' | 'flick' | 'glance' | 'sniff' | 'whisk', number>>

export function idle(
  svg: SVGSVGElement,
  { breath = true, resume }: { breath?: boolean; resume?: Beats } = {},
) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let stopped = false
  /**
   * When each beat is next due, so a drawing that replaces this one can take
   * the schedule over rather than draw a fresh one.
   *
   * Without this, a change of coat gave the new cat a whole new set of
   * staggered first beats — a blink six hundred milliseconds in, a glance
   * after a second and a half — and they landed while she was still fading
   * in. The cat you were watching had done none of those things: something
   * moved, and it moved for no reason.
   */
  const due: Record<string, number> = {}
  /** Used once, by the first start. A tab coming back gets a fresh stagger. */
  let carried: Beats | undefined = resume

  const beat = (name: keyof Beats, fn: () => void, ms: number) => {
    due[name] = performance.now() + ms
    later(fn, ms)
  }

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
    return t
  }

  // WAAPI rather than CSS for these: the point is that each has its own
  // irregular schedule, and a CSS animation can only repeat on a fixed one.
  const play = (frames: Keyframe[], duration: number, easing = 'ease-in-out') =>
    svg.animate(frames, { duration, easing, fill: 'none' })

  // --- blink -------------------------------------------------------------
  // Driven by attribute from a frame loop, not by an animated custom
  // property: Chrome will not re-evaluate a clipPath's geometry when a
  // property inside it changes, so the lid never moved and only the lash line
  // travelled — a blinking eyebrow over an open eye. Writing both in the same
  // frame also welds the line to the lid edge it is drawing.
  //
  // A real blink is about an eighth of a second, but a drawn one that fast
  // reads as a glitch rather than as a blink: you see that something happened
  // without seeing what. Closing faster than opening is what keeps it from
  // looking sleepy at this length.
  // The mask and the border are the same curve at the same instant, so they
  // are recomputed together from one call. Anything that derives them
  // separately drifts apart the moment the timing is not identical.
  const lidParts = [...svg.querySelectorAll<SVGElement>('.cat-lidmask, .cat-lash')]
  const SHUT = 150,
    OPEN = 210

  function setLid(t: number) {
    // Three things stack, in order of how long they last: the eye variant's
    // own lid, the mood's bias on top of it, and the blink closing whatever
    // remains. Each closes a fraction of what is still open rather than
    // setting an absolute, so a cat already looking down blinks from there
    // instead of opening her eyes first to do it.
    const bias = +(svg.dataset.lid || 0)
    for (const el of lidParts) {
      const n = (k: string) => Number(el.dataset[k] ?? 0)
      const t0 = n('t0')
      const base = t0 + bias * (1 - t0)
      const at = base + t * (1 - base)
      const paths = lidPaths(n('cx'), n('cy'), n('rx'), n('ry'), at)
      el.setAttribute('d', el.classList.contains('cat-lash') ? paths.lash : paths.mask)
    }
  }

  // How shut she is at a given moment of the blink. Pulled out as its own
  // function because the face has to sample the same curve, just later.
  const shape = (e: number) => {
    if (e <= 0) return 0
    if (e < SHUT) return (e / SHUT) ** 1.7 // shut: accelerating
    if (e < SHUT + OPEN) return (1 - (e - SHUT) / OPEN) ** 2 // open: easing out
    return 0
  }

  // The muzzle follows the lids down and comes back up behind them. Parts that
  // arrive together read as one rigid object; the lag is most of what makes a
  // face look like it is attached to something.
  const FACE_LAG = 55

  function blink() {
    if (stopped) return
    // On her back the flip draws her lids, blinks included.
    if (svg.dataset.flip) return void beat('blink', blink, rand(2800, 7400))
    const t0 = performance.now()
    const step = (now: number) => {
      if (stopped) {
        setLid(0)
        svg.style.setProperty('--face-dip', '0')
        return
      }
      const e = now - t0
      setLid(shape(e))
      svg.style.setProperty('--face-dip', shape(e - FACE_LAG).toFixed(3))
      if (e >= SHUT + OPEN + FACE_LAG) {
        setLid(0)
        svg.style.setProperty('--face-dip', '0')
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    // Real blinks cluster. A double every so often is most of what stops the
    // interval sounding metronomic.
    if (chance(0.16)) beat('blink', blink, SHUT + OPEN + rand(90, 170))
    else beat('blink', blink, rand(2800, 7400))
  }

  // --- ear flick ---------------------------------------------------------
  // One ear at a time, never both, and asymmetric in the return: out fast,
  // back with a small overshoot. A symmetric twitch looks mechanical.
  function flick() {
    if (stopped) return
    const v = chance(0.5) ? '--twitch-l' : '--twitch-r'
    const away = v === '--twitch-l' ? -9 : 9
    play(
      [
        { [v]: '0deg' },
        { [v]: `${away}deg`, offset: 0.28 },
        { [v]: `${-away * 0.22}deg`, offset: 0.62 },
        { [v]: '0deg' },
      ],
      340,
      'ease-out',
    )
    beat('flick', flick, rand(5000, 13000))
  }

  // --- glance ------------------------------------------------------------
  // The eyes drift and come back. Cheap, and it is the single thing that
  // stops a still face looking like a drawing rather than an animal.
  function glance() {
    if (stopped) return
    // And her gaze, which it turns into her frame.
    // And while she is in the middle of a trick, whose eyes are on the thing.
    if (svg.dataset.flip || svg.dataset.trick !== undefined)
      return void beat('glance', glance, rand(4200, 11000))
    const x = rand(-2.6, 2.6).toFixed(2)
    const y = rand(-1.4, 0.9).toFixed(2)
    play(
      [
        { '--gaze-x': '0px', '--gaze-y': '0px' },
        { '--gaze-x': `${x}px`, '--gaze-y': `${y}px`, offset: 0.18 },
        { '--gaze-x': `${x}px`, '--gaze-y': `${y}px`, offset: 0.72 },
        { '--gaze-x': '0px', '--gaze-y': '0px' },
      ],
      rand(1400, 2200),
      'ease-in-out',
    )
    beat('glance', glance, rand(4200, 11000))
  }

  // --- nose twitch -------------------------------------------------------
  // Rare and tiny. It is the sniff, and it should barely register.
  function sniff() {
    if (stopped) return
    sniffOnce()
    beat('sniff', sniff, rand(9000, 24000))
  }

  function sniffOnce() {
    play([{ '--whisk': 0 }, { '--whisk': 0.45, offset: 0.35 }, { '--whisk': 0 }], 480, 'ease-out')
    play(
      [
        { '--sniff': 0 },
        { '--sniff': 1, offset: 0.3 },
        { '--sniff': 0, offset: 0.55 },
        { '--sniff': 0.6, offset: 0.75 },
        { '--sniff': 0 },
      ],
      420,
      'ease-out',
    )
  }

  svg.addEventListener('cat:sniff', () => !stopped && sniffOnce())

  // --- whisker twitch ----------------------------------------------------
  // The one beat that keeps running whatever she is doing. Whiskers move on a
  // sleeping cat as readily as on a waking one — they are wired to her nose,
  // not to her mood — so this is deliberately not gated on anything, and it is
  // the only sign of life left when everything else has gone still.
  //
  // Direction is random. A twitch that always goes the same way is a tic.
  function whisk() {
    if (stopped) return
    const d = chance(0.5) ? 1 : -1
    play(
      [
        { '--whisk': 0 },
        { '--whisk': d, offset: 0.22 },
        { '--whisk': d * -0.28, offset: 0.55 },
        { '--whisk': 0 },
      ],
      rand(420, 620),
      'ease-out',
    )
    beat('whisk', whisk, rand(5200, 14000))
  }

  function start() {
    if (reduced.matches) return
    stopped = false
    svg.classList.toggle('cat-breathing', breath)
    // Staggered entry, so the first few seconds are not all four beats at
    // once — the same cascade rule, applied to starting up. Unless a drawing
    // before this one was already keeping time, in which case this one picks
    // the clock up where that one left it.
    const was = carried
    carried = undefined
    beat('blink', blink, was?.blink ?? rand(600, 2400))
    beat('flick', flick, was?.flick ?? rand(2000, 6000))
    beat('glance', glance, was?.glance ?? rand(1500, 5000))
    beat('sniff', sniff, was?.sniff ?? rand(4000, 12000))
    beat('whisk', whisk, was?.whisk ?? rand(1600, 5000))
  }

  function stop() {
    stopped = true
    timers.forEach(clearTimeout)
    timers.clear()
    svg.classList.remove('cat-breathing')
    svg.getAnimations().forEach((a) => a.cancel())
  }

  // Nothing runs while the tab is in the background: the timers would pile up
  // and all fire at once on return.
  const onVisibility = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)
  // The phone can be asked for less motion at any time, not only at load.
  reduced.addEventListener('change', () => (reduced.matches ? stop() : start()))

  start()
  return {
    /** What each beat still has to wait, for the drawing that comes next. */
    pending(): Beats {
      const now = performance.now()
      const left: Beats = {}
      for (const [name, at] of Object.entries(due)) {
        left[name as keyof Beats] = Math.max(0, at - now)
      }
      return left
    },
    stop() {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
