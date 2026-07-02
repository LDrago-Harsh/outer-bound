import * as React from "react";

import { smtpRepo, type SmtpAccount, type SmtpEncryption } from "./db";
import { isValidEmail } from "./validation";

export type SmtpForm = {
  name: string;
  host: string;
  port: string;
  username: string;
  password: string;
  encryption: SmtpEncryption;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  dailyLimit: string;
  isDefault: boolean;
};

export type SmtpFormErrors = Partial<Record<keyof SmtpForm, string>>;

function toForm(account: SmtpAccount | null): SmtpForm {
  return account
    ? {
        name: account.name,
        host: account.host,
        port: String(account.port),
        username: account.username,
        password: account.password,
        encryption: account.encryption,
        senderName: account.senderName,
        senderEmail: account.senderEmail,
        replyTo: account.replyTo,
        dailyLimit: account.dailyLimit ? String(account.dailyLimit) : "",
        isDefault: account.isDefault,
      }
    : {
        name: "",
        host: "",
        port: "587",
        username: "",
        password: "",
        encryption: "starttls",
        senderName: "",
        senderEmail: "",
        replyTo: "",
        dailyLimit: "",
        isDefault: false,
      };
}

function validate(form: SmtpForm): SmtpFormErrors {
  const errors: SmtpFormErrors = {};
  if (!form.host.trim()) errors.host = "Host is required";

  const port = Number(form.port);
  if (!form.port.trim()) errors.port = "Port is required";
  else if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.port = "Port must be between 1 and 65535";

  if (!form.username.trim()) errors.username = "Username is required";
  if (!form.password) errors.password = "Password is required";
  if (!form.senderName.trim()) errors.senderName = "Sender name is required";

  const senderEmail = form.senderEmail.trim();
  if (!senderEmail) errors.senderEmail = "Sender email is required";
  else if (!isValidEmail(senderEmail)) errors.senderEmail = "Invalid email format";

  const replyTo = form.replyTo.trim();
  if (replyTo && !isValidEmail(replyTo)) errors.replyTo = "Invalid email format";

  const dailyLimit = form.dailyLimit.trim();
  if (dailyLimit && (!Number.isInteger(Number(dailyLimit)) || Number(dailyLimit) < 0))
    errors.dailyLimit = "Must be a whole number";

  return errors;
}

// Editing logic for one SMTP account (or a new draft when account is null).
// Saving an account marked Default clears the flag on every other account.
export function useSmtpEditor(
  account: SmtpAccount | null,
  onSaved: (account: SmtpAccount, others: SmtpAccount[]) => void
) {
  const initial = React.useMemo(() => toForm(account), [account]);
  const [form, setForm] = React.useState<SmtpForm>(initial);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => setForm(initial), [initial]);

  const setField = <K extends keyof SmtpForm>(key: K, value: SmtpForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const errors = React.useMemo(() => validate(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const dirty = React.useMemo(
    () => (Object.keys(initial) as (keyof SmtpForm)[]).some((k) => form[k] !== initial[k]),
    [form, initial]
  );

  const reset = () => {
    setForm(initial);
    setSaveError(null);
  };

  const save = async (): Promise<SmtpAccount | null> => {
    if (!valid || saving || (!dirty && account)) return account;
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const saved: SmtpAccount = {
        id: account?.id ?? crypto.randomUUID(),
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port),
        username: form.username.trim(),
        password: form.password,
        encryption: form.encryption,
        senderName: form.senderName.trim(),
        senderEmail: form.senderEmail.trim(),
        replyTo: form.replyTo.trim(),
        dailyLimit: form.dailyLimit.trim() ? Number(form.dailyLimit) : 0,
        isDefault: form.isDefault,
        createdAt: account?.createdAt ?? now,
        updatedAt: now,
      };
      await smtpRepo.put(saved);

      // Only one default may exist.
      let others = (await smtpRepo.getAll()).filter((a) => a.id !== saved.id);
      if (saved.isDefault) {
        const toClear = others.filter((a) => a.isDefault);
        others = others.map((a) => (a.isDefault ? { ...a, isDefault: false } : a));
        await Promise.all(toClear.map((a) => smtpRepo.put({ ...a, isDefault: false })));
      }
      onSaved(saved, others);
      return saved;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save account");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { form, setField, errors, valid, dirty, saving, saveError, reset, save };
}
