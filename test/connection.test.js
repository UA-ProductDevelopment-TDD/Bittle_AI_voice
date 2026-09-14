import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PRE_POSES,validateAnimation,sampleAnimation,frameCommands} from '../dist/animation-core.js';
const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace("import {PRE_POSES,validateAnimation,sampleAnimation,frameCommands} from './animation-core.js';",'');
function setup(){
 const elements=new Map();
 function el(){return {value:'',textContent:'',children:[],style:{},dataset:{},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},get firstChild(){return {remove:()=>this.children.shift()};}};}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 get('transport').value='ble';get('ending').value='lf';
 const writes=[];const listeners=new Map();let subscriptions=0;
 const notify={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),startNotifications:async()=>{subscriptions++;}};
 const writer={properties:{write:true},writeValueWithResponse:async bytes=>writes.push(new TextDecoder().decode(bytes))};
 const device={name:'Test Bittle',addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),gatt:{connected:false,connect:async()=>{device.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async id=>id.startsWith('6e400002')?writer:notify})};},disconnect:()=>{device.gatt.connected=false;}}};
 const context=vm.createContext({PRE_POSES,validateAnimation,sampleAnimation,frameCommands,setTimeout,clearTimeout,setInterval,clearInterval,window:{addEventListener(){}},document:{addEventListener(){},getElementById:get,querySelectorAll:()=>[],createElement:el,createTextNode:text=>text},navigator:{bluetooth:{requestDevice:async()=>device}},TextDecoder,TextEncoder,Date});
 vm.runInContext(source,context);
 return {context,get,writes,listeners,device,subscriptions:()=>subscriptions};
}
test('BLE gebruikt notificaties en verstuurt exact het commando; verbreken blokkeert verzending',async()=>{
 const app=setup();await app.get('connect').onclick();assert.equal(app.subscriptions(),1);assert.equal(app.get('send').disabled,false);
 app.get('command').value='ksit';await app.get('sendform').onsubmit({preventDefault(){}});
 // The UI event schedules run; yield until its asynchronous write completes.
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(app.writes,['P\n','ksit\n']);
 app.listeners.get('characteristicvaluechanged')({target:{value:new TextEncoder().encode('Volta')}});app.listeners.get('characteristicvaluechanged')({target:{value:new TextEncoder().encode('ge: 7.35 V\r\n')}});app.listeners.get('characteristicvaluechanged')({target:{value:new TextEncoder().encode('k\r\n')}});
 assert.equal(app.get('battery-voltage').textContent,'7,35 V');
 assert.ok(app.get('log').children.some(row=>row.children.includes('"k\\r\\n"')));
 await app.get('disconnect').onclick();assert.equal(app.get('send').disabled,true);assert.equal(app.device.gatt.connected,false);
});
test('testmodus verstuurt niets via BLE',async()=>{
 const app=setup();app.get('transport').value='simulation';await app.get('connect').onclick();
 app.get('command').value='kup';app.get('sendform').onsubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(app.subscriptions(),0);assert.equal(app.writes.length,0);assert.ok(app.get('log').children.some(row=>row.className==='test'));
});

