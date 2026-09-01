export interface Review {
  name: string;
  role: string;
  text: string;
  rating: number;
  when: string;
}

export interface Brand {
  name: string;
  accent: string;
  logoUrl: string | null;
  detected: boolean;
}

export type ParsedInput =
  | { kind: 'maps'; name: string }
  | { kind: 'mapslink'; url: string }
  | { kind: 'site'; url: string }
  | { kind: 'name'; name: string };

const HEX = /^#[0-9a-f]{6}$/i;

export function isValidHex(c: string | null | undefined): c is string {
  return !!c && HEX.test(c.trim());
}

export function parseInput(raw: string): ParsedInput | null {
  const s = raw.trim();
  if (!s) return null;

  const looksUrl = /^https?:\/\//i.test(s) || (/^[\w-]+(\.[\w-]+)+/.test(s) && !s.includes(' '));

  if (looksUrl) {
    const normalized = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    let u: URL;
    try {
      u = new URL(normalized);
    } catch {
      return { kind: 'name', name: s };
    }
    const host = u.hostname.toLowerCase();

    if (host.includes('google.') && u.pathname.includes('/maps/place/')) {
      const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
      if (m) {
        const name = decodeURIComponent(m[1].replace(/\+/g, ' '));
        return { kind: 'maps', name };
      }
    }
    if (host === 'maps.app.goo.gl' || host === 'g.co' || host === 'goo.gl') {
      return { kind: 'mapslink', url: normalized };
    }
    return { kind: 'site', url: normalized };
  }

  return { kind: 'name', name: s };
}

export function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

export function accentFromName(name: string, detectedHex?: string | null): string {
  if (isValidHex(detectedHex)) {
    return detectedHex.toLowerCase();
  }
  const h = hashHue(name.toLowerCase());
  return `hsl(${h} 72% 64%)`;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'client'
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Realistic sample reviews shown in the demo widget. Production connects
// Google/G2/screenshot imports — this pool adapts to any business name.
export const SAMPLE_REVIEWS: Review[] = [
  {
    name: 'Maya Torres',
    role: 'Operations lead',
    text: 'Absolutely the best decision we made this year. Communication was fast, the team actually listened, and results showed up in the first month.',
    rating: 5,
    when: '2 weeks ago',
  },
  {
    name: 'Daniel Okafor',
    role: 'Founder',
    text: 'I compared five options before choosing them. No contest. Professional from the first call to delivery, and the follow-up care is unmatched.',
    rating: 5,
    when: '1 month ago',
  },
  {
    name: 'Priya Raman',
    role: 'Marketing director',
    text: 'They took something I dreaded and made it effortless. Clear timelines, zero surprises, and the outcome exceeded what we scoped.',
    rating: 5,
    when: '1 month ago',
  },
  {
    name: 'Tom Brennan',
    role: 'Regular customer',
    text: 'Been coming here for over a year now. Consistent, friendly, and genuinely good at what they do. Highly recommend to anyone nearby.',
    rating: 5,
    when: '2 months ago',
  },
  {
    name: 'Sofia Lindgren',
    role: 'General manager',
    text: 'Responsive, detail-oriented, and honest about what would and would not work. That honesty is exactly why we keep renewing.',
    rating: 5,
    when: '2 months ago',
  },
  {
    name: 'James Whitfield',
    role: 'Owner',
    text: 'Fixed a problem two other providers gave up on. Straightforward pricing, no upsell games, and it has worked flawlessly since.',
    rating: 4,
    when: '3 months ago',
  },
  {
    name: 'Alicia Moreno',
    role: 'Practice manager',
    text: 'The whole team is a joy to work with. Quick to respond, quick to solve, and they explain everything in plain language.',
    rating: 5,
    when: '3 months ago',
  },
  {
    name: 'Ravi Patel',
    role: 'COO',
    text: 'We saw measurable improvement within weeks. Worth every penny. I only wish we had found them sooner.',
    rating: 5,
    when: '4 months ago',
  },
  {
    name: 'Grace Kim',
    role: 'Long-time client',
    text: 'Three years in and they have never missed a deadline. In this industry, that says everything.',
    rating: 5,
    when: '5 months ago',
  },
];
