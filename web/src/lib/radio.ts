import type { KeyboardEvent } from "react";

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** Arrow keys move focus and selection through a `role="radiogroup"`'s enabled radios, wrapping at the ends. */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>) {
  const step = STEPS[e.key];
  if (!step) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const current = radios.indexOf(e.target as HTMLElement);
  if (current < 0) return;
  e.preventDefault();
  const next = radios[(current + step + radios.length) % radios.length]!;
  next.focus();
  next.click();
}

/** Gives a radio group one Tab stop: the selected option, or the first option when none is selected. */
export function radioTabIndex<T>(option: T, selected: T, options: readonly T[]) {
  return option === selected || (option === options[0] && !options.includes(selected)) ? 0 : -1;
}
