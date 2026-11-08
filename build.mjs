import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist');
const result = await build({
  absWorkingDir: root, entryPoints: ['src/app.js'], bundle: true,
  outfile: 'bundle/app.js', write: false, minify: true,
  format: 'iife', target: ['es2022'], legalComments: 'inline',
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.eot': 'dataurl', '.svg': 'dataurl' }
});
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
const js = result.outputFiles.find((file) => file.path.endsWith('.js')).text;
const template = readFileSync(join(root, 'src', 'page.html'), 'utf8');
for (const token of ['__APP_CSS__', '__APP_JS__']) if (template.split(token).length !== 2) throw new Error(`Missing unique slot: ${token}`);
const licenses = [
  ['bpmn-js', readFileSync(join(root, 'node_modules', 'bpmn-js', 'LICENSE'), 'utf8')],
  ['bpmn-js-token-simulation', readFileSync(join(root, 'node_modules', 'bpmn-js-token-simulation', 'LICENSE'), 'utf8')]
].map(([name, text]) => `${name}\n${text}`).join('\n\n');
const html = template.replace('__APP_CSS__', () => css.replace(/<\/style/gi, '<\\/style')).replace('__APP_JS__', () => js.replace(/<\/script/gi, '<\\/script')) + `\n<!-- Third-party licenses\n${licenses.replaceAll('--', '—')}\n-->\n`;
mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'index.html'), html);
writeFileSync(join(output, 'THIRD-PARTY-LICENSES.txt'), licenses);
console.log(`Built offline interactive diagram: ${join(output, 'index.html')} (${Math.round(Buffer.byteLength(html) / 1024)} KB)`);
