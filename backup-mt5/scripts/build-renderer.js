/**
 * Build renderer with esbuild for browser module resolution
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// CSS loader plugin
const cssLoaderPlugin = {
  name: 'css-loader',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, 'utf8');
      return {
        contents: `
          const style = document.createElement('style');
          style.textContent = ${JSON.stringify(css)};
          document.head.appendChild(style);
        `,
        loader: 'js',
      };
    });
  },
};

esbuild.build({
  entryPoints: [path.join(__dirname, '../src/renderer/renderer.tsx')],
  bundle: true,
  outfile: path.join(__dirname, '../dist/renderer/renderer.js'),
  format: 'esm',
  target: ['ES2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  external: [],
  sourcemap: true,
  plugins: [cssLoaderPlugin],
}).catch(() => process.exit(1));
