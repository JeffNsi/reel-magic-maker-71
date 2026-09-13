import { createFileRoute } from "@tanstack/react-router";

// This file holds SumUp's Apple Pay domain-verification content.
// Paste the exact text SumUp gives you between the backticks below,
// then publish again.
const APPLE_PAY_VERIFICATION = `
PASTE_SUMUP_APPLE_PAY_VERIFICATION_FILE_CONTENT_HERE
`.trim();

export const Route = createFileRoute("/api/public/apple-pay-verification")({
  server: {
    handlers: {
      GET: async () => {
        if (APPLE_PAY_VERIFICATION.includes("PASTE_SUMUP")) {
          return new Response(
            "Apple Pay verification file has not been configured yet.",
            { status: 503, headers: { "Content-Type": "text/plain" } },
          );
        }
        return new Response(APPLE_PAY_VERIFICATION, {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
