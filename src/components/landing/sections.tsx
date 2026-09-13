import { Link } from "@tanstack/react-router";
import {
  Check,
  Instagram,
  Music,
  Palette,
  PenLine,
  Play,
  Sparkles,
  Twitter,
  Youtube,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { COIN_COST } from "@/lib/storyreel.functions";
import { Reveal } from "./reveal";

const STEPS = [
  {
    number: "01",
    icon: PenLine,
    title: "Write your idea",
    body: "Describe the short film you want in a few words.",
  },
  {
    number: "02",
    icon: Palette,
    title: "Pick your style",
    body: "Choose a cinematic look that fits your vision.",
  },
  {
    number: "03",
    icon: Play,
    title: "Get your film",
    body: "Render in 2–3 minutes and download in vertical 9:16.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">How it works</h2>
      </Reveal>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 80}>
            <div className="surface-cinema relative h-full overflow-hidden rounded-2xl p-6">
              <span className="absolute -right-2 -top-4 font-display text-7xl italic leading-none text-primary/10">
                {step.number}
              </span>
              <div className="relative">
                <span className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  Step {i + 1}
                </p>
                <h3 className="mt-1 text-lg font-medium text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

const TESTIMONIALS = [
  {
    name: "Maya Lindqvist",
    role: "Content creator, 180k followers",
    quote:
      "I went from idea to a finished vertical short in under three minutes. The quality is unreal for something that fast.",
    initials: "ML",
  },
  {
    name: "Tobias Ek",
    role: "Marketing lead, Nordwave",
    quote:
      "We used to spend a day shooting one hook. Now we generate three variations before lunch and pick the winner.",
    initials: "TE",
  },
  {
    name: "Amara Osei",
    role: "Screenwriter",
    quote:
      "It is the easiest way to visualize a scene before I write the full script. The cinematic style presets are genuinely useful.",
    initials: "AO",
  },
];

const LOGOS = ["NORDWAVE", "STUDIO ÅTTA", "PIXELHOUSE", "LUMEN", "KVARTAL"];

export function SocialProof() {
  return (
    <section className="mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Loved by creators
        </h2>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {TESTIMONIALS.map((person, i) => (
          <Reveal as="li" key={person.name} delay={i * 80}>
            <figure className="surface-cinema relative h-full overflow-hidden rounded-2xl border border-border/60 p-6">
              <span
                aria-hidden
                className="absolute -right-2 -top-2 font-display text-6xl italic leading-none text-primary/20"
              >
                “
              </span>
              <blockquote className="relative text-sm leading-relaxed text-foreground/90">
                {person.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                >
                  {person.initials}
                </span>
                <span className="text-sm">
                  <span className="block font-medium text-foreground">{person.name}</span>
                  <span className="block text-xs text-muted-foreground">{person.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
      <Reveal className="mt-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Used by creators from
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {LOGOS.map((logo) => (
            <li
              key={logo}
              className="text-sm font-semibold tracking-[0.2em] text-muted-foreground/50"
            >
              {logo}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

const TIERS = [
  {
    name: "Free",
    price: "$0",
    cadence: "per month",
    highlight: false,
    features: ["3 renders", "5-second videos", "STORYREEL watermark"],
    cta: "Start free",
    to: "/auth" as const,
  },
  {
    name: "Creator",
    price: "$19",
    cadence: "per month",
    highlight: true,
    features: ["Unlimited renders", "No watermark", "Priority render queue"],
    cta: "Go Creator",
    to: "/dramawave/rewards" as const,
  },
  {
    name: "Studio",
    price: "$99",
    cadence: "per month",
    highlight: false,
    features: ["Team seats", "Longer durations", "API access"],
    cta: "Contact us",
    to: "/auth" as const,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">Pricing</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Start free. One film costs {COIN_COST} coins on paid plans.
        </p>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier, i) => (
          <Reveal as="li" key={tier.name} delay={i * 80}>
            <div
              className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                tier.highlight
                  ? "border-primary bg-card shadow-[0_0_36px_var(--glow)]"
                  : "border-border bg-card/60"
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                  Most popular
                </span>
              )}
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {tier.name}
              </h3>
              <p className="mt-3 font-display text-4xl text-foreground">{tier.price}</p>
              <p className="text-xs text-muted-foreground">{tier.cadence}</p>
              <ul className="mt-5 flex-1 space-y-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm text-foreground/85">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={tier.highlight ? "default" : "outline"}
                className={`mt-6 h-11 rounded-xl text-xs font-semibold uppercase tracking-[0.15em] ${
                  tier.highlight
                    ? "bg-primary text-primary-foreground hover:shadow-[0_0_24px_var(--glow)]"
                    : ""
                }`}
              >
                <Link to={tier.to}>{tier.cta}</Link>
              </Button>
            </div>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const FAQS = [
  {
    q: "What exactly do I get?",
    a: "A 5-second vertical 9:16 AI-generated short film, ready to post.",
  },
  {
    q: "Why is the video silent?",
    a: "Silent output is optimized for social feeds where viewers watch without sound.",
  },
  {
    q: "Can I make longer videos?",
    a: "Longer durations are coming soon for Creator and Studio plans.",
  },
  {
    q: "How long does rendering take?",
    a: "Usually 2–3 minutes. You can keep browsing while it renders.",
  },
  {
    q: "Do I own the videos I create?",
    a: "Yes, you own full rights to every short you generate.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — 3 free renders, no credit card required.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Questions, answered
        </h2>
      </Reveal>
      <Reveal className="mt-6">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q} className="border-border">
              <AccordionTrigger className="text-left font-sans text-base font-medium text-foreground hover:text-primary">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}

const FOOTER_LINKS = {
  Product: [
    { label: "Generator", href: "#create" },
    { label: "Gallery", href: "#gallery" },
    { label: "Pricing", href: "#pricing" },
  ],
  Company: [
    { label: "About", href: "#top" },
    { label: "Contact", href: "mailto:hello@storyreel.app" },
    { label: "Careers", href: "#top" },
  ],
  Legal: [
    { label: "Privacy", to: "/privacy" as const },
    { label: "Terms", to: "/terms" as const },
  ],
};

const SOCIALS = [
  { label: "X", href: "https://x.com", Icon: Twitter },
  { label: "Instagram", href: "https://instagram.com", Icon: Instagram },
  { label: "TikTok", href: "https://tiktok.com", Icon: Music },
  { label: "YouTube", href: "https://youtube.com", Icon: Youtube },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border pt-12">
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <p className="font-display text-2xl italic text-primary">STORYREEL</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Cinematic vertical shorts from a single idea.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Made for creators
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">Product</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LINKS.Product.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">Company</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LINKS.Company.map((item) => (
              <li key={item.label}>
                <a href={item.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">Legal</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LINKS.Legal.map((item) => (
              <li key={item.label}>
                <Link to={item.to} className="text-muted-foreground transition-colors hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © 2026 STORYREEL. All rights reserved.
        </p>
        <ul className="flex items-center gap-4">
          {SOCIALS.map((social) => (
            <li key={social.label}>
              <a
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <social.Icon className="size-4" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
