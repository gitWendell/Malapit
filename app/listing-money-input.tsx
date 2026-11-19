"use client";
import { useLayoutEffect, useRef } from "react";
import { formatMoneyInput, moneyInputCaret, moneyInputDigits } from "../lib/money-input";

type Props = { name: string; label: string; value: string; min: number; max: number; optional: boolean; onChange: (value: string) => void };
export default function ListingMoneyInput({ name, label, value, min, max, optional, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const amount = Number(value);
    input.current?.setCustomValidity(value && (!Number.isSafeInteger(amount) || amount < min || amount > max) ? `Enter an amount from ₱${formatMoneyInput(String(min))} to ₱${formatMoneyInput(String(max))}.` : "");
  }, [value, min, max]);
  return <label className="field"><span>{label}</span><input ref={input} name={name} aria-label={label} type="text" inputMode="numeric" autoComplete="off" required={!optional} placeholder={optional ? "Optional" : "e.g. 10,000"} value={formatMoneyInput(value)} onChange={event => {
    const element = event.currentTarget, typed = element.value;
    const digitsToRight = typed.slice(element.selectionStart ?? typed.length).replace(/\D/g, "").length;
    const digits = moneyInputDigits(typed);
    const formatted = formatMoneyInput(digits ?? value);
    element.value = formatted;
    if (digits !== null) onChange(digits);
    const caret = moneyInputCaret(formatted, digitsToRight);
    element.setSelectionRange(caret, caret);
    requestAnimationFrame(() => { if (element.isConnected && document.activeElement === element) element.setSelectionRange(caret, caret); });
  }} onKeyDown={event => {
    const element = event.currentTarget, start = element.selectionStart;
    if (start === null || start !== element.selectionEnd) return;
    if (event.key === "Backspace" && start > 0 && element.value[start - 1] === ",") element.setSelectionRange(start - 1, start - 1);
    if (event.key === "Delete" && element.value[start] === ",") element.setSelectionRange(start + 1, start + 1);
  }} /></label>;
}
