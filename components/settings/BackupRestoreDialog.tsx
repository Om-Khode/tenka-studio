"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useSystemStore,
  RECOVERY_PHRASE_SHAPE_HINT,
  looksLikeRecoveryPhrase,
} from "@/store/system-store";
import type { RestoreStep } from "@/types/system";

export function BackupRestoreDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const restoreBackup = useSystemStore((s) => s.restoreBackup);

  const [step, setStep] = useState<RestoreStep>("phrase");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Title AND detail. The store distinguishes "she could not open that
  // backup" from "this device may not do that" in the detail line, and this
  // dialog is the only place that outcome is ever shown -- it does not go
  // through a toast -- so dropping the detail dropped the distinction.
  const [result, setResult] = useState<{ title: string; detail?: string } | null>(null);

  // BackupPanel never unmounts this dialog -- it only toggles the `open`
  // prop -- so a restore that is still awaiting `restoreBackup` when the
  // user dismisses (Escape / overlay click, neither of which the
  // "verifying" step gates) survives the reset below and its continuation
  // would otherwise land on a dialog that looks freshly reopened. Bumping
  // this token in close() invalidates any in-flight run so its continuation
  // becomes a no-op instead of resurrecting stale state.
  const runRef = useRef(0);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      runRef.current += 1;
      setStep("phrase");
      setPhrase("");
      setError(null);
      setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogTitle className="font-display text-lg font-bold text-bone">
          Restore from backup
        </DialogTitle>

        {step === "phrase" && (
          <>
            {/*
              No word count here. Studio has no route that reports how long
              her phrase is, and the number that used to sit in this sentence
              (8) was one BIP39 cannot produce -- so this told every user a
              false fact about their own recovery phrase before the gate
              below refused it.
            */}
            <DialogDescription>
              Her recovery phrase decrypts the archive. Without it the backup is unreadable —
              including to us.
            </DialogDescription>
            <label htmlFor="recovery-phrase" className="mt-4 block font-mono text-[10px] uppercase tracking-wide text-bone-subtle">
              recovery phrase
            </label>
            <input
              id="recovery-phrase"
              value={phrase}
              onChange={(e) => {
                setPhrase(e.target.value);
                setError(null);
              }}
              // A real recovery phrase is a secret on the level of a private
              // key. Browsers and password managers must not capture,
              // autofill, or spellcheck-upload it once this is wired to the
              // real daemon in spec 5.
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-xs text-bone focus:border-border-strong focus:outline-none"
            />
            {/* Field validation belongs next to the field, not in a toast. */}
            {error && <p className="mt-1 font-mono text-[10px] text-fail">{error}</p>}
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={() => close(false)}>
                cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  /*
                    Milestone-4 blocker 4: this used to compare `phrase`
                    against `VALID_RECOVERY_PHRASE`, a constant that shipped
                    in the public JS bundle -- any live Studio user could
                    have typed it to restore (overwrite) a real assistant's
                    memory, regardless of that instance's actual recovery
                    phrase. There is no correctness check left client-side:
                    this is a word-count sanity check only (catches an empty
                    field or an obviously wrong paste before spending a
                    network round trip), not a security boundary. The real
                    check -- and the real mutation -- happens exactly once,
                    inside restoreBackup(), at the "overwrite" button below.

                    The message states the FORMAT's legal lengths, not a
                    length of hers -- see RECOVERY_PHRASE_SHAPE_HINT. The
                    gate now admits every one of them, so a phrase the
                    daemon would accept can always reach it; the old `=== 8`
                    could admit none.
                  */
                  if (!looksLikeRecoveryPhrase(phrase)) {
                    setError(RECOVERY_PHRASE_SHAPE_HINT);
                    return;
                  }
                  setStep("confirm");
                }}
              >
                verify
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogDescription>
              This replaces everything she currently remembers with the snapshot from that backup.
              It cannot be undone from here.
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={() => setStep("phrase")}>
                back
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-fail text-bone hover:bg-fail/85"
                onClick={async () => {
                  const run = ++runRef.current;
                  setStep("verifying");
                  const outcome = await restoreBackup(phrase);
                  if (runRef.current !== run) return; // dialog was closed mid-verify
                  setResult({ title: outcome.title, detail: outcome.detail });
                  setStep("result");
                }}
              >
                overwrite her memory
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "verifying" && <DialogDescription>Restoring…</DialogDescription>}

        {step === "result" && (
          <>
            <DialogDescription>{result?.title}</DialogDescription>
            {result?.detail && (
              <p className="mt-1 text-xs text-bone-dim">{result.detail}</p>
            )}
            <DialogFooter>
              <Button variant="primary" size="sm" onClick={() => close(false)}>
                done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
