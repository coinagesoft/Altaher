import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import logoAsset from "@/assets/altaher-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/")({
  validateSearch: (search: Record<string, unknown>) => ({ reason: search["reason"] === "no-role" ? "no-role" : undefined }),
  head: () => ({ meta: [
    { title: "Staff sign in | Talent Operations" },
    { name: "description", content: "Sign in to the internal recruitment and mobilisation workspace." },
    { property: "og:title", content: "Staff sign in | Talent Operations" },
    { property: "og:description", content: "Secure access for authorised staffing operations teams." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { reason } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(reason === "no-role" ? "Your account has not been assigned a workspace role. Contact an administrator." : "");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) { setError("Email or password is incorrect."); setBusy(false); return; }
    await navigate({ to: "/dashboard" });
  }
  return <main className="grid min-h-screen place-items-center bg-background px-5"><section className="w-full max-w-sm"><div className="mb-8 flex flex-col items-center gap-3 text-center"><img src={logoAsset.url} alt="Company logo" className="h-20 w-auto max-w-[300px] object-contain" /><div><h1 className="text-xl font-semibold">Talent Operations</h1><p className="text-xs text-muted-foreground">Authorised staff access</p></div></div><form onSubmit={submit} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm"><div><h2 className="text-lg font-semibold">Sign in</h2><p className="mt-1 text-sm text-muted-foreground">Use the account created by your administrator.</p></div><div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} required /></div><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required /></div>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form></section></main>;
}
