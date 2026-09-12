import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAction,tools,catalog} from '../dist/pito-tools.js';
import {createApp} from '../server.mjs';
test('Pito mag alleen bekende acties met begrensde duur uitvoeren',()=>{
 assert.equal(validateAction({actie:'zitten',duur_ms:800}).command,'ksit');
 assert.equal(validateAction({actie:'vooruit',duur_ms:1500}).walking,true);
 for(const input of [{actie:'ksit\nkff',duur_ms:800},{actie:'vooruit',duur_ms:9999},{actie:'vooruit',duur_ms:0},{actie:'vooruit',duur_ms:'800'},{actie:'zitten',duur_ms:800,command:'c'},{actie:'toString',duur_ms:800}])assert.throws(()=>validateAction(input));
 assert.equal(tools.length,2);
});
test('lokale API bewaart sleutel op server en wisselt SDP uit met vaste configuratie',async t=>{
 const secret='sk-test-private-123456789';let calls=0;
 const server=createApp({apiKey:'',fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/realtime/calls');assert.equal(options.headers.Authorization,'Bearer '+secret);
  const session=JSON.parse(options.body.get('session'));assert.equal(session.type,'realtime');assert.equal(session.tools[1].name,'robot_actie');assert.ok(session.instructions.includes('Pito'));
  return new Response('v=0\r\nanswer',{status:200});
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const url='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(url+'/api/session',{method:'POST',headers:{Origin:url},body:'v=0'})).status,503);
 assert.equal((await fetch(url+'/api/key',{method:'POST',headers:{Origin:'http://evil.example'},body:JSON.stringify({key:secret})})).status,403);
 assert.equal((await fetch(url+'/api/key',{method:'POST',headers:{Origin:url},body:JSON.stringify({key:secret})})).status,200);
 const config=await (await fetch(url+'/api/config')).text();assert.ok(!config.includes(secret));assert.equal(JSON.parse(config).configured,true);
 const answer=await fetch(url+'/api/session',{method:'POST',headers:{Origin:url},body:'v=0\r\no=-'});assert.equal(answer.status,200);assert.equal(await answer.text(),'v=0\r\nanswer');assert.equal(calls,1);
 assert.equal((await fetch(url+'/.env')).status,404);
 await fetch(url+'/api/key',{method:'DELETE',headers:{Origin:url}});assert.equal((await (await fetch(url+'/api/config')).json()).configured,false);
});

test('elke beweging uit de bediening is beschikbaar voor de gespreksagent',async()=>{
 const {readFile}=await import('node:fs/promises');
 const page=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
 const codes=[...page.matchAll(/<option value="(k[^"]+)" data-gait="(true|false)"/g)];
 assert.equal(codes.length,catalog.length);
 for(const [,code,gait] of codes){const action=validateAction({actie:code,duur_ms:800});assert.equal(action.command,code);assert.equal(action.walking,gait==='true');}
 assert.equal(validateAction({actie:'kbf',duur_ms:800}).settleMs,4500);
 assert.equal(validateAction({actie:'kff',duur_ms:800}).command,'kff');
});
