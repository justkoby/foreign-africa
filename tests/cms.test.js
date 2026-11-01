import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCms,contentFromBlocks} from '../server/cms-service.js';
import {createHandler} from '../api/cms.js';

const form={id:'general_enquiry',purpose:'general_enquiry',title:'General enquiry',status:'draft',success:'Thanks. Your enquiry has been received.',fields:[{id:'name',label:'Your name',type:'text',required:true},{id:'email',label:'Email address',type:'email',required:true},{id:'message',label:'Your message',type:'textarea',required:true}]};

function studio(){
 const root=mkdtempSync(join(tmpdir(),'fa-cms-'));
 mkdirSync(join(root,'data','cms'),{recursive:true});
 writeFileSync(join(root,'data','cms','forms.json'),JSON.stringify([form]));
 writeFileSync(join(root,'data','cms','commentaries.json'),'[]');
 return createCms({root,env:{CMS_PASSWORD:'secret'},clock:()=>1_700_000_000_000});
}
const response=()=>({headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}});

test('paragraph edits keep untouched links and drop markup from edited paragraphs',()=>{
 const node={tag:'p',children:['Keep ',{tag:'a',href:'/blog/',children:['this']}]};
 assert.equal(contentFromBlocks([{kind:'text',tag:'p',text:'Keep this',node}])[0].children[1].tag,'a');
 assert.deepEqual(contentFromBlocks([{kind:'text',tag:'p',text:'Changed',node}])[0].children,['Changed']);
 assert.equal(contentFromBlocks([{kind:'text',tag:'p',text:'<script>alert(1)</script>'}])[0].tag,'p');
});

test('draft forms stay private and a saved enquiry is acknowledged once',()=>{
 const cms=studio();
 assert.equal(cms.publicForm('general_enquiry'),null);
 assert.equal(cms.submit('general_enquiry',{name:'Ada',email:'ada@example.com',message:'Hello'}).status,404);
 const opened=cms.saveItem('forms',{...form,status:'publish'});
 assert.equal(opened.item.status,'publish');
 assert.equal(cms.publicForm('general_enquiry').fields.length,3);
 const first=cms.submit('general_enquiry',{name:'Ada',email:'ada@example.com',message:'Hello'},'once');
 assert.equal(first.ok,true);assert.match(first.reference,/^FA-/);
 const again=cms.submit('general_enquiry',{name:'Ada',email:'ada@example.com',message:'Hello'},'once');
 assert.equal(again.duplicate,true);assert.equal(cms.submissions().length,1);
 assert.equal(cms.submit('general_enquiry',{name:'',email:'not-an-email',message:''}).status,400);
});

test('editor sign-in is required before content changes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'fa-cms-'));
 mkdirSync(join(root,'data','cms'),{recursive:true});
 writeFileSync(join(root,'data','cms','news.json'),'[]');
 const handler=createHandler({root,env:{CMS_PASSWORD:'secret'},clock:()=>1_700_000_000_000});
 const denied=response();
 await handler({method:'PUT',url:'/api/cms/items',headers:{},body:{collection:'news',item:{title:'A report'}}},denied);
 assert.equal(denied.statusCode,401);
 const cms=createCms({root,env:{CMS_PASSWORD:'secret'},clock:()=>1_700_000_000_000});
 const signed=response();
 await handler({method:'PUT',url:'/api/cms/items',headers:{cookie:cms.cookie()},body:{collection:'news',item:{title:'A report',status:'draft'}}},signed);
 assert.equal(signed.statusCode,409);
 const event=response();
 await handler({method:'PUT',url:'/api/cms/items',headers:{cookie:cms.cookie()},body:{collection:'events',item:{title:'A workshop',status:'draft'}}},event);
 assert.equal(event.statusCode,200);assert.equal(event.data.item.status,'draft');
 const wrong=response();
 await handler({method:'POST',url:'/api/cms/login',headers:{},body:{password:'nope'}},wrong);
 assert.equal(wrong.statusCode,401);
});
