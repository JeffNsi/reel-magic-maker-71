import { Link } from "@tanstack/react-router";
import { Check, Palette, PenLine, Play, Sparkles } from "lucide-react";

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
    icon: PenLine,
    title: "Write your idea",
    body: "One sentence. A person, a place, a want.",
  },
  {
    icon: Palette,
    title: "Pick a style",
    body: "Cinematic, anime, noir — the look is applied for you.",
  },
  {
    icon: Play,
    title: "Get your film",
    body: "A vertical short lands in your library, ready to post.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">How it works</h2>
      </Reveal>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal as="li" key={step.title} delay={i * 80}>
            <div className="surface-cinema h-full rounded-2xl p-6">
              <span className="flex size-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                <step.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Step {i + 1}
              </p>
              <h3 className="mt-1 text-lg font-medium text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
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
    quote: "I post five shorts a week now. The style presets do the work a whole crew used to do.",
    initials: "ML",
  },
  {
    name: "Tobias Ek",
    role: "Marketing lead, Nordwave",
    quote: "We test three hooks before lunch. Vertical, on brand, no shoot day.",
    initials: "TE",
  },
  {
    name: "Amara Osei",
    role: "Screenwriter",
    quote: "It is the fastest way I have found to see a scene before I commit to writing it.",
    initials: "AO",
  },
];

const LOGOS = ["NORDWAVE", "STUDIO ÅTTA", "PIXELHOUSE", "LUMEN", "KVARTAL"];

export function SocialProof() {
  return (
    <section className="mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">
          Creators ship faster
        </h2>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {TESTIMONIALS.map((person, i) => (
          <Reveal as="li" key={person.name} delay={i * 80}>
            <figure className="surface-cinema h-full rounded-2xl p-6">
              <blockquote className="text-sm leading-relaxed text-foreground/90">
                “{person.quote}”
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
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
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
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
    price: "0 kr",
    cadence: "to start",
    highlight: false,
    features: ["3 free renders", "All six visual styles", "Vertical 9:16 · watch & download"],
    cta: "Start free",
    to: "/auth" as const,
  },
  {
    name: "Creator",
    price: "199 kr",
    cadence: "per month",
    highlight: true,
    features: [
      "30 renders a month",
      "Story generator & scene editor",
      "Voice-over and music beds",
      "Priority render queue",
    ],
    cta: "Get Creator",
    to: "/dramawave/rewards" as const,
  },
  {
    name: "Studio",
    price: "699 kr",
    cadence: "per month",
    highlight: false,
    features: ["Unlimited renders", "Commercial licence", "Team library", "Priority support"],
    cta: "Get Studio",
    to: "/dramawave/rewards" as const,
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
    a: "A vertical 9:16 AI-generated video, five seconds long, that you can watch, download and post. Every film is saved in My shorts.",
  },
  {
    q: "Why is the video silent?",
    a: "The video model renders picture only by default. Flip the Sound switch before you generate, or add a narrated voice-over and a music bed to the finished film in the player.",
  },
  {
    q: "Can I make longer videos?",
    a: "One render is five seconds. For a longer film, use the scene editor: write each scene, generate them one at a time with the same characters and setting, then post them as a series.",
  },
  {
    q: "How long does rendering take?",
    a: "Roughly two to three minutes per film. You see live progress and an estimated time left while it renders.",
  },
  {
    q: "Do I own the videos I create?",
    a: "Yes. You keep the films you generate and can post them anywhere. Commercial use is included on the Studio plan.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. New accounts get free coins for three films. No credit card needed to try it.",
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
              <AccordionTrigger className="text-left text-base text-foreground hover:text-primary">
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

const SOCIALS = [
  { label: "X", href: "https://x.com" },
  { label: "Instagram", href: "https://instagram.com" },
  { label: "TikTok", href: "https://tiktok.com" },
  { label: "YouTube", href: "https://youtube.com" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border pt-10">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-display text-2xl italic text-primary">STORYREEL</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Cinematic vertical shorts from a single idea.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Made for creators
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm sm:flex-1">
          <a href="#top" className="text-muted-foreground hover:text-foreground">
            Home
          </a>
          <a href="#gallery" className="text-muted-foreground hover:text-foreground">
            Gallery
          </a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground">
            Pricing
          </a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground">
            FAQ
          </a>
          <a
            href="mailto:hello@storyreel.app"
            className="text-muted-foreground hover:text-foreground"
          >
            Contact
          </a>
          <Link to="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-muted-foreground hover:text-foreground">
            Terms of Service
          </Link>
        </nav>

        <ul className="flex gap-4">
          {SOCIALS.map((social) => (
            <li key={social.label}>
              <a
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
              >
                {social.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-10 pb-10 text-xs text-muted-foreground/60">
        © {new Date().getFullYear()} STORYREEL. All rights reserved.
      </p>
    </footer>
  );
}
