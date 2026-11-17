import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { wrap } from './gait.js';
import { GAITS } from './gaits.js';
import { createCat } from './cat-rig.js';
import { materials } from './wire-geometry.js';
import './style.css';
const viewport = document.querySelector('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x101112, 0.055);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.minDistance = 3.2;
orbit.maxDistance = 10;
orbit.maxPolarAngle = Math.PI * 0.51;
const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const rig = createCat(scene);

// Subtle ground references move at the same velocity as planted paws.
const ground = new THREE.Group();
scene.add(ground);
const groundInk = new THREE.LineBasicMaterial({ color: 0x737773, transparent: true, opacity: 0.17 });
const groundLines=[];
for (let i = -14; i <= 14; i++) groundLines.push(v(i * 0.42, -0.004, -2.5), v(i * 0.42, -0.004, 2.5));
for (let i = -5; i <= 5; i++) groundLines.push(v(-6, -0.004, i * 0.5), v(6, -0.004, i * 0.5));
ground.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(groundLines),groundInk));

// Chinese and English interface text. Keys match data-i18n / data-i18n-label in index.html.
const STRINGS = {
  'zh-Hant': {
    title: 'FELIS — 貓科步態研究', viewport: '可拖曳旋轉的貓咪跑步線框模型', keyframes: '關鍵姿態',
    key1: '01 全速伸展', key2: '02 前肢承重', key3: '03 收腹騰空', key4: '04 後肢推蹬',
    hint: '拖曳旋轉 · 滾輪縮放', phase: '步態週期', phaseLabel: '步態週期，拖動時暫停', speed: '播放速度',
    views: '觀察角度', side: '側面', three: '立體', front: '正面', skeleton: '顯示骨架', xray: '透視線框',
    pause: '暫停', play: '播放', toLight: '日光模式', toDark: '深色模式', toLightLabel: '切換到日光模式', toDarkLabel: '切換到深色模式',
    lang: 'EN', langLabel: 'Switch to English',
    gaits: '步態', walk: '走路', gallop: '跑步',
    walk1: '01 左後落地', walk2: '02 左前落地', walk3: '03 右後落地', walk4: '04 右前落地',
  },
  en: {
    title: 'FELIS — Feline Gait Study', viewport: 'Wireframe model of a galloping cat; drag to rotate', keyframes: 'Key poses',
    key1: '01 Extension', key2: '02 Fore stance', key3: '03 Gathered flight', key4: '04 Hind push-off',
    hint: 'Drag to rotate · Scroll to zoom', phase: 'Gait cycle', phaseLabel: 'Gait cycle; dragging pauses playback', speed: 'Speed',
    views: 'View', side: 'Side', three: '3/4', front: 'Front', skeleton: 'Skeleton', xray: 'X-ray',
    pause: 'Pause', play: 'Play', toLight: 'Light', toDark: 'Dark', toLightLabel: 'Switch to light mode', toDarkLabel: 'Switch to dark mode',
    lang: '中文', langLabel: '切換到中文',
    gaits: 'Gait', walk: 'Walk', gallop: 'Gallop',
    walk1: '01 Left hind down', walk2: '02 Left fore down', walk3: '03 Right hind down', walk4: '04 Right fore down',
  },
};
const tr = (key) => STRINGS[document.documentElement.lang === 'en' ? 'en' : 'zh-Hant'][key];
const langButton = document.querySelector('#lang');
function applyLanguage(lang) {
  document.documentElement.lang = lang;
  document.title = tr('title');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', tr(el.dataset.i18nLabel)));
  langButton.textContent = tr('lang');
  langButton.setAttribute('aria-label', tr('langLabel'));
}
langButton.addEventListener('click', () => {
  const next = document.documentElement.lang === 'en' ? 'zh-Hant' : 'en';
  try { localStorage.setItem('felis-lang', next); } catch {}
  applyLanguage(next);
  applyTheme(document.documentElement.dataset.theme);
  setPlaying(playing);
});
applyLanguage(document.documentElement.lang === 'en' ? 'en' : 'zh-Hant');

// Dark and daylight themes: the page colours come from CSS, the scene's from here.
const THEMES = {
  dark: { bg: 0x101112, line: 0xd8d9d4, bone: 0xffffff, ground: 0x737773, groundOpacity: 0.17 },
  light: { bg: 0xf1f0eb, line: 0x1e211f, bone: 0x111311, ground: 0x8c8f88, groundOpacity: 0.2 },
};
const themeButton = document.querySelector('#theme');
const themeMeta = document.querySelector('meta[name="theme-color"]');
function applyTheme(name) {
  const t = THEMES[name];
  document.documentElement.dataset.theme = name;
  scene.fog.color.setHex(t.bg);
  for (const key of ['ink', 'fine', 'grid']) materials[key].color.setHex(t.line);
  materials.bone.color.setHex(t.bone);
  groundInk.color.setHex(t.ground); groundInk.opacity = t.groundOpacity;
  themeMeta.content = `#${t.bg.toString(16).padStart(6, '0')}`;
  themeButton.textContent = name === 'light' ? tr('toDark') : tr('toLight');
  themeButton.setAttribute('aria-label', name === 'light' ? tr('toDarkLabel') : tr('toLightLabel'));
}
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  try { localStorage.setItem('felis-theme', next); } catch {}
  applyTheme(next);
});

