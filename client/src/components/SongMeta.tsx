import type { SongMeta as SongMetaType } from '../types';

interface Props {
  meta: SongMetaType;
  transpose: number;
}

// All 12 chromatic notes for transposing
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_MAP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B',
};

export function transposeNote(note: string, semitones: number): string {
  const normalized = FLAT_MAP[note] ?? note;
  const idx = CHROMATIC.indexOf(normalized);
  if (idx === -1) return note;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return CHROMATIC[newIdx];
}

export default function SongMeta({ meta, transpose }: Props) {
  const displayKey = transposeNote(meta.key, transpose);

  return (
    <div className="song-meta">
      <h1 className="song-title">{meta.name}</h1>
      <div className="song-details">
        <span className="meta-badge artist">{meta.artist}</span>
        <span className="meta-badge key">
          Key: <strong>{displayKey}</strong>
          {transpose !== 0 && (
            <span className="original-key"> (orig: {meta.key})</span>
          )}
        </span>
        {meta.capo > 0 && (
          <span className="meta-badge capo">Capo {meta.capo}</span>
        )}
        {meta.composer && meta.composer !== 'N/A' && (
          <span className="meta-badge composer">曲: {meta.composer}</span>
        )}
      </div>
    </div>
  );
}
