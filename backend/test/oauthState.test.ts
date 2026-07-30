import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeState, createState } from '../src/lib/oauthState';

describe('oauthState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a freshly created state exactly once, and returns the entité it was created for', () => {
    const state = createState('SORAM');
    expect(consumeState(state)).toEqual({ entite: 'SORAM' });
    expect(consumeState(state)).toBeNull(); // single-use
  });

  it('keeps distinct states for distinct entités independent from one another', () => {
    const soramState = createState('SORAM');
    const irisState = createState('IRIS');
    expect(consumeState(irisState)).toEqual({ entite: 'IRIS' });
    expect(consumeState(soramState)).toEqual({ entite: 'SORAM' });
  });

  it('rejects an unknown state', () => {
    expect(consumeState('not-a-real-state')).toBeNull();
  });

  it('rejects an undefined state', () => {
    expect(consumeState(undefined)).toBeNull();
  });

  it('rejects a state after it has expired (10 minutes)', () => {
    const state = createState('SORAM');
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(consumeState(state)).toBeNull();
  });

  it('accepts a state just before expiry', () => {
    const state = createState('SORAM');
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(consumeState(state)).toEqual({ entite: 'SORAM' });
  });
});