let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches, phase = 0, speed = 1, distance = 0;
const play = document.querySelector('#play');
function setPlaying(value) {
  playing = value;
  play.textContent = playing ? 'Ⅱ' : '▷';
  play.setAttribute('aria-label', playing ? tr('pause') : tr('play'));
}
play.addEventListener('click', () => setPlaying(!playing));
setPlaying(playing);
const phaseInput = document.querySelector('#phase');
phaseInput.addEventListener('input', () => { setPlaying(false); phase = Number(phaseInput.value); });
document.querySelector('#speed').addEventListener('input', (e) => { speed = Number(e.target.value); document.querySelector('#speed-value').value = `${speed.toFixed(2)}×`; });
document.querySelector('#skeleton').addEventListener('change', (e) => { rig.skeleton.visible = e.target.checked; });
document.querySelector('#xray').addEventListener('change', (e) => { materials.depth.depthTest = !e.target.checked; materials.depth.depthWrite = !e.target.checked; });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'BUTTON'].includes(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!playing); }
  if (e.code === 'ArrowRight' && document.activeElement.tagName !== 'INPUT') { setPlaying(false); phase = wrap(phase + 0.01); }
  if (e.code === 'ArrowLeft' && document.activeElement.tagName !== 'INPUT') { setPlaying(false); phase = wrap(phase - 0.01); }
});
function setView(view) {
  camera.position.copy({ side: v(0.48, 1.13, 6.0), three: v(3.3, 1.9, 5.4), front: v(6.0, 1.15, 0.03) }[view]);
  orbit.target.set(-0.36, 0.72, 0);
  orbit.update();
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
}
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
orbit.addEventListener('start', () => document.querySelectorAll('[data-view]').forEach((button) => button.classList.remove('active')));
document.querySelectorAll('[data-phase]').forEach(button => button.addEventListener('click', () => { setPlaying(false); phase=Number(button.dataset.phase); }));
// Walk or gallop. The key-pose buttons follow the chosen gait.
let gait = 'gallop';
function setGait(name) {
  gait = name;
  document.querySelectorAll('[data-gait]').forEach((button) => button.classList.toggle('active', button.dataset.gait === name));
  document.querySelectorAll('[data-phase]').forEach((button, i) => {
    const [p, key] = GAITS[name].keyframes[i];
    button.dataset.phase = p; button.dataset.i18n = key; button.textContent = tr(key);
  });
  lastPhase = NaN;
}
document.querySelectorAll('[data-gait]').forEach((button) => button.addEventListener('click', () => setGait(button.dataset.gait)));
setView('side');
// Dev-only handle for close-up inspection of the model from the console.
if (import.meta.env.DEV) window.__felis = { camera, orbit, rig, renderer, setPhase: (p) => { setPlaying(false); phase = p; }, setGait: (g) => setGait(g) };
const controlsBar = document.querySelector('.controls');
new ResizeObserver(() => {
  const top = viewport.getBoundingClientRect().bottom - controlsBar.getBoundingClientRect().top;
  document.documentElement.style.setProperty('--bar-top', `${Math.round(top)}px`);
}).observe(controlsBar);
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.zoom = Math.min(1, camera.aspect / 1.35);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
const clock = new THREE.Clock();
let lastPhase=NaN,lastBones=false;
const phaseValue=document.querySelector('#phase-value');
const phaseButtons=[...document.querySelectorAll('[data-phase]')];
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (playing) {
    const advance = dt * speed * GAITS[gait].CYCLE_HZ;
    phase = wrap(phase + advance);
    distance += advance * GAITS[gait].STRIDE;
    ground.position.x = -(distance % 0.42);
  }
  if(phase!==lastPhase||rig.skeleton.visible!==lastBones){
  rig.pose(phase,gait);
  lastPhase=phase;lastBones=rig.skeleton.visible;
  const {gaitStage}=GAITS[gait];
  const label=gaitStage(phase);
  phaseButtons.forEach(button => {
    const p=Number(button.dataset.phase);
    const active = gaitStage(p)===label;
    button.classList.toggle('current',active);
  });
  phaseInput.value = phase;
  phaseValue.value = `${Math.round(phase * 100).toString().padStart(2, '0')}%`;
  }
  orbit.update();
  rig.updateContour(camera);
  renderer.render(scene, camera);
}
animate();
