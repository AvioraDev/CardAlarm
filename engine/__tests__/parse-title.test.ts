import { parseTitleMetadata } from '../src/parse-title';

describe('parseTitleMetadata', () => {
  it('parses standard NBA card title', () => {
    const meta = parseTitleMetadata(
      '2023-24 Panini Prizm - Green Prizm #35 Damian Lillard'
    );
    expect(meta.year).toBe('2023-24');
    expect(meta.setName).toBe('Panini Prizm');
    expect(meta.variant).toBe('Green Prizm');
    expect(meta.cardNumber).toBe('35');
    expect(meta.playerName).toBe('Damian Lillard');
    expect(meta.category).toBe('NBA');
    expect(meta.isSerial).toBe(false);
    expect(meta.isAuto).toBe(false);
    expect(meta.isRookie).toBe(false);
  });

  it('detects serial numbered cards', () => {
    const meta = parseTitleMetadata(
      '2024-25 Panini Donruss Optic Lime Green Prizm #3 Cam Reddish /149'
    );
    expect(meta.year).toBe('2024-25');
    expect(meta.cardNumber).toBe('3');
    expect(meta.playerName).toBe('Cam Reddish');
    expect(meta.isSerial).toBe(true);
    expect(meta.serialNumber).toBe('149');
    expect(meta.serialCurrent).toBeNull();
    expect(meta.serialLimit).toBe('149');
  });

  it('detects autograph cards', () => {
    const meta = parseTitleMetadata(
      '2013-14 Totally Certified - Rookie Roll Call Signatures - Silver #7 - Peyton Siva'
    );
    expect(meta.isAuto).toBe(true);
    expect(meta.isRookie).toBe(true);
    expect(meta.cardNumber).toBe('7');
  });

  it('detects WWE category', () => {
    const meta = parseTitleMetadata(
      '2022 Panini Prizm WWE #37 Alexa Bliss'
    );
    expect(meta.category).toBe('WWE');
    expect(meta.year).toBe('2022');
  });

  it('detects Marvel category', () => {
    const meta = parseTitleMetadata(
      '1995 Fleer Ultra Marvel Spider-Man - Golden Web #8 Venom'
    );
    expect(meta.category).toBe('Marvel');
  });

  it('detects Soccer/UEFA category', () => {
    const meta = parseTitleMetadata(
      '2025-26 Topps UEFA Club Competitions - 8-Bit Shots #8B-8 Zinédine Zidane'
    );
    expect(meta.category).toBe('Soccer');
    expect(meta.cardNumber).toBe('8B-8');
  });

  it('detects MMA/Combat category', () => {
    const meta = parseTitleMetadata(
      '2025 Panini Combat Anthology - Ring Royalty - Red Fireworks #10 Kenta /275'
    );
    expect(meta.category).toBe('MMA');
    expect(meta.isSerial).toBe(true);
    expect(meta.serialNumber).toBe('275');
  });

  it('detects Pokémon category', () => {
    const meta = parseTitleMetadata(
      '2013 Pokémon Black & White - Plasma Blast - Expansion Set #8 Accelgor'
    );
    expect(meta.category).toBe('Pokémon');
  });

  it('parses multi-segment variant chains', () => {
    const meta = parseTitleMetadata(
      '2024-25 Panini Mosaic - Epic Performers - Mosaic Prizm #4 Jayson Tatum'
    );
    expect(meta.setName).toBe('Panini Mosaic');
    expect(meta.variant).toBe('Epic Performers - Mosaic Prizm');
    expect(meta.playerName).toBe('Jayson Tatum');
  });

  it('parses single-year format', () => {
    const meta = parseTitleMetadata(
      '2025 Topps Universe WWE #18 "Dirty" Dominik Mysterio'
    );
    expect(meta.year).toBe('2025');
    expect(meta.category).toBe('WWE');
  });

  it('handles inline serial format #/299', () => {
    const meta = parseTitleMetadata(
      '2016-17 Panini Select Blue Prizm #23 Concourse - Georges Niang #/299'
    );
    expect(meta.isSerial).toBe(true);
    expect(meta.serialNumber).toBe('299');
    expect(meta.serialCurrent).toBeNull();
    expect(meta.serialLimit).toBe('299');
  });

  it('detects exact serial numbering current and limit', () => {
    const meta = parseTitleMetadata(
      '2024-25 Panini Prizm Silver #12 Test Player 07/25'
    );

    expect(meta.isSerial).toBe(true);
    expect(meta.serialNumber).toBe('07/25');
    expect(meta.serialCurrent).toBe('07');
    expect(meta.serialLimit).toBe('25');
  });

  it('defaults to NBA when no category signal found', () => {
    const meta = parseTitleMetadata(
      '2021-22 Donruss Elite #2 LeBron James'
    );
    expect(meta.category).toBe('NBA');
    expect(meta.playerName).toBe('LeBron James');
  });

  it('handles dash-separated player names', () => {
    const meta = parseTitleMetadata(
      '1996 Fleer USA Basketball - Heroes #7 - Scottie Pippen'
    );
    expect(meta.playerName).toBe('Scottie Pippen');
  });

  it('handles titles with RC suffix', () => {
    const meta = parseTitleMetadata(
      '2020-21 Panini Recon - Rookie Recon #6 Tyrese Haliburton'
    );
    expect(meta.isRookie).toBe(true);
    expect(meta.playerName).toBe('Tyrese Haliburton');
  });

  it('extracts No. format card numbers', () => {
    const meta = parseTitleMetadata(
      '2022 Chronicles Recon Draft Picks Jayson Tatum - No. 24'
    );

    expect(meta.year).toBe('2022');
    expect(meta.cardNumber).toBe('24');
  });
});
