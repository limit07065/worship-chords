import type { SearchResult } from '../types';

interface Props {
  results: SearchResult[];
  currentUrl: string;
  onSelect: (url: string) => void;
}

export default function VersionPicker({ results, currentUrl, onSelect }: Props) {
  if (results.length <= 1) return null;

  return (
    <div className="version-picker">
      <span className="version-label">Other versions:</span>
      {results.map((r) => (
        <button
          key={r.scoreId}
          className={`version-btn ${r.url === currentUrl ? 'active' : ''}`}
          onClick={() => onSelect(r.url)}
        >
          {r.artist} — {r.name}
        </button>
      ))}
    </div>
  );
}
