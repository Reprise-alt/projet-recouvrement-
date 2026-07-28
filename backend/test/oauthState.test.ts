import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeState, createState } from '../src/lib/oauthState';

describe('oauthState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a freshly created state exactly once', () => {
    const state = createState();
    expect(consumeState(state)).toBe(true);
    expect(consumeState(state)).toBe(false); // single-use
  });

  it('rejects an unknown state', () => {
    expect(consumeState('not-a-real-state')).toBe(false);
  });

  it('rejects an undefined state', () => {
    expect(consumeState(undefined)).toBe(false);
  });

  it('rejects a state after it has expired (10 minutes)', () => {
    const state = createState();
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeState(state)).toBe(false);
  });

  it('accepts a state just before expiry', () => {
    const state = createState();
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(consumeState(state)).toBe(true);
  });
});
