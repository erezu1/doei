// ---------------------------------------------------------------------------
// Doei's cat.
//
// The pose is the peek: ears and face, a hint of chest, two front paws hooked
// over an edge, everything below that edge cut off. It is the pose that needs
// furniture to sit on, which is what makes it placeable in an app that is
// mostly cards.
//
// Nothing here is a picture. A coat is a handful of colours and two blobs
// clipped to the silhouette; an expression is a choice of eyes and a mouth.
// So the eleventh expression costs a line, not a drawing.
//
// Every moving part comes out as its own <g> with an id and a pivot already
// set, because a mascot welded into one path can only ever fade in and out.
// ---------------------------------------------------------------------------

// --- geometry --------------------------------------------------------------
// One box, 120 wide and 108 tall, with the ground along the bottom edge.
//
// The box height is a drawing decision, not a container. Make it taller and
// the paws show their straight sides and read as two posts; crop it here and
// only the domes clear the edge, which is what a paw hooked over something
// actually looks like.

// The head is not a shape, it is a shape under load. She is lying with her
// chin on the carpet, and that is the whole reason she is wider than she is
// tall: the weight spreads the lower half. Lift the head and the spread comes
// out of it — narrower, taller, brow further from the floor.
//
// So `squash` is a parameter and not a drawing. 1 is fully down on the
// carpet, 0 is head raised clear of it. The floor line stays put at y=100
// whatever it is set to, because that is the one thing she is resting on.
const FLOOR = 100

/**
 * The head at rest and the head in the air, as two control nets of the same
 * shape — same seven curves, same order — so every value between them is a
 * straight interpolation and the browser can walk it as a `d` transition.
 *
 * Scaling one frozen path could never do this. A scale keeps every proportion
 * it was given, so a head whose brow is 34 wide and whose jaw is 52 stays that
 * ratio however hard it is squashed: flatter, yes, but always the same egg,
 * and never a circle and never a base that is the widest part of her. These
 * are the two shapes actually wanted, drawn as shapes.
 *
 * CIRCLE is exact — anchors on the circle, handles at r * 4/3 * tan(theta/4).
 * TRAP has its widest point at y 78 and a flat bottom from x 16 to 104, with
 * the corners rounded just enough not to be corners.
 */
const CIRCLE: [number, number][] = [
  [60, 9], [73.31, 9], [85.95, 14.83], [94.6, 24.95],
  [101.63, 33.19], [105.5, 43.67], [105.5, 54.5],
  [105.5, 79.63], [85.13, 100], [60, 100],
  [60, 100], [60, 100], [60, 100],
  [34.87, 100], [14.5, 79.63], [14.5, 54.5],
  [14.5, 43.67], [18.37, 33.19], [25.4, 24.95],
  [34.05, 14.83], [46.69, 9], [60, 9],
]
/**
 * The wedge, and it is a gentler one than the first try. The first had a flat
 * crown and two straight vertical runs down each side, which is a box; a side
 * that goes straight for a stretch and then turns reads as two curves meeting
 * however smoothly they actually join. Every anchor down each side now hands
 * over along its own tangent and the curvature never stops changing, so each
 * side is one sweep from the base corner to the crown.
 */

/** Where the resting shape sits in the range, and where the wedge starts. */
const REST_AT = 0.85
const FLAT_AT = 0.98

/** The head she has at rest, and for everything between resting and asleep. */
const REST: [number, number][] = [
  [60, 14.95], [76.78, 14.95], [89.52, 24.26], [93.55, 30.26],
  [103.44, 41.26], [111.1, 53.98], [111.1, 65.98],
  [111.1, 83.98], [91.68, 100], [60, 100],
  [60, 100], [60, 100], [60, 100],
  [28.32, 100], [8.9, 83.98], [8.9, 65.98],
  [8.9, 53.98], [16.56, 41.26], [26.45, 30.26],
  [30.48, 24.26], [43.22, 14.95], [60, 14.95],
]

const TRAP: [number, number][] = [
  [60, 20], [78, 20], [93, 24], [98, 32],
  [105, 44], [112, 58], [113, 72],
  [113.5, 84], [110, 94.4], [102, 95],
  [90, 95], [30, 95], [18, 95],
  [10, 94.4], [6.5, 84], [7, 72],
  [8, 58], [15, 44], [22, 32],
  [27, 24], [42, 20], [60, 20],
]

export function headPath(q = 1): string {
  const t = Math.max(0, Math.min(1, q))
  // Three shapes, not two, and the middle one holds a stretch of the range to
  // itself. Everything between resting and nearly-flat — reading, a drowsy
  // yawn, sad, bored — is the head she has always had; the wedge is the last
  // fiftieth of the range and sleep is the only mood in it.
  const [a, b, u] =
    t <= REST_AT
      ? [CIRCLE, REST, t / REST_AT]
      : t <= FLAT_AT
        ? [REST, REST, 0]
        : [REST, TRAP, (t - FLAT_AT) / (1 - FLAT_AT)]
  const n = (v: number) => (Math.round(v * 100) / 100).toString()
  let d = ''
  for (let i = 0; i < a.length; i++) {
    const x = a[i][0] + (b[i][0] - a[i][0]) * u
    const y = a[i][1] + (b[i][1] - a[i][1]) * u
    d += (i === 0 ? 'M' : (i - 1) % 3 === 0 ? 'C' : ' ') + n(x) + ' ' + n(y)
  }
  return d + 'Z'
}

// Big triangles off the top corners. The ear is the silhouette — it is what
// still says "cat" at 36px, when the whole face has become four grey pixels.
//
// Scaled to four fifths about the pivot each one turns on, so the base stays
// exactly where it met the skull and only the ear got smaller. Scaling the
// group instead would have been one number, and would also have scaled the
// outline's stroke — a thinner line around the ears than around the head.
//
// There is no anchor between the tip and the inner edge. There used to be
// one, at the point where the tip rounding handed over, and every attempt to
// make the two curves meet smoothly there was a matter of keeping three
// points collinear by hand — which held until the next time either curve was
// touched, and then the border had a corner in it again.
//
// One cubic does the tip AND the whole inner edge, so there is no junction
// left to get wrong: it leaves the tip going up and away, comes over the top,
// and steepens all the way down into the skull. The same is done to the pink.
// A curve with nowhere to break cannot break.
//
// The base runs a long way down into the skull. None of that lobe is ever
// seen — the head is drawn over it — and it is there entirely so the ear
// still has something to sit on once it has been turned by a perk or lifted
// by a squash. A base cut to just what shows at rest comes away from the
// head the moment anything moves, and it did: asleep, with both ears laid
// flat and the head at its widest and lowest, the bottom of the right lobe
// swung out past the skull and you could see where the ear stopped. It now
// runs fourteen units deeper, to y 74, which is still well inside a head
// whose edge at that height is out at 110.
const EAR_L = 'M15.2 46.4C11.2 34.4 8.8 17.6 12 12C14 8.5 39.2 18.4 44 27.2C48.8 43.2 42.4 65.6 28 67.2C18.4 68 15.2 57.6 15.2 46.4Z'
const EAR_R = 'M104.8 46.4C108.8 34.4 111.2 17.6 108 12C106 8.5 80.8 18.4 76 27.2C71.2 43.2 77.6 65.6 92 67.2C101.6 68 104.8 57.6 104.8 46.4Z'

// The pink sits inside the ear, hard over toward the OUTER edge: a little
// over two units of fur along the outside against a dozen along the inside.
// That offset alone is what makes an ear look like it is facing away from the
// centre of the head. Centre it and both ears face straight at you.
//
// The inner band has to be thick where the ear is VISIBLE, which is only
// above the skull line — an earlier version put all its clearance down at the
// base, where the head covers it, so the two ears looked identical.
//
// Its inner boundary turns the same way the ear's does — steepening as it
// goes down rather than flattening off — because a pink drawn with the
// opposite curvature to the ear around it reads as a sticker on the ear
// rather than as the inside of one. It leaves its own tip along the tangent
// it arrived on, for the same reason the ear does.
const EAR_L_IN = 'M17.2 45.6C12.8 34 10.8 18 14 13C15.3 11 34.4 24 37.6 33.6C32 40 21.6 44 17.2 45.6Z'
const EAR_R_IN = 'M102.8 45.6C107.2 34 109.2 18 106 13C104.7 11 85.6 24 82.4 33.6C88 40 98.4 44 102.8 45.6Z'

