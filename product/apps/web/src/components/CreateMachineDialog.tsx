import { Trans, useLingui } from "@lingui/react/macro";
import type { MachineSize, MachineTemplate, SizePreset } from "@rookbox/contracts";
import {
  CreateMachineInput,
  IDLE_TIMEOUT_PRESETS_S,
  MachineName,
  presetOf,
  SIZE_LIMITS,
  SIZE_PRESETS,
} from "@rookbox/contracts";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Disclosure,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  toast,
} from "@rookbox/ui-web";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, orpc } from "../lib/api";
import { formatIdle } from "../lib/format";
import { ErrorNote, useToastError } from "./ErrorNote";
import { useSizeText } from "./SizeText";

const GIB = 1024;

/** Every create shares this key, so the machines list can show one that is still starting. */
export const MACHINE_CREATE_KEY = ["machine-create"] as const;

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const invalid = !Number.isInteger(value) || value < min || value > max;
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? "" : value}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </Field>
  );
}

/** Counts seconds while a create is running, so a slow first start does not look frozen. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

export function CreateMachineDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useLingui();
  const sizeText = useSizeText();
  const toastError = useToastError();
  const queryClient = useQueryClient();
  const config = useQuery(orpc.config.get.queryOptions({ staleTime: 60_000 }));
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<MachineTemplate | null>(null);
  const [size, setSize] = useState<MachineSize>(SIZE_PRESETS.small);
  const [idleTimeoutS, setIdleTimeoutS] = useState<number | null>(null);
  const preset = presetOf(size);
  const openRef = useRef(open);
  openRef.current = open;

  const templates = config.data?.templates ?? [];
  const chosenTemplate = template ?? templates[0] ?? null;
  const chosenIdle = idleTimeoutS ?? config.data?.defaultIdleTimeoutS ?? 900;
  const idleChoices = [
    ...new Set([...IDLE_TIMEOUT_PRESETS_S, config.data?.defaultIdleTimeoutS ?? 900]),
  ].sort((a, b) => a - b);

  const create = useMutation({
    mutationKey: MACHINE_CREATE_KEY,
    mutationFn: (input: CreateMachineInput) => api.machines.create(input),
    onSuccess: (machine) => {
      toast.success(t`${machine.name} is ready.`);
      if (openRef.current) onOpenChange(false);
      setName("");
      setSize(SIZE_PRESETS.small);
    },
    onError: (error) => {
      // With the dialog open the failure shows inside it; closed, it must not go unseen.
      if (!openRef.current) toastError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.machines.key() }),
  });

  const elapsed = useElapsed(create.isPending);
  const input = {
    name: name.trim() || undefined,
    template: chosenTemplate ?? "seed",
    size,
    idleTimeoutS: chosenIdle,
  };
  const nameInvalid = name.trim() !== "" && !MachineName.safeParse(name.trim()).success;
  const valid = chosenTemplate !== null && CreateMachineInput.safeParse(input).success;

  const presetLabels: Record<SizePreset, string> = {
    small: t`Small`,
    medium: t`Medium`,
    large: t`Large`,
  };

  const templateText: Record<MachineTemplate, { title: string; description: string }> = {
    desktop: {
      title: t`Desktop with browser`,
      description: t`A Linux desktop with Chromium you can open in a tab, plus a terminal.`,
    },
    "corvo-computer": {
      title: t`Computer-use desktop`,
      description: t`The desktop image built for AI agents that use a screen.`,
    },
    seed: {
      title: t`Terminal only`,
      description: t`Linux with root access and no screen. The fastest to start.`,
    },
  };

  const pending = create.isPending;
  const close = (next: boolean) => {
    // A create in flight keeps going if the dialog is closed; it reports when it is done.
    if (!next) create.reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>New machine</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>A private Linux machine that starts in seconds.</Trans>
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-10 text-center"
          >
            <Spinner className="size-6" aria-hidden="true" />
            <p className="text-heading3 font-semibold text-foreground">
              <Trans>Preparing the machine…</Trans>
            </p>
            <p className="max-w-xs text-body2 text-muted-foreground">
              {elapsed < 8 ? (
                <Trans>The first start of a template can take about 15 seconds.</Trans>
              ) : (
                <Trans>Still working. It's almost there.</Trans>
              )}
            </p>
            <p className="text-label text-muted-foreground tabular-nums">{t`${elapsed} s`}</p>
            <Button variant="ghost" className="h-11" onClick={() => onOpenChange(false)}>
              <Trans>Keep working, tell me when it's ready</Trans>
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (valid) create.mutate(input);
            }}
          >
            {create.isError ? (
              <ErrorNote error={create.error} onRetry={() => create.mutate(input)} />
            ) : null}

            <Field data-invalid={nameInvalid || undefined}>
              <FieldLabel htmlFor="machine-name">
                <Trans>Name</Trans>
              </FieldLabel>
              <Input
                id="machine-name"
                value={name}
                placeholder={t`Optional, for example research-agent`}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={nameInvalid || undefined}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              {nameInvalid ? (
                <FieldError>
                  <Trans>Use lowercase letters, digits and dashes.</Trans>
                </FieldError>
              ) : (
                <FieldDescription>
                  <Trans>Leave it empty and Rookbox picks one.</Trans>
                </FieldDescription>
              )}
            </Field>

            <FieldSet>
              <FieldLegend variant="label">
                <Trans>Type</Trans>
              </FieldLegend>
              {config.isError ? (
                <ErrorNote error={config.error} onRetry={() => config.refetch()} />
              ) : (
                <RadioGroup
                  value={chosenTemplate ?? ""}
                  onValueChange={(value) => setTemplate(value as MachineTemplate)}
                  className="grid-cols-1"
                >
                  {templates.map((value) => (
                    <FieldLabel key={value} htmlFor={`template-${value}`}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>{templateText[value].title}</FieldTitle>
                          <FieldDescription>{templateText[value].description}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem id={`template-${value}`} value={value} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              )}
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">
                <Trans>Size</Trans>
              </FieldLegend>
              <RadioGroup
                value={preset ?? ""}
                onValueChange={(value) => setSize(SIZE_PRESETS[value as SizePreset])}
                className="grid-cols-1 sm:grid-cols-3"
              >
                {(Object.keys(SIZE_PRESETS) as SizePreset[]).map((key) => (
                  <FieldLabel key={key} htmlFor={`size-${key}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{presetLabels[key]}</FieldTitle>
                        <FieldDescription className="text-label">
                          {sizeText(SIZE_PRESETS[key])}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem id={`size-${key}`} value={key} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              <Disclosure
                summary={
                  <span className="text-body2 text-muted-foreground">
                    <Trans>Custom size</Trans>
                  </span>
                }
                contentClassName="pt-3"
              >
                <div className="grid grid-cols-3 gap-3">
                  <NumberField
                    id="size-vcpu"
                    label={t`vCPU`}
                    value={size.vcpu}
                    min={SIZE_LIMITS.vcpu.min}
                    max={SIZE_LIMITS.vcpu.max}
                    onChange={(vcpu) => setSize({ ...size, vcpu })}
                  />
                  <NumberField
                    id="size-memory"
                    label={t`RAM (GiB)`}
                    value={size.memoryMib / GIB}
                    min={1}
                    max={SIZE_LIMITS.memoryMib.max / GIB}
                    onChange={(gib) => setSize({ ...size, memoryMib: gib * GIB })}
                  />
                  <NumberField
                    id="size-disk"
                    label={t`Disk (GiB)`}
                    value={size.diskMib / GIB}
                    min={SIZE_LIMITS.diskMib.min / GIB}
                    max={SIZE_LIMITS.diskMib.max / GIB}
                    onChange={(gib) => setSize({ ...size, diskMib: gib * GIB })}
                  />
                </div>
              </Disclosure>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">
                <Trans>Suspend when idle</Trans>
              </FieldLegend>
              <RadioGroup
                value={String(chosenIdle)}
                onValueChange={(value) => setIdleTimeoutS(Number(value))}
                className="grid-cols-2 sm:grid-cols-4"
              >
                {idleChoices.map((seconds) => (
                  <FieldLabel key={seconds} htmlFor={`idle-${seconds}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{formatIdle(seconds, i18n.locale)}</FieldTitle>
                      </FieldContent>
                      <RadioGroupItem id={`idle-${seconds}`} value={String(seconds)} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              <FieldDescription>
                <Trans>
                  A machine with no activity for this long is suspended and keeps its memory.
                  Restore it any time.
                </Trans>
              </FieldDescription>
            </FieldSet>

            <DialogFooter>
              <Button type="submit" className="h-11 px-[18px]" disabled={!valid}>
                <Trans>Create machine</Trans>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
