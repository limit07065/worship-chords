export interface SongMeta {
  name: string;
  artist: string;
  key: string;
  capo: number;
  composer: string;
  scoreId: number;
  url: string;
}

export interface SongSection {
  type: 'label' | 'line';
  text?: string;
  chord?: string;
  lyric?: string;
}

export interface SearchResult {
  scoreId: number;
  name: string;
  artist: string;
  url: string;
}

export interface SongResponse {
  meta: SongMeta;
  sections: SongSection[];
  allResults: SearchResult[];
}
