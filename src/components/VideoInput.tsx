'use client';

import { useState } from 'react';

import { Icon } from '@/components/Icon';
import { parsePlaylistId, parseVideoId } from '@/lib/youtube';

interface SearchResult {
  videoId: string;
  title: string;
  channelName: string;
}

export interface VideoInputProps {
  onSelectVideo: (videoId: string) => void;
  onSelectPlaylist: (playlistId: string) => void;
  /** Larger, centred treatment for the empty state. */
  size?: 'default' | 'hero';
}

/**
 * One box for three jobs: a video link, a playlist link, or a search query.
 *
 * A URL carrying both `v=` and `list=` opens as a playlist, which is what
 * YouTube itself does and what the user almost always means. Search needs
 * YOUTUBE_API_KEY; links always work without one.
 */
export function VideoInput({ onSelectVideo, onSelectPlaylist, size = 'default' }: VideoInputProps) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = value.trim();
    if (!input) return;

    const clear = () => {
      setResults([]);
      setMessage(null);
      setValue('');
    };

    const playlistId = parsePlaylistId(input);
    if (playlistId) {
      clear();
      onSelectPlaylist(playlistId);
      return;
    }

    const videoId = parseVideoId(input);
    if (videoId) {
      clear();
      onSelectVideo(videoId);
      return;
    }

    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(input)}`);
      const data = (await response.json()) as { results?: SearchResult[]; message?: string };
      setResults(data.results ?? []);
      setMessage(data.message ?? (data.results?.length ? null : 'No videos found.'));
    } catch {
      setMessage('Search is unavailable. You can still paste a YouTube link.');
    } finally {
      setSearching(false);
    }
  };

  const pick = (videoId: string) => {
    setResults([]);
    setMessage(null);
    setValue('');
    onSelectVideo(videoId);
  };

  return (
    <div className={size === 'hero' ? 'mx-auto w-full max-w-xl space-y-3' : 'space-y-3'}>
      {/*
        The button sits inside the field from 420px up, and becomes a full-width
        control beneath it on a phone — at 320px an inline button leaves the
        input too narrow to read a pasted URL, and a stacked one is a far easier
        thumb target. 420px rather than the sm breakpoint because a phone in
        landscape is wide enough for the inline form, and stacking there pushed
        the player below the fold.
      */}
      <form onSubmit={submit} className="space-y-2 min-[420px]:relative min-[420px]:space-y-0">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 text-muted">
            <Icon name="search" size={17} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a YouTube link…"
            aria-label="YouTube video link, playlist link, or search query"
            className={`input pl-11 min-[420px]:pr-[6.5rem] ${size === 'hero' ? 'py-3.5' : ''}`}
          />
        </div>
        <button
          type="submit"
          disabled={searching || value.trim() === ''}
          className="btn btn-primary w-full min-[420px]:absolute min-[420px]:right-1.5 min-[420px]:top-1/2 min-[420px]:w-auto min-[420px]:-translate-y-1/2"
        >
          {searching ? 'Searching…' : 'Watch'}
        </button>
      </form>

      {message && <p className="text-sm text-muted">{message}</p>}

      {results.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {results.map((result) => (
            <li key={result.videoId}>
              <button
                type="button"
                onClick={() => pick(result.videoId)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised"
              >
                {/* Thumbnail comes straight from YouTube's CDN, not our server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${result.videoId}/mqdefault.jpg`}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.title}</span>
                  <span className="block truncate text-xs text-muted">{result.channelName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
