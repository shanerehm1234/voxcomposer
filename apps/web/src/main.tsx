import { StrictMode } from 'react';
import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import * as VoxPluginSdk from '@voxcomposer/plugin-sdk';
import { App } from './App.js';
import { publishPluginHost, loadInstalledPlugins } from './plugins/loader.js';
import './styles/index.css';

// Publish the host's React + JSX runtime + plugin SDK so externally-installed
// plugin bundles can share them (see public/vox-host-*.js + the import map in
// index.html). Must happen before any plugin can be imported.
publishPluginHost({ React, jsxRuntime: ReactJsxRuntime, sdk: VoxPluginSdk });

// Restore plugins the user installed by URL in a previous session. Best-effort
// and non-blocking — a broken/removed plugin URL must never stop the app.
void loadInstalledPlugins();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
