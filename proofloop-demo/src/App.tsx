import { useEffect, useRef, useState } from 'react';
import {
  accentFromName,
  delay,
  initialsOf,
  parseInput,
  SAMPLE_REVIEWS,
  slugify,
  type Brand,
} from './lib';

type Flow = 'idle' | 'loading' | 'done';

const STAGES = [
  'Fetching brand tokens',
  'Importing proof',
  'Building white-label widget',
];

const EXAMPLES = [
  { label: 'Blue Bottle Coffee', value: 'https://bluebottlecoffee.com' },
  { label: 'A local gym', value: 'https://www.google.com/maps/place/Iron+Paradise+Fitness' },
  { label: 'A dental clinic', value: 'Bright Smile Dental' },
];

const PREVIEW_BRAND: Brand = {
  name: 'Harborline Studio',
  accent: 'hsl(38 78% 58%)',
  logoUrl: null,
  detected: false,
};

const VENTS = [
  { pain: '20 minutes', rest: 'before every sales call, digging for the one quote that fits.' },
  { pain: 'Five sources', rest: 'holding one client\u2019s proof: Google, G2, screenshots, email, old drives.' },
  { pain: 'Preset styles', rest: 'that break client brand guidelines the moment you embed.' },
];

const STEPS = [
  {
    title: 'Import everything',
    body: 'Google reviews, G2, screenshot praise from WhatsApp, forwarded emails. Every client gets one proof workspace instead of six hiding places.',
  },
  {
    title: 'Ask for the quote',
    body: 'Type what the moment needs, like \u201cresults for e-commerce clients\u201d, and get the exact testimonial, copy-ready, with attribution.',
  },
  {
    title: 'Ship it branded',
    body: 'White-label widget, client-ready Proof Report, one embed snippet. Package the proof into deliverables the retainer already pays for.',
  },
];

async function fetchBrand(url: string): Promise<Partial<Brand>> {
  try {
    const res = await fetch('/api/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      name: data.name ?? undefined,
      logoUrl: data.logoUrl ?? null,
      accent: data.accent ?? undefined,
    };
  } catch {
    return {};
  }
}

