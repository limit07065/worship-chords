import type { SongSection } from '../types';

interface Props {
  sections: SongSection[];
  transpose: number;
  fontSize: number;
}

// All 12 chromatic notes
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_MAP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};
const PREFER_FLAT = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  // Match chord root + optional sharp/flat + optional suffix + optional bass note
  return chord.replace(
    /([A-G][#b]?)((?:maj|min|m|M|dim|aug|sus|add)?[0-9]*)(?:\/([A-G][#b]?))?/g,
    (_, root, suffix, bass) => {
      const normalized = FLAT_MAP[root] ?? root;
      const idx = CHROMATIC.indexOf(normalized);
      if (idx === -1) return _;
      const newIdx = ((idx + semitones) % 12 + 12) % 12;
      let newRoot = CHROMATIC[newIdx];
      // Use flat notation if key suggests it
      if (PREFER_FLAT.has(newRoot) && SHARP_TO_FLAT[newRoot]) {
        newRoot = SHARP_TO_FLAT[newRoot];
      }
      if (bass) {
        const bassNorm = FLAT_MAP[bass] ?? bass;
        const bassIdx = CHROMATIC.indexOf(bassNorm);
        if (bassIdx !== -1) {
          const newBassIdx = ((bassIdx + semitones) % 12 + 12) % 12;
          let newBass = CHROMATIC[newBassIdx];
          if (PREFER_FLAT.has(newBass) && SHARP_TO_FLAT[newBass]) {
            newBass = SHARP_TO_FLAT[newBass];
          }
          return `${newRoot}${suffix}/${newBass}`;
        }
      }
      return `${newRoot}${suffix}`;
    }
  );
}

function renderChordLine(chordStr: string, lyricStr: string, transpose: number, fontSize: number) {
  const transposed = transposeChord(chordStr, transpose);
  return (
    <div className="chord-line" style={{ fontSize }}>
      <div className="chord-row">{transposed || '\u00A0'}</div>
      <div className="lyric-row">{lyricStr || '\u00A0'}</div>
    </div>
  );
}

function renderBarLine(chordStr: string, lyricStr: string, transpose: number, fontSize: number) {
  // Parse bar notation: | Chord | Chord | ...
  const transposed = transposeChord(chordStr, transpose);
  return (
    <div className="chord-line bar-line" style={{ fontSize }}>
      <div className="chord-row bar-chord">{transposed}</div>
      {lyricStr && <div className="lyric-row">{lyricStr}</div>}
    </div>
  );
}

export default function ChordChart({ sections, transpose, fontSize }: Props) {
  return (
    <div className="chord-chart">
      {sections.map((section, i) => {
        if (section.type === 'label') {
          const text = section.text || '';
          if (!text) return null;
          return (
            <div key={i} className="section-label">
              {text}
            </div>
          );
        }

        if (section.type === 'line') {
          const chord = section.chord || '';
          const lyric = section.lyric || '';

          // Empty spacer line
          if (!chord.trim() && !lyric.trim()) {
            return <div key={i} className="spacer-line" />;
          }

          // Bar notation line (already has | markers from source)
          if (chord.includes('|')) {
            return (
              <div key={i}>
                {renderBarLine(chord, lyric, transpose, fontSize)}
              </div>
            );
          }

          // Regular chord-above-lyric line
          return (
            <div key={i}>
              {renderChordLine(chord, lyric, transpose, fontSize)}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
