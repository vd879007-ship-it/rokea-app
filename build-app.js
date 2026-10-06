const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const WWW_DIR = path.join(ROOT_DIR, 'www');

// Ensure www exists and is clean
if (fs.existsSync(WWW_DIR)) {
  fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });

// Copy file helper
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    const parentDir = path.dirname(dest);
    if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Copy directory helper
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Copy All HTML Pages
const htmlFiles = [
  'index.html',
  'collections.html',
  'product-details.html',
  'about.html',
  'contact.html',
  'custom-blouse-order.html',
  'blouse-designs.html',
  'ai-stylist.html',
  'temp_fetch.html',
  'middle.html'
];
htmlFiles.forEach(f => copyFile(path.join(ROOT_DIR, f), path.join(WWW_DIR, f)));

// 2. Copy CSS
const cssFiles = ['style.css', 'mobile.css', 'custom-blouse.css', 'form.css'];
cssFiles.forEach(f => copyFile(path.join(ROOT_DIR, f), path.join(WWW_DIR, f)));

// 3. Copy Client JS
const jsFiles = ['script.js', 'config.js'];
jsFiles.forEach(f => copyFile(path.join(ROOT_DIR, f), path.join(WWW_DIR, f)));

// 4. Copy Static Assets & Icons
copyDir(path.join(ROOT_DIR, 'assets'), path.join(WWW_DIR, 'assets'));

const staticAssets = [
  'favicon.ico',
  'favicon.svg',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'site.webmanifest'
];
staticAssets.forEach(f => copyFile(path.join(ROOT_DIR, f), path.join(WWW_DIR, f)));

console.log('✓ Successfully prepared www bundle for Capacitor. All private credentials excluded.');