// A squircle, not a rectangle: the same four arcs an ellipse has, but pulled
// with a fatter handle (0.72 of the radius instead of 0.552) so the top,
// bottom and sides run flatter and the turns happen closer to the corners.
// There is no straight segment anywhere in it — the last version had real
// H and V edges, which is what made it a box. A pure ellipse went the other
// way and turned them into eggs; this sits between the two.
// The two TOP corners are rounder than the bottom two: the handle there is
// 0.70 of the radius against 0.72 below. The top of a paw is the part with
// nothing behind it, so a corner there reads as a corner; the bottom two sit
// against the ledge and keep the flatter, weightier turn.
//
// Whole rounded shapes, top and bottom both. Nothing is cut by the frame —
// they rest above it. Two earlier tries were wrong in opposite directions: a
// half-oval, which has no bottom at all, and then a rounded rectangle, which
// has twelve units of dead straight side. This has neither; the curve never
// stops turning.
const PAW_L = 'M11 92C11 83.6 15.8 80 27 80C38.2 80 43 83.6 43 92C43 100.6 38.5 104 27 104C15.5 104 11 100.6 11 92Z'
const PAW_R = 'M77 92C77 83.6 81.8 80 93 80C104.2 80 109 83.6 109 92C109 100.6 104.5 104 93 104C81.5 104 77 100.6 77 92Z'
// The toe splits rise from the bottom of the paw, not down from the crown. A
// paw divides front-to-back; a line hanging off the top reads as a seam.
// Down to 103, where the round cap takes them to 104 — exactly the paw's
// lower edge, so each line runs into the outline rather than stopping in open
// fur a couple of units above it. That gap is what made them read as marks
// ON a paw instead of as the splits BETWEEN toes.
const TOES_L = 'M23 103V95M33 103V95'
const TOES_R = 'M87 103V95M97 103V95'

const EYE = { l: 40, r: 80, y: 58, rx: 11.5, ry: 12 }
/**
 * How far the nose and mouth ride above where they are drawn.
 *
 * They are drawn as one assembly — every mouth hangs off the nose's bottom
 * point at y 80.4 — so moving the nose means moving both, and one number
 * does it for all of them rather than five sets of coordinates being nudged
 * out of agreement with each other.
 */
export const SNOUT = -6

const NOSE = 'M60 80.4C56.6 80.4 53.5 78.1 53.5 75.5C53.5 73.5 56.5 72.4 60 72.4C63.5 72.4 66.5 73.5 66.5 75.5C66.5 78.1 63.4 80.4 60 80.4Z'
// Long, and deliberately outside the silhouette. Clipping them to the head
// was wrong — in life and in the reference they cross the edge.
// Three z's rising off her right ear. Drawn rather than set as text: at this
// size a glyph is at the mercy of hinting and a font that may not have loaded,
// and this is two strokes.
//
// They live in the frame's right margin — the space the ear tips needed for a
// tilt — so they never cross her. A zzz over the cat is a label saying she is
// asleep; a zzz beside her is her sleeping.
export const ZED = 'M0 0h5.4L0 6.6h5.4'

// And hearts, when she is delighted. The same corner of the frame as the zzz,
// since the two moods can never happen at once, and the same construction —
// the difference between sleeping and being pleased should be what rises off
// her, not where it rises from.
//
// Two of them, not three. At this size a third crowds the corner and turns a
// gesture into a cloud, and the zzz get three precisely because they are
// smaller: how many there are is set by how much room each one takes, not by
// matching the other beat.
export const HEART =
  'M0 2.1C0 0.7 1.2 0 2.1 0.6C2.5 0.85 2.8 1.2 3 1.5C3.2 1.2 3.5 0.85 3.9 0.6' +
  'C4.8 0 6 0.7 6 2.1C6 3.9 3.9 5.5 3 6.2C2.1 5.5 0 3.9 0 2.1Z'

// A five-pointed star, ten units across, drawn from its own centre outward:
// outer points at 5 from the middle, inner at 2.1. Not a four-pointed
// sparkle, which is the shape everything uses for "magic" and reads as a
// glint on glass rather than as a star.
export const STAR =
  'M5 0L6.23 3.3L9.76 3.45L7 5.65L7.94 9.05L5 7.1L2.06 9.05L3 5.65L0.24 3.45L3.77 3.3Z'

// Short arcs at the edge of her face, not long lines across it. They begin
// just inside the silhouette rather than out by the muzzle, and each one runs
// a few units past the outline — which is what a whisker does, and the reason
// they are not part of the shape the outline is traced from: a line drawn
// around them would make them furniture rather than hair.
//
// All three droop, and by different amounts: the top one falls three units
// over its length, the bottom one ten. That is what stops them reading as a
// comb — three parallel strokes is a grille, three that spread is a set of
// hairs growing out of the same cheek.
//
// Each is its own path with its own root, because each one swings about where
// it leaves her face. `swing` says which of the three lagging channels it
// follows and how much of it it takes; `flick` is how hard a jump throws it.
// The bottom whisker is the longest and takes the most of both — a longer
// hair has further to travel and more of its own weight to carry.
const WHISKERS: { d: string; at: string; swing: number; flick: number }[] = [
  { d: 'M19 62C13 62.5 8 64 4 65.5', at: '19px 62px', swing: 0.7, flick: -3 },
  { d: 'M19 68C13 68.5 7 70 2 74', at: '19px 68px', swing: 1, flick: -4.5 },
  { d: 'M19 74C13 74.5 7 77 3.5 84', at: '19px 74px', swing: 1.3, flick: -6 },
  { d: 'M101 62C107 62.5 112 64 116 65.5', at: '101px 62px', swing: 0.7, flick: -3 },
  { d: 'M101 68C107 68.5 113 70 118 74', at: '101px 68px', swing: 1, flick: -4.5 },
  { d: 'M101 74C107 74.5 113 77 116.5 84', at: '101px 74px', swing: 1.3, flick: -6 },
]

// --- coats -----------------------------------------------------------------
// Independent of the theme on purpose: this is which cat you have, not which
// colour the app is. Every coat still has to survive both ramps, so none uses
// pure white or pure black, and each carries its own line colour — a darkened
// version of its own fur, never one generic grey outline for all of them.

