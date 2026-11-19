import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Info,
} from "lucide-react";

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

function generateSecurePassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  let pwd = "AT@";
  for (let i = 0; i < 7; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

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
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [role, setRole] = useState<Role>("Data Entry");
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Password modal state
  const [passwordTarget, setPasswordTarget] = useState<{
    id: string;
    email: string;
    hasExistingPassword: boolean;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(true);

  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const staff = useQuery({ queryKey: ["staff-accounts"], queryFn: () => fetchStaff({}) });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["staff-accounts"] });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
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
        text: `Account created for ${result.email} with password "${result.password}". They can sign in immediately.`,
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
      if (!passwordTarget) throw new Error("No user selected");
      return resetPasswordFn({ data: { userId: passwordTarget.id, newPassword: passwordInput.trim() } });
    },
    onSuccess: () => {
      const updatedEmail = passwordTarget?.email;
      const newPwd = passwordInput.trim();
      copyToClipboard(newPwd);
      setMessage({
        tone: "ok",
        text: `Password reset successfully for ${updatedEmail} and copied to clipboard: ${newPwd}`,
      });
      setPasswordTarget((prev) => (prev ? { ...prev, hasExistingPassword: true } : null));
      refresh();
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
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Password</Label>
                  <button
                    type="button"
                    onClick={() => setPassword(generateSecurePassword())}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Sparkles className="size-3" /> Generate
                  </button>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showCreatePassword ? "text" : "password"}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    className="pr-8"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0.5 top-0.5 size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                  >
                    {showCreatePassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
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
          <p className="mt-1 text-xs text-muted-foreground">
            Change a role to move someone to a different part of the workflow.
          </p>
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
                    <SelectTrigger className="w-[190px]"><SelectValue placeholder="Assign a role" /></SelectTrigger>
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
                        <Copy className="mr-1 size-3.5" /> Link
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="View prefilled password or reset password"
                      onClick={() => {
                        setPasswordTarget({
                          id: account.id,
                          email: account.email,
                          hasExistingPassword: !!account.password,
                        });
                        // Prefill existing password if one exists
                        setPasswordInput(account.password || "");
                        setShowPassword(true);
                      }}
                    >
                      <KeyRound className="mr-1 size-3.5" /> Password
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

      <Dialog open={!!passwordTarget} onOpenChange={(open) => { if (!open) setPasswordTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Staff Password
            </DialogTitle>
            <DialogDescription>
              Account credentials for <span className="font-semibold text-foreground">{passwordTarget?.email}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="staff-password-input" className="text-xs font-semibold">
                  {passwordTarget?.hasExistingPassword ? "Current Password (prefilled)" : "New Password"}
                </Label>
                <div className="flex items-center gap-2">
                  {passwordInput ? (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(passwordInput)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Copy password to clipboard"
                    >
                      {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPasswordInput(generateSecurePassword())}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                    title="Generate a random secure password"
                  >
                    <Sparkles className="size-3" /> Generate new
                  </button>
                </div>
              </div>

              <div className="relative">
                <Input
                  id="staff-password-input"
                  type={showPassword ? "text" : "password"}
                  placeholder={passwordTarget?.hasExistingPassword ? "Prefilled password" : "Enter minimum 8 characters"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  minLength={8}
                  className="pr-10 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-0.5 size-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>

              {passwordTarget?.hasExistingPassword ? (
                <p className="text-[11px] text-muted-foreground">
                  The existing password is prefilled above. You can copy it, or edit / generate a new one and click <strong>Reset password</strong>.
                </p>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  No password was previously tracked for this account. Enter or generate a password, then click <strong>Reset password</strong>.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button variant="outline" onClick={() => setPasswordTarget(null)}>
              Close
            </Button>
            <Button
              onClick={() => resetPasswordMutation.mutate()}
              disabled={resetPasswordMutation.isPending || passwordInput.trim().length < 8}
            >
              {resetPasswordMutation.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <KeyRound className="mr-1.5 size-4" />}
              Reset password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
