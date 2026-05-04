import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as OpenCC from 'opencc-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const app = express();

app.use(cors());
app.use(express.json());

const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

const GUITARIANS_BASE = 'https://www.guitarians.com';
const GUITARIANS_SEARCH = 'https://zh-hans.guitarians.com/home/search';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': `${GUITARIANS_BASE}/`,
  'Origin': GUITARIANS_BASE,
  'X-Requested-With': 'XMLHttpRequest',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Connection': 'keep-alive',
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

function parseChordLine(chordStr: string, lyricStr: string): { chord: string; lyric: string } {
  if (!chordStr || !chordStr.trim()) {
    return { chord: '', lyric: lyricStr };
  }

  const chordPositions: { pos: number; name: string }[] = [];
  const chordRegex = /([A-Ga-g][#b]?(?:maj|min|m|M|dim|aug|sus|add)?[0-9]*(?:\/[A-Ga-g][#b]?)?)\s*/g;
  let match;
  while ((match = chordRegex.exec(chordStr)) !== null) {
    chordPositions.push({ pos: match.index, name: match[1] });
  }

  if (chordPositions.length === 0) {
    return { chord: chordStr, lyric: lyricStr };
  }

  if (chordStr.includes('|')) {
    return { chord: chordStr, lyric: lyricStr };
  }

  const BAR_WIDTH = 12;
  let formattedChord = '| ';
  const formattedLyric = '  ';

  for (let i = 0; i < chordPositions.length; i++) {
    const { name } = chordPositions[i];
    const padded = name.padEnd(BAR_WIDTH);
    formattedChord += padded;

    if (i < chordPositions.length - 1) {
      formattedChord += '| ';
    } else {
      formattedChord += '|';
    }
  }

  return { chord: formattedChord, lyric: lyricStr };
}

// Fetch a session cookie from the homepage to avoid 403s from datacenter IPs
async function getSessionCookie(): Promise<string> {
  try {
    const res = await axios.get(GUITARIANS_BASE, {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': HEADERS['Accept-Language'],
      },
      maxRedirects: 5,
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      return setCookie.map((c: string) => c.split(';')[0]).join('; ');
    }
  } catch {
    // Proceed without cookie if homepage fetch fails
  }
  return '';
}

async function searchGuitarians(query: string): Promise<ScoreResult[]> {
  const traditional = converter(query);
  const searchQuery = traditional !== query ? traditional : query;

  const params = new URLSearchParams();
  params.append('query', searchQuery);

  const cookie = await getSessionCookie();
  const response = await axios.post(
    `${GUITARIANS_SEARCH}?query=${encodeURIComponent(searchQuery)}`,
    params,
    {
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }
  );

  const data = response.data;
  const scores: ScoreResult[] = data.score_list || [];
  scores.sort((a, b) => scoreRelevance(b) - scoreRelevance(a));
  return scores;
}

async function fetchChordData(webScoreUrl: string): Promise<{ score: GuitariansScore; sections: Section[] }> {
  const url = `${GUITARIANS_BASE}${webScoreUrl}`;
  const cookie = await getSessionCookie();
  const response = await axios.post(url, {}, {
    headers: {
      ...HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  return response.data;
}

function processSections(sections: Section[]) {
  return sections.map((section) => {
    if (section.details?.type === 2) {
      return {
        type: 'label',
        text: (section.details.text || '').trim(),
      };
    }
    if (section.chord !== undefined || section.lyric !== undefined) {
      const { chord, lyric } = parseChordLine(section.chord || '', section.lyric || '');
      return { type: 'line', chord, lyric };
    }
    return null;
  }).filter(Boolean);
}

// GET /api/health — checks server liveness and outbound connectivity to guitarians.com
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let guitarianStatus: number | null = null;
  let guitarianError: string | null = null;
  let cookie: string | null = null;

  try {
    const result = await axios.get(GUITARIANS_BASE, {
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Accept': 'text/html',
      },
      maxRedirects: 5,
      timeout: 8000,
      validateStatus: () => true,
    });
    guitarianStatus = result.status;
    const setCookie = result.headers['set-cookie'];
    cookie = setCookie ? setCookie.map((c: string) => c.split(';')[0]).join('; ') : null;
  } catch (err: any) {
    guitarianError = err.message;
  }

  res.json({
    status: 'ok',
    region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? 'unknown',
    timestamp: new Date().toISOString(),
    upstreamCheck: {
      url: GUITARIANS_BASE,
      httpStatus: guitarianStatus,
      cookie: cookie ?? '(none)',
      error: guitarianError,
      latencyMs: Date.now() - start,
    },
  });
});

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

app.get('/api/chord', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  try {
    const data = await fetchChordData(url);
    const { score, sections } = data;
    const processed = processSections(sections);
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
    const processed = processSections(sections);
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

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
