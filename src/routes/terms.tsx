import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — STORYREEL" },
      {
        name: "description",
        content: "The rules for using STORYREEL and the films you create with it.",
      },
      { property: "og:title", content: "Terms of Service — STORYREEL" },
      {
        property: "og:description",
        content: "The rules for using STORYREEL and the films you create with it.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-16 sm:px-6">
      <Link to="/" className="font-display text-2xl italic text-primary">
        STORYREEL
      </Link>
      <h1 className="mt-8 font-display text-4xl italic text-foreground">Terms of Service</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          You keep the films you generate and may post them anywhere. Commercial use is included on
          the Studio plan.
        </p>
        <p>
          Do not use STORYREEL to create content that is illegal, hateful, sexual involving minors,
          or that impersonates a real person without consent. We may remove such content and close
          the account behind it.
        </p>
        <p>
          Coins are consumed when a render starts and refunded automatically if the render fails.
          Rendering depends on a third-party provider, so we cannot guarantee uninterrupted service.
        </p>
      </div>
    </main>
  );
}
