// Captures the public homepage (desktop 1440x900 and mobile 390x844) for visual comparison: every hero slide, a full
// scroll series, and a DOM snapshot. Needs Playwright (not a project dependency): npm i --no-save playwright.
// Usage: node scripts/visual-regression/capture.mjs <baseUrl> <outDir>
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(new URL('../../package.json', import.meta.url));
const {chromium}=require('playwright');
const [base,out]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const sizes={desktop:{width:1440,height:900},mobile:{width:390,height:844}};
const log=[];
for(const [name,viewport] of Object.entries(sizes)){
  const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:name==='mobile',isMobile:name==='mobile'});
  const page=await ctx.newPage();
  await page.route(/res\.cloudinary\.com|youtube|ytimg|googleapis/,r=>r.abort());   // deterministic: no third-party media
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.waitForSelector('.hero-slider');
  // pause the slideshow so timing never changes what is on screen
  await page.click('.slider-pause').catch(()=>{});
  // load every lazy image, then return to the top
  const total=await page.evaluate(()=>document.documentElement.scrollHeight);
  for(let y=0;y<total;y+=viewport.height/2){await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(120)}
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(500);
  const height=await page.evaluate(()=>document.documentElement.scrollHeight);
  log.push(`${name}: page height ${height}`);
  // hero slides
  const count=await page.$$eval('.slide-indicators button',b=>b.length);
  for(let i=0;i<count;i++){await page.click(`.slide-indicators button >> nth=${i}`);await page.waitForTimeout(900);await page.screenshot({path:`${out}/${name}-hero-${i+1}.png`,animations:'disabled'})}
  await page.click('.slide-indicators button >> nth=0');await page.waitForTimeout(600);
  // scrolled sections
  let n=0;for(let y=0;y<height;y+=viewport.height){await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(400);await page.screenshot({path:`${out}/${name}-scroll-${String(n++).padStart(2,'0')}.png`,animations:'disabled'})}
  // DOM snapshot of the rendered homepage (hero slide 1, top of page)
  await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(400);
  const dom=await page.evaluate(()=>document.querySelector('#root').innerHTML.replace(/\s+/g,' '));
  writeFileSync(`${out}/${name}-dom.html`,dom);
  log.push(`${name}: ${count} hero slides, ${n} scroll shots, dom ${dom.length} chars`);
  await ctx.close();
}
await browser.close();writeFileSync(`${out}/log.txt`,log.join('\n'));console.log(log.join('\n'));
