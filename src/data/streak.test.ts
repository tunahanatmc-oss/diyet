import { describe, it, expect } from 'vitest';
import { computeStreak } from './streak';

describe('computeStreak', () => {
  it('is 0 with no logs', () => { expect(computeStreak([], '2026-11-20')).toEqual({ current: 0, activeToday: false, best: 0, lastDate: null }); });
  it('counts consecutive days ending today', () => {
    const s = computeStreak(['2026-11-18', '2026-11-19', '2026-11-20'], '2026-11-20');
    expect(s.current).toBe(3); expect(s.activeToday).toBe(true); expect(s.best).toBe(3);
  });
  it('keeps the streak alive when today is not logged yet', () => {
    const s = computeStreak(['2026-11-17', '2026-11-18', '2026-11-19'], '2026-11-20');
    expect(s.current).toBe(3); expect(s.activeToday).toBe(false);
  });
  it('breaks after a fully missed day', () => { expect(computeStreak(['2026-11-17', '2026-11-18'], '2026-11-20').current).toBe(0); });
  it('a gap resets the run; best keeps the longest', () => {
    const s = computeStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10', '2026-11-19', '2026-11-20'], '2026-11-20');
    expect(s.current).toBe(2); expect(s.best).toBe(4);
  });
  it('ignores duplicates, future dates and garbage', () => {
    const s = computeStreak(['2026-11-20', '2026-11-20', '2026-11-21', 'x', '2026-11-19'], '2026-11-20');
    expect(s.current).toBe(2); expect(s.lastDate).toBe('2026-11-20');
  });
  it('crosses month and year boundaries', () => {
    expect(computeStreak(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01').current).toBe(3);
    expect(computeStreak(['2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(2);
  });
});
