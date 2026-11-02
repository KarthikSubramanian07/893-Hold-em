import { describe, expect, it } from 'vitest';
import { canonicalPath, matchRoute } from './routes';

describe('matchRoute', () => {
  it('matches the landing page', () => {
    expect(matchRoute('/')).toEqual({ name: 'landing' });
    expect(matchRoute('/index.html')).toEqual({ name: 'landing' });
  });

  it('matches a table and uppercases the code', () => {
    expect(matchRoute('/t/K7QX2')).toEqual({ name: 'table', code: 'K7QX2' });
    expect(matchRoute('/t/k7qx2')).toEqual({ name: 'table', code: 'K7QX2' });
    expect(matchRoute('/t/K7QX2/')).toEqual({ name: 'table', code: 'K7QX2' });
  });

  it('closes bad codes', () => {
    expect(matchRoute('/t/OOOOO')).toEqual({ name: 'notfound', reason: 'code' });
    expect(matchRoute('/t/K7QX')).toEqual({ name: 'notfound', reason: 'code' });
    expect(matchRoute('/t/%E0%A4%A')).toEqual({ name: 'notfound', reason: 'code' });
  });

  it('closes unknown paths', () => {
    expect(matchRoute('/about')).toEqual({ name: 'notfound', reason: 'path' });
    expect(matchRoute('/t')).toEqual({ name: 'notfound', reason: 'path' });
    expect(matchRoute('/t/K7QX2/extra')).toEqual({ name: 'notfound', reason: 'path' });
  });

  it('reports a canonical path for lowercase codes', () => {
    expect(canonicalPath('/t/k7qx2', matchRoute('/t/k7qx2'))).toBe('/t/K7QX2');
    expect(canonicalPath('/t/K7QX2', matchRoute('/t/K7QX2'))).toBeNull();
    expect(canonicalPath('/', matchRoute('/'))).toBeNull();
  });
});
