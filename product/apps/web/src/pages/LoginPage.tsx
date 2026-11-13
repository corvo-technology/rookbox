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
import { useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { SESSION_KEY, SignInError, signIn } from "../lib/auth";

/** Shown instead of the dashboard when the real API is configured and nobody is signed in. */
export function LoginPage() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    } catch (failure) {
      setError(
        failure instanceof SignInError && failure.kind === "network"
          ? t`Can't reach Rookbox. Check your connection and try again.`
          : t`Email or password is wrong.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <InputRevealLabelsProvider show={t`Show password`} hide={t`Hide password`}>
      <main className="grid min-h-full place-items-center px-4 py-10">
        <form
          onSubmit={submit}
          className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-card p-6"
        >
          <Logo className="text-[24px]" />
          <div className="flex flex-col gap-1">
            <h1 className="text-heading2 font-semibold text-foreground">
              <Trans>Sign in</Trans>
            </h1>
            <p className="text-body1 text-muted-foreground">
              <Trans>Use the account you were given.</Trans>
            </p>
          </div>
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
          <Field data-invalid={error ? true : undefined}>
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
              aria-invalid={error ? true : undefined}
            />
            {error ? <FieldError role="alert">{error}</FieldError> : null}
          </Field>
          <Button type="submit" className="h-11 text-body1 font-semibold" disabled={busy}>
            {busy ? <Spinner aria-hidden="true" /> : null}
            <Trans>Sign in</Trans>
          </Button>
        </form>
      </main>
    </InputRevealLabelsProvider>
  );
}
