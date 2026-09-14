import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validateAction,validateGesture,validateScene} from '../dist/pito-tools.js';
const source=(await readFile(new URL('../dist/chat.js',import.meta.url),'utf8'))
 .replace("import {validateAction,validateGesture,validateScene,tools,personality} from './pito-tools.js';",'')
 .replace("import {createBrowserSession} from './realtime-browser.js';",'');
function setup({staticMode=false}={}){
 const nodes=new Map(),sent=[],actions=[],played=[],fetches=[];
 const node=()=>({textContent:'',children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];},remove(){},pause(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 get('dogsounds').checked=true;
 class Audio{constructor(src){this.src=src;}pause(){}play(){played.push(this.src);queueMicrotask(()=>this.onended?.());return Promise.resolve();}}
 const context=vm.createContext({BITTLE_STATIC_PAGE:staticMode,validateAction,validateGesture,validateScene,createBrowserSession:async()=>'',Audio,setTimeout,clearTimeout,setInterval,clearInterval,Date,crypto:{randomUUID:()=>String(Math.random())},document:{getElementById:get,createElement:node,querySelectorAll:()=>[]},window:{addEventListener(){},pitoRobot:{status:()=>({connected:true}),cancel:async()=>{},act:async(action,valid,guard)=>{assert.equal(guard(),true);actions.push(action);return {status:'sent'};},scene:async(scene,valid,guard)=>{assert.equal(guard(),true);actions.push('scene:'+scene);return {status:'sent'};}}},fetch:async(...args)=>{fetches.push(args);return {ok:true,json:async()=>({configured:true})};}});
 vm.runInContext(source,context);context.sent=sent;vm.runInContext("active=true;dc={readyState:'open',send:text=>sent.push(JSON.parse(text)),close(){}};",context);
 const event=e=>{context.event=e;return vm.runInContext('onEvent(event,0)',context);};
 return {event,sent,actions,played,fetches,context,get};
}
const call={type:'function_call',name:'robot_actie',call_id:'a',arguments:JSON.stringify({actie:'zitten',duur_ms:800})};
test('een toolaanroep wordt slechts één keer uitgevoerd',async()=>{
 const app=setup();await app.event({type:'response.created',response:{id:'r'}});
 const done={type:'response.done',response:{id:'r',status:'completed',output:[call]}};
 await app.event(done);await app.event(done);assert.deepEqual(app.actions,['zitten']);
});

test('precies gebaar en samengestelde scène worden lokaal gevalideerd',async()=>{
 const app=setup();
 await app.event({type:'response.created',response:{id:'g'}});
 await app.event({type:'response.done',response:{id:'g',status:'completed',output:[{type:'function_call',name:'robot_gebaar',call_id:'g1',arguments:JSON.stringify({gebaar:'kijk_links',waarde:35})}]}});
 await app.event({type:'response.created',response:{id:'s'}});
 await app.event({type:'response.done',response:{id:'s',status:'completed',output:[{type:'function_call',name:'robot_scene',call_id:'s1',arguments:JSON.stringify({scene:'speuren'})}]}});
 assert.deepEqual(app.actions,['kijk_links','scene:speuren']);
});
test('oude actie na een gesproken onderbreking wordt geweigerd',async()=>{
 const app=setup();await app.event({type:'response.created',response:{id:'r'}});
 await app.event({type:'input_audio_buffer.speech_started'});
 await app.event({type:'response.done',response:{id:'r',status:'completed',output:[call]}});
 assert.equal(app.actions.length,0);assert.ok(app.sent.some(e=>e.item?.type==='function_call_output'&&JSON.parse(e.item.output).error));
});

test('spontane uitnodiging alleen tijdens een actief toegestaan en rustig gesprek',()=>{
 const app=setup();app.get('spontaneous').checked=true;app.get('allowactions').checked=true;
 vm.runInContext('lastActivity=0;spontaneousTick()',app.context);
 assert.ok(app.sent.some(event=>event.type==='response.create'));
 app.sent.length=0;app.get('spontaneous').checked=false;
 vm.runInContext('responseActive=false;lastActivity=0;spontaneousTick()',app.context);
 assert.equal(app.sent.length,0);
 app.get('spontaneous').checked=true;
 vm.runInContext('userSpeaking=true;spontaneousTick()',app.context);
 assert.equal(app.sent.length,0);
});

test('echt hondengeluid respecteert selectie, schakelaar en afkoelperiode',async()=>{
 const app=setup();
 assert.equal(JSON.stringify(await vm.runInContext("playDogSound({geluid:'blaf'})",app.context)),JSON.stringify({status:'played',sound:'blaf'}));
 assert.deepEqual(app.played,['./sounds/bark.ogg']);
 await assert.rejects(vm.runInContext("playDogSound({geluid:'huil'})",app.context),/te kort geleden/);
 vm.runInContext('lastDogSound=0',app.context);
 assert.equal(JSON.stringify(await vm.runInContext("playDogSound({geluid:'snuffel'})",app.context)),JSON.stringify({status:'played',sound:'snuffel'}));
 assert.deepEqual(app.played,['./sounds/bark.ogg','./sounds/sniff.ogg']);
 app.get('dogsounds').checked=false;
 await assert.rejects(vm.runInContext("playDogSound({geluid:'grom'})",app.context),/staan uit/);
 await assert.rejects(vm.runInContext("playDogSound({geluid:'miauw'})",app.context),/Onbekend/);
});

test('Pages bewaart een ingevoerde sleutel alleen in tabgeheugen en gebruikt geen lokale API',async()=>{
 const app=setup({staticMode:true});
 app.get('apikey').value='sk-test_1234567890';
 await app.get('keyform').onsubmit({preventDefault(){}});
 assert.equal(vm.runInContext('browserApiKey',app.context),'sk-test_1234567890');
 assert.equal(app.get('apikey').value,'');
 assert.equal(app.fetches.length,0);
 await app.get('keyremove').onclick();
 assert.equal(vm.runInContext('browserApiKey',app.context),'');
 assert.equal(app.fetches.length,0);
});
