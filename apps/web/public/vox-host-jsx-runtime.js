// Host React automatic-JSX runtime bridge for externally-loaded plugins.
//
// Plugins compiled with the automatic JSX runtime (tsconfig "jsx": "react-jsx")
// emit `import { jsx as _jsx } from "react/jsx-runtime"`. The import map in
// index.html points that at this file so those calls use the HOST's runtime and
// share its single React instance. See vox-host-react.js for the why.
const host = globalThis.__VOX_HOST__;
if (!host || !host.jsxRuntime) {
  throw new Error(
    'Vox Composer host JSX runtime not ready — a plugin imported "react/jsx-runtime" too early.',
  );
}
const J = host.jsxRuntime;

export const jsx = J.jsx;
export const jsxs = J.jsxs;
export const Fragment = J.Fragment;
