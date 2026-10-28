import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, PackageOpen, ArrowUpRight } from "lucide-react";
import { usePos } from "./context";
import {
  formatNumericInput,
  numericInputEdit,
  numericInputError,
} from "./numeric-input";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { error, clearError, busy } = usePos();
  useEffect(() => {
    clearError();
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>("[data-autofocus]")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={36} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="stat">
      <div>
        {label}
        <ArrowUpRight size={16} />
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "type" | "value" | "defaultValue"
> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};
export function NumberInput({
  value,
  defaultValue = "",
  onValueChange,
  name,
  min = "0",
  max,
  step = "0.01",
  required = true,
  disabled,
  inputRef: externalInputRef,
  ...props
}: NumberInputProps) {
  const [internal, setInternal] = useState(String(defaultValue));
  const ownInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? ownInputRef;
  const raw = value === undefined ? internal : String(value);
  useEffect(() => {
    inputRef.current?.setCustomValidity(numericInputError(raw, min, max, step));
  }, [raw, min, max, step]);
  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => setInternal(String(defaultValue));
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  return (
    <>
      <input
        {...props}
        ref={inputRef}
        data-autofocus={props.autoFocus || undefined}
        type="text"
        inputMode={step === "1" || step === 1 ? "numeric" : "decimal"}
        required={required}
        disabled={disabled}
        value={formatNumericInput(raw)}
        onChange={(event) => {
          const result = numericInputEdit(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? 0,
            raw,
            (event.nativeEvent as InputEvent).inputType ?? "",
            Number(min) < 0,
          );
          if (!result) return;
          event.currentTarget.setCustomValidity(
            numericInputError(result.canonical, min, max, step),
          );
          setInternal(result.canonical);
          onValueChange?.(result.canonical === "-" ? "" : result.canonical);
          queueMicrotask(() =>
            inputRef.current?.setSelectionRange(result.caret, result.caret),
          );
        }}
      />
      {name && (
        <input type="hidden" name={name} value={raw} disabled={disabled} />
      )}
    </>
  );
}