/** A circle, as a path, because a patch is a `d` and an ellipse is not. */
const disc = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`

// A two-colour cat is two caps, one over each ear, carried down the side of
// the head until they pass behind the eye. That is what the marking actually
// is on a real animal — colour that comes over the top and stops — and it
// leaves the white where a cat's white belongs: up the middle of the face and
// all the way round the muzzle.
//
// Each one is a plain circle. Nothing drawn by hand out of segments stays
// round under a clip and a squash, and every earlier attempt read as what it
// was: two lines meeting at a corner somewhere on her forehead. A circle has
// no corner to find. Kept small enough to be a marking rather than a hood:
// it takes the ear and the brow above the eye and stops, which leaves her
// most of a white face to make expressions with.
//
// The two are not the same size. A cat whose markings match on both sides is
// a logo; the left one comes further down and wraps under the eye onto the
// cheek, which is the difference between a pattern and an animal.
const P = {
  left: disc(19, 33, 38),
  right: disc(98, 23, 30),
  mask: 'M60 44C82 44 99 62 99 86C99 110 82 126 60 126C38 126 21 110 21 86C21 62 38 44 60 44Z',
}

// Tabby markings, as ellipses that run off the edge of the head and are cut
// by the silhouette clip. Drawn as closed triangles they read as loose
// shapes floating inside her — a band has to arrive from somewhere, so each
// one starts outside the head and the clip decides where it enters.
//
// They also stop well clear of the eyes. A stripe running down into the lash
// line reads as a scar rather than as fur.
const STRIPES: Stripe[] = [
  { cx: 60, cy: 17, rx: 4.6, ry: 17 },
  { cx: 44, cy: 19, rx: 3.9, ry: 16, rot: -12 },
  { cx: 76, cy: 19, rx: 3.9, ry: 16, rot: 12 },
  { cx: 29, cy: 25, rx: 3.6, ry: 15, rot: -27 },
  { cx: 91, cy: 25, rx: 3.6, ry: 15, rot: 27 },
  { cx: 13, cy: 41, rx: 3.4, ry: 14, rot: -58 },
  { cx: 107, cy: 41, rx: 3.4, ry: 14, rot: 58 },
]

// One pupil for every cat. What changes between them is the iris behind it —
// pale by default, gold on the black cat, blue on the Siamese — which is how
// a gold-eyed cat can still have the same eye as everybody else.
const PUPIL = '#262019'

export interface Coat {
  /** What the marking is called. */
  name: string
  /**
   * What she is called. A coat is a description and a cat is somebody, and
   * the difference is most of why anyone picks one over another — nobody is
   * attached to "Gray". Dutch, and earned by the coat rather than assigned to
   * it: soot, ginger, mist, mocha, a snowflake, a patch of cloth. Teller is
   * the exception and gets to be a name for its own sake.
   */
  who: string
  base: string
  muzzle: string
  /**
   * Her pink: the inside of both ears and her nose, which are the same colour
   * on a real cat and are now the same colour here. They were two fields and
   * drifted apart the moment either was tuned — a cat with a rose nose and
   * salmon ears is two decisions where there is only one fact.
   */
  ear: string
  iris: string
  pupil: string
  line: string
  /**
   * The line on a dark page, where one is needed. A coat's outline is normally
   * a darkened version of its own fur, which works because the page is pale —
   * but on a dark page a dark cat's outline is darker than both her and the
   * ground, so it does nothing and she loses her edge entirely. The coats that
   * carry a lot of black say what to use instead.
   */
  lineDark?: string
  paw: string
  dark?: boolean
  muzzleAlpha?: number
  /** The OUTER ear, for a coat whose ears are a colour point rather than fur. */
  earFur?: string
  patches?: { d: string; fill: string; soft?: boolean }[]
  stripes?: { d: Stripe[]; fill: string }
  chin?: { cx: number; cy: number; rx: number; ry: number; fill: string }
}

interface Stripe { cx: number; cy: number; rx: number; ry: number; rot?: number }

export interface Mood {
  eyes: keyof typeof EYES
  mouth: keyof typeof MOUTHS
  label: string
  squash?: number
  /** How far each ear slides away from the midline, in user units. */
  earOut?: number
  /**
   * How far each ear sinks into the skull, in user units.
   *
   * Not a scale: the ear is drawn with a long lobe buried in the head, so
   * pushing it down leaves less of it standing out and it simply reads as a
   * smaller ear. A cat flat on the carpet has very little ear showing.
   */
  earDown?: number
  /**
   * How far the whole face rides down, in user units.
   *
   * A head with a lower crown has less room above the eyes and the same
   * amount below, which puts the face too high in it. This is not a squash —
   * nothing changes shape, the arrangement just sits lower, which is where a
   * face sits on a cat lying flat.
   */
  faceDown?: number
  /**
   * Straight up, in user units, with no change of shape.
   *
   * Squash already lifts her, but it lifts her by deforming — narrower and
   * taller — so asking for more height that way asks for more stretch as
   * well. This is the other half of the same idea kept separate: a cat can
   * raise her chest off the floor without becoming a longer cat.
   */
  rise?: number
  tilt?: number
  ear?: 'perk' | 'flat'
  gaze?: [number, number]
  arc?: number
  lid?: number
}

export const COATS: Record<string, Coat> = {
  calico: {
    lineDark: '#6E5C4C', // her black side would otherwise have no edge
    name: 'Calico', who: 'Lapje', base: '#FBF2E3', muzzle: '#FFFCF6', ear: '#F2B3AA',
    iris: '#FFFFFF', pupil: PUPIL, line: '#5A4A3E', paw: '#FFFCF6',
    patches: [{ d: P.left, fill: '#3C3430' }, { d: P.right, fill: '#E39A4C' }],
  },
  // The same two patches as the calico, both in black. A tuxedo is not a
  // different animal, it is the same animal with the ginger taken out.
  tuxedo: {
    lineDark: '#6B615B', // light enough to clear the page, dark enough to show on her chin
    name: 'Tuxedo', who: 'Teller', base: '#FCF7EF', muzzle: '#FFFFFF', ear: '#EFAEA6',
    iris: '#FFFFFF', pupil: PUPIL, line: '#4A423E', paw: '#FFFFFF',
    patches: [{ d: P.left, fill: '#2F2B29' }, { d: P.right, fill: '#2F2B29' }],
    // The goatee. A tuxedo's chin spot is what stops the white muzzle reading
    // as a bib, and it is four numbers.
    // A half oval, made by putting a whole oval's CENTRE on the chin and
    // letting the head clip take the rest: the jawline cuts it along its own
    // curve, so the flat edge of the half is the bottom of her face rather
    // than a straight line drawn across it.
    chin: { cx: 60, cy: FLOOR, rx: 11, ry: 9, fill: '#2F2B29' },
  },
  black: {
    lineDark: '#7C726B', // the only coat that is dark everywhere
    // A shade off true black, so the lines drawn on her have something to be
    // darker than. Her mouth, whiskers and brows are the same near-black as
    // every other coat's; the fur is what moved, and only just — any further
    // and she stops being the black cat.
    name: 'Black', who: 'Roet', base: '#423C39', muzzle: '#4D4740', ear: '#C08B84',
    iris: '#F2CB64', pupil: '#1C1815', line: '#211E1D', dark: true, paw: '#4C4643',
  },
  ginger: {
    // Her ear is a deeper rose than the others'. A ginger cat's pink sits on
    // orange, and the two are close enough in both hue and lightness that the
    // usual salmon disappeared into the coat — the one place the inner ear
    // has to fight its own background rather than contrast with it.
    name: 'Ginger', who: 'Gember', base: '#EDA45C', muzzle: '#FBE7CE', ear: '#D5747F',
    iris: '#FFF3DE', pupil: PUPIL, line: '#A9622C', paw: '#FBE7CE',
    stripes: { d: STRIPES, fill: '#D5823C' },
  },
  gray: {
    // Deeper than the pale coats' pink. Grey fur is the one background that
    // is neither warm nor dark, so a soft salmon has nothing to be different
    // from — it read as a slightly warmer grey rather than as pink.
    name: 'Gray', who: 'Mist', base: '#A9AEB0', muzzle: '#E4E6E6', ear: '#D4837E',
    iris: '#FFFFFF', pupil: PUPIL, line: '#6B7073', paw: '#E8EAEA',
    stripes: { d: STRIPES, fill: '#868D90' },
  },
  siamese: {
    name: 'Siamese', who: 'Mokka', base: '#F1E3CE', muzzle: '#F7EEE0', ear: '#C2726C',
    iris: '#A9D4EE', pupil: PUPIL, line: '#8D765F', paw: '#F9F2E7',
    patches: [{ d: P.mask, fill: '#6E5747', soft: true }],
    // A siamese's ears are a point, not fur — so the whole ear goes dark and
    // the pink sits inside it, which is both what the animal looks like and
    // the only way her ear and her nose can be the same colour.
    earFur: '#8A6A58',
    // The mask runs right over the muzzle, and a rose nose on top of that
    // brown is two dark things on each other — the nose disappeared. So the
    // muzzle reads at nearly full strength on this coat, which is what gives
    // the nose a pale field to sit on.
    muzzleAlpha: 0.88,
  },
  white: {
    name: 'White', who: 'Vlok', base: '#FCF9F3', muzzle: '#FFFFFF', ear: '#F2B3AA',
    // A pale cat needs a darker line than a dark one, not a lighter one: she
    // has no edge contrast of her own against an off-white page.
    iris: '#FFFFFF', pupil: PUPIL, line: '#8E8375', paw: '#FFFFFF',
  },
}

// --- eyes ------------------------------------------------------------------
// One structure everywhere: an iris field, a pupil that fills most of it, and
// two highlights. The gaze moves the pupil and its highlights together, which
// is all "looking up and to the left" has ever been.

// One curve does both jobs.
//
// The eye closes because a lid comes down across it, so there is exactly one
// piece of geometry involved: the lid's edge. The mask is the region below
// that edge, and the drawn border IS that edge. Deriving them separately is
// what was broken before — the mask was a rectangle, so the top of the
// clipped eye was a straight horizontal line, while the border was a curved
// arc sliding down independently. Two different shapes; they could never
// agree, and what you saw was a line drifting over an eye that ignored it.
//
// t is how shut she is. 0 is open, and the lid then traces the top of the
// eye, which is why the border at rest looks like the eye's own outline. 0.5
// puts it flat across the middle. 1 bulges it past the bottom, which leaves
// no eye at all.
// Zero: at rest the lid sits exactly on the top of the eye, so the eye is a
// full circle and the border traces its outline. Any resting value above zero
// makes every eye a lens instead — a small distortion, applied permanently,
// to a shape that carries most of her character.
export const LID_OPEN = 0

export function lidPaths(cx: number, cy: number, rx: number, ry: number, t: number) {
  // The eye narrows onto its own centre line, evenly from above and below, so
  // the mask is simply the eye's ellipse with its vertical radius collapsing:
  // radii (rx, h) with h running from ry to nothing. At t = 0 it is the eye
  // itself and nothing is hidden; at t = 1 it has closed to a line across the
  // middle and there is no eye left on either side of it.
  //
  // The border is the top half of that same ellipse, which is why it reads as
  // the eye's own outline at rest and as a straight line when shut — one
  // shape, sampled twice, so the two can never disagree.
  //
  // Elliptical arcs rather than Béziers: a quadratic through the same three
  // points sags badly at the sides, and that is what made the open eye's
  // border cut across it instead of sitting on it.
  const h = Math.max(ry * (1 - t) * 1.03, 0.01)
  const n = (v: number) => v.toFixed(2)
  // sweep-flag 1 is the positive angle direction, which with y pointing down
  // runs clockwise on screen — left point, over the top, right point.
  const over = `A${n(rx)} ${n(h)} 0 0 1 ${n(cx + rx)} ${n(cy)}`
  const under = `A${n(rx)} ${n(h)} 0 0 1 ${n(cx - rx)} ${n(cy)}`
  return {
    mask: `M${n(cx - rx)} ${n(cy)}${over}${under}Z`,
    lash: `M${n(cx - rx)} ${n(cy)}${over}`,
  }
}

interface EyeOpts {
  gaze?: [number, number]
  inward?: number
  lid?: number
  arc?: number
  /**
   * Which blink channel this eye answers to. Kept in the call sites even
   * though the markup no longer branches on it: every eye is blinkable now,
   * and the name documents which side a call is building.
   */
  blink?: string
}

function eye(cx: number, cy: number, rx: number, ry: number, c: Coat, id: string,
  { gaze = [0, 0] as [number, number], inward = 0, lid = 0, arc = LID_OPEN }: EyeOpts = {}): string {
  const [gx, gy] = gaze
  const px = cx + gx + inward, py = cy + gy
  const prx = rx * 0.74, pry = ry * 0.82
  const shape = `cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`

  // The pupil is clipped to the eye, always. It sits off-centre toward the
  // nose by default and moves further with the mood, and the hole it lives in
  // is the only thing keeping that from sliding out onto the cheek.
  // A blink is a lid travelling down over an eye that does not itself change.
  // Scaling the eye group was wrong twice over: it squashed the pupil out of
  // round and it thinned the lash line, because a stroke scales with whatever
  // it is drawn on. So the eye is clipped by a rectangle that slides down over
  // it, and the lash line — which IS the edge of the lid — translates the same
  // distance. Nothing is scaled, so the pupil keeps its shape and the stroke
  // keeps its weight; they are simply covered.
  //
  // Clipping rather than covering also means whatever is behind the eye shows
  // through as she closes it, which matters on a calico: her left eye sits on
  // a black patch and her right on cream, and a single lid colour would be
  // wrong on one of them.
  // Both the lid and the lash line are moved from JS, by attribute, and not
  // through a custom property. Chrome does not re-evaluate a clipPath's
  // geometry when a registered property inside it animates, and CSS
  // `clip-path: inset()` on the group does not either — the eye simply never
  // changed while the lash line slid down it on its own. Attributes always
  // repaint, and driving both in the same tick is also the only way to
  // guarantee the line stays welded to the edge it is drawing.
  // Both elements are redrawn from lidPaths by JS, by attribute. A registered
  // custom property cannot drive this: Chrome does not re-evaluate a
  // clipPath's geometry when one animates inside it, and CSS clip-path:inset
  // on the group does not repaint either. Attributes always do.
  const geo = `data-cx="${cx}" data-cy="${cy}" data-rx="${rx}" data-ry="${ry}" data-t0="${arc}"`
  const d0 = lidPaths(cx, cy, rx, ry, arc)
  const inner = `
      <clipPath id="${id}h"><ellipse ${shape}/></clipPath>
      <clipPath id="${id}d"><path class="cat-lidmask" ${geo} d="${d0.mask}"/></clipPath>
      <g clip-path="url(#${id}d)">
        <ellipse ${shape} fill="${c.iris}"/>
        <g clip-path="url(#${id}h)">
          <g class="cat-pupil" style="transform-box:view-box;transform:${POSE_GAZE}">
          <ellipse cx="${px}" cy="${py}" rx="${prx}" ry="${pry}" fill="${c.pupil}"/>
          <circle cx="${px + prx * 0.34}" cy="${py - pry * 0.44}" r="${prx * 0.32}" fill="#fff" opacity=".96"/>
          <circle cx="${px - prx * 0.42}" cy="${py + pry * 0.42}" r="${prx * 0.18}" fill="#fff" opacity=".6"/>
          </g>
        </g>
      </g>
      <path class="cat-lash" ${geo} d="${d0.lash}" fill="none" stroke="${c.line}"
        stroke-width="2.6" stroke-linecap="round"/>`

  if (!lid) return inner

  // The cross eye. Not a smaller eye — a lid drawn across it, dropping toward
  // the nose. Narrowing an eye symmetrically only makes a cat look far away;
  // it is the slant that reads as an opinion.
  const o = 4
  const a = [cx - lid * (rx + o), cy - ry * 0.72]
  const b = [cx + lid * (rx + o), cy - ry * 0.08]
  // Walk the quad's perimeter: a, b, b's foot, a's foot. Sorting the two x
  // values instead put the corners in the order right, left, right, left on
  // whichever eye had a negative lid, which is a bowtie, not a quad — and a
  // self-intersecting clip is what grew the extra eye on the grumpy face.
  const foot = cy + ry + o
  return `<clipPath id="${id}k"><polygon points="${a[0]},${a[1]} ${b[0]},${b[1]}
      ${b[0]},${foot} ${a[0]},${foot}"/></clipPath>
    <g clip-path="url(#${id}k)">${inner}</g>
    <path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="${c.line}" stroke-width="2.2"
      stroke-linecap="round" fill="none"/>`
}

// How far the pupils sit toward the nose. A pair of pupils dead centre in
// their own sockets is a doll; pulling them in a couple of units is the whole
// of the silly, slightly cross-eyed look the reference has.
const IN = 2.6

// A closed eye is an arc, and which way it bends is the entire mood: up is
// pleased, down is asleep. Same stroke, opposite sign.
function arcEye(cx: number, cy: number, c: Coat, up = true) {
  const w = 10, h = up ? -6.4 : 5.8
  return `<path d="M${cx - w} ${cy + (up ? 2.6 : -1)}q${w} ${h * 2} ${w * 2} 0" fill="none"
      stroke="${c.pupil}" stroke-width="3.6" stroke-linecap="round"/>`
}

// Brows are two short strokes and they carry more mood than the eyes do.
// Which end is raised is the whole difference: inner-up reads as pleading,
// inner-down as cross. Nothing else about the face changes between the two.
// Measured off the eye rather than typed in. Hand-placed brows are exactly
// what gets left behind the next time the face moves.
const brow = (c: Coat, inner: 'up' | 'down') => {
  const x0 = EYE.l - EYE.rx - 1
  const w = (EYE.rx + 1) * 2
  const y = EYE.y - EYE.ry - 3.5
  const dy = inner === 'up' ? -3 : 4.6
  const lift = inner === 'up' ? -5.5 : 1.2
  return `<path d="M${x0} ${y}q${w / 2} ${lift} ${w} ${dy}M${120 - x0} ${y}q${-w / 2} ${lift} ${-w} ${dy}"
      fill="none" stroke="${c.pupil}" stroke-width="2.7" stroke-linecap="round" opacity=".7"/>`
}

const E = EYE
const open2 = (c: Coat, id: string, g: [number, number], arc: number, dx = 0, dy = 0): [string, string] => [
  eye(E.l, E.y + dy, E.rx + dx, E.ry + dx, c, id + 'a', { gaze: g, inward: IN, arc, blink: '--blink-l' }),
  eye(E.r, E.y + dy, E.rx + dx, E.ry + dx, c, id + 'b', { gaze: g, inward: -IN, arc, blink: '--blink-r' }),
]
type EyeFn = (c: Coat, id: string, g: [number, number], arc: number) => [string, string, string]

const EYES: Record<string, EyeFn> = {
  open: (c, id, g, arc) => [...open2(c, id, g, arc), ''],
  wide: (c, id, g, arc) => [...open2(c, id, g, arc, 1.8), ''],
  happy: (c) => [arcEye(E.l, E.y, c, true), arcEye(E.r, E.y, c, true), ''],
  sleepy: (c) => [arcEye(E.l, E.y + 2, c, false), arcEye(E.r, E.y + 2, c, false), ''],
  // Sad is not a frown — it is the eyes going big and the brows tipping in.
  sad: (c, id, g, arc) => [...open2(c, id, g, arc, 0.6, 1), brow(c, 'up')],
  // Curious: one eye a shade larger. Asymmetry is what reads as attention.
  // One eye a shade larger than the other — but both still circles, and
  // scaled evenly. Asymmetry is what reads as attention; a squint is not.
  curious: (c, id, g, arc) => [
    eye(E.l, E.y, E.rx + 0.8, E.ry + 0.8, c, id + 'a', { gaze: g, inward: IN, arc, blink: '--blink-l' }),
    eye(E.r, E.y + 1.6, E.rx - 1.8, E.ry - 1.8, c, id + 'b', { gaze: g, inward: -IN, arc, blink: '--blink-r' }), ''],
  angry: (c, id, _g, arc) => [
    eye(E.l, E.y, E.rx, E.ry, c, id + 'a', { gaze: [0, 1], inward: IN, lid: 1, arc, blink: '--blink-l' }),
    eye(E.r, E.y, E.rx, E.ry, c, id + 'b', { gaze: [0, 1], inward: -IN, lid: -1, arc, blink: '--blink-r' }), brow(c, 'down')],
}

const MOUTHS: Record<string, (c: Coat) => string> = {
  // The default is a small w hung off the nose: two arcs, not a curve.
  neutral: (c) => `<path d="M60 80.4v2.9M60 83.3q-2.1 4.4-6.3 3.3M60 83.3q2.1 4.4 6.3 3.3" fill="none"
      stroke="${c.line}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  smile: (c) => `<path d="M60 80.4v3.1M60 83.5q-3.4 5.8-8.8 4.1M60 83.5q3.4 5.8 8.8 4.1" fill="none"
      stroke="${c.line}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  open: (c) => `<path d="M60 80.8c5.9 0 9.2 1.1 9.2 3.5 0 4.3-4.1 7.8-9.2 7.8s-9.2-3.5-9.2-7.8c0-2.4 3.3-3.5 9.2-3.5Z"
      fill="${c.pupil}"/><path d="M60 91.8c2.7-.2 4.4-1.8 4.4-3.3 0-1.3-2-2.1-4.4-2.1s-4.4.8-4.4 2.1c0 1.5 1.7 3.1 4.4 3.3Z"
      fill="#EE8E96"/>`,
  // A yawn is a plain oval, taller than it is wide, and nothing else.
  //
  // It used to be the open mouth stretched downward, which kept that shape's
  // wide, nearly straight top — and a wide flat top with corners is a grin.
  // She read as delighted with her mouth open rather than as a cat yawning.
  // A true ellipse has no corners to read as anything.
  yawn: (c) => `<path d="M60 79.4C63.98 79.4 67.2 83.12 67.2 87.7C67.2 92.28 63.98 96 60 96C56.02 96 52.8 92.28 52.8 87.7C52.8 83.12 56.02 79.4 60 79.4Z"
      fill="${c.pupil}"/><path d="M60 94.6c2.7-.3 4.5-2.4 4.5-4.1 0-1.4-2-2.3-4.5-2.3s-4.5.9-4.5 2.3c0 1.7 1.8 3.8 4.5 4.1Z"
      fill="#EE8E96"/>`,
  frown: (c) => `<path d="M60 80.4v2.9M53.8 87.8q6.2-4.8 12.4 0" fill="none" stroke="${c.line}"
      stroke-width="2.4" stroke-linecap="round"/>`,
  // Chewing, in two positions she alternates between: the lips closed on
  // something, the jaw down and then up. Not a mood's mouth — nothing she
  // feels looks like this — so only a trick shows them.
  munch: (c) => `<path d="M60 80.4v3.6M53 85.6q3.5 2.7 7 0q3.5 2.7 7 0" fill="none"
      stroke="${c.line}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  munch2: (c) => `<path d="M60 80.4v2.4M54.4 83.4q2.8 1.7 5.6 0q2.8 1.7 5.6 0" fill="none"
      stroke="${c.line}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
}

