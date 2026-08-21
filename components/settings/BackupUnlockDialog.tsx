"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useSystemStore,
  RECOVERY_PHRASE_SHAPE_HINT,
  looksLikeRecoveryPhrase,
} from "@/store/system-store";

/**
 * Arms her backup key for the current session.
 *
 * Deliberately NOT a step of BackupRestoreDialog, though both take the same
 * secret. Restore replaces everything she remembers and needs its own confirm
 * step to say so; unlocking changes nothing and needs no confirmation at all.
 * Folding them together would put a destructive dialog's warnings in front of
 * a harmless action, or -- worse the other way -- make it a one-line edit to
 * send a phrase typed for unlocking to the route that overwrites her memory.
 *
 * There is no "verify" step here for the same reason the daemon has none:
 * deriving a key with no archive to decrypt cannot tell a right phrase from a
 * wrong-but-well-formed one. A wrong phrase unlocks and fails at the next
 * backup. Claiming to verify would be a check this cannot make.
 */
export function BackupUnlockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const unlockBackup = useSystemStore((s) => s.unlockBackup);

  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string; detail?: string } | null>(null);

  // Same guard as BackupRestoreDialog: the panel toggles `open` rather than
  // unmounting, so an unlock still in flight when the user dismisses would
  // otherwise write its outcome onto a dialog that looks freshly opened.
  const runRef = useRef(0);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      runRef.current += 1;
      setPhrase("");
      setError(null);
      setBusy(false);
      setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogTitle className="font-display text-lg font-bold text-bone">
          Unlock backups
        </DialogTitle>

        {result ? (
          <>
            <DialogDescription>
              {result.title}
              {result.detail ? ` — ${result.detail}` : ""}
            </DialogDescription>
            <DialogFooter>
              <Button variant="primary" size="sm" onClick={() => close(false)}>
                done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogDescription>
              She derives the encryption key from her recovery phrase and keeps it in memory only,
              so it is gone every time she restarts. Nothing is changed or overwritten — this just
              lets her start backing up again.
            </DialogDescription>
            <label
              htmlFor="unlock-phrase"
              className="mt-4 block font-mono text-[10px] uppercase tracking-wide text-bone-subtle"
            >
              recovery phrase
            </label>
            <input
              id="unlock-phrase"
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value);
                if (error) setError(null);
              }}
              // A recovery phrase is a secret on the level of a private key.
              // Browsers and password managers must not capture, autofill, or
              // spellcheck-upload it. Same treatment as the restore dialog.
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs text-bone focus:border-border-strong focus:outline-none"
            />
            {error && <p className="mt-1 font-mono text-[10px] text-fail">{error}</p>}
            <DialogFooter>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => close(false)}>
                cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  // Shape only, and only to save a round trip on an empty
                  // field or a stray paste. Not a security boundary: the
                  // daemon is the sole authority on whether the phrase is
                  // hers, and it cannot tell either until a backup runs.
                  if (!looksLikeRecoveryPhrase(phrase)) {
                    setError(RECOVERY_PHRASE_SHAPE_HINT);
                    return;
                  }
                  const run = runRef.current;
                  setBusy(true);
                  const outcome = await unlockBackup(phrase);
                  if (runRef.current !== run) return;
                  setBusy(false);
                  // The phrase leaves state the moment it has been sent --
                  // there is no reason for a secret to outlive the request.
                  setPhrase("");
                  setResult({ title: outcome.title, detail: outcome.detail });
                }}
              >
                {busy ? "unlocking…" : "unlock"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
