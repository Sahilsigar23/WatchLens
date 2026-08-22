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
    const query = value.trim();
    if (!query) return;

    const clear = () => {
      setResults([]);
      setMessage(null);
      setValue('');
    };

    const playlistId = parsePlaylistId(query);
    if (playlistId) {
      clear();
      onSelectPlaylist(playlistId);
      return;
    }

    const videoId = parseVideoId(query);
    if (videoId) {
      clear();
      onSelectVideo(videoId);
      return;
    }

    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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

  const hero = size === 'hero';

  return (
    <div className={hero ? 'mx-auto w-full max-w-2xl space-y-3' : 'space-y-3'}>
      {/*
        Two treatments, because the two placements have different jobs.

        HERO (nothing playing): the input IS the page's action, so the button is
        stacked and full-width below 420px — the easiest possible thumb target,
        and at 320px an inline button would leave the field too narrow to read a
        pasted URL.

        DEFAULT (a video is on screen): the search is secondary to the player, so
        the button stays inside the field at every width and collapses to its
        glyph on a phone. A full-width amber slab above the video would be the
        loudest thing on a page whose whole point is the video.
      */}
      <form
        onSubmit={submit}
        className={hero ? 'space-y-2 min-[420px]:relative min-[420px]:space-y-0' : 'relative'}
      >
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3.5 text-dim">
            <Icon name="search" size={16} />
          </span>
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={hero ? 'Paste a YouTube link, or search' : 'Paste a link, or search'}
            aria-label="YouTube video link, playlist link, or search query"
            className={`field pl-10 ${
              hero ? 'py-3.5 text-base min-[420px]:pr-[7rem]' : 'pr-14 min-[420px]:pr-[7rem]'
            }`}
          />
        </div>
        <button
          type="submit"
          disabled={searching || value.trim() === ''}
          className={`btn btn-signal ${
            hero
              ? 'w-full min-[420px]:absolute min-[420px]:right-1.5 min-[420px]:top-1/2 min-[420px]:h-[calc(100%-0.75rem)] min-[420px]:min-h-0 min-[420px]:w-auto min-[420px]:-translate-y-1/2'
              : 'absolute right-1.5 top-1/2 h-[calc(100%-0.75rem)] min-h-0 w-auto -translate-y-1/2 px-3 min-[420px]:px-4'
          }`}
        >
          {/* Glyph only on a phone in the compact placement; the label returns
              as soon as there is room for it. */}
          {!hero && (
            <span className="min-[420px]:hidden">
              <Icon name="arrowUpRight" size={15} />
            </span>
          )}
          <span className={hero ? '' : 'hidden min-[420px]:inline'}>
            {searching ? 'Searching…' : 'Watch'}
          </span>
        </button>
      </form>

      {message && <p className="text-sm text-dim">{message}</p>}

      {results.length > 0 && (
        <ul className="panel divide-y divide-rule overflow-hidden text-left">
          {results.map((result) => (
            <li key={result.videoId}>
              <button
                type="button"
                onClick={() => pick(result.videoId)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-panel-2"
              >
                {/* Thumbnail comes straight from YouTube's CDN, not our server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${result.videoId}/mqdefault.jpg`}
                  alt=""
                  className="h-11 w-[4.9rem] shrink-0 rounded-md object-cover"
                  loading="lazy"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.title}</span>
                  <span className="block truncate text-xs text-dim">{result.channelName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