// `squash` is how hard her chin is pressed into the carpet: 1 flat out, 0
// head up. `ear` perks or flattens both ears; it is the difference between a cat that
// has just woken up and one that has heard something. `gaze` moves the pupils
// without moving the head, which is the cheaper and more feline of the two.
// How lidded each eye variant sits before any blink is applied. It belongs to
// the variant, not the mood, because the rig renders each variant once and
// then only chooses between them.
// Only two of these are allowed to change the eye's shape, and both have a
// reason you could name: asleep, where the eye is shut, and cross, where a lid
// comes down at an angle. Everything else keeps the circle and says what it
// means with gaze, tilt, ears and mouth. An eye quietly squeezed into a lens
// reads as a different animal, not a different mood.
export const VARIANT_LID: Record<string, number> = {
  open: 0, wide: 0, happy: 0, sleepy: 0, sad: 0, curious: 0, angry: 0.24,
}

export { EAR_TURN }

export const MOODS: Record<string, Mood> = {
  idle:      { eyes: 'open',    mouth: 'neutral', squash: 0.85, label: 'Idle' },
  // Pleased lifts her. Squash alone only narrows the head a little at this
  // end of the range, and being pleased is a thing you do with your chin up.
  happy:     { eyes: 'happy',   mouth: 'smile', squash: 0.78, rise: 3, label: 'Happy' },
  // All the way down, and it is the only mood that is: the squash channel
  // spreads her past resting only above 0.85, and she is the only one up
  // there. A negative rise on top of it settles her the last couple of units
  // into the carpet — the scale flattens her, this is the weight.
  // Down on the carpet her ears slide outward and lie back further than any
  // other mood's: a head spread along the floor takes its ears with it.
  // No tilt. Every other mood can lean, but this one is the only one whose
  // shape has a flat bottom, and four degrees of lean on a flat bottom is a
  // cat lying on a slope. The base has to be parallel to the ground it is
  // supposed to be resting on.
  sleepy:    { eyes: 'sleepy',  mouth: 'neutral', squash: 1, earOut: 4, earDown: 5, faceDown: 5,
               label: 'Sleepy', ear: 'flat' },
  // Two yawns, because a cat yawns for two different reasons and they do not
  // look alike.
  //
  // This is the one on the way down: she is going to sleep and her mouth
  // opens on the way. Nothing else moves — no lift, no tremble — because
  // nothing else is happening. She is already three quarters gone.
  yawn:      { eyes: 'sleepy',  mouth: 'yawn', squash: 0.95,    label: 'Yawn',   tilt: -3, ear: 'flat' },
  // And this is the one on the way back: the yawn that comes with a stretch,
  // which is the only reason to come up off the carpet with your eyes still
  // shut. The lift is the whole difference — a yawn taken lying flat is a cat
  // with her mouth open — and her paws quiver through it, the way they do.
  stretch:   { eyes: 'sleepy',  mouth: 'yawn', squash: 0, rise: 7, label: 'Stretch', tilt: -3, ear: 'flat' },
  curious:   { eyes: 'curious', mouth: 'neutral', squash: 0.5, label: 'Curious', tilt: 7 },
  // A head that has come up, not just opened. The squash lifts her a little on
  // its own — three units at this end of the range — so the mood was a face
  // changing on a head that stayed where it was. Seven on top of that is
  // nearly ten units clear of resting: enough to read as her coming up, and
  // short of the eleven and sixteen that were tried, which read as a leap.
  surprised: { eyes: 'wide',    mouth: 'open', squash: 0.32, rise: 7, label: 'Surprised', ear: 'perk' },
  celebrate: { eyes: 'happy',   mouth: 'open', squash: 0.4,    label: 'Celebrate', tilt: -3, ear: 'perk' },
  // Woken with a start. Further up than surprised and with no tilt at all —
  // a head that has come straight off the ground rather than turned toward
  // something. It is the only mood that is normally seen in the air.
  startled:  { eyes: 'wide',    mouth: 'open', squash: 0.12, rise: 8, label: 'Startled', ear: 'perk' },
  sad:       { eyes: 'sad',     mouth: 'frown', squash: 0.9,   label: 'Sad' },
  grumpy:    { eyes: 'angry',   mouth: 'neutral', squash: 0.8, label: 'Grumpy' },
  lookUpL:   { eyes: 'open',    mouth: 'neutral', squash: 0.45, label: 'Look up left',
               gaze: [-4.5, -4], tilt: 5, ear: 'perk' },
  lookUpR:   { eyes: 'open',    mouth: 'neutral', squash: 0.45, label: 'Look up right',
               gaze: [4.5, -4], tilt: -5, ear: 'perk' },

  // Looking down, which is most of what she will be doing: she sits above the
  // card and the card is what there is to look at. Three of them, because a
  // gaze that never moves across what it is reading is a stare.
  //
  // The pupils drop and the head comes down with them. No lid: reading is not
  // a different eye, it is the same eye pointed somewhere else.
  lookDownL: { eyes: 'open', mouth: 'neutral', squash: 0.95, label: 'Look down left',
               gaze: [-4.5, 4.5], tilt: 3 },
  lookDownC: { eyes: 'open', mouth: 'neutral', squash: 0.98, label: 'Look down',
               gaze: [0, 5], tilt: 0 },
  lookDownR: { eyes: 'open', mouth: 'neutral', squash: 0.95, label: 'Look down right',
               gaze: [4.5, 4.5], tilt: -3 },
}

