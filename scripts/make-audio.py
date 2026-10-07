"""
Records every piece of Dutch the app can say, once per voice, into
public/audio/<voice>/.

The phone's own text-to-speech is whatever the phone happens to have, and on
Android that is often flat and robotic. So the app plays a recording instead,
made here with Piper — an open-source neural voice that runs on this computer,
with no account and no service involved — and falls back to the phone only for
a text that has no recording (see src/core/speech.ts).

Each clip is named after a hash of its text, the same hash the app computes, so
there is no index to ship: the app asks for audio/<voice>/<hash>.ogg and either
it is there or the phone speaks instead. Re-running records only what is new
and deletes clips whose text is no longer in the deck.

Opus at 16 kbit/s, trimmed of the silence Piper leaves at either end: about
3 KB for a word and 6 KB for a sentence, which is what makes several voices
affordable.

Setup, once:
    python3 -m venv .venv-audio
    .venv-audio/bin/pip install piper-tts av numpy
    .venv-audio/bin/python -m piper.download_voices --download-dir .piper \\
        nl_NL-pim-medium nl_NL-ronnie-medium nl_NL-alex-medium nl_BE-nathalie-medium
Run:
    .venv-audio/bin/python scripts/make-audio.py [--models .piper] [--voices pim,ronnie]
"""

import argparse
import json
import os
import re
import sys
from multiprocessing import Pool

DECK = 'src/content/deck-core.json'
OUT = 'public/audio'

# The ids the app offers (src/core/speech.ts) and the Piper model behind each.
VOICES = {
    'pim': 'nl_NL-pim-medium',
    'ronnie': 'nl_NL-ronnie-medium',
    'alex': 'nl_NL-alex-medium',
    'nathalie': 'nl_BE-nathalie-medium',
}

# Said by the app outside any card: the sample in Settings.
EXTRA = ['Goedemorgen, hoe gaat het met je?']

RATE = 24000  # Opus takes 8, 12, 16, 24 or 48 kHz; Piper makes 22.05.
KBPS = 16


def norm(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip()


def cyrb53(text: str, seed: int = 0) -> str:
    """The same 53-bit hash as clipName() in src/core/speech.ts."""
    M = 0xFFFFFFFF
    h1 = (0xDEADBEEF ^ seed) & M
    h2 = (0x41C6CE57 ^ seed) & M
    # JavaScript strings are UTF-16: hash code units, not code points.
    data = text.encode('utf-16-le')
    for i in range(0, len(data), 2):
        ch = data[i] | (data[i + 1] << 8)
        h1 = ((h1 ^ ch) * 2654435761) & M
        h2 = ((h2 ^ ch) * 1597334677) & M
    h1 = ((h1 ^ (h1 >> 16)) * 2246822507) & M
    h1 ^= ((h2 ^ (h2 >> 13)) * 3266489909) & M
    h2 = ((h2 ^ (h2 >> 16)) * 2246822507) & M
    h2 ^= ((h1 ^ (h1 >> 13)) * 3266489909) & M
    value = 4294967296 * (2097151 & h2) + (h1 & M)
    return format(value, 'x')


UNITS = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen']
TEENS = {10: 'tien', 11: 'elf', 12: 'twaalf', 13: 'dertien', 14: 'veertien', 15: 'vijftien',
         16: 'zestien', 17: 'zeventien', 18: 'achttien', 19: 'negentien'}
TENS = {20: 'twintig', 30: 'dertig', 40: 'veertig', 50: 'vijftig',
        60: 'zestig', 70: 'zeventig', 80: 'tachtig', 90: 'negentig'}
# The compound each tens word teaches. Both tables mirror src/core/numbers.ts.
TEACHES = {20: 2, 30: 3, 40: 7, 50: 1, 60: 4, 70: 8, 80: 5, 90: 9}


def spell(n: int) -> str:
    """A number written the way it is said. See src/core/numbers.ts."""
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n]
    tens, unit = n // 10 * 10, n % 10
    if not unit:
        return TENS[tens]
    joined = 'tweeën' if unit == 2 else 'drieën' if unit == 3 else UNITS[unit] + 'en'
    return joined + TENS[tens]