export default function App() {
  const [input, setInput] = useState('');
  const [flow, setFlow] = useState<Flow>('idle');
  const [stage, setStage] = useState(0);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [elapsed, setElapsed] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [joined, setJoined] = useState(false);
  const [auditAgency, setAuditAgency] = useState('');
  const [auditClient, setAuditClient] = useState('');
  const [auditEmail, setAuditEmail] = useState('');
  const [auditSubmitted, setAuditSubmitted] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  async function generate(raw?: string) {
    if (busyRef.current) return; // covers Enter key + example chips + double-clicks
    const source = (raw ?? input).trim();
    const parsed = parseInput(source);
    if (!parsed) {
      setError('Paste a Google Business URL, a website, or a business name.');
      return;
    }
    busyRef.current = true;
    const t0 = performance.now();
    try {
      setError('');
      setFlow('loading');
      setStage(0);
      setCopied(false);

      let name: string;
      let brandFetch: Promise<Partial<Brand>> = Promise.resolve({});

      if (parsed.kind === 'maps') {
        name = parsed.name;
      } else if (parsed.kind === 'name') {
        name = parsed.name;
      } else {
        // 'site' and 'mapslink' both go through /api/brand; the server resolves
        // short maps links to a place name and extracts brands for real sites.
        brandFetch = fetchBrand(parsed.url);
        name = '';
      }

      const [b] = await Promise.all([brandFetch, delay(750)]);
      setStage(1);
      await delay(650);

      const resolvedName = (b.name ?? name ?? '').trim() || deriveNameFromInput(source);
      setStage(2);
      await delay(550);

      const accent = accentFromName(resolvedName, b.accent ?? null);
      setBrand({
        name: resolvedName,
        accent,
        logoUrl: b.logoUrl ?? null,
        detected: Boolean(b.logoUrl || b.accent),
      });
      setElapsed(((performance.now() - t0) / 1000).toFixed(1) + 's');
      setFlow('done');
      setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        60,
      );
    } finally {
      busyRef.current = false;
    }
  }

  function deriveNameFromInput(s: string): string {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      return u.hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return s.slice(0, 40);
    }
  }

  async function copyEmbed() {
    if (!brand) return;
    const slug = slugify(brand.name);
    const snippet = [
      `<!-- ProofLoop widget: ${brand.name} -->`,
      `<div data-proofloop-widget="${slug}"></div>`,
      `<script async src="https://proofloop.app/widget.js"></script>`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* demo endpoint — still show success */
    }
    setJoined(true);
  }

  async function requestAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!auditAgency.trim() || !auditClient.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auditEmail)) return;
    try {
      await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: auditEmail,
          agency: auditAgency.trim(),
          client: auditClient.trim(),
        }),
      });
    } catch {
      /* demo endpoint — still show the confirmation */
    }
    setAuditSubmitted(true);
  }

  function scrollToAudit() {
    document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <main className="page">
      <nav className="nav">
        <div className="nav-logo">
          <span className="nav-mark" />
          ProofLoop
        </div>
        <a className="nav-cta" href="#audit">Get a free audit</a>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Testimonial operations for agencies</p>
          <h1>
            Your clients&rsquo; proof is everywhere.{' '}
            <span className="hero-em">Put it to work.</span>
          </h1>
          <p className="sub">
            ProofLoop turns scattered client reviews into branded proof you can search, ship
            anywhere, and bill into the retainer.
          </p>
          <div className="input-row">
            <input
              className="url-input"
              type="text"
              placeholder="Paste a client's website or Google link…"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && generate()}
              spellCheck={false}
              aria-label="Client website, Google Business URL, or business name"
            />
            <button className="btn-primary" onClick={() => generate()} disabled={flow === 'loading'}>
              {flow === 'loading' ? 'Building…' : 'Build my widget'}
            </button>
          </div>
          {error && <p className="input-error">{error}</p>}
          <div className="examples">
            <span>Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                className="example-chip"
                onClick={() => {
                  setInput(ex.value);
                  generate(ex.value);
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
          <div className="hero-secondary-cta">
            <span>Not ready to build?</span>
            <button className="text-link" onClick={scrollToAudit}>Get a free proof audit <span aria-hidden="true">↘</span></button>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <Widget brand={PREVIEW_BRAND} limit={3} />
          <p className="visual-caption">A sample client workspace, built in the time it took to read this.</p>
        </div>
      </header>

      <div ref={resultRef}>
        {flow === 'loading' && (
          <div className="stages" role="status">
            {STAGES.map((s, i) => (
              <div key={s} className={`stage ${i <= stage ? 'stage-active' : ''}`}>
                <span className="stage-dot">{i < stage ? '✓' : i === stage ? '•' : ''}</span>
                {s}
                {i === stage && <span className="stage-ellipsis" />}
              </div>
            ))}
          </div>
        )}

        {flow === 'done' && brand && (
          <div className="result">
            <div className="result-head">
              <span className="result-badge">
                {brand.detected ? 'Brand detected from live site' : 'Demo branding applied'}
              </span>
              <span className="result-time">Built in {elapsed}</span>
            </div>

            <div className="widget-frame">
              <div className="widget-chrome">
                <span /><span /><span />
                <div className="widget-url">{slugify(brand.name)}.com/testimonials</div>
              </div>
              <Widget brand={brand} />
            </div>

            <div className="panels">
              <div className="panel-card">
                <h3>Embed anywhere</h3>
                <p>One snippet. Any site, any CMS, already styled in your client's brand.</p>
                <pre className="embed-code">{`<div data-proofloop-widget="${slugify(brand.name)}"></div>
<script async src="https://proofloop.app/widget.js"></script>`}</pre>
                <button className="btn-ghost" onClick={copyEmbed}>
                  {copied ? 'Copied ✓' : 'Copy embed code'}
                </button>
              </div>
              <div className="panel-card">
                <h3>Monthly Proof Report</h3>
                <p>The client-ready deliverable agencies bill into the retainer.</p>
                <div className="report">
                  <div className="report-stat">
                    <strong>41</strong>
                    <span>reviews collected</span>
                  </div>
                  <div className="report-stat">
                    <strong>4.8</strong>
                    <span>average rating</span>
                  </div>
                  <div className="report-stat">
                    <strong>+9.4%</strong>
                    <span>lift on proof pages</span>
                  </div>
                </div>
                <div className="report-foot">ProofLoop, {brand.name}, monthly</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <section className="section">
        <div className="problem-grid">
          <div>
            <h2>You have the proof. You can&rsquo;t reach it.</h2>
            <p className="section-lede">
              Every agency sits on a mountain of client praise that never makes it into a pitch, a
              proposal, or a client&rsquo;s homepage. The collecting is done. The using never
              happens.
            </p>
          </div>
          <div className="problem-vents">
            {VENTS.map((v) => (
              <div className="vent" key={v.pain}>
                <strong>{v.pain}</strong> {v.rest}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>One workflow, start to invoice</h2>
        <p className="section-lede">
          ProofLoop is not another collection form. It is the layer after collecting, where proof
          becomes client work.
        </p>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li className="step" key={s.title}>
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <div className="ask-grid">
          <div>
            <h2>Five seconds instead of twenty minutes</h2>
            <p className="section-lede">
              Ask Proof reads every quote in the workspace and hands back the one that fits the
              call. No folders, no filters, no scrolling.
            </p>
          </div>
          <div className="ask-demo" aria-hidden="true">
            <div className="ask-bar">
              <span className="ask-kbd">⌘K</span>
              <span>quotes about fast communication</span>
              <span className="ask-caret" />
            </div>
            <div className="ask-result">
              <blockquote>
                &ldquo;Communication was fast, the team actually listened, and results showed up
                in the first month.&rdquo;
              </blockquote>
              <div className="ask-meta">
                <span>Maya Torres, Operations lead, 5.0</span>
                <span className="ask-copy-chip">Copy quote</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="audit-section section" id="audit">
        <div className="audit-intro">
          <p className="eyebrow">For agencies with proof hiding in plain sight</p>
          <h2>Get your first proof audit free.</h2>
          <p className="section-lede">
            Share one client. We&rsquo;ll find five reviews worth reusing, one homepage opportunity,
            and a practical way to turn that proof into a deliverable.
          </p>
        </div>
        <div className="audit-card">
          {auditSubmitted ? (
            <div className="audit-success">
              <span className="success-mark" aria-hidden="true">✓</span>
              <h3>Your audit is on its way.</h3>
              <p>We&rsquo;ll review the agency and client sites, then send the findings to {auditEmail}.</p>
            </div>
          ) : (
            <form className="audit-form" onSubmit={requestAudit}>
              <div className="form-field">
                <label htmlFor="audit-agency">Your agency website</label>
                <input
                  id="audit-agency"
                  type="text"
                  placeholder="https://youragency.com"
                  value={auditAgency}
                  onChange={(e) => setAuditAgency(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="audit-client">One client website</label>
                <input
                  id="audit-client"
                  type="text"
                  placeholder="https://yourclient.com"
                  value={auditClient}
                  onChange={(e) => setAuditClient(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="audit-email">Where should we send it?</label>
                <input
                  id="audit-email"
                  type="email"
                  placeholder="you@agency.com"
                  value={auditEmail}
                  onChange={(e) => setAuditEmail(e.target.value)}
                  required
                />
              </div>
              <button className="btn-primary" type="submit">Send me the free audit</button>
              <p className="form-note">No pitch deck. Just three useful observations for one client.</p>
            </form>
          )}
        </div>
      </section>

      <section className="waitlist" id="waitlist">
        <h2>Be first in line</h2>
        <p>ProofLoop is in private build. Join the waitlist and we&rsquo;ll set up your first client workspace personally.</p>
        {joined ? (
          <p className="joined">You're on the list. We'll be in touch. ✓</p>
        ) : (
          <form className="waitlist-form" onSubmit={joinWaitlist}>
            <input
              type="email"
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="Work email"
            />
            <button className="btn-primary" type="submit">
              Get early access
            </button>
          </form>
        )}
      </section>

      <footer className="footer">
        <p>
          Demo build. Reviews shown are sample data; the production product imports real reviews
          from Google, G2, and screenshot drops.
        </p>
      </footer>

      {copied && <div className="toast">Embed code copied</div>}
    </main>
  );
}

function Widget({ brand, limit = 6 }: { brand: Brand; limit?: number }) {
  const shown = SAMPLE_REVIEWS.slice(0, limit);
  return (
    <div className="widget" style={{ '--w-accent': brand.accent } as React.CSSProperties}>
      <div className="widget-head">
        {brand.logoUrl ? (
          <img
            className="widget-logo"
            src={brand.logoUrl}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              e.currentTarget.parentElement?.classList.add('logo-fallback');
            }}
          />
        ) : null}
        {!brand.logoUrl && <span className="widget-logo-letter">{initialsOf(brand.name)}</span>}
        <div>
          <div className="widget-title">{brand.name}</div>
          <div className="widget-sub">
            <span className="stars">★★★★★</span> 4.8 · Wall of Love
          </div>
        </div>
        <span className="widget-powered">Powered by ProofLoop</span>
      </div>
      <div className="wall">
        {shown.map((r, i) => (
          <figure className="quote" key={i} style={{ animationDelay: `${i * 70}ms` }}>
            <div className="quote-stars" aria-label={`${r.rating} stars`}>
              {'★'.repeat(r.rating)}
              <span className="quote-stars-empty">{'★'.repeat(5 - r.rating)}</span>
            </div>
            <blockquote>{r.text}</blockquote>
            <figcaption>
              <span className="avatar">
                {initialsOf(r.name)}
              </span>
              <span>
                <strong>{r.name}</strong>
                <em>{r.role} · {r.when}</em>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="widget-more">+ 32 more reviews</div>
    </div>
  );
}
