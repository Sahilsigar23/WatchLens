import { describe, expect, it } from 'vitest';

import { keywordClassifier } from '@/lib/classify';

const classify = (title: string, channelName = '') =>
  keywordClassifier.classify({ title, channelName });

describe('rule-based classification', () => {
  it('recognises study material', () => {
    expect(classify('Python Dictionary Tutorial')).toBe('STUDY');
    expect(classify('Machine Learning Course')).toBe('STUDY');
    expect(classify('Python DSA Lecture 12: Binary Trees')).toBe('STUDY');
  });

  it('recognises entertainment', () => {
    expect(classify('Gaming Highlights')).toBe('ENTERTAINMENT');
    expect(classify('Funny Moments Compilation')).toBe('ENTERTAINMENT');
    expect(classify('IPL 2026 Match Highlights')).toBe('ENTERTAINMENT');
  });

  it('falls back to OTHER rather than guessing', () => {
    expect(classify('Untitled')).toBe('OTHER');
    expect(classify('')).toBe('OTHER');
  });

  it('falls back to the channel when the title says nothing', () => {
    // "Session 4" carries no keyword either way; the channel decides.
    expect(classify('Session 4', 'Khan Academy Physics')).toBe('STUDY');
    expect(classify('Session 4', 'Daily Vlog Life')).toBe('ENTERTAINMENT');
  });

  it('lets a strong title beat a misleading channel name', () => {
    // "Episode" reads as entertainment, and here that is the honest answer —
    // the classifier is keyword-based, not clairvoyant.
    expect(classify('Episode 4', 'Khan Academy Physics')).toBe('ENTERTAINMENT');
  });

  it('weighs the title above the channel', () => {
    // "gaming" in the channel should not override a clear tutorial title.
    expect(classify('Rust Ownership Tutorial', 'Gaming Dev Channel')).toBe('STUDY');
  });
});
