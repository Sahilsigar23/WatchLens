import type { Category, VideoMeta } from './types';

/**
 * Video classification: STUDY / ENTERTAINMENT / OTHER.
 *
 * Version one is a keyword scorer — no API key, no latency, no cost, and easy
 * to eyeball when it gets something wrong. The `Classifier` interface below is
 * the seam: an LLM-backed classifier only has to implement `classify()` and be
 * passed to `setClassifier()`, with no caller changes.
 */

export interface ClassifierInput {
  title: string;
  channelName: string;
}

export interface Classifier {
  classify(input: ClassifierInput): Category | Promise<Category>;
}

const STUDY_KEYWORDS = [
  'tutorial', 'course', 'lecture', 'lesson', 'class', 'chapter', 'crash course',
  'learn', 'learning', '教程', 'explained', 'explanation', 'introduction', 'intro to',
  'beginner', 'advanced', 'masterclass', 'bootcamp', 'workshop', 'seminar', 'webinar',
  'study', 'revision', 'exam', 'syllabus', 'semester', 'university', 'college',
  'algorithm', 'algorithms', 'data structure', 'dsa', 'leetcode', 'programming',
  'coding', 'code with', 'developer', 'software', 'engineering', 'compiler',
  'python', 'javascript', 'typescript', 'java ', 'golang', 'rust ', 'c++', 'sql',
  'react', 'nextjs', 'next.js', 'node', 'django', 'flask', 'fastapi', 'docker',
  'kubernetes', 'linux', 'git ', 'database', 'system design', 'api',
  'machine learning', 'deep learning', 'neural network', 'data science', 'statistics',
  'mathematics', 'maths', 'calculus', 'algebra', 'geometry', 'trigonometry',
  'physics', 'chemistry', 'biology', 'science', 'economics', 'accounting', 'finance',
  'history of', 'documentary', 'how to', 'guide', 'walkthrough', 'deep dive',
  'interview questions', 'certification', 'jee', 'neet', 'gate ', 'upsc', 'gre', 'ielts',
];

const ENTERTAINMENT_KEYWORDS = [
  'funny', 'fun ', 'comedy', 'prank', 'meme', 'memes', 'fails', 'fail compilation',
  'reaction', 'reacts', 'reacting', 'try not to laugh', 'roast', 'cringe',
  'gaming', 'gameplay', 'walkthrough gameplay', 'highlights', 'montage', 'speedrun',
  'minecraft', 'fortnite', 'gta', 'valorant', 'bgmi', 'pubg', 'free fire', 'roblox',
  'vlog', 'vlogs', 'day in my life', 'shorts', 'challenge', 'stream', 'live stream',
  'music video', 'official video', 'lyrics', 'song', 'songs', 'album', 'remix',
  'trailer', 'teaser', 'movie', 'web series', 'episode', 'season ', 'anime', 'cartoon',
  'cricket', 'football', 'ipl', 'match highlights', 'wwe', 'ufc', 'nba',
  'unboxing', 'asmr', 'mukbang', 'celebrity', 'gossip', 'drama', 'tiktok', 'podcast clip',
];

/** Weighted so a match in the title beats an incidental match in the channel. */
const TITLE_WEIGHT = 2;
const CHANNEL_WEIGHT = 1;

function countMatches(haystack: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

/**
 * The default rule-based classifier. Ties and total silence both fall through
 * to OTHER — better an honest "unclassified" bucket than a coin flip that
 * quietly pollutes the study statistics.
 */
export const keywordClassifier: Classifier = {
  classify({ title, channelName }: ClassifierInput): Category {
    const t = title.toLowerCase();
    const c = channelName.toLowerCase();

    const study =
      countMatches(t, STUDY_KEYWORDS) * TITLE_WEIGHT +
      countMatches(c, STUDY_KEYWORDS) * CHANNEL_WEIGHT;
    const entertainment =
      countMatches(t, ENTERTAINMENT_KEYWORDS) * TITLE_WEIGHT +
      countMatches(c, ENTERTAINMENT_KEYWORDS) * CHANNEL_WEIGHT;

    if (study === 0 && entertainment === 0) return 'OTHER';
    if (study === entertainment) return 'OTHER';
    return study > entertainment ? 'STUDY' : 'ENTERTAINMENT';
  },
};

let activeClassifier: Classifier = keywordClassifier;

/**
 * Swaps in a different classifier — an LLM-backed one, a user-trained one, a
 * stub in tests. Call once at startup.
 */
export function setClassifier(classifier: Classifier): void {
  activeClassifier = classifier;
}

/** Classifies a video with whichever classifier is currently installed. */
export async function classifyVideo(
  meta: Pick<VideoMeta, 'title' | 'channelName'>,
): Promise<Category> {
  try {
    return await activeClassifier.classify({
      title: meta.title ?? '',
      channelName: meta.channelName ?? '',
    });
  } catch {
    // A classifier that throws must never block a watch session from being
    // recorded — the video is simply unclassified.
    return 'OTHER';
  }
}
