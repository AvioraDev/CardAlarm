import { readFileSync } from 'fs';
import { join } from 'path';

function readApp(...parts: string[]): string {
  return readFileSync(join(__dirname, '..', '..', 'web', 'src', 'app', ...parts), 'utf8');
}

describe('design system', () => {
  it('defines tokens and component classes in globals.css', () => {
    const css = readApp('globals.css');
    for (const needle of [
      '--color-confirmed',
      '--color-possible',
      '@layer components',
      '.btn-primary',
      '.eyebrow',
      '.data',
      '.field',
      '.chip',
      '.card-possible',
    ]) {
      expect(css).toContain(needle);
    }
  });

  it('keeps the shell sentence-case with a signed-out call to action', () => {
    const layout = readApp('layout.tsx');
    expect(layout).toContain('href="/signup"');
    expect(layout).toContain('nav-link');
    expect(layout).not.toContain('uppercase');
  });

  it('loading skeleton mirrors the card layout and respects reduced motion', () => {
    const loading = readApp('loading.tsx');
    expect(loading).toContain('aspect-[5/7]');
    expect(loading).toContain('motion-reduce:animate-none');
  });
});