test('loslaten tijdens verzending stuurt loopopdracht gevolgd door stop',async()=>{
 const app=setup();await app.get('connect').onclick();
 vm.runInContext("beginWalk('forward');stopWalk()",app.context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(app.writes,['P\n','kwkF\n','kbalance\n']);
});
test('wandelen stopt na de maximale duur',async()=>{
 const app=setup();await app.get('connect').onclick();
 vm.runInContext("beginWalk('backward')",app.context);
 await new Promise(resolve=>setTimeout(resolve,2100));
 assert.deepEqual(app.writes,['P\n','kbk\n','kbalance\n']);
});

test('parametercommando’s hebben juiste indeling en weigeren ongeldige waarden',()=>{
 const {context}=setup();
 assert.equal(vm.runInContext("parameterCommand('motor',8,40)",context),'m 8 40');
 assert.equal(vm.runInContext("parameterCommand('turn',0,45)",context),'kwkL 45');
 assert.equal(vm.runInContext("parameterCommand('joint',0,0)",context),'j 0');
 for(const code of ["parameterCommand('motor',4,0)","parameterCommand('motor',8,90)","parameterCommand('tilt',3,0)","parameterCommand('turn',0,0)","parameterCommand('motor','',0)","parameterCommand('volume',11,0)"]){assert.throws(()=>vm.runInContext(code,context));}
});

test('zoeken vindt acties op omschrijving en commandocode, ook zonder accenten',()=>{
 const {context}=setup();
 assert.equal(vm.runInContext("postureMatchesQuery('Voorwaartse salto maken','kff','salto')",context),true);
 assert.equal(vm.runInContext("postureMatchesQuery('Een hoog pootje geven','kfiv','KFIV')",context),true);
 assert.equal(vm.runInContext("postureMatchesQuery('Gehurkt bewegen','khu','gehürkt')",context),true);
 assert.equal(vm.runInContext("postureMatchesQuery('Gaan zitten','ksit','vliegen')",context),false);
});

test('gesprek respecteert toestemming en annuleert nog niet verstuurde acties',async()=>{
 const app=setup();await app.get('connect').onclick();
 await assert.rejects(vm.runInContext("window.pitoRobot.act('zitten',{command:'ksit',walking:false},()=>true)",app.context));
 app.get('allowactions').checked=true;
 const action=vm.runInContext("window.pitoRobot.act('zitten',{command:'ksit',walking:false},()=>true)",app.context);
 await vm.runInContext('window.pitoRobot.cancel()',app.context);
 await assert.rejects(action);assert.deepEqual(app.writes,['P\n']);
});

test('gespreksscène voert commando’s op volgorde uit',async()=>{
 const app=setup();app.get('transport').value='simulation';await app.get('connect').onclick();app.get('allowactions').checked=true;
 const result=await vm.runInContext("window.pitoRobot.scene('kort',{steps:[{command:'ksit',waitMs:5,walking:false},{command:'m 0 25',waitMs:5,walking:false}]},()=>true)",app.context);
 assert.deepEqual(Array.from(result.commands),['ksit','m 0 25']);
 const tests=app.get('log').children.filter(row=>row.className==='test');assert.equal(tests.length,2);
});

test('tijdlijn speelt geïnterpoleerde motorframes af en kan stoppen',async()=>{
 const app=setup();app.get('transport').value='simulation';await app.get('connect').onclick();
 app.context.animation={name:'Test',prePose:'balance',keyframes:[{time:0,joints:{0:0}},{time:250,joints:{0:20}}]};
 const result=await vm.runInContext('window.pitoRobot.playAnimation(animation)',app.context);
 assert.equal(result.status,'simulated');assert.equal(result.durationMs,250);assert.equal(result.iterations,1);assert.ok(result.frames>=2);
 const tests=app.get('log').children.filter(row=>row.className==='test');assert.ok(tests.length>=3);
});

test('tijdlijn kan meerdere rondes afspelen zonder de beginhouding te herhalen',async()=>{
 const app=setup();app.get('transport').value='simulation';await app.get('connect').onclick();
 app.context.animation={name:'Loop',prePose:'balance',keyframes:[{time:0,joints:{0:0}},{time:250,joints:{0:20}}]};app.context.loopChecks=0;
 const result=await vm.runInContext('window.pitoRobot.playAnimation(animation,()=>{},()=>loopChecks++<1)',app.context);
 assert.equal(result.iterations,2);
 const commands=app.get('log').children.filter(row=>row.className==='test').map(row=>row.children.at(-1));
 assert.equal(commands.filter(command=>command==='"kbalance\\n"').length,1);
});

test('testmodus levert batterijtelemetrie en een veilige demo-feedbackopname',async()=>{
 const app=setup();app.get('transport').value='simulation';await app.get('connect').onclick();
 assert.equal(app.get('battery-voltage').textContent,'7,62 V');
 const result=await vm.runInContext('window.pitoRobot.recordMotion()',app.context);
 assert.equal(result.status,'simulated');assert.match(result.raw,/Optimized Data/);
});
