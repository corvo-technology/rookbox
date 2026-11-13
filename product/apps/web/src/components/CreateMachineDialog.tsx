import { Trans, useLingui } from "@lingui/react/macro";
import type { MachineSize, MachineTemplate, SizePreset } from "@rookbox/contracts";
import {
  AVAILABLE_TEMPLATES,
  CreateMachineInput,
  MachineName,
  presetOf,
  SIZE_LIMITS,
  SIZE_PRESETS,
} from "@rookbox/contracts";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../lib/api";
import { useSizeText } from "./SizeText";

const GIB = 1024;

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

export function CreateMachineDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const sizeText = useSizeText();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<MachineTemplate>("seed");
  const [size, setSize] = useState<MachineSize>(SIZE_PRESETS.small);
  const preset = presetOf(size);

  const create = useMutation(
    orpc.machines.create.mutationOptions({
      onSuccess: () => {
        onOpenChange(false);
        setName("");
        setSize(SIZE_PRESETS.small);
      },
      onError: () => toast.error(t`The machine wasn't created. Try again.`),
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.machines.key() }),
    }),
  );

  const input = { name: name.trim() || undefined, template, size };
  const nameInvalid = name.trim() !== "" && !MachineName.safeParse(name).success;
  const valid = CreateMachineInput.safeParse(input).success;

  const presetLabels: Record<SizePreset, string> = {
    small: t`Small`,
    medium: t`Medium`,
    large: t`Large`,
  };

  const templates: { value: MachineTemplate; description: string }[] = [
    { value: "seed", description: t`Linux with root access.` },
    { value: "desktop", description: t`Linux with a desktop and a browser.` },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>New machine</Trans>
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate(input);
          }}
        >
          <Field data-invalid={nameInvalid || undefined}>
            <FieldLabel htmlFor="machine-name">
              <Trans>Name</Trans>
            </FieldLabel>
            <Input
              id="machine-name"
              value={name}
              placeholder={t`Optional`}
              autoComplete="off"
              aria-invalid={nameInvalid || undefined}
              onChange={(event) => setName(event.currentTarget.value)}
            />
            {nameInvalid ? (
              <FieldError>
                <Trans>Use lowercase letters, digits and dashes.</Trans>
              </FieldError>
            ) : null}
          </Field>

          <FieldSet>
            <FieldLegend variant="label">
              <Trans>Template</Trans>
            </FieldLegend>
            <RadioGroup
              value={template}
              onValueChange={(value) => setTemplate(value as MachineTemplate)}
              className="grid-cols-1 sm:grid-cols-2"
            >
              {templates.map(({ value, description }) => {
                const available = AVAILABLE_TEMPLATES.includes(value);
                return (
                  <FieldLabel key={value} htmlFor={`template-${value}`}>
                    <Field orientation="horizontal" data-disabled={!available || undefined}>
                      <FieldContent>
                        <FieldTitle className="font-mono">
                          {value}
                          {available ? null : (
                            <Badge variant="outline" className="font-sans">
                              <Trans>Coming soon</Trans>
                            </Badge>
                          )}
                        </FieldTitle>
                        <FieldDescription>{description}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        id={`template-${value}`}
                        value={value}
                        disabled={!available}
                      />
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
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
                  <Trans>Advanced</Trans>
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

          <DialogFooter>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? <Spinner /> : null}
              <Trans>Create machine</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
