// Screens open on top of each other (a client, then one of their emails…), and Android's back
// button closes the top one. Screens underneath stay as they were; after a change, close with
// pop({ changed: true }) and screens that use useRefresh() load their data again.
import { App as CapApp } from '@capacitor/app';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Nav = { push: (screen: ReactNode) => void; pop: (o?: { changed?: boolean }) => void; refresh: number; changed: () => void };
const Ctx = createContext<Nav>(null as never);
export const useNav = () => useContext(Ctx);
/** A number that goes up after a change somewhere: put it in a useEffect's list to load again. */
export const useRefresh = () => useContext(Ctx).refresh;

export function NavProvider({ root }: { root: ReactNode }) {
  const [stack, setStack] = useState<{ id: number; screen: ReactNode }[]>([]);
  const [refresh, setRefresh] = useState(0);
  const next = useRef(1);
  const push = useCallback((screen: ReactNode) => setStack((s) => [...s, { id: next.current++, screen }]), []);
  const pop = useCallback((o: { changed?: boolean } = {}) => {
    setStack((s) => s.slice(0, -1));
    if (o.changed) setRefresh((n) => n + 1);
  }, []);
  const changed = useCallback(() => setRefresh((n) => n + 1), []);
  const depth = useRef(0);
  depth.current = stack.length;
  useEffect(() => {
    const l = CapApp.addListener('backButton', () => {
      // A pop-up (dialog) open: close it first.
      const dlg = [...document.querySelectorAll('dialog[open]')].pop() as HTMLDialogElement | undefined;
      if (dlg) { dlg.close(); return; }
      if (depth.current) pop();
      else CapApp.minimizeApp();
    });
    return () => { l.then((x) => x.remove()); };
  }, [pop]);
  return (
    <Ctx.Provider value={{ push, pop, refresh, changed }}>
      <div className="layer" hidden={stack.length > 0}>{root}</div>
      {stack.map((s, i) => (
        <div key={s.id} className="layer" hidden={i < stack.length - 1}>{s.screen}</div>
      ))}
    </Ctx.Provider>
  );
}
