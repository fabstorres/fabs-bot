import { useEffect, useEffectEvent, useState, type DependencyList } from "react";

/** Load async data whenever `deps` change. `reload` runs the loader again. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string }>({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ data }),
      (e: Error) => live && setState((s) => ({ data: s.data, error: e.message })),
    );
    return () => {
      live = false;
    };
  }, [...deps, version]);
  return { ...state, reload: () => setVersion((v) => v + 1) };
}

/** Listen to a window event while the component is mounted, always calling the latest handler. */
export function useWindowEvent<K extends keyof WindowEventMap>(type: K, handler: (e: WindowEventMap[K]) => void) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => {
    const listener = (e: WindowEventMap[K]) => onEvent(e);
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [type]);
}

export function useNow(everyMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
