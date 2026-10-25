import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {policyBriefs} from '../src/pages/policy-content.js';
import {partners} from '../src/partners.js';
import {resolvePage} from '../src/pages/routes.js';
import {discover} from '../src/discovery.js';

test('publication routes and search results lead to the migrated local library',()=>{
  assert.equal(resolvePage('/partners').type,'partners');
  assert.equal(resolvePage('/policy-briefs/').type,'policy');
  for(const brief of policyBriefs){
    assert.ok(discover(brief.title,'Research').results.some(r=>r.url===brief.url));
    assert.equal(resolvePage(brief.url.split('#')[0]).type,'policy');
  }
});
test('every supplied brief has an original PDF and complete image and text reading views',()=>{
  for(const brief of policyBriefs){
    const base=`public${brief.base}`;
    assert.equal(readFileSync(`${base}/brief.pdf`).subarray(0,5).toString(),'%PDF-');
    assert.ok(existsSync(`${base}/cover.webp`));
    const text=JSON.parse(readFileSync(`${base}/text.json`,'utf8'));
    assert.equal(text.length,brief.pages);
    assert.equal(readdirSync(base).filter(n=>/^page-\d+\.webp$/.test(n)).length,brief.pages);
    for(let p=1;p<=brief.pages;p++){
      assert.ok(existsSync(`${base}/page-${p}.webp`));
      assert.ok(Array.isArray(text[p-1]));
      if(p>1)assert.ok(text[p-1].join('').length>100);
    }
  }
});
test('all partner entries have distinct, locally available logos',()=>{
  assert.equal(new Set(partners.map(p=>p.id)).size,partners.length);
  for(const partner of partners)assert.ok(existsSync(`public${partner.logo}`),partner.name);
});
