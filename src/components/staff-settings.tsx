import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Mail, ShieldCheck, UserPlus, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createStaffAccount,
  getStaffInviteLink,
  inviteStaffAccount,
  listStaffAccounts,
  resetStaffPassword,
  setStaffActive,
  setStaffRole,
} from "@/lib/operations.functions";
import { ROLES, formatDate } from "@/lib/workspace";

type Role = (typeof ROLES)[number];

export function StaffSettings() {
  const queryClient = useQueryClient();
  const fetchStaff = useServerFn(listStaffAccounts);
  const invite = useServerFn(inviteStaffAccount);
  const createAccount = useServerFn(createStaffAccount);
  const fetchInviteLink = useServerFn(getStaffInviteLink);
  const resetPasswordFn = useServerFn(resetStaffPassword);
  const changeRole = useServerFn(setStaffRole);
  const changeActive = useServerFn(setStaffActive);

  const [mode, setMode] = useState<"invite" | "create">("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Data Entry");
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");

  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const staff = useQuery({ queryKey: ["staff-accounts"], queryFn: () => fetchStaff({}) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setMessage({ tone: "info", text: "Link generated. Please copy it from the text box." });
    }
  };

  const sendInviteMutation = useMutation({
    mutationFn: () => invite({ data: { email: email.trim(), role, redirectTo: `${window.location.origin}/auth` } }),
    onSuccess: (result) => {
      if (result.emailSent) {
        setMessage({
          tone: "ok",
          text: `Invitation email sent to ${result.email}. They set their own password from the email link.`,
        });
        setGeneratedInviteLink(null);
      } else if (result.inviteLink) {
        setGeneratedInviteLink(result.inviteLink);
        setMessage({
          tone: "info",
          text: result.note || "User created! The mail server (SMTP) could not send the email automatically. Please copy and share this invite link with the user:",
        });
      } else {
        setMessage({ tone: "ok", text: `User created with role ${result.role}.` });
      }
      setEmail("");
      refresh();
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  const createAccountMutation = useMutation({
    mutationFn: () => createAccount({ data: { email: email.trim(), password, role } }),
    onSuccess: (result) => {
      setMessage({
        tone: "ok",
        text: `Account created for ${result.email} with role "${result.role}". They can sign in immediately with the password provided.`,
      });
      setEmail("");
      setPassword("");
      setGeneratedInviteLink(null);
      refresh();
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  const copyExistingInviteMutation = useMutation({
    mutationFn: (userEmail: string) => fetchInviteLink({ data: { email: userEmail, redirectTo: `${window.location.origin}/auth` } }),
    onSuccess: (result, userEmail) => {
      if (result.inviteLink) {
        setGeneratedInviteLink(result.inviteLink);
        copyToClipboard(result.inviteLink);
        setMessage({ tone: "ok", text: `Invite link for ${userEmail} copied to clipboard!` });
      }
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => {
      if (!resetTarget) throw new Error("No target selected");
      return resetPasswordFn({ data: { userId: resetTarget.id, newPassword: newPasswordInput } });
    },
    onSuccess: () => {
      setMessage({ tone: "ok", text: `Password successfully updated for ${resetTarget?.email}.` });
      setResetTarget(null);
      setNewPasswordInput("");
    },
    onError: (error: Error) => setMessage({ tone: "error", text: error.message }),
  });

  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User management</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite staff by email, create accounts directly, assign roles and manage access.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <Tabs value={mode} onValueChange={(val) => { setMode(val as "invite" | "create"); setMessage(null); setGeneratedInviteLink(null); }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {mode === "invite" ? <Mail className="size-4 text-muted-foreground" /> : <UserPlus className="size-4 text-muted-foreground" />}
              <h2 className="text-sm font-semibold">{mode === "invite" ? "Invite a user" : "Create user directly"}</h2>
            </div>
            <TabsList>
              <TabsTrigger value="invite">Send invite link</TabsTrigger>
              <TabsTrigger value="create">Create with password</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="invite" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <Label className="text-xs text-muted-foreground">Work email</Label>
                <Input
                  className="mt-1.5"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="name@altaher.in"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => { setMessage(null); setGeneratedInviteLink(null); sendInviteMutation.mutate(); }}
                  disabled={sendInviteMutation.isPending || !email.trim()}
                >
                  {sendInviteMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Send invite
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-1">
                <Label className="text-xs text-muted-foreground">Work email</Label>
                <Input
                  className="mt-1.5"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="name@altaher.in"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password (min 8 chars)</Label>
                <Input
                  className="mt-1.5"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Initial password"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => { setMessage(null); setGeneratedInviteLink(null); createAccountMutation.mutate(); }}
                  disabled={createAccountMutation.isPending || !email.trim() || password.length < 8}
                >
                  {createAccountMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Create user
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {generatedInviteLink ? (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="w-full space-y-2">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Direct invitation link ready to share:
                </p>
                <p className="text-muted-foreground">
                  The auth server is not configured to send emails directly via SMTP. You can copy this link and send it directly to the user (via email, message, etc.) so they can set their password and sign in.
                </p>
                <div className="flex items-center gap-2">
                  <Input readOnly value={generatedInviteLink} className="h-8 font-mono text-xs bg-background" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => copyToClipboard(generatedInviteLink)}
                  >
                    {copied ? <Check className="mr-1 size-3 text-emerald-600" /> : <Copy className="mr-1 size-3" />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            className={`mt-3 text-xs ${
              message.tone === "ok"
                ? "text-emerald-600"
                : message.tone === "info"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-destructive"
            }`}
          >
            {message.text}
          </p>
        ) : null}
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
              <th className="px-5 py-3 text-right">Actions</th>
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
                  {!account.role ? (
                    <Badge variant="outline">No role</Badge>
                  ) : account.active ? (
                    <Badge variant="secondary">{account.invited ? "Invited" : "Active"}</Badge>
                  ) : (
                    <Badge variant="outline">Deactivated</Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(account.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {account.invited ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Copy direct invite / setup link"
                        disabled={copyExistingInviteMutation.isPending}
                        onClick={() => copyExistingInviteMutation.mutate(account.email)}
                      >
                        <Copy className="size-3.5 mr-1" /> Link
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Set / Reset password"
                      onClick={() => {
                        setResetTarget({ id: account.id, email: account.email });
                        setNewPasswordInput("");
                      }}
                    >
                      <KeyRound className="size-3.5 mr-1" /> Password
                    </Button>
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password for staff member</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-semibold text-foreground">{resetTarget?.email}</span>. They can use this to sign in immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="reset-new-password">New password</Label>
            <Input
              id="reset-new-password"
              type="password"
              placeholder="Minimum 8 characters"
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              minLength={8}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              onClick={() => resetPasswordMutation.mutate()}
              disabled={resetPasswordMutation.isPending || newPasswordInput.length < 8}
            >
              {resetPasswordMutation.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null} Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
