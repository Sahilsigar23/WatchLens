'use client';

import { useState } from 'react';

import { parseVideoId } from '@/lib/youtube';

interface SearchResult {
  videoId: string;
  title: string;
  channelName: string;
}

/**
 * One box for both jobs. A YouTube link or bare id loads immediately; anything
 * else is treated as a search query, which needs YOUTUBE_API_KEY. When no key
 * is configured the box still works for links — it just says so.
 */
export function VideoInput({ onSelect }: { onSelect: (videoId: string) => void }) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = value.trim();
    if (!input) return;

    const videoId = parseVideoId(input);
    if (videoId) {
      setResults([]);
      setMessage(null);
      setValue('');
      onSelect(videoId);
      return;
    }

    setSearching(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(input)}`);
      const data = (await response.json()) as {
        results?: SearchResult[];
        message?: string;
      };
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
    onSelect(videoId);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Paste a YouTube link, or search…"
          aria-label="YouTube link or search query"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-brand"
        />
        <button
          type="submit"
          disabled={searching}
          className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
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
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas"
              >
                {/* Thumbnail comes straight from YouTube's CDN, not our server. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${result.videoId}/mqdefault.jpg`}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-md object-cover"
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
