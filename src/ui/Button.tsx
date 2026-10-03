import { motion } from 'framer-motion'
import type React from 'react'
import type { ReactNode } from 'react'
import { pressable, quiet } from './motion'

// ---------------------------------------------------------------------------
// One button, so every action in the app is the same height, the same type
// size and the same shape. Start, Continue, Back and the two grade buttons all
// come from here — buttons that differ slightly from screen to screen are one
// of the clearest tells of a homemade interface.
// ---------------------------------------------------------------------------

type Tone = 'primary' | 'accent' | 'good' | 'bad' | 'neutral'

const tones: Record<Tone, string> = {
  primary: 'bg-primary text-on-primary shadow-3',
  /** The accent, quietly — for an action that shouldn't shout on every card. */
  accent: 'bg-primary-container text-on-primary-container shadow-2',
  good: 'bg-good text-good-ink shadow-2',
  bad: 'bg-bad text-bad-ink shadow-2',
  neutral: 'bg-surface-1 text-on-surface shadow-2',
}

/**
 * The wash that goes over the part NOT done.
 *
 * Painting the done part was tried twice and neither way was right: darker
 * and it reads as a stain across the button, lighter and the part you have
 * finished looks like the part you have not. Paling what is left works
 * because it leaves the done part as the button's own colour — the thing you
 * are working towards is the button simply being itself.
 *
 * Faintly stronger at the far end, so the boundary where you have got to is
 * the crispest edge in it and the distance ahead fades away from you.
 *
 * How far it goes is a theme's business, not this file's: the word lies
 * across both halves in one ink, so the wash can only be as strong as that
 * ink can survive, and which ink that is depends on which way round the
 * accent and its ink are.
 */
export function wash(tone: Tone): string {
  const quiet = tone === 'accent' || tone === 'neutral'
  if (quiet) {
    const at = (pct: number) => `color-mix(in srgb, var(--color-surface) ${pct}%, transparent)`
    return `linear-gradient(to right, ${at(40)}, ${at(52)})`
  }
  const at = (v: string) => `color-mix(in srgb, #fff ${v}, transparent)`
  return `linear-gradient(to right, ${at('var(--wash-near)')}, ${at('var(--wash-far)')})`
}

interface Props {
  children: ReactNode
  onClick: () => void
  tone?: Tone
  disabled?: boolean
  /**
   * Something painted across the button, under the words — a clock running
   * down, where `progress` would be a quantity standing still. The button
   * doesn't know what it means; it only owns the rounded box that clips it.
   */
  overlay?: ReactNode
  /** For a button that cares about the press itself, not only the click. */
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void
  /**
   * How much of today is behind you, nought to one. The button draws it.
   *
   * A graded wash whose gradient spans the fill rather than the button, so its
   * edge always sits exactly where the progress has reached. It covers what is
   * LEFT rather than what is done.
   *
   * It sits under the label, so the words are one ink from end to end rather
   * than half on one colour and half on another.
   */
  progress?: number
  className?: string
}

export function Button({
  children,
  onClick,
  tone = 'primary',
  disabled,
  progress,
  overlay,
  onPointerDown,
  className = '',
}: Props) {
  return (
    <motion.button
      {...pressable}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      className={`relative overflow-hidden rounded-full px-8 py-5 text-lg leading-none font-semibold transition-shadow active:shadow-press disabled:opacity-40 disabled:shadow-1 ${tones[tone]} ${className}`}
    >
      {overlay}
      {progress != null && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-y-0 right-0"
          style={{ background: wash(tone) }}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, 1 - progress)) * 100}%` }}
          transition={quiet}
        />
      )}
      {/* One ink from end to end. The word was written twice for a while, the
          second copy clipped to the pale part in a darker ink, because white
          on a wash of the accent is thin — but a word that changes colour
          halfway through is a word you notice instead of read. The wash is
          held back to where white survives instead. */}
      <span className="relative">{children}</span>
    </motion.button>
  )
}
