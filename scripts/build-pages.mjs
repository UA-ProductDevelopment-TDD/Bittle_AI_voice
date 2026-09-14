import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';

const projectRoot=new URL('../',import.meta.url);
const source=new URL('dist/',projectRoot);
const output=new URL('_site/',projectRoot);

await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
await cp(source,output,{recursive:true});

const indexUrl=new URL('index.html',output);
let html=await readFile(indexUrl,'utf8');
html=html.replaceAll('href="/style.css"','href="./style.css"')
 .replaceAll('src="/app.js"','src="./app.js"')
 .replaceAll('src="/animation.js"','src="./animation.js"')
 .replaceAll('src="/chat.js"','src="./chat.js"')
 .replace('<script type="module" src="./chat.js"></script>','<script>window.BITTLE_STATIC_PAGE=true</script><script type="module" src="./chat.js"></script>');

if(!html.includes('window.BITTLE_STATIC_PAGE=true'))throw new Error('De Pages-modus kon niet in index.html worden geplaatst.');
if(/(?:href|src)="\/(?!\/)/.test(html))throw new Error('index.html bevat nog een absoluut assetpad.');

await writeFile(indexUrl,html);
await writeFile(new URL('.nojekyll',output),'');

console.log('GitHub Pages-build gemaakt in _site/.');
