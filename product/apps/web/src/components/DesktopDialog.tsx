import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@rookbox/ui-web";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { orpc } from "../lib/api";
import { useToastError } from "./ErrorNote";

/** How long the desktop gets to load before the dialog offers a retry. */
export const DESKTOP_LOAD_TIMEOUT_MS = 30_000;

type Phase = "loading" | "ready" | "stalled" | "failed";

/**
 * Opens the machine's desktop in a dialog on the same page. The API hands out a short-lived,
 * single-use link; the iframe loads it, and the desktop (its own origin, same site as the
 * dashboard) answers with a policy that lets only the dashboard frame it. Because a link works
 * once, every reconnect and the "new tab" fallback ask for a fresh one.
 */
export function OpenDesktopButton({ id, name }: { id: string; name: string }) {
  const { t } = useLingui();
  const toastError = useToastError();
  const link = useMutation(orpc.machines.desktopLink.mutationOptions());
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  const load = async () => {
    setPhase("loading");
    setSrc(null);
    try {
      const { url } = await link.mutateAsync({ id });
      setSrc(url);
    } catch (error) {
      setPhase("failed");
      toastError(error);
    }
  };

  const openNewTab = async () => {
    // Opened first, while the click still counts, so the browser does not take it for a pop-up.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { url } = await link.mutateAsync({ id });
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setOpen(false);
    } catch (error) {
      tab?.close();
      toastError(error);
    }
  };

  useEffect(() => {
    if (!open || phase !== "loading" || !src) return;
    const timer = window.setTimeout(() => setPhase("stalled"), DESKTOP_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [open, phase, src]);

  const start = () => {
    setOpen(true);
    void load();
  };
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setSrc(null);
  };

  const trouble = phase === "failed" || phase === "stalled";
  return (
    <>
      <Button
        variant="outline"
        className="mt-2 h-11 px-3"
        onClick={start}
        disabled={link.isPending && !open}
      >
        {link.isPending && !open ? <Spinner /> : null}
        <Trans>Open desktop</Trans>
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none grid-rows-[auto_1fr] gap-3 p-4 sm:max-w-none"
          data-testid="desktop-dialog"
        >
          <DialogHeader className="flex-row flex-wrap items-center gap-x-3 gap-y-2 pr-10">
            <div className="mr-auto min-w-0">
              <DialogTitle className="truncate">
                <Trans>Desktop of {name}</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>Closing this window does not stop the machine.</Trans>
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={link.isPending}
            >
              <RefreshCw aria-hidden="true" />
              <Trans>Reconnect</Trans>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openNewTab()}
              disabled={link.isPending}
            >
              <ExternalLink aria-hidden="true" />
              <Trans>Open in a new tab</Trans>
            </Button>
          </DialogHeader>
          <div className="relative min-h-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
            {src ? (
              <iframe
                key={src}
                title={t`Desktop of ${name}`}
                src={src}
                className="size-full border-0"
                allow="clipboard-read; clipboard-write; fullscreen"
                referrerPolicy="no-referrer"
                onLoad={() => setPhase((current) => (current === "failed" ? current : "ready"))}
                onError={() => setPhase("failed")}
              />
            ) : null}
            {phase === "loading" ? (
              <div
                role="status"
                className="absolute inset-0 flex items-center justify-center gap-2 bg-muted text-body1 text-muted-foreground"
              >
                <Spinner aria-hidden="true" />
                <Trans>Starting the desktop. The first time can take a few seconds.</Trans>
              </div>
            ) : null}
            {trouble ? (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center"
              >
                <p className="m-0 text-body1">
                  <Trans>The desktop did not open.</Trans>
                </p>
                <Button onClick={() => void load()} disabled={link.isPending}>
                  <RefreshCw aria-hidden="true" />
                  <Trans>Try again</Trans>
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
