import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GIS_SRC,
  GoogleIdentityLoadError,
  loadGoogleIdentity,
  resetGoogleIdentityLoader,
} from './google-identity';

const fakeId = {
  initialize: vi.fn(),
  renderButton: vi.fn(),
  cancel: vi.fn(),
  disableAutoSelect: vi.fn(),
};

function script(): HTMLScriptElement | null {
  return document.querySelector(`script[src="${GIS_SRC}"]`);
}

describe('loadGoogleIdentity', () => {
  beforeEach(() => {
    resetGoogleIdentityLoader();
    document.head.innerHTML = '';
    delete window.google;
  });
  afterEach(() => vi.useRealTimers());

  it('injects the Google script once and resolves when it loads', async () => {
    const first = loadGoogleIdentity();
    const second = loadGoogleIdentity();
    expect(document.querySelectorAll(`script[src="${GIS_SRC}"]`)).toHaveLength(1);
    expect(script()?.async).toBe(true);
    window.google = { accounts: { id: fakeId } };
    script()?.dispatchEvent(new Event('load'));
    await expect(first).resolves.toBe(fakeId);
    await expect(second).resolves.toBe(fakeId);
  });

  it('resolves immediately when Google is already available', async () => {
    window.google = { accounts: { id: fakeId } };
    await expect(loadGoogleIdentity()).resolves.toBe(fakeId);
    expect(script()).toBeNull();
  });

  it('rejects when the script fails to load (blocked or offline), and can retry', async () => {
    const attempt = loadGoogleIdentity();
    script()?.dispatchEvent(new Event('error'));
    await expect(attempt).rejects.toBeInstanceOf(GoogleIdentityLoadError);
    expect(script()).toBeNull();
    const retry = loadGoogleIdentity();
    expect(script()).not.toBeNull();
    window.google = { accounts: { id: fakeId } };
    script()?.dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBe(fakeId);
  });

  it('rejects when the script loads but Google is missing', async () => {
    const attempt = loadGoogleIdentity();
    script()?.dispatchEvent(new Event('load'));
    await expect(attempt).rejects.toBeInstanceOf(GoogleIdentityLoadError);
  });

  it('times out', async () => {
    vi.useFakeTimers();
    const attempt = loadGoogleIdentity(1000);
    vi.advanceTimersByTime(1001);
    await expect(attempt).rejects.toBeInstanceOf(GoogleIdentityLoadError);
  });
});
