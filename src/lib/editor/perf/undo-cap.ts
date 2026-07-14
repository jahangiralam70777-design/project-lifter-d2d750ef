// Phase-4 — Undo/Redo stack hardening.
// Caps stack sizes to prevent Zustand memory bloat under heavy editing.

export const MAX_UNDO = 100;
export const MAX_REDO = 50;

export function capStack<T>(stack: T[], max: number): T[] {
  if (stack.length <= max) return stack;
  return stack.slice(stack.length - max);
}

export function pushCapped<T>(stack: T[], item: T, max: number): T[] {
  const next = stack.length >= max ? stack.slice(stack.length - max + 1) : stack.slice();
  next.push(item);
  return next;
}
