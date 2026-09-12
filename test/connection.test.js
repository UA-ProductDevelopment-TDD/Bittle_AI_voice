import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map();
 function el(){return {value:'',textContent:'',children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},get firstChild(){return {remove:()=>this.children.shift()};}};}
 const get=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 get('transport').value='ble';get('ending').value='lf';
 const writes=[];const listeners=new Map();let subscriptions=0;
 const notify={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),startNotifications:async()=>{subscriptions++;}};
 const writer={properties:{write:true},writeValueWithResponse:async bytes=>writes.push(new TextDecoder().decode(bytes))};
 const device={name:'Test Bittle',addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),gatt:{connected:false,connect:async()=>{device.gatt.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async id=>id.startsWith('6e400002')?writer:notify})};},disconnect:()=>{device.gatt.connected=false;}}};
 const context=vm.createContext({setTimeout,clearTimeout,window:{addEventListener(){}},document:{addEventListener(){},getElementById:get,querySelectorAll:()=>[],createElement:el,createTextNode:text=>text},navigator:{bluetooth:{requestDevice:async()=>device}},TextDecoder,TextEncoder,Date});
 vm.runInContext(source,context);
 return {context,get,writes,listeners,device,subscriptions:()=>subscriptions};
}
test('BLE gebruikt notificaties en verstuurt exact het commando; verbreken blokkeert verzending',async()=>{
 const app=setup();await app.get('connect').onclick();assert.equal(app.subscriptions(),1);assert.equal(app.get('send').disabled,false);
 app.get('command').value='ksit';await app.get('sendform').onsubmit({preventDefault(){}});
 // The UI event schedules run; yield until its asynchronous write completes.
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(app.writes,['ksit\n']);
 app.listeners.get('characteristicvaluechanged')({target:{value:new TextEncoder().encode('k\r\n')}});
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
 assert.deepEqual(app.writes,['kwkF\n','kbalance\n']);
});
test('wandelen stopt na de maximale duur',async()=>{
 const app=setup();await app.get('connect').onclick();
 vm.runInContext("beginWalk('backward')",app.context);
 await new Promise(resolve=>setTimeout(resolve,2100));
 assert.deepEqual(app.writes,['kbk\n','kbalance\n']);
});

test('parametercommando’s hebben juiste indeling en weigeren ongeldige waarden',()=>{
 const {context}=setup();
 assert.equal(vm.runInContext("parameterCommand('motor',8,40)",context),'m 8 40');
 assert.equal(vm.runInContext("parameterCommand('turn',0,45)",context),'kwkL 45');
 assert.equal(vm.runInContext("parameterCommand('joint',0,0)",context),'j 0');
 for(const code of ["parameterCommand('motor',4,0)","parameterCommand('motor',8,90)","parameterCommand('tilt',3,0)","parameterCommand('turn',0,0)","parameterCommand('motor','',0)","parameterCommand('volume',11,0)"]){assert.throws(()=>vm.runInContext(code,context));}
});

test('gesprek respecteert toestemming en annuleert nog niet verstuurde acties',async()=>{
 const app=setup();await app.get('connect').onclick();
 await assert.rejects(vm.runInContext("window.pitoRobot.act('zitten',{command:'ksit',walking:false},()=>true)",app.context));
 app.get('allowactions').checked=true;
 const action=vm.runInContext("window.pitoRobot.act('zitten',{command:'ksit',walking:false},()=>true)",app.context);
 await vm.runInContext('window.pitoRobot.cancel()',app.context);
 await assert.rejects(action);assert.equal(app.writes.length,0);
});