// --- drawing ---------------------------------------------------------------
// Pivots are declared here rather than left to whoever animates her later. An
// ear that twitches around its own centre looks like it came loose; it has to
// turn about its base, which is a point only this file knows.

const PIVOT: Record<string, string> = {
  head: '60px 100px',   // the neck — a tilt should swing, not spin
  earL: '28px 40px',   //
  earR: '92px 40px',   // each ear about where it meets the skull
  eyeL: `${EYE.l}px ${EYE.y}px`,
  eyeR: `${EYE.r}px ${EYE.y}px`,
  pawL: '27px 104px',  // the paws pivot on the edge they are hooked over
  pawR: '93px 104px',
}
// One transform channel, not two. A `transform` attribute and a CSS
// transform-origin on the same element do not sit side by side: Chrome reads
// the attribute AS the CSS property, so the origin applies to it too and the
// part rotates about a point twice removed from the one asked for. That is
// what had the ears drifting off the skull on every tilted mood. Everything
// static goes through CSS here, which is also the channel an animation will
// use later.
const pin = (o: string, deg: string | number = 0, dx = 0, dy = 0, extra = '') => {
  const t = []
  if (dx || dy) t.push(`translate(${dx}px, ${dy}px)`)
  if (deg) t.push(`rotate(${typeof deg === 'string' ? deg : `${deg}deg`})`)
  if (extra) t.push(extra)
  return `transform-box:view-box;transform-origin:${o}${t.length ? `;transform:${t.join(' ')}` : ''}`
}

