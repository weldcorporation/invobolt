"use client";

/** Small, unopinionated form primitives shared by the invoice form. */

import type { ReactNode } from "react";

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-bolt-amber focus:ring-2 focus:ring-bolt-amber/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputBase} ${className}`} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { className = "", ...rest } = props;
  return (
    <textarea {...rest} className={`${inputBase} resize-y ${className}`} />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${inputBase} ${className}`}>
      {children}
    </select>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/60">
      <h2 className="mb-3 text-sm font-semibold text-ink dark:text-neutral-100">
        {title}
      </h2>
      {children}
    </section>
  );
}
