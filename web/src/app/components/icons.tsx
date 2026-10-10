/**
 * The only icons in CardAlarm: four inline SVGs (no icon font or package, no emoji or glyphs).
 * Decorative: always paired with visible text, so they are hidden from assistive tech.
 * They draw in currentColor, so they take the colour of the text around them.
 */

interface IconProps {
  className?: string;
}

const svgProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  "aria-hidden": true,
  focusable: false,
} as const;

/** Confirmed match. */
export function IconCheck({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <polyline points="3.5,8.5 6.5,11.5 12.5,4.5" />
    </svg>
  );
}

/** Possible match: a question mark in a circle. */
export function IconPossible({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.3 6.2a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3v.4" />
      <circle cx="8" cy="11.6" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Opens an external store page. */
export function IconExternal({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M6 3.5h6.5V10 M12.5 3.5 4 12" />
    </svg>
  );
}

/** Disclosure chevron (points down; rotate 180deg when expanded). */
export function IconChevron({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
