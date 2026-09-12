import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validateAction} from '../dist/pito-tools.js';
const source=(await readFile(new URL('../dist/chat.js',import.meta.url),'utf8')).replace("import {validateAction,tools,personality} from './pito-tools.js';",'');
function setup(){
 const nodes=new Map(),sent=[],actions=[];
 const node=()=>({textContent:'',children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];},remove(){},pause(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const context=vm.createContext({validateAction,setTimeout,clearTimeout,setInterval,clearInterval,Date,crypto:{randomUUID:()=>String(Math.random())},document:{getElementById:get,createElement:node,querySelectorAll:()=>[]},window:{addEventListener(){},pitoRobot:{status:()=>({connected:true}),cancel:async()=>{},act:async(action,valid,guard)=>{assert.equal(guard(),true);actions.push(action);return {status:'sent'};}}},fetch:async()=>({ok:true,json:async()=>({configured:true})})});
 vm.runInContext(source,context);context.sent=sent;vm.runInContext("active=true;dc={readyState:'open',send:text=>sent.push(JSON.parse(text))};",context);
 const event=e=>{context.event=e;return vm.runInContext('onEvent(event,0)',context);};
 return {event,sent,actions,context,get};
}
const call={type:'function_call',name:'robot_actie',call_id:'a',arguments:JSON.stringify({actie:'zitten',duur_ms:800})};
test('een toolaanroep wordt slechts één keer uitgevoerd',async()=>{
 const app=setup();await app.event({type:'response.created',response:{id:'r'}});
 const done={type:'response.done',response:{id:'r',status:'completed',output:[call]}};
 await app.event(done);await app.event(done);assert.deepEqual(app.actions,['zitten']);
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