// ---------------------------------------------------------------------------
// The animation hooks.
//
// A pose and its animation must not fight over the same transform, and they
// will if both are written into it: the pose is set once when the mood
// changes, the animation runs sixty times a second, and whichever wrote last
// wins. So the pose is baked into the transform expression and the animation
// drives registered custom properties inside it. They compose instead of
// overwriting, and both copies of an ear — the outline layer and the fill
// layer — read the same variable and stay in step for free.
//
// Only transforms are animated. Nothing here touches a path's `d`: a squash
// that regenerates the head outline would rebuild and re-parse a path every
// frame, and path data is the one thing the compositor cannot help with.
// Breathing is a scale about the floor, which costs nothing.
const BREATH = 'scaleX(calc(1 - var(--breath, 0) * 0.006)) scaleY(calc(1 + var(--breath, 0) * 0.013))'

// --- the rig's pose channels -----------------------------------------------
// Squash stops being a path and becomes a transform.
//
// headPath(q) was right about the shape and wrong about the cost: a squash
// that regenerates the outline cannot be blended, because every frame of the
// blend is a new path string to build and re-parse. Scaling about the floor
// gets within a few percent of the same geometry — at the most extreme mood
// it is 0.92 across and 1.06 up — and it is free, continuous, and something
// two poses can meet in the middle of.
//
// The numbers come from headPath itself: at full lift it drew the lower half
// at 46/52 of its resting width and the head 91/84 of its resting height.
const LIFT = '(1 - var(--sq, 0.85))'


// Only the breath is left in here. The squash used to be a scale on this
// group and is a `d` transition on the skull itself now, which is the only
// way the shape can actually change rather than be stretched.
const SX = `(1 - var(--breath, 0) * 0.006)`
const SY = `(1 + var(--breath, 0) * 0.013)`


// The lift is a translate as well as a stretch. Scaling about the floor makes
// the crown rise while the chin stays welded to it, which is a head being
// pulled taller rather than a head coming up — the difference between a cat
// looking up and a cat being stretched by someone off-screen. Raising the
// whole thing as it narrows is what makes it read as her own movement.
//
// Outermost in the list, so it moves the already-deformed head rather than
// being scaled along with everything else.
//
// The trick channels, --t-rise and --t-tilt, are a second rise and tilt added
// on top of the mood's. A trick moves her head by an offset that starts and
// ends at nothing, so whatever the mood is doing underneath — arriving,
// transitioning, being replaced — carries on untouched, and the head can
// never jump when the trick lets go of it. Unregistered on purpose: the trick
// writes them every frame, and a transition on them would only lag it.
const POSE_HEAD =
  `translateY(calc(${LIFT} * -5px + var(--rise, 0) * -1px + var(--hop, 0) * -15px + var(--t-rise, 0) * -1px)) ` +
  `rotate(calc(var(--tilt, 0deg) + var(--t-tilt, 0deg))) scaleX(calc(${SX})) scaleY(calc(${SY}))`

// The skull deforms; the things sitting in it do not. An eye is a circle and
// a squashed circle is a different eye — she goes from alert to sleepy just
// because her head met the carpet, which is not a mood anyone chose.
//
// Each feature undoes the head's scale about its OWN centre, so it keeps its
// shape while still being carried wherever the deformation puts it. Position
// follows the face, proportion does not. EVERY feature: the eyes and the nose
// did this from the start, but the mouth, the brows, the muzzle and each
// whisker did not, and a mouth that widens with the skull is a different
// mouth. The whiskers undo it about their own roots, which is the same point
// they swing about — a hair does not get fatter because she lay down.
const UNSQUASH = `scaleX(calc(1 / ${SX})) scaleY(calc(1 / ${SY}))`
// Each ear has its OWN huff channel, so an irritated cat can lay back both
// ears, or one, or neither. Driving them from the same value as the nose made
// every huff identical, and a tic that repeats exactly is a mechanism rather
// than a mood.
const POSE_EAR = (side: 'l' | 'r') => {
  const out = side === 'l' ? 1 : -1
  return `translate(calc(${LIFT} * ${out * 2.5}px + var(--ear-out, 0) * ${out}px), ` +
    `calc(${LIFT} * -4px + var(--ear-down, 0) * 1px)) ` +
    `rotate(calc(var(--ear-${side}, 0deg) + var(--twitch-${side}, 0deg) + var(--huff-${side}, 0) * ${out * 15}deg))`
}
// The idle glance and the mood's own gaze are separate channels that add, so
// her eyes can drift while she is also looking somewhere on purpose.
// Sleeping cats work their paws. Each turns about where it meets the ledge,
// and the two run in antiphase on a period that is not a multiple of the
// breath's — beats that share a factor resolve into one pattern.
const POSE_PAW = (side: 'l' | 'r') =>
  `rotate(calc(var(--paw-${side}, 0deg) + var(--shake, 0) * var(--shake-gain, 0) * 5deg)) ` +
  `translateY(calc(var(--paw-${side}-y, 0px) + var(--bob, 0) * var(--bob-gain, 0) * -6px` +
  // A fifth of what the head does, and its own channel because it also
  // arrives late: the body goes and the legs are dragged after it. Parts that
  // leave together are one rigid object, which is the difference between a
  // cat jumping and a picture of a cat being moved.
  ` + var(--hop-paw, 0) * -3.5px))` +
  // A trick's hold on the paw — shifted, lifted and turned about the ledge —
  // added after everything above rather than put in its place, the way the
  // head's trick channels are: the knead, a pleased cat's lift, a tremble all
  // carry on underneath, and the paw leaves from exactly where it was and
  // comes back to exactly where it would have been. An animation of the
  // transform itself cannot do this: what it adds to is the paw's style
  // before its own loops run, so the lift of a pleased cat vanished under it
  // and came back in one frame when it ended.
  ` translate(var(--t-paw-${side}-x, 0px), var(--t-paw-${side}-y, 0px)) rotate(var(--t-paw-${side}-r, 0deg))`
const POSE_GAZE =
  'translate(calc(var(--gaze-x, 0px) + var(--gaze-px, 0px)), calc(var(--gaze-y, 0px) + var(--gaze-py, 0px)))'
const TWITCH = (deg: number, v: string) => `calc(${deg}deg + var(${v}, 0deg))`
// Kept small. The base of the ear is hidden behind the skull, and these are
// the angles that stay hidden — turn it further and the ear visibly unhooks.
// Signs, because they are the easy thing to get backwards and I did. The left
// ear's tip sits up and to the left of its pivot, so a POSITIVE rotation
// swings that tip inward and up — ears pinched together, which is an alert
// cat, not a sleeping one. Laid back is outward and down, which is negative.
const EAR_TURN: Record<string, number> = { perk: -6, flat: -15 }

let uid = 0

/** The tuxedo's chin spot, which every cat now carries and only she shows. */
const CHIN = { cx: 60, cy: FLOOR, rx: 11, ry: 9 }

/**
 * A coat as a set of custom properties: every colour she wears, and which of
 * the markings they all carry this one shows.
 *
 * Opacity rather than display for the markings, because it is one property to
 * set and because it could be transitioned — a coat could fade into another
 * rather than cut, which nothing about the drawing now prevents.
 */
export function coatVars(coat: string, rim = false): Record<string, string> {
  const base = COATS[coat] ?? COATS.calico
  const c = rim && base.lineDark ? { ...base, line: base.lineDark } : base
  const patch = (d: string) => c.patches?.find((p) => p.d === d)
  const left = patch(P.left), right = patch(P.right), mask = patch(P.mask)
  return {
    '--cat-base': c.base, '--cat-muzzle': c.muzzle, '--cat-ear': c.ear,
    '--cat-ear-fur': c.earFur ?? c.base, '--cat-iris': c.iris,
    '--cat-pupil': c.pupil, '--cat-line': c.line, '--cat-paw': c.paw ?? c.base,
    // A dark cat's muzzle and the shadow under her both have to be stronger
    // on her than on a pale coat, or they read as dirt rather than as form.
    '--cat-muzzle-a': String(c.muzzleAlpha ?? (c.dark ? 0.42 : 0.65)),
    '--cat-contact-a': c.dark ? '.34' : '.26',
    '--cat-rim': rim ? '.15' : '0',
    '--mark-left': left?.fill ?? '#0000', '--mark-left-on': left ? '1' : '0',
    '--mark-right': right?.fill ?? '#0000', '--mark-right-on': right ? '1' : '0',
    // The siamese's points have no edge: hers is drawn through a blur and
    // held back from full strength.
    '--mark-mask': mask?.fill ?? '#0000', '--mark-mask-on': mask ? '.8' : '0',
    '--mark-stripe': c.stripes?.fill ?? '#0000', '--mark-stripe-on': c.stripes ? '1' : '0',
    '--mark-chin': c.chin?.fill ?? '#0000', '--mark-chin-on': c.chin ? '1' : '0',
  }
}

