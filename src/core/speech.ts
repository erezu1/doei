// ---------------------------------------------------------------------------
// Dutch speech. A recording first, the phone's own voice if there isn't one.
//
// The phone's text-to-speech is whatever the phone happens to have, and on
// Android that is often flat and robotic. So every word and sentence in the
// deck is recorded in advance, in each of a few voices (scripts/make-audio.py,
// with Piper: open source, made on a computer, no service behind it), and
// shipped as audio/<voice>/<hash>.ogg, named by a hash of its text so no index
// has to be downloaded to find it. A text with no recording — one added since
// the last recording, or any clip while offline and not yet heard — is spoken
// by the phone as before, and so is everything if the phone is the voice
// chosen.
//
// About the phone's voice:
// She never speaks unless you ask her to. Every call to `speak` comes from a
// tap — on the word, on the sentence, on the speaker beside them, or on "Hear
// it" in Settings — and nothing here is wired to a card arriving or an answer
// being revealed. A language app that talks at you on a train is one you stop
// taking on trains, so if that is ever to change it has to be a switch
// somebody turned on themselves.
//
// One thing to know before reading any of this: an empty voice list does not
// mean a silent phone. Android hands `getVoices()` back empty for the first
// seconds, and on plenty of devices until something has actually been spoken —
// while `speak()` with `lang = 'nl-NL'` goes straight to the system engine and
// talks anyway. So the list is evidence of a voice when it has one, and
// evidence of nothing at all when it doesn't.
// ---------------------------------------------------------------------------

/** Only ever holds a hit: a cached miss would be a miss for the whole session. */
let cached: SpeechSynthesisVoice | null = null

/** Whether the phone has a text-to-speech engine at all. */
function synthesizes(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Whether anything can be heard: a recording, or the phone's own voice. */
export function supported(): boolean {
  return typeof Audio !== 'undefined' || synthesizes()
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!synthesizes()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const dutch = voices.filter((v) => v.lang?.toLowerCase().startsWith('nl'))
  if (!dutch.length) return null
  // Prefer nl-NL over nl-BE, and a local voice over a network one.
  return (
    dutch.find((v) => v.lang.toLowerCase() === 'nl-nl' && v.localService) ??
    dutch.find((v) => v.lang.toLowerCase() === 'nl-nl') ??
    dutch[0]
  )
}

export function dutchVoice(): SpeechSynthesisVoice | null {
  if (!cached) cached = pickVoice()
  return cached
}

/** Voices load asynchronously on some platforms; re-check when they arrive. */
export function onVoicesReady(cb: () => void): () => void {
  if (!synthesizes()) return () => {}
  const handler = () => {
    cached = null
    cb()
  }
  window.speechSynthesis.addEventListener('voiceschanged', handler)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
}

/**
 * The recording's file name: a 53-bit hash of the text (cyrb53), in hex. The
 * recording script computes the same one, so the two agree on a name without
 * a list of them having to ship.
 */
export function clipName(text: string): string {
  const str = text.replace(/\s+/g, ' ').trim()
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export interface VoiceOption {
  id: string
  name: string
  note: string
}

/** The recorded voices, and the phone's own. The ids are make-audio.py's folders. */
export const VOICES: VoiceOption[] = [
  { id: 'pim', name: 'Pim', note: 'Man, from the Netherlands' },
  { id: 'ronnie', name: 'Ronnie', note: 'Man, from the Netherlands' },
  { id: 'alex', name: 'Alex', note: 'Man, from the Netherlands' },
  { id: 'nathalie', name: 'Nathalie', note: 'Woman, from Flanders' },
  { id: 'phone', name: 'Your phone', note: 'Whichever Dutch voice it has' },
]

export const DEFAULT_VOICE = 'pim'

export function voiceById(id: string | null | undefined): VoiceOption {
  return VOICES.find((v) => v.id === id) ?? VOICES.find((v) => v.id === DEFAULT_VOICE)!
}

/** The voice everything is said in. Set from the saved choice when the app loads. */
let chosen = DEFAULT_VOICE

export function setVoice(id: string): void {
  chosen = voiceById(id).id
}

/** One player for the whole app, so a new word stops the last one. */
let player: HTMLAudioElement | null = null
/** Bumped by every call to speak, so a slow fetch can tell it has been overtaken. */
let turn = 0

/**
 * Plays the recording of the text. Resolves true once it has had its say —
 * played to the end, or been cut off by the next word — and false when there
 * is no recording to play: a missing file, or offline with nothing cached.
 *
 * Fetched rather than handed to the player as a URL: an audio element asks
 * for byte ranges, which a cached response can't always answer, and a fetch
 * says plainly whether the file exists before anything tries to play it.
 */
async function playClip(text: string, voice: string, mine: number): Promise<boolean> {
  if (voice === 'phone') return false
  if (typeof Audio === 'undefined' || typeof fetch === 'undefined') return false
  let blob: Blob
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/${voice}/${clipName(text)}.ogg`)
    if (!res.ok) return false
    blob = await res.blob()
  } catch {
    return false
  }
  if (mine !== turn) return true
  const src = URL.createObjectURL(blob)
  const audio = new Audio(src)
  player = audio
  return new Promise<boolean>((resolve) => {
    let started = false
    const settle = (played: boolean) => {
      audio.onended = audio.onerror = audio.onpause = null
      URL.revokeObjectURL(src)
      resolve(played)
    }
    audio.onended = () => settle(true)
    audio.onpause = () => settle(true)
    audio.onerror = () => settle(started)
    audio.play().then(
      () => (started = true),
      () => settle(false),
    )
  })
}

/**
 * Speaks the text and resolves when it stops, so the caller can show something
 * for exactly as long as it is talking. `voice` is for trying one out before
 * choosing it.
 */
export async function speak(text: string, rate = 0.9, voice = chosen): Promise<void> {
  if (!text) return
  const mine = ++turn
  player?.pause()
  if (synthesizes()) window.speechSynthesis.cancel()
  if (await playClip(text, voice, mine)) return
  if (mine !== turn) return
  return speakWithPhone(text, rate)
}

/**
 * The phone's own voice.
 *
 * Some platforms never fire `end` — a cancelled or failed utterance can go
 * quiet without telling anyone — so a timeout scaled to the length of the text
 * resolves it anyway. Better to stop an animation slightly late than to leave
 * it running for ever.
 */
function speakWithPhone(text: string, rate: number): Promise<void> {
  if (!synthesizes()) return Promise.resolve()

  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = dutchVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'nl-NL'
  u.rate = rate

  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(failsafe)
      resolve()
    }
    // Roughly 12 characters a second at this rate, plus a little headroom.
    const failsafe = setTimeout(finish, 1200 + (text.length / 12) * 1000)
    u.onend = finish
    u.onerror = finish
    window.speechSynthesis.speak(u)
  })
}

export interface VoiceReport {
  supported: boolean
  /** A named Dutch voice in the list. Its absence proves nothing — see above. */
  found: boolean
  name?: string
  lang?: string
  local?: boolean
}

export function voiceReport(): VoiceReport {
  if (!synthesizes()) return { supported: false, found: false }
  const v = dutchVoice()
  if (!v) return { supported: true, found: false }
  return { supported: true, found: true, name: v.name, lang: v.lang, local: v.localService }
}
