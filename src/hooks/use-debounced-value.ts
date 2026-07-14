import { useEffect, useState } from "react";

/**
 * Returns a debounced copy of `value`. Updates only after `delay` ms of inactivity.
 * Used to throttle expensive filter queries while typing.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
