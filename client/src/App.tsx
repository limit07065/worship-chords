import { useState, useRef } from 'react';
import SongMetaComponent from './components/SongMeta';
import ChordChart from './components/ChordChart';
import VersionPicker from './components/VersionPicker';
import type { SongResponse } from './types';
import './App.css';

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [song, setSong] = useState<SongResponse | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [fontSize, setFontSize] = useState(15);
  const inputRef = useRef<HTMLInputElement>(null);

  async function fetchSong(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setSong(null);
    setTranspose(0);
    try {
      const res = await fetch(`/api/song?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch song');
      } else {
        setSong(data);
      }
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  }

  async function fetchByUrl(url: string) {
    setLoading(true);
    setError('');
    setTranspose(0);
    try {
      const res = await fetch(`/api/chord?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to fetch chord data');
      } else {
        setSong(prev => prev ? { ...prev, meta: { ...prev.meta, ...data.meta, url }, sections: data.sections } : null);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchSong(query);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🎵</span>
            <span className="logo-text">Worship Chord</span>
          </div>
          <form className="search-form" onSubmit={handleSubmit}>
            <div className="search-input-wrap">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                placeholder="输入诗歌名称... e.g. 永恒唯一的盼望"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button type="button" className="clear-btn" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                  ✕
                </button>
              )}
            </div>
            <button type="submit" className="search-btn" disabled={loading || !query.trim()}>
              {loading ? <span className="spinner" /> : '搜索'}
            </button>
          </form>
        </div>
      </header>

      <main className="main">
        {!song && !loading && !error && (
          <div className="empty-state">
            <div className="empty-icon">♩</div>
            <p>输入诗歌名称，自动获取和弦谱</p>
            <div className="examples">
              {['永恒唯一的盼望', '生命在于你', '活着为要敬拜祢'].map(ex => (
                <button key={ex} className="example-btn" onClick={() => { setQuery(ex); fetchSong(ex); }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-state">
            <div className="loading-bars">
              <span /><span /><span /><span />
            </div>
            <p>正在搜索和弦谱...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <span className="error-icon">⚠</span>
            <p>{error}</p>
            <button className="retry-btn" onClick={() => fetchSong(query)}>重试</button>
          </div>
        )}

        {song && !loading && (
          <div className="song-view">
            <SongMetaComponent meta={song.meta} transpose={transpose} />

            <div className="controls-bar">
              <div className="control-group">
                <span className="control-label">调号</span>
                <button className="ctrl-btn" onClick={() => setTranspose(t => t - 1)}>−</button>
                <span className="ctrl-value">{transpose > 0 ? `+${transpose}` : transpose}</span>
                <button className="ctrl-btn" onClick={() => setTranspose(t => t + 1)}>+</button>
                {transpose !== 0 && (
                  <button className="ctrl-reset" onClick={() => setTranspose(0)}>复位</button>
                )}
              </div>
              <div className="control-group">
                <span className="control-label">字体</span>
                <button className="ctrl-btn" onClick={() => setFontSize(s => Math.max(11, s - 1))}>−</button>
                <span className="ctrl-value">{fontSize}px</span>
                <button className="ctrl-btn" onClick={() => setFontSize(s => Math.min(24, s + 1))}>+</button>
              </div>
              <a
                className="source-link"
                href={`https://www.guitarians.com${song.meta.url}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                guitarians.com ↗
              </a>
            </div>

            <VersionPicker
              results={song.allResults}
              currentUrl={song.meta.url}
              onSelect={fetchByUrl}
            />

            <ChordChart
              sections={song.sections}
              transpose={transpose}
              fontSize={fontSize}
            />
          </div>
        )}
      </main>
    </div>
  );
}
