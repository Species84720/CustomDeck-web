const fs = require('fs');
const { execSync } = require('child_process');

console.log('1. Cleaning dist folder...');
fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });

console.log('2. Copying web app files...');
fs.cpSync('github-pages-bpmn', 'dist/github-pages-bpmn', { recursive: true });
fs.cpSync('github-pages-worklog', 'dist/github-pages-worklog', { recursive: true });

if (fs.existsSync('index.html')) fs.copyFileSync('index.html', 'dist/index.html');
if (fs.existsSync('styles.css')) fs.copyFileSync('styles.css', 'dist/styles.css');

console.log('3. Publishing to GitHub Pages...');
// Get remote origin URL from parent git repository
const repoUrl = execSync('git config --get remote.origin.url').toString().trim();

const options = { cwd: 'dist', stdio: 'inherit' };
execSync('git init', options);
execSync('git checkout -b gh-pages', options);
execSync('git add .', options);
execSync('git commit -m "Deploy from laptop"', options);
execSync(`git push -f "${repoUrl}" gh-pages`, options);

console.log('Successfully deployed to gh-pages branch!');