import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — STORYREEL" },
      {
        name: "description",
        content: "How STORYREEL handles your account, prompts and generated films.",
      },
      { property: "og:title", content: "Privacy Policy — STORYREEL" },
      {
        property: "og:description",
        content: "How STORYREEL handles your account, prompts and generated films.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-16 sm:px-6">
      <Link to="/" className="font-display text-2xl italic text-primary">
        STORYREEL
      </Link>
      <h1 className="mt-8 font-display text-4xl italic text-foreground">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          We store the email you sign up with, your coin balance, the prompts you write and the
          films you generate. That is what the product needs to work.
        </p>
        <p>
          Prompts are sent to our video generation provider to render your film. Films are stored
          privately and only shared through links you open yourself.
        </p>
        <p>
          We never sell your data. Ask us to delete your account and everything tied to it goes with
          it — mail{" "}
          <a className="text-primary hover:underline" href="mailto:hello@storyreel.app">
            hello@storyreel.app
          </a>
          .
        </p>
      </div>
    </main>
  );
}
