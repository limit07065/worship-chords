import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as OpenCC from 'opencc-js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simplified → Traditional Chinese converter
const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const GUITARIANS_BASE = 'https://www.guitarians.com';
const GUITARIANS_SEARCH = 'https://zh-hans.guitarians.com/home/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Referer': `${GUITARIANS_BASE}/`,
  'Origin': GUITARIANS_BASE,
  'X-Requested-With': 'XMLHttpRequest',
};

interface ScoreResult {
  score_id: number;
  name: string;
  artist_name: string;
  web_score_url: string;
}

interface Section {
  details: { type: number; text?: string; eol?: number };
  chord?: string;
  lyric?: string;
}

interface GuitariansScore {
  score_id: number;
  name: string;
  artist_name: string;
  original_key: string;
  original_capo: number;
  composer_name: string;
  lyricist_name: string;
  web_score_url: string;
}

// Worship-related keywords to prioritise relevant results
const WORSHIP_KEYWORDS = ['詩歌', '敬拜', '讚美', '新歌', '教會', 'worship', '福音', '聖歌'];

function scoreRelevance(score: ScoreResult): number {
  const artistLower = score.artist_name.toLowerCase();
  const nameLower = score.name.toLowerCase();
  let score_val = 0;
  for (const kw of WORSHIP_KEYWORDS) {
    if (artistLower.includes(kw.toLowerCase()) || nameLower.includes(kw.toLowerCase())) {
      score_val += 10;
    }
  }
  return score_val;
}

// Parse chords positioned above lyrics and add | bar separators every 4 beats
function parseChordLine(chordStr: string, lyricStr: string): { chord: string; lyric: string } {
  if (!chordStr || !chordStr.trim()) {
    return { chord: '', lyric: lyricStr };
  }

  // Extract chord positions: { position: chordName }
  const chordPositions: { pos: number; name: string }[] = [];
  const chordRegex = /([A-Ga-g][#b]?(?:maj|min|m|M|dim|aug|sus|add)?[0-9]*(?:\/[A-Ga-g][#b]?)?)\s*/g;
  let match;
  while ((match = chordRegex.exec(chordStr)) !== null) {
    chordPositions.push({ pos: match.index, name: match[1] });
  }

  if (chordPositions.length === 0) {
    return { chord: chordStr, lyric: lyricStr };
  }

  // If the source already contains | bar markers, pass through directly
  if (chordStr.includes('|')) {
    return { chord: chordStr, lyric: lyricStr };
  }

  // For lines with chords, add | separators based on chord count per phrase
  // Standard worship song: 4 chords per line = 4 bars, 2-3 chords = estimate beat durations
  const chordCount = chordPositions.length;
  const beatsPerChord = chordCount <= 2 ? 2 : 1; // 2-chord lines: 2 bars each; 3-4 chord: 1 bar each
  
  // Build formatted chord line with | separators
  const BAR_WIDTH = 12;
  let formattedChord = '| ';
  let formattedLyric = '  ';
  let barCount = 0;

  for (let i = 0; i < chordPositions.length; i++) {
    const { name } = chordPositions[i];
    const padded = name.padEnd(BAR_WIDTH);
    formattedChord += padded;
    barCount++;

    // Each chord = 1 bar (4 beats). Add | after each
    if (i < chordPositions.length - 1) {
      formattedChord += '| ';
    } else {
      formattedChord += '|';
    }
  }

  return { chord: formattedChord, lyric: lyricStr };
}

// Search guitarians.com for a song title
async function searchGuitarians(query: string): Promise<ScoreResult[]> {
  const traditional = converter(query);
  const searchQuery = traditional !== query ? traditional : query;

  const params = new URLSearchParams();
  params.append('query', searchQuery);

  const response = await axios.post(
    `${GUITARIANS_SEARCH}?query=${encodeURIComponent(searchQuery)}`,
    params,
    { headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const data = response.data;
  const scores: ScoreResult[] = data.score_list || [];
  
  // Sort by worship relevance
  scores.sort((a, b) => scoreRelevance(b) - scoreRelevance(a));
  return scores;
}

// Fetch chord data for a given score
async function fetchChordData(webScoreUrl: string): Promise<{ score: GuitariansScore; sections: Section[] }> {
  const url = `${GUITARIANS_BASE}${webScoreUrl}`;
  const response = await axios.post(url, {}, {
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  });
  return response.data;
}

// GET /api/search?q=<song_title>
app.get('/api/search', async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }
  try {
    const results = await searchGuitarians(q);
    res.json({ results: results.slice(0, 10) });
  } catch (err: any) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// GET /api/chord?url=<web_score_url>
app.get('/api/chord', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const data = await fetchChordData(url);
    const { score, sections } = data;

    // Process sections: parse chord/lyric lines
    const processed = sections.map((section) => {
      if (section.details?.type === 2) {
        return {
          type: 'label',
          text: (section.details.text || '').trim(),
        };
      }
      if (section.chord !== undefined || section.lyric !== undefined) {
        const { chord, lyric } = parseChordLine(section.chord || '', section.lyric || '');
        return {
          type: 'line',
          chord,
          lyric,
        };
      }
      return null;
    }).filter(Boolean);

    res.json({
      meta: {
        name: score.name,
        artist: score.artist_name,
        key: score.original_key,
        capo: score.original_capo,
        composer: score.composer_name,
      },
      sections: processed,
    });
  } catch (err: any) {
    console.error('Chord fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch chord data', detail: err.message });
  }
});

// GET /api/song?q=<song_title>  — search + auto-pick best result + return chord data
app.get('/api/song', async (req, res) => {
  const q = req.query.q as string;
  if (!q) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }
  try {
    const results = await searchGuitarians(q);
    if (results.length === 0) {
      return res.status(404).json({ error: 'Song not found on guitarians.com' });
    }
    const best = results[0];
    const data = await fetchChordData(best.web_score_url);
    const { score, sections } = data;

    const processed = sections.map((section) => {
      if (section.details?.type === 2) {
        return {
          type: 'label',
          text: (section.details.text || '').trim(),
        };
      }
      if (section.chord !== undefined || section.lyric !== undefined) {
        const { chord, lyric } = parseChordLine(section.chord || '', section.lyric || '');
        return {
          type: 'line',
          chord,
          lyric,
        };
      }
      return null;
    }).filter(Boolean);

    res.json({
      meta: {
        name: score.name,
        artist: score.artist_name,
        key: score.original_key,
        capo: score.original_capo,
        composer: score.composer_name,
        scoreId: score.score_id,
        url: best.web_score_url,
      },
      allResults: results.slice(0, 5).map(r => ({
        scoreId: r.score_id,
        name: r.name,
        artist: r.artist_name,
        url: r.web_score_url,
      })),
      sections: processed,
    });
  } catch (err: any) {
    console.error('Song fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch song', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Worship Chord Server running on http://localhost:${PORT}`);
});
