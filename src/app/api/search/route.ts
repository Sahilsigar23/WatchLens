import { NextResponse } from 'next/server';

import { requireUserId, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q=python+dsa
 *
 * Optional convenience. Pasting a YouTube URL or id always works without this;
 * search additionally needs a YouTube Data API key, so the route reports
 * `configured: false` instead of failing when one is not set.
 *
 * This calls the metadata API only. No video bytes pass through the server.
 */
export async function GET(request: Request) {
  try {
    await requireUserId();

    const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (!q) return NextResponse.json({ results: [] });

    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return NextResponse.json({
        configured: false,
        results: [],
        message: 'Search needs YOUTUBE_API_KEY. You can still paste any YouTube link or video id.',
      });
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '12');
    url.searchParams.set('q', q);
    url.searchParams.set('key', key);

    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      return NextResponse.json(
        { configured: true, results: [], message: 'YouTube search is unavailable right now.' },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }[];
    };

    return NextResponse.json({
      configured: true,
      results: (data.items ?? []).map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelName: item.snippet.channelTitle,
      })),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/search failed:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
