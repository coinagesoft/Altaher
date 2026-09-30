import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteStaffAccount, listStaffAccounts, setStaffActive, setStaffRole } from "@/lib/operations.functions";
import { ROLES, formatDate } from "@/lib/workspace";

type Role = (typeof ROLES)[number];

export function StaffSettings() {
  const queryClient = useQueryClient();
  const fetchStaff = useServerFn(listStaffAccounts);
  const invite = useServerFn(inviteStaffAccount);
  const changeRole = useServerFn(setStaffRole);
  const changeActive = useServerFn(setStaffActive);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Data Entry");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const staff = useQuery({ queryKey: ["staff-accounts"], queryFn: () => fetchStaff({}) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });

  const send = useMutation({
    mutationFn: () => invite({ data: { email: email.trim(), role, redirectTo: `${window.location.origin}/auth` } }),
    onSuccess: () => {
      setMessage({ tone: "ok", text: `Invitation sent to ${email.trim()}. They set their own password from the email link.` });
      setEmail("");
      refresh();
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Invite staff by email, set what they can access and deactivate people who have left. History is always kept.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Invite a user</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label className="text-xs text-muted-foreground">Work email</Label>
            <Input className="mt-1.5" value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@company.com" autoComplete="off" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => { setMessage(null); send.mutate(); }} disabled={send.isPending || !email.trim()}>
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Send invite
            </Button>
          </div>
        </div>
        {message ? <p className={`mt-3 text-xs ${message.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Users</h2>
          <p className="mt-1 text-xs text-muted-foreground">Change a role to move someone to a different part of the workflow.</p>
        </div>
        {staff.isLoading ? <p className="px-5 py-6 text-sm text-muted-foreground">Loading…</p> : null}
        {staff.error ? <p className="px-5 py-6 text-sm text-destructive">{(staff.error as Error).message}</p> : null}
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Date added</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(staff.data ?? []).map((account) => (
              <tr key={account.id}>
                <td className="px-5 py-3 font-medium">{account.email}</td>
                <td className="px-5 py-3">
                  <Select
                    {...(account.role ? { value: account.role } : {})}
                    onValueChange={(value) => {
                      setMessage(null);
                      changeRole({ data: { userId: account.id, role: value as Role } })
                        .then(() => { setMessage({ tone: "ok", text: "Role updated." }); refresh(); })
                        .catch((error: Error) => setMessage({ tone: "error", text: error.message }));
                    }}
                  >
                    <SelectTrigger className="w-[210px]"><SelectValue placeholder="Assign a role" /></SelectTrigger>
                    <SelectContent>{ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-5 py-3">
                  {!account.role ? <Badge variant="outline">No role</Badge> : account.active ? <Badge variant="secondary">{account.invited ? "Invited" : "Active"}</Badge> : <Badge variant="outline">Deactivated</Badge>}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(account.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setMessage(null);
                      changeActive({ data: { userId: account.id, active: !account.active } })
                        .then(() => { setMessage({ tone: "ok", text: account.active ? "User deactivated." : "User reactivated." }); refresh(); })
                        .catch((error: Error) => setMessage({ tone: "error", text: error.message }));
                    }}
                  >
                    {account.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
