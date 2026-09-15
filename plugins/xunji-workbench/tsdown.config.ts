import { defineConfig } from 'tsdown'

const moduleId = 'xunji-workbench'
const external = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/dsh-api-remotes/client',
]

export default defineConfig([
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    clean: true,
    dts: false,
    deps: { neverBundle: external },
    format: 'iife',
    globalName: 'XunjiWorkbench',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    outputOptions: { entryFileNames: '[name].js' },
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(moduleId)}, factory: (require) => { const react = require('react'); const react_jsx_runtime = require('react/jsx-runtime');`,
    footer: 'return XunjiWorkbench; }});',
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    clean: false,
    dts: { emitDtsOnly: true },
    deps: { neverBundle: external },
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  },
  {
    entry: { index: 'src/index.ts', workflows: 'src/client/workflows.ts' },
    outDir: 'lib',
    clean: false,
    dts: true,
    format: 'esm',
    platform: 'node',
    fixedExtension: false,
    target: 'node22',
    sourcemap: true,
  },
])
