// Host React bridge for externally-loaded plugins.
//
// An external plugin bundle that leaves `react` as an external import resolves
// it here (via the import map in index.html). We re-export the HOST app's own
// React instance so the plugin and the app share one React — otherwise a
// plugin's renderSetup/renderInspector hooks (useState, useEffect) would run on
// a second React copy and throw "invalid hook call". The host publishes its
// instance on window.__VOX_HOST__ before any plugin can load (see main.tsx).
const host = globalThis.__VOX_HOST__;
if (!host || !host.React) {
  throw new Error(
    'Vox Composer host React not ready — a plugin imported "react" before the app initialised it.',
  );
}
const R = host.React;

export default R;

// Named re-exports must be enumerated (you can't spread a namespace into
// `export const`). These are the React 18 APIs a plugin's UI is likely to use.
export const {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  useContext,
  useReducer,
  useId,
  useTransition,
  useDeferredValue,
  useSyncExternalStore,
  createElement,
  cloneElement,
  createContext,
  forwardRef,
  memo,
  Fragment,
  Children,
  isValidElement,
  StrictMode,
  Suspense,
  startTransition,
  version,
} = R;
