import { Trans, useLingui } from "@lingui/react/macro";
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  InputRevealLabelsProvider,
  Spinner,
} from "@rookbox/ui-web";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { LanguageSelect } from "../components/LanguageSelect";
import { Logo } from "../components/Logo";
import { SESSION_ENDED_KEY, SESSION_KEY, SignInError, signIn } from "../lib/auth";

/** Shown instead of the dashboard when the real API is configured and nobody is signed in. */
export function LoginPage() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SignInError | null>(null);
  const ended = useQuery({
    queryKey: SESSION_ENDED_KEY,
    queryFn: () => false,
    staleTime: Number.POSITIVE_INFINITY,
    initialData: false,
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      await signIn(email.trim(), password);
      queryClient.setQueryData(SESSION_ENDED_KEY, false);
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    } catch (error) {
      setFailure(error instanceof SignInError ? error : new SignInError("server", "unknown"));
    } finally {
      setBusy(false);
    }
  };

  const message = (() => {
    if (!failure) return null;
    switch (failure.kind) {
      case "network":
        return t`Can't reach Rookbox. Check your connection and try again.`;
      case "rate_limited": {
        const minutes = Math.max(1, Math.ceil((failure.retryAfterS ?? 60) / 60));
        return t`Too many attempts. Try again in ${minutes} min.`;
      }
      case "server":
        return t`Rookbox had a problem. Try again in a minute.`;
      default:
        return t`Email or password is wrong.`;
    }
  })();

  return (
    <InputRevealLabelsProvider show={t`Show password`} hide={t`Hide password`}>
      <div className="flex min-h-full flex-col">
        <header className="flex h-15 shrink-0 items-center justify-between px-3 md:px-5">
          <Logo />
          <LanguageSelect />
        </header>
        <main className="grid flex-1 place-items-center px-4 pt-6 pb-16">
          <form
            onSubmit={submit}
            className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-6"
          >
            <Logo className="text-[26px]" />
            <div className="flex flex-col gap-1">
              <h1 className="text-heading2 font-semibold text-foreground">
                <Trans>Sign in</Trans>
              </h1>
              <p className="text-body1 text-muted-foreground">
                <Trans>Use the account you were given.</Trans>
              </p>
            </div>
            {ended.data ? (
              <p
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-border bg-muted p-3 text-body2 text-foreground"
              >
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Trans>Your session ended. Sign in again to continue.</Trans>
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor="login-email">
                <Trans>Email</Trans>
              </FieldLabel>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field data-invalid={message ? true : undefined}>
              <FieldLabel htmlFor="login-password">
                <Trans>Password</Trans>
              </FieldLabel>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={message ? true : undefined}
              />
              {message ? <FieldError role="alert">{message}</FieldError> : null}
            </Field>
            <Button type="submit" className="h-11 text-body1 font-semibold" disabled={busy}>
              {busy ? <Spinner aria-hidden="true" /> : null}
              <Trans>Sign in</Trans>
            </Button>
          </form>
        </main>
      </div>
    </InputRevealLabelsProvider>
  );
}
