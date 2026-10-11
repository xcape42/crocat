import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';

const modules = new Map();
function load(file) {
  const path = file.replace(/^@\//, '') + (file.endsWith('.ts') ? '' : '.ts');
  if (modules.has(path)) return modules.get(path);
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  modules.set(path, module.exports);
  const wrapped = vm.runInNewContext(`(function(require, module, exports) {\n${js}\n})`, {});
  wrapped((specifier) => load(specifier), module, module.exports);
  return module.exports;
}

const { WORLD_OPTIONS } = load('src/theme/worlds.ts');
const { MASCOT_COLOR_OPTIONS, mascotColor, mascotInk } = load('src/theme/mascots.ts');
const { mascotColorsForWorld } = load('src/features/profile/options.ts');

const legacy = {
  moss: '#BBD68A',
  lime: '#D9DD8A',
  coral: '#FFB49E',
  blue: '#93BDD1',
  violet: '#B9B8E9',
  peach: '#F0B78F',
  mint: '#9CCDB9',
  halo: '#FFFDF8',
  ember: '#B30F2E',
  shadow: '#151119',
  royal: '#D7B34A',
};

assert.equal(new Set(MASCOT_COLOR_OPTIONS.map((option) => option.key)).size, MASCOT_COLOR_OPTIONS.length);
for (const [key, hex] of Object.entries(legacy)) {
  assert.equal(mascotColor(key), hex, `Legacy mascot color changed: ${key}`);
}
assert.equal(mascotColor('black'), '#101010');
assert.equal(mascotColor('white'), '#FFFFFF');

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function ratio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

for (const option of MASCOT_COLOR_OPTIONS) {
  assert.match(option.hex, /^#[a-fA-F0-9]{6}$/);
  assert.ok(ratio(option.hex, mascotInk(option.key)) >= 4.5,
    `${option.key} must have contrast-safe face ink`);
}

for (const world of WORLD_OPTIONS) {
  const options = mascotColorsForWorld(world.key);
  const own = options.filter((option) => option.worldKey === world.key);
  assert.ok(own.length >= 3, `${world.key} requires at least three unique colors`);
  assert.equal(new Set(own.map((option) => option.hex)).size, own.length);
  assert.ok(options.some((option) => option.key === 'black'));
  assert.ok(options.some((option) => option.key === 'white'));
  assert.equal(options.length, own.length + 2);
  assert.ok(options.every((option) => !option.worldKey || option.worldKey === world.key));
}

const kept = mascotColorsForWorld('moon', 'royal');
assert.equal(kept.filter((color) => color.key === 'royal').length, 1);
assert.equal(kept.at(-1).key, 'royal');
assert.equal(mascotColorsForWorld('royal', 'royal').filter((c) => c.key === 'royal').length, 1);
assert.equal(mascotColorsForWorld('halo', 'white').filter((c) => c.key === 'white').length, 1);
assert.equal(mascotColorsForWorld('ink').filter((c) => c.worldKey === 'moon').length, 3);

console.log('Crocat 1.8.7: all seven World palettes, legacy colors, universal neutrals, contrast and saved cross-World colors passed.');
