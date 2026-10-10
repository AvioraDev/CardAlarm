import fs from 'node:fs';
import path from 'node:path';

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

describe('landing page', () => {
  const page = readWebFile('app', 'page.tsx');

  it('shows a labelled example and the new hero', () => {
    expect(page).toContain('Illustrative example');
    expect(page).toContain('preview');
    expect(page).toContain('Start watching a player');
    expect(page).toContain('Never miss the card you&apos;re chasing.');
  });

  it('drops the old copy and uppercase styling', () => {
    expect(page).not.toContain('User-owned watchlists');
    expect(page).not.toContain('Focused discovery workflow');
    expect(page).not.toContain('Create Watchlist');
    expect(page).not.toContain('uppercase');
    expect(page).not.toMatch(/\bbackfill\b|canonical|\bMVP\b|cached listings/i);
  });
});

describe('card image', () => {
  const cardImage = readWebFile('app', 'components', 'card-image.tsx');

  it('loads store images safely without layout shift', () => {
    expect(cardImage).toContain('"use client"');
    expect(cardImage).toContain('loading=');
    expect(cardImage).toContain('decoding="async"');
    expect(cardImage).toContain('width={500}');
    expect(cardImage).toContain('height={700}');
    expect(cardImage).toContain('referrerPolicy="no-referrer"');
    expect(cardImage).toContain('onError');
    expect(cardImage).toContain('aspect-[5/7]');
    expect(cardImage).not.toContain('dangerouslySetInnerHTML');
  });

  it('sets the art on a catalogue mat', () => {
    expect(cardImage).toContain('mix-blend-multiply');
    expect(cardImage).toContain('dark:mix-blend-normal');
    expect(cardImage).not.toMatch(/rounded-(2xl|3xl|full)/);
  });
});

describe('listing card', () => {
  const listingCard = readWebFile('app', 'components', 'listing-card.tsx');
  const matchDisplay = readWebFile('lib', 'match-display.ts');

  it('sanitises store-controlled values', () => {
    expect(listingCard).toContain('cardImageSrc(');
    expect(listingCard).toContain('cardAltText(');
    expect(listingCard).toContain('safeListingHref(');
    expect(listingCard).not.toContain('alt={listing.title');
    expect(listingCard).not.toContain('href={listing.url');
    expect(listingCard).not.toContain('dangerouslySetInnerHTML');
  });

  it('separates possible matches visually', () => {
    expect(listingCard).toContain('card-possible');
    expect(listingCard).toContain('badge-possible');
    expect(listingCard).toContain('tierLabel(');
    expect(matchDisplay).toContain('Possible match');
  });

  it('keeps feedback wiring and drops internal labels', () => {
    expect(listingCard).toContain('showFeedbackControls');
    expect(listingCard).toContain('imageLoading');
    expect(listingCard).not.toContain('"Cached"');
    expect(listingCard).not.toContain('match_type');
    expect(listingCard).not.toContain('uppercase');
  });

  it('uses the catalogue card anatomy', () => {
    expect(listingCard).not.toContain('✓');
    expect(listingCard).not.toContain('shadow-card');
    expect(listingCard).not.toMatch(/rounded-(2xl|3xl|full)/);
    expect(listingCard).toContain('aria-pressed');
    expect(listingCard).toContain('IconExternal');
    expect(listingCard).toContain('IconCheck');
    expect(listingCard).toContain('IconPossible');
    expect(listingCard).toContain('card-title');
  });

  it('keeps match-display pure for tests', () => {
    const imports = matchDisplay.match(/^import .+$/gm) ?? [];
    expect(imports).toEqual(['import type { ListingRow } from "./types";']);
  });
});