/**
 * Change her coat, on the cat already on screen.
 *
 * The whole of a coat change: she keeps her pose, her breath, her idle clock,
 * whatever she was in the middle of, and the element she has always been.
 */
export function paint(svg: SVGElement, coat: string, { rim = false } = {}) {
  for (const [k, v] of Object.entries(coatVars(coat, rim))) svg.style.setProperty(k, v)
  // The one colour that is not a fill: the z's and the hearts are spawned
  // later and read their ink from here.
  const c = COATS[coat] ?? COATS.calico
  svg.querySelector('.cat-emit')?.setAttribute('data-ink', rim ? '#ffffff' : c.line)
}

export function catSvg({ coat = 'calico', mood = 'idle', rim = false, shade = true, size = 160, rig = false } = {}) {
  const base = COATS[coat]
  // Resolved once, here, rather than at each of the twenty places that draw a
  // line. Everything downstream — the silhouette, the whiskers, the mouth, the
  // lash, the toes, the z's — reads c.line and gets the right one.
  const c = rim && base.lineDark ? { ...base, line: base.lineDark } : base
  // Every colour she wears is a custom property, and `V` is the palette as the
  // DRAWING refers to it rather than as it resolves. One consequence: the
  // markup is the same for all seven cats — every coat's markings are in it,
  // the ones this coat does not wear at nought opacity — so a change of coat
  // is `paint`, a dozen properties on an element that is never replaced.
  //
  // Which is the point of it. She used to be regenerated, and a new drawing
  // meant a new rig: her pose, her idle clock and a roll in mid-air all had to
  // be caught on the way out and handed back on the way in, and each of those
  // was a bug before it was a handover. Nothing is torn down now.
  const V = { ...c, base: 'var(--cat-base)', muzzle: 'var(--cat-muzzle)',
    ear: 'var(--cat-ear)', iris: 'var(--cat-iris)', pupil: 'var(--cat-pupil)',
    line: 'var(--cat-line)', paw: 'var(--cat-paw)' }
  const m = MOODS[mood]
  const id = `c${uid++}`
  // The variant's own lid, then the mood's bias on top of what is still open —
  // the same stacking the blink uses, so a still frame matches the rig.
  const lid0 = m.arc ?? LID_OPEN
  const [eyeL, eyeR, brows] = EYES[m.eyes](V, id, m.gaze ?? [0, 0], lid0 + (m.lid ?? 0) * (1 - lid0))
  const pawFur = `fill="var(--cat-paw)"`
  const turn = m.ear ? (EAR_TURN[m.ear] ?? 0) : 0
  // In rig mode the pose is not baked in. Every channel reads a custom
  // property instead, so one element can hold any mood and two moods can be
  // blended by transitioning the properties rather than swapping drawings.
  // The static render has no channels to read, so the rise is written into
  // the transform directly — otherwise a still of a mood does not match the
  // rig's version of the same mood, which is the sort of thing that is only
  // ever found later and by accident.
  const headStyle = rig
    ? pin(PIVOT.head, 0, 0, 0, POSE_HEAD)
    : pin(PIVOT.head, m.tilt ?? 0, 0, -(m.rise ?? 0), BREATH)
  const earStyle = (side: 'l' | 'r') => rig
    ? pin(side === 'l' ? PIVOT.earL : PIVOT.earR, 0, 0, 0, POSE_EAR(side))
    : pin(side === 'l' ? PIVOT.earL : PIVOT.earR,
          TWITCH(side === 'l' ? turn : -turn, `--twitch-${side}`),
          side === 'l' ? earDx : -earDx, earDy)

  // Every eye, mouth and brow is drawn once and all but one hidden. Swapping
  // by visibility rather than re-rendering is what lets the idle loop keep
  // running across a mood change: a fresh SVG would restart the breath and
  // drop every scheduled beat mid-flight.
  // `display`, not `hidden`. The HTML hidden attribute works through a UA
  // stylesheet rule that only targets HTML elements — on an SVG group it is
  // inert, so every variant drew at once and she wore all seven expressions
  // simultaneously.
  const off = (shown: boolean) => (shown ? '' : ' display="none"')
  const eyeSets = rig ? Object.entries(EYES).map(([name, fn]) => {
    const [l, r, br] = fn(V, id + name, [0, 0], VARIANT_LID[name] ?? LID_OPEN)
    return { name, l, r, br, shown: name === m.eyes }
  }) : []
  const side = (k: 'l' | 'r') => eyeSets.map((v) =>
    `<g data-eyes="${v.name}"${off(v.shown)}>${v[k]}</g>`).join('')
  const browSets = rig
    ? ['none', 'up', 'down'].map((n) =>
        `<g data-brow="${n}"${off((brows ? (brows.includes('q-5.5') ? 'up' : 'down') : 'none') === n)}>${
          n === 'none' ? '' : brow(V, n as 'up' | 'down')}</g>`).join('')
    : brows
  const mouthSets = rig
    ? Object.entries(MOUTHS).map(([n, fn]) =>
        `<g data-mouth="${n}"${off(n === m.mouth)}>${fn(V)}</g>`).join('')
    : MOUTHS[m.mouth](V)
  // How far off the carpet this mood holds its head. Anything that looks up
  // or reacts lifts; anything drowsy presses back down.
  const q = m.squash ?? 0.85
  const lift = 1 - q
  const HEAD = headPath(q)
  // The brow narrows by 3 and rises by 7 across the full range; the ears and
  // the face have to travel with it or they come unstuck from the skull.
  // The ears follow the brow up, but only about half as far as it travels.
  // The skull narrows as it lifts, and an ear that rides the full 7 units
  // ends up above the part of the head still wide enough to hold it.
  const earDx = 2.5 * lift, earDy = -4 * lift
  const faceDy = -3.5 * lift + (m.faceDown ?? 0)
  // In the rig the mood is chosen after the drawing is built, so anything the
  // mood decides has to be a channel rather than a number baked into it.
  const DOWN = 'var(--face-down, 0) * 1px'

  // Patches carry onto the ears — a calico's black side takes its ear with
  // it. Stripes do not: they are laid out for the forehead, and letting them
  // through the ear clip just drops fragments of band on the ear backs.
  // All three of them on every cat — a left side, a right side and a mask —
  // because across the seven coats that is the whole vocabulary of patches,
  // and a coat that wears none of them simply wears all three at nought.
  const patches = ([['left', P.left, ''], ['right', P.right, ''],
    ['mask', P.mask, ` filter="url(#${id}f)"`]] as const).map(([k, d, extra]) =>
    `<path class="cat-mark" d="${d}" fill="var(--mark-${k})" opacity="var(--mark-${k}-on)"${extra}/>`).join('')
  const stripes = STRIPES.map((e) =>
    `<ellipse class="cat-mark" cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"${e.rot ? ` transform="rotate(${e.rot} ${e.cx} ${e.cy})"` : ''} fill="var(--mark-stripe)" opacity="var(--mark-stripe-on)"/>`).join('')
  const marks = patches + stripes

  // Shading, kept to three moves. A light from the upper left that the whole
  // head shares, a darkening where one form passes behind another, and
  // nothing else — the moment fur gets its own texture she stops belonging
  // beside an interface that has no illustration anywhere else in it.
  const volume = shade
    ? `<path class="cat-shade" style="d:path('${HEAD}')" fill="url(#${id}v)"/>` : ''
  const contact = shade
    ? `<g class="cat-contact" clip-path="url(#${id}body)" filter="url(#${id}b)" opacity="var(--cat-contact-a)">
      <ellipse cx="27" cy="84" rx="16" ry="7" fill="#000"/>
      <ellipse cx="93" cy="84" rx="16" ry="7" fill="#000"/>
    </g>` : ''
  const pawVolume = shade ? `fill="url(#${id}p)"` : ''

  // In dark mode the outline is joined by a rim of light rather than swapped
  // for one — the same move the app already makes with its shadows, which are
  // cast in light on a dark page instead of in ink.
  // It has to sit inside the groups that carry the pose. Drawn once at the top
  // level it never moved, so the moment she tilted or squashed it stayed
  // behind as a second outline hanging in the air where she used to be.
  // Her whole outline — ears, head and paws — as one set of paths, each still
  // inside the group that carries its own pose. Written once because the rim
  // and the line have to trace exactly the same silhouette; two copies of this
  // would eventually disagree.
  const silhouette = `<g class="cat-head" style="${headStyle}">
      <g class="cat-ear cat-ear-l" style="${earStyle('l')}"><path d="${EAR_L}"/></g>
      <g class="cat-ear cat-ear-r" style="${earStyle('r')}"><path d="${EAR_R}"/></g>
      <path class="cat-skull-line" style="d:path('${HEAD}')"/>
    </g>
    <g class="cat-paw cat-paw-l" style="${pin(PIVOT.pawL, 0, 0, 0, POSE_PAW('l'))}"><path d="${PAW_L}"/></g>
    <g class="cat-paw cat-paw-r" style="${pin(PIVOT.pawR, 0, 0, 0, POSE_PAW('r'))}"><path d="${PAW_R}"/></g>`

  const catRim = `<g class="cat-rim" fill="none" stroke="#fff" stroke-width="9"
      opacity="var(--cat-rim)" stroke-linejoin="round">${silhouette}</g>`

  // The drawing is laid out in a 120x108 field and the frame is wider than
  // that on every side, because almost everything she does makes her briefly
  // bigger than her resting pose. A seven-degree tilt swings the far ear tip
  // about eight units sideways and five up; a lifted squash stretches her and
  // then raises the whole head on top of that; a huff lays the ears back.
  //
  // Measured rather than guessed: across the tilt and squash range her ears
  // reach y = -9.1, which a top edge at -10 was clipping the moment two of
  // those combined. The margin is now ten units clear at the top, where every
  // one of those effects points.
  return `<svg viewBox="-14 -20 148 134" width="${size}" height="${size * 134 / 148}"
  xmlns="http://www.w3.org/2000/svg" class="cat" role="img" aria-label="${c.name} cat, ${m.label.toLowerCase()}"
  style="${Object.entries(coatVars(coat, rim)).map(([k, v]) => `${k}:${v}`).join(';')}">
  <defs>
    <clipPath id="${id}body"><path class="cat-skull-clip" style="d:path('${HEAD}')"/></clipPath>
    <clipPath id="${id}s"><path class="cat-skull-clip" style="d:path('${HEAD}')"/></clipPath>
    <clipPath id="${id}el"><path d="${EAR_L}"/></clipPath>
    <clipPath id="${id}er"><path d="${EAR_R}"/></clipPath>
    <filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <!-- A Siamese's points have no edge. Three and a half units of blur still
         left one — a soft line is still a line — so the soft patches get their
         own filter at twice the spread, and a fill closer to the coat so there
         is less distance for the blur to cover in the first place. -->
    <filter id="${id}f" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="8"/></filter>
    <radialGradient id="${id}v" cx="38%" cy="24%" r="82%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".34"/>
      <stop offset="52%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".15"/>
    </radialGradient>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity=".3"/>
      <stop offset="60%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".1"/>
    </linearGradient>
  </defs>
  ${catRim}
  <!-- She is one shape, so she gets one outline — paws included. Every stroke
       is laid down first and every fill goes over the top of all of them: any
       stroke that falls inside the union is painted out, and what survives is
       only the outer boundary.

       That is why the paws are in here rather than carrying their own. Drawn
       separately they came with a full outline each, so a line ran between a
       paw and the face it rests against — she read as a cat with two objects
       in front of her rather than as a cat with her paws up.

       The width is doubled because the fills cover the inner half of it,
       leaving 2.6 showing on the outside. -->
  <g class="cat-outline" fill="none" stroke="var(--cat-line)" stroke-width="5.2" stroke-linejoin="round">
    ${silhouette}
  </g>
  <g class="cat-head" style="${headStyle}">
    <g class="cat-ear cat-ear-l" style="${earStyle('l')}">
      <path d="${EAR_L}" fill="var(--cat-ear-fur)"/>
      <g clip-path="url(#${id}el)">${patches}
        <path class="cat-ear-in" d="${EAR_L_IN}" fill="var(--cat-ear)"/></g>
    </g>
    <g class="cat-ear cat-ear-r" style="${earStyle('r')}">
      <path d="${EAR_R}" fill="var(--cat-ear-fur)"/>
      <g clip-path="url(#${id}er)">${patches}
        <path class="cat-ear-in" d="${EAR_R_IN}" fill="var(--cat-ear)"/></g>
    </g>
    <path class="cat-skull" style="d:path('${HEAD}')" fill="var(--cat-base)"/>
    <!-- No spread on these. The same markings are drawn three times — once on
         the head and once inside each ear clip — and moving only the head's
         copy breaks them apart at the ear's edge, which is worse than a cap
         that covers a little less of a wider head. -->
    <g class="cat-coat" clip-path="url(#${id}s)">${marks}</g>
    <ellipse class="cat-muzzle" cx="60" cy="75" rx="24" ry="13.5"
      fill="var(--cat-muzzle)" opacity="var(--cat-muzzle-a)"
      style="transform-box:view-box;transform-origin:60px 75px;transform:translateY(calc(${faceDy}px + ${DOWN})) ${rig ? UNSQUASH : ''}"/>
    ${volume}
    <ellipse class="cat-chin" clip-path="url(#${id}s)" cx="${CHIN.cx}" cy="${CHIN.cy}"
      rx="${CHIN.rx}" ry="${CHIN.ry}" fill="var(--mark-chin)" opacity="var(--mark-chin-on)"/>
    <g class="cat-whiskers" style="transform-box:view-box;transform-origin:60px 78px;transform:translateY(calc(${faceDy}px + ${DOWN})) rotate(calc(var(--huff,0) * -2.2deg + var(--whisk,0) * 2.1deg)) scaleX(calc(1 + var(--huff,0) * 0.035 + var(--whisk,0) * 0.022))">
      ${WHISKERS.map((w, i) => `<path d="${w.d}" fill="none" stroke="var(--cat-line)"
        stroke-width="1.8" stroke-linecap="round" style="transform-box:view-box;
        transform-origin:${w.at};transform:rotate(calc(var(--whisk-${i % 3}, 0deg) * ${w.swing}
        + var(--hop, 0) * ${w.flick}deg)) ${rig ? UNSQUASH : ''}"/>`).join('')}
    </g>
    <g class="cat-face" style="transform-box:view-box;transform-origin:60px 100px;transform:translateY(calc(${faceDy}px + ${DOWN}))">
      <g class="cat-brows" style="transform-box:view-box;transform-origin:60px 44px;transform:${rig ? UNSQUASH : 'none'}">${browSets}</g>
      <g class="cat-eye cat-eye-l" style="${pin(PIVOT.eyeL, 0, 0, 0, rig ? UNSQUASH : '')}">${rig ? side('l') : eyeL}</g>
      <g class="cat-eye cat-eye-r" style="${pin(PIVOT.eyeR, 0, 0, 0, rig ? UNSQUASH : '')}">${rig ? side('r') : eyeR}</g>
      <g class="cat-mouth" style="transform-box:view-box;transform-origin:60px 84px;transform:translateY(calc(${SNOUT}px + var(--face-dip,0) * 1.5px)) ${rig ? UNSQUASH : ''}">${rig ? mouthSets : MOUTHS[m.mouth](c)}</g>
      <path class="cat-nose" d="${NOSE}" fill="var(--cat-ear)"
        style="transform-box:view-box;transform-origin:60px 76px;transform:translateY(calc(${SNOUT}px + var(--sniff,0) * -0.7px + var(--face-dip,0) * 1.1px + var(--huff,0) * -1.7px)) scale(calc(1 + var(--sniff,0) * 0.07 + var(--huff,0) * 0.16)) ${rig ? UNSQUASH : ''}"/>
    </g>
  </g>
  ${contact}
  <!-- Empty on purpose. Each z and each heart is spawned here when a mood
       calls for one and removes itself when it has finished rising, so a mark
       already in the air is never cut short by her changing her mind. -->
  <g class="cat-emit" data-ink="${rim ? '#ffffff' : c.line}"></g>
  <g class="cat-paw cat-paw-l" style="${pin(PIVOT.pawL, 0, 0, 0, POSE_PAW('l'))}">
<path d="${PAW_L}" ${pawFur}/><path d="${PAW_L}" ${pawVolume}/>
    <path d="${TOES_L}" fill="none" stroke="var(--cat-line)" stroke-width="2" stroke-linecap="round" opacity=".45"/>
  </g>
  <g class="cat-paw cat-paw-r" style="${pin(PIVOT.pawR, 0, 0, 0, POSE_PAW('r'))}">
<path d="${PAW_R}" ${pawFur}/><path d="${PAW_R}" ${pawVolume}/>
    <path d="${TOES_R}" fill="none" stroke="var(--cat-line)" stroke-width="2" stroke-linecap="round" opacity=".45"/>
  </g>
</svg>`
}

/** The coats, in the order the picker shows them. */
export const COAT_IDS = Object.keys(COATS)
export type CoatId = string
export const DEFAULT_COAT: CoatId = 'calico'
export const coatById = (id: string | null): CoatId => (id && COATS[id] ? id : DEFAULT_COAT)
