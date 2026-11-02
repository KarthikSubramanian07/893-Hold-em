import { describe, expect, it } from 'vitest';
import { backoff, socketUrl } from './store';

describe('socketUrl', () => {
  it('uses wss on https and ws on http, on our own origin', () => {
    expect(socketUrl('K7QX2', { protocol: 'https:', host: 'holdem893.pages.dev' })).toBe(
      'wss://holdem893.pages.dev/room/K7QX2',
    );
    expect(socketUrl('K7QX2', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/room/K7QX2');
  });
});

describe('backoff', () => {
  it('doubles from 400ms and caps at 8s, with ±25% jitter', () => {
    const mid = () => 0.5;
    expect(backoff(0, mid)).toBe(400);
    expect(backoff(1, mid)).toBe(800);
    expect(backoff(4, mid)).toBe(6400);
    expect(backoff(10, mid)).toBe(8000);
    expect(backoff(0, () => 0)).toBe(300);
    expect(backoff(0, () => 1)).toBe(500);
  });
});
