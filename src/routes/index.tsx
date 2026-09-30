import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => { throw redirect({ to: "/auth", search: { reason: undefined } }); },
  head: () => ({ meta: [
    { title: "Talent Operations | Secure staff access" },
    { name: "description", content: "Secure staff access for recruitment and mobilisation operations." },
    { property: "og:title", content: "Talent Operations | Secure staff access" },
    { property: "og:description", content: "Secure staff access for recruitment and mobilisation operations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
});
