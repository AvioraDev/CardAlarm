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
      '--color-mat',
      'prefers-color-scheme: dark',
      'color-scheme: light dark',
      '--radius-card',
      '@theme inline',
      '.notice',
      '.notice-error',
      '.notice-success',
      '.link',
      '.ref',
      '.card-title',
      '.page-title',
      '.display-title',
      '.section-title',
      '.section-head',
    ]) {
      expect(css).toContain(needle);
    }
  });

  it('keeps every legacy class working until pages migrate', () => {
    const css = readApp('globals.css');
    for (const legacy of [
      '.panel', '.field-label', '.btn ', '.btn-sm', '.btn-secondary', '.btn-ghost', '.btn-danger',
      '.nav-link', '.badge ', '.badge-confirmed', '.badge-possible', '.badge-neutral', '.badge-example',
      '.tag ', '.tag-accent', '.tag-warning', '.tag-rookie', '.metric-card', '.metric-label', '.metric-value',
      '.scan-pulse',
    ]) {
      expect(css).toContain(legacy);
    }
  });

  it('is a flat catalogue: no glows, pills-by-default or shadows', () => {
    const css = readApp('globals.css');
    expect(css).not.toContain('radial-gradient');
    expect(css).not.toContain('::-webkit-scrollbar');
    expect(css).not.toContain('999px');
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).toContain('--shadow-card: 0 0 #0000');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('loads Plex Sans, Plex Mono and Newsreader without colliding with Tailwind font keys', () => {
    const layout = readApp('layout.tsx');
    expect(layout).toContain('IBM_Plex_Sans');
    expect(layout).toContain('IBM_Plex_Mono');
    expect(layout).toContain('Newsreader');
    expect(layout).not.toContain('Inter(');
    expect(layout).not.toContain('JetBrains_Mono');
    expect(layout).not.toContain("variable: \"--font-sans\"");
    expect(layout).toContain('colorScheme: "light dark"');
  });

  it('ships exactly four accessible inline icons and an aria-current nav link', () => {
    const icons = readApp('components', 'icons.tsx');
    const exported = icons.match(/export function (\w+)/g) ?? [];
    expect(exported.map((e) => e.replace('export function ', '')).sort()).toEqual(
      ['IconCheck', 'IconChevron', 'IconExternal', 'IconPossible'],
    );
    expect(icons).toContain('"aria-hidden": true');
    expect(icons).toContain('currentColor');
    expect(icons).not.toContain('use client');
    const navLink = readApp('components', 'nav-link.tsx');
    expect(navLink).toContain('"use client"');
    expect(navLink).toContain('usePathname');
    expect(navLink).toContain('aria-current');
  });

  it('lets submit buttons pass through aria attributes', () => {
    for (const file of ['submit-button.tsx', 'confirm-submit-button.tsx']) {
      const src = readApp('components', file);
      expect(src).toContain('...rest');
      expect(src).toContain('ButtonHTMLAttributes');
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
