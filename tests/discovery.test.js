import test from 'node:test';
import assert from 'node:assert/strict';
import {discover} from '../src/discovery.js';
import {answerDiscovery,validatedAnswer,validateInput} from '../server/discovery-service.js';
import {createHandler} from '../api/discover.js';

test('natural-language questions rank relevant pages without requiring every filler word',()=>{
 const found=discover('Do you have research on trade and job creation?');
 assert.ok(found.results.some(r=>r.title==='Africa Trade & Job Tracker'));
 assert.ok(found.results.some(r=>r.title==='Policy briefs'));
 assert.equal(discover('Learning opportunities for entrepreneurs').results[0].title,'Enterprise Development Workshop Series');
 assert.equal(discover('Learning opportunities for entrepreneurs','Programme').results[0].title,'Enterprise Development Workshop Series');
 assert.equal(discover('I would like a remote internship').results[0].title,'Remote Internship Programme');
});
test('unavailable recordings and unrelated questions never fabricate content',()=>{
 assert.equal(discover('Find meeting recordings').results.length,0);
 assert.equal(discover('Find meeting recordings').canAnswer,false);
 assert.match(discover('Find meeting recordings').message,/No recordings are indexed/);
 assert.equal(discover('quantum physics').results.length,0);
});
test('opportunity results explicitly avoid confirming status and eligibility',()=>{
 const found=discover('What internships are open and can I apply?','Opportunity');
 assert.ok(found.results.length);assert.ok(found.results.every(r=>r.status==='unverified'));
 assert.match(found.notice,/not been verified/);
});
test('request validation bounds question and category',()=>{
 for(const body of [null,{},[],{query:''},{query:'x'.repeat(501)},{query:3},{query:'hello',category:'private'}])assert.equal(validateInput(body),null);
 assert.deepEqual(validateInput({query:'  trade  '}),{query:'trade',category:'All'});
});
test('no configured key or model returns usable directory results without calling provider',async()=>{
 let calls=0;const result=await answerDiscovery({query:'internship',category:'All'},{fetchImpl:()=>{calls++}});
 assert.equal(calls,0);assert.equal(result.mode,'directory');assert.equal(result.reason,'not-configured');assert.ok(result.results.length);
});
test('unsupported recording query never calls provider even when configured',async()=>{
 let calls=0;await answerDiscovery({query:'youtube recordings',category:'All'},{apiKey:'test-only',model:'test-model',fetchImpl:()=>{calls++}});assert.equal(calls,0);
});
test('valid model answer cites only server-resolved URLs and uses protected credentials',async()=>{
 const result=await answerDiscovery({query:'remote internship',category:'All'},{apiKey:'test-only',model:'test-model',fetchImpl:async(url,options)=>{
  assert.match(url,/\/models\/test-model:generateContent$/);assert.ok(!url.includes('test-only'));
  assert.equal(options.headers['x-goog-api-key'],'test-only');
  const sent=JSON.parse(options.body);assert.ok(sent.systemInstruction.parts[0].text.includes('Never invent'));
  return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({answer:'Explore the Remote Internship Programme. Check the programme page for current application details.',sourceIds:['fa-7']})}]}}]})};
 }});
 assert.equal(result.mode,'ai');assert.equal(result.answer.sources[0].url,'/remote-internship-programme-rip/');
});
test('invalid citations and embedded links are rejected',()=>{
 const results=discover('internship').results;
 for(const payload of [{answer:'Example',sourceIds:['fake-id']},{answer:'Example',sourceIds:[]},{answer:'Visit https://evil.example',sourceIds:['fa-7']},{answer:'<a>test</a>',sourceIds:['fa-7']}])assert.equal(validatedAnswer(payload,results),null);
});
test('provider failures and malformed responses fall back without leaking error content',async()=>{
 for(const fetchImpl of [async()=>{throw new Error('secret-test-only')},async()=>({ok:false}),async()=>({ok:true,json:async()=>({})}),async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'invalid json'}]}}]})})]){
  const r=await answerDiscovery({query:'internship',category:'All'},{apiKey:'test-only',model:'test-model',fetchImpl});assert.equal(r.mode,'directory');assert.ok(r.results.length);assert.ok(!JSON.stringify(r).includes('secret-test-only'));
 }
});
const response=()=>({headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}});
test('endpoint accepts POST, rejects foreign origins and bounds body size',async()=>{
 const handler=createHandler({env:{},limits:new Map()});
 for(const [req,code]of [[{method:'GET'},405],[{method:'POST',headers:{host:'example.com',origin:'https://evil.example'}},403],[{method:'POST',headers:{'content-length':'5000'}},413],[{method:'POST',body:'{'},400]]){const res=response();await handler(req,res);assert.equal(res.statusCode,code)}
 const res=response();await handler({method:'POST',headers:{host:'example.com',origin:'https://example.com'},body:{query:'internship'}},res);assert.equal(res.statusCode,200);assert.equal(res.data.mode,'directory');assert.equal(res.headers['Cache-Control'],'no-store');
});
test('endpoint enforces request limits and resets expired buckets',async()=>{
 let now=0;const handler=createHandler({env:{},limits:new Map(),clock:()=>now});
 const req={method:'POST',headers:{},socket:{remoteAddress:'127.0.0.1'},body:{query:'internship'}};
 for(let i=0;i<10;i++){const r=response();await handler(req,r);assert.equal(r.statusCode,200)}
 const blocked=response();await handler(req,blocked);assert.equal(blocked.statusCode,429);
 now=60001;const later=response();await handler(req,later);assert.equal(later.statusCode,200);
});
