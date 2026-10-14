import { Link } from "@tanstack/react-router";
import { Check, Music, Sparkles, Twitter, Instagram, Youtube } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { CREATOR_PLAN_COPY, FILM_PRICE_COPY } from "./copy";
import { Reveal } from "./reveal";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    cadence: "per month",
    highlight: false,
    features: ["3 renders", "5-second videos", "Shortizereel watermark"],
    cta: "Start free",
    plan: "free" as const,
  },
  {
    name: "Creator",
    price: "$19",
    cadence: "per month",
    highlight: true,
    features: [CREATOR_PLAN_COPY, "No watermark", "Priority render queue"],
    cta: "Go Creator",
    plan: "creator" as const,
  },
  {
    name: "Studio",
    price: "$99",
    cadence: "per month",
    highlight: false,
    features: ["Team seats", "Longer durations", "API access"],
    cta: "Go Studio",
    plan: "studio" as const,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="mt-24 scroll-mt-24">
      <Reveal>
        <h2 className="font-display text-3xl italic text-foreground sm:text-4xl">Pricing</h2>
        <p className="mt-3 text-sm text-muted-foreground">{FILM_PRICE_COPY}</p>
      </Reveal>
      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {TIERS.map((tier, i) => (
          <Reveal as="li" key={tier.name} delay={i * 80}>
            <div
              className={`relative flex h-full flex-col rounded-lg border p-6 ${
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
                <Link to="/auth" search={{ plan: tier.plan }}>
                  {tier.cta}
                </Link>
              </Button>
            </div>
          </Reveal>
        ))}
      </ul>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
        Plans are priced in USD. Individual clip purchases are priced in SEK.
      </p>
    </section>
  );
}

const FAQS = [
  {
    q: "What does the AI Director actually do?",
    a: "It reads your idea, asks one useful question at a time, suggests cinematic possibilities and builds a Film Bible you approve before anything is generated.",
  },
  {
    q: "When are credits used?",
    a: `Only when you approve the direction and choose to make the film. Talking with the Director costs no film credits. ${FILM_PRICE_COPY}`,
  },
  {
    q: "What if I close the browser?",
    a: "A confirmed clip purchase stays confirmed and the clip is waiting on the film page when you return.",
  },
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
    { label: "Create", href: "#create" },
    { label: "How it works", href: "#how" },
  ],
  Company: [{ label: "Contact", href: "mailto:hello@storyreel.app" }],
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
          <p className="font-display text-2xl italic text-primary">Shortizereel</p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            You bring the idea. Your AI Director finds the film inside it.
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" aria-hidden /> Made for creators
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
            Product
          </h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LINKS.Product.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
            Company
          </h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LINKS.Company.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
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
                <Link
                  to={item.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
        <p className="text-xs text-muted-foreground">© 2026 Shortizereel. All rights reserved.</p>
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