def texts(deck) -> set[str]:
    """Everything a card can speak — mirrors the `speak` fields in session/prompts.ts."""
    out = set(EXTRA)
    for n in deck['notes']:
        out.add(n['nl'])
        if n.get('gender'):
            out.add(f"{n['gender']} {n['nl']}")
        if n.get('plural'):
            out.add(f"de {n['plural']}" if n.get('gender') else n['plural'])
        v = n.get('verb')
        if v and v.get('participle') and v['participle'] != '—':
            aux = 'hebben' if v.get('auxiliary') == 'both' else v.get('auxiliary', 'hebben')
            out.add(v['participle'])
            out.add(f"{aux} {v['participle']}")
        # The two-digit number a tens word teaches — "tweeëntwintig" — which
        # is the one thing a card says that is nowhere in the deck.
        if n.get('pos') == 'num':
            for value, unit in TEACHES.items():
                if n['nl'] == TENS[value]:
                    out.add(spell(value + unit))
        for ex in n.get('examples', []):
            out.add(ex['nl'])
    return {norm(t) for t in out if t and norm(t)}


def trim(samples, rate, pad=0.06):
    """Cut the silence at either end, keeping a breath of it."""
    import numpy as np

    loud = np.flatnonzero(np.abs(samples) > 400)
    if not len(loud):
        return samples
    keep = int(pad * rate)
    return samples[max(0, loud[0] - keep) : min(len(samples), loud[-1] + keep)]


def encode(samples, rate, path):
    import av

    out = av.open(path, 'w', format='ogg')
    stream = out.add_stream('libopus', rate=RATE, layout='mono')
    stream.bit_rate = KBPS * 1000
    frame = av.AudioFrame.from_ndarray(samples.reshape(1, -1), format='s16', layout='mono')
    frame.sample_rate = rate
    resampler = av.AudioResampler(format='s16', layout='mono', rate=RATE)
    for f in resampler.resample(frame) + resampler.resample(None):
        for packet in stream.encode(f):
            out.mux(packet)
    for packet in stream.encode(None):
        out.mux(packet)
    out.close()


def record_voice(job):
    voice, model, todo = job
    import numpy as np
    import piper
    from piper import PiperVoice

    # espeak-ng silently truncates data paths past 160 characters, and this
    # project's path is long; a relative one is short enough, or point
    # PIPER_ESPEAK_DATA at a short link to it.
    data = os.environ.get('PIPER_ESPEAK_DATA') or os.path.relpath(
        os.path.join(os.path.dirname(piper.__file__), 'espeak-ng-data')
    )
    speaker = PiperVoice.load(model, espeak_data_dir=data)
    for i, (text, path) in enumerate(todo, 1):
        chunks = list(speaker.synthesize(text))
        samples = np.concatenate([c.audio_int16_array for c in chunks])
        rate = chunks[0].sample_rate
        encode(trim(samples, rate), rate, path + '.part')
        os.replace(path + '.part', path)
        if i % 1000 == 0:
            print(f'  {voice}: {i}/{len(todo)}', flush=True)
    return voice, len(todo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--models', default='.piper')
    ap.add_argument('--voices', default=','.join(VOICES))
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    deck = json.load(open(DECK, encoding='utf-8'))
    wanted = {cyrb53(t): t for t in texts(deck)}
    jobs = []
    for voice in args.voices.split(','):
        folder = os.path.join(OUT, voice)
        os.makedirs(folder, exist_ok=True)
        have = {f[:-4] for f in os.listdir(folder) if f.endswith('.ogg')}
        todo = [(t, os.path.join(folder, f'{h}.ogg')) for h, t in wanted.items() if h not in have]
        stale = sorted(have - wanted.keys())
        print(f'{voice}: {len(wanted)} texts, {len(todo)} to record, {len(stale)} to delete')
        if args.dry_run:
            continue
        for h in stale:
            os.remove(os.path.join(folder, f'{h}.ogg'))
        model = os.path.join(args.models, f'{VOICES[voice]}.onnx')
        if not os.path.exists(model):
            sys.exit(f'missing model {model} — see the setup at the top of this file')
        if todo:
            jobs.append((voice, model, todo))
    if jobs:
        with Pool(len(jobs)) as pool:
            for voice, n in pool.imap_unordered(record_voice, jobs):
                print(f'{voice}: recorded {n}')


if __name__ == '__main__':
    main()
