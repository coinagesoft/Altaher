import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteCandidateDocument, getDocumentLink } from "@/lib/operations.functions";

export function DocumentLink({ documentId, onDeleted }: { documentId: string; onDeleted?: () => void }) {
  const link = useServerFn(getDocumentLink);
  const remove = useServerFn(deleteCandidateDocument);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function open(download: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await link({ data: { documentId, download } });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError((openError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    setError("");
    try {
      await remove({ data: { documentId } });
      onDeleted?.();
    } catch (deleteError) {
      setError((deleteError as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(false)}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />} View
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(true)}>
        <Download className="size-3.5" /> Download
      </Button>
      {onDeleted ? (
        confirming ? (
          <>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void destroy()}>Confirm delete</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(true)} aria-label="Delete document">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
