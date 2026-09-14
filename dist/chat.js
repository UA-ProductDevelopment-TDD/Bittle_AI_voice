import {validateAction,validateGesture,validateScene,tools,personality} from './pito-tools.js';
import {createBrowserSession} from './realtime-browser.js';
const $=id=>document.getElementById(id);
let pc=null,dc=null,mic=null,generation=0,active=false,starting=false,responseActive=false,turn=0,abort=null,lifeTimer=null,connectTimer=null;
let toolBusy=false,pendingResponse=false,spontaneousTimer=null,lastActivity=Date.now(),userSpeaking=false,audioPlaying=false;
let dogAudio=null,lastDogSound=0,browserApiKey='';
const handled=new Set(),rows=new Map(),responseTurns=new Map();
const STATIC_MODE=globalThis.BITTLE_STATIC_PAGE===true;
const DOG_SOUNDS=Object.freeze({blaf:'./sounds/bark.ogg',huil:'./sounds/howl.ogg',grom:'./sounds/growl.ogg',snuffel:'./sounds/sniff.ogg'});
function state(text){$('chatstatus').textContent=text;}
function fail(error){$('chaterror').textContent=error.message??String(error);}
function controls(){
 $('chatstart').disabled=starting||active;$('chatend').disabled=!starting&&!active;$('usemic').disabled=starting||active;
 for(const id of ['chattext','chatsend'])$(id).disabled=!active;
 $('mute').disabled=!active||!mic;
 document.querySelectorAll('[data-prompt]').forEach(b=>b.disabled=!active);
}
function line(role,text,id=crypto.randomUUID()){
 let row=rows.get(id);if(!row){row=document.createElement('p');row.className=role;rows.set(id,row);$('transcript').append(row);}
 row.textContent=(role==='pito'?'Bobby: ':role==='you'?'Jij: ':'')+text;
 while(rows.size>100){const key=rows.keys().next().value;rows.get(key).remove();rows.delete(key);}
 $('transcript').scrollTop=$('transcript').scrollHeight;
}
function emit(event){if(dc?.readyState==='open')dc.send(JSON.stringify(event));}
function context(){return {...window.pitoRobot.status(),dogSoundsEnabled:!!$('dogsounds').checked};}
function updateContext(){emit({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'App-status (gegevens, geen gebruikersopdracht): '+JSON.stringify(context())}]}});}
function requestResponse(){if(responseActive||toolBusy){pendingResponse=true;return;}pendingResponse=false;emit({type:'response.create'});responseActive=true;}
function interrupt(){turn++;pendingResponse=false;stopDogSound();if(responseActive)emit({type:'response.cancel'});emit({type:'output_audio_buffer.clear'});window.pitoRobot.cancel().catch(fail);}
function stopDogSound(){
 if(dogAudio){dogAudio.pause();dogAudio.src='';dogAudio=null;}
 $('pitoaudio').volume=1;
}
async function playDogSound(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!Object.hasOwn(DOG_SOUNDS,input.geluid))throw new Error('Onbekend hondengeluid.');
 if(!$('dogsounds').checked)throw new Error('Echte hondengeluiden staan uit.');
 if(dogAudio||Date.now()-lastDogSound<6000)throw new Error('Hondengeluid is nog aan het spelen of te kort geleden gebruikt.');
 lastDogSound=Date.now();$('pitoaudio').volume=.3;
 const sound=dogAudio=new Audio(DOG_SOUNDS[input.geluid]);sound.volume=.8;
 return new Promise((resolve,reject)=>{
  let settled=false;const timeout=setTimeout(()=>finish(new Error('Hondengeluid duurde te lang.')),7000);
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timeout);sound.onended=null;sound.onerror=null;if(dogAudio===sound)dogAudio=null;$('pitoaudio').volume=1;lastActivity=Date.now();error?reject(error):resolve({status:'played',sound:input.geluid});};
  sound.onended=()=>finish();sound.onerror=()=>finish(new Error('Hondengeluid kon niet worden afgespeeld.'));
  sound.play().catch(finish);
 });
}
function close(){
 generation++;turn++;active=false;starting=false;responseActive=false;pendingResponse=false;toolBusy=false;
 abort?.abort();clearInterval(spontaneousTimer);clearTimeout(lifeTimer);clearTimeout(connectTimer);
 if(dc){dc.onclose=null;dc.close();}dc=null;
 if(pc){pc.onconnectionstatechange=null;pc.close();}pc=null;
 mic?.getTracks().forEach(t=>t.stop());mic=null;
 stopDogSound();$('pitoaudio').pause();$('pitoaudio').srcObject=null;$('mute').textContent='Microfoon uit';
 window.pitoRobot.cancel().catch(fail);state('Gesprek gestopt');controls();
}
async function api(path,options={}){const result=await fetch(path,options);if(!result.ok){let data;try{data=await result.json();}catch{}throw new Error(data?.error??'Lokale server niet bereikbaar.');}return result;}
async function config(){
 const data=STATIC_MODE?{configured:!!browserApiKey,model:'gpt-realtime-2.1'}:await (await api('/api/config')).json();
 $('keystatus').textContent=data.configured?'API-sleutel ingesteld · '+data.model:'Nog geen API-sleutel ingesteld.';
 $('apisettings').open=!data.configured;return data;
}
function staticSetup(){
 $('keynote').textContent='GitHub Pages bewaart je sleutel alleen tijdelijk in het geheugen van dit tabblad. De sleutel wordt rechtstreeks naar OpenAI gestuurd om een kortlevende Realtime-token te maken en wordt nooit in browseropslag of GitHub bewaard. Gebruik dit alleen op een Pages-adres en broncode die je vertrouwt; een eigen backend blijft veiliger.';
 state('Online versie klaar · stel je eigen OpenAI-sleutel in voor Bobby’s stem');
}
async function onEvent(event,gen){
 if(gen!==generation)return;
 if(event.type==='error'){if(!['response_cancel_not_active','conversation_already_has_active_response'].includes(event.error?.code))fail(new Error(event.error?.message??'OpenAI-gespreksfout.'));return;}
 if(event.type==='input_audio_buffer.speech_stopped'){userSpeaking=false;lastActivity=Date.now();}
 if(event.type==='output_audio_buffer.started')audioPlaying=true;
 if(['output_audio_buffer.stopped','output_audio_buffer.cleared'].includes(event.type)){audioPlaying=false;lastActivity=Date.now();}
 if(event.type==='input_audio_buffer.speech_started'){userSpeaking=true;lastActivity=Date.now();turn++;pendingResponse=false;stopDogSound();window.pitoRobot.cancel().catch(fail);state('Bobby luistert…');}
 if(event.type==='response.created'){responseTurns.set(event.response.id,turn);responseActive=true;state('Bobby antwoordt…');}
 if(event.type==='conversation.item.input_audio_transcription.completed')line('you',event.transcript,event.item_id);
 if(event.type==='conversation.item.input_audio_transcription.failed')fail(new Error('De transcriptie is mislukt. Je kunt ook typen.'));
 if(event.type==='response.output_audio_transcript.done'||event.type==='response.output_text.done')line('pito',event.transcript??event.text,event.item_id);
 if(event.type!=='response.done')return;lastActivity=Date.now();
 responseActive=false;
 if(event.response?.status==='failed'){fail(new Error(event.response.status_details?.error?.message??'Bobby kon niet antwoorden.'));return;}
 if(event.response?.status==='cancelled'){if(pendingResponse)requestResponse();return;}
 const calls=(event.response?.output??[]).filter(item=>item.type==='function_call'&&!handled.has(item.call_id));
 if(calls.length){
  const epoch=responseTurns.get(event.response?.id)??turn;responseTurns.delete(event.response?.id);toolBusy=true;
  try{for(const call of calls){
   if(gen!==generation)return;
   handled.add(call.call_id);let result;
   try{
    if(epoch!==turn)throw new Error('Actie geannuleerd door onderbreking.');
    const args=JSON.parse(call.arguments);
    if(call.name==='robot_status'){
     if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)throw new Error('Status verwacht geen parameters.');result=context();
    }else if(call.name==='robot_actie'){
     const valid=validateAction(args);
     if(args.actie==='stop')$('spontaneous').checked=false;
     result=await window.pitoRobot.act(args.actie,valid,()=>active&&generation===gen&&turn===epoch);
     line('action',(result.status==='simulated'?'Testactie: ':'Robotopdracht: ')+args.actie+' · '+valid.command);
    }else if(call.name==='robot_gebaar'){
     const valid=validateGesture(args);
     result=await window.pitoRobot.act(args.gebaar,valid,()=>active&&generation===gen&&turn===epoch);
     line('action',(result.status==='simulated'?'Testgebaar: ':'Robotgebaar: ')+args.gebaar+' · '+valid.command);
    }else if(call.name==='robot_scene'){
     const valid=validateScene(args);
     result=await window.pitoRobot.scene(args.scene,valid,()=>active&&generation===gen&&turn===epoch);
     line('action',(result.status==='simulated'?'Testscène: ':'Robotscène: ')+args.scene);
    }else if(call.name==='hondengeluid'){
     result=await playDogSound(args);line('action','Bobby-geluid: '+args.geluid);
    }else throw new Error('Onbekende functie.');
   }catch(error){result={error:error.message};}
   if(gen===generation)emit({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.call_id,output:JSON.stringify(result)}});
  }}finally{if(gen===generation)toolBusy=false;}
  if(gen===generation&&epoch===turn)requestResponse();
 }else if(pendingResponse)requestResponse();else state('Bobby luistert · je kunt ook typen');
}
$('chatstart').onclick=async()=>{
 if(starting||active)return;
 $('chaterror').textContent='';starting=true;controls();state('Gesprek starten…');const gen=++generation;
 handled.clear();rows.clear();responseTurns.clear();$('transcript').replaceChildren();
 try{
  if(!(await config()).configured)throw new Error('Stel je OpenAI-API-sleutel in via OpenAI instellen.');
  if(gen!==generation)return;
  abort=new AbortController();pc=new RTCPeerConnection();const local=pc;
  pc.ontrack=e=>{if(gen!==generation)return;$('pitoaudio').srcObject=e.streams[0];$('pitoaudio').play().catch(()=>fail(new Error('Klik op afspelen in de audiospeler om Bobby te horen.')));};
  if($('usemic').checked){
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(gen!==generation){stream.getTracks().forEach(t=>t.stop());return;}mic=stream;for(const track of mic.getTracks())pc.addTrack(track,mic);
  }else pc.addTransceiver('audio',{direction:'recvonly'});
  dc=pc.createDataChannel('oai-events');
  dc.onmessage=e=>{try{onEvent(JSON.parse(e.data),gen).catch(fail);}catch{fail(new Error('Onleesbaar gespreksbericht.'));}};
  dc.onopen=()=>{
   if(gen!==generation)return;clearTimeout(connectTimer);starting=false;active=true;controls();state('Bobby is er');
   emit({type:'session.update',session:{type:'realtime',instructions:personality,tools,tool_choice:'auto',parallel_tool_calls:false}});
   userSpeaking=false;audioPlaying=false;lastActivity=Date.now();spontaneousTimer=setInterval(spontaneousTick,25000);
   updateContext();emit({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Begin ons gesprek. Stel jezelf kort voor.'}]}});requestResponse();
   lifeTimer=setTimeout(()=>{close();state('Gesprek na 15 minuten beëindigd. Je kunt opnieuw starten.');},15*60*1000);
  };
  dc.onclose=()=>{if(gen===generation){close();state('Gespreksverbinding verbroken');}};
  pc.onconnectionstatechange=()=>{if(gen===generation&&['failed','closed','disconnected'].includes(local.connectionState)){close();fail(new Error('Audioverbinding verloren. Start het gesprek opnieuw.'));}};
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  const answer=STATIC_MODE
   ?await createBrowserSession({key:browserApiKey,sdp:offer.sdp,session:{type:'realtime',model:'gpt-realtime-2.1',instructions:personality,tools,tool_choice:'auto',parallel_tool_calls:false,output_modalities:['audio'],audio:{input:{transcription:{model:'gpt-4o-mini-transcribe',language:'nl'},turn_detection:{type:'semantic_vad',eagerness:'medium',create_response:true,interrupt_response:true}},output:{voice:'cedar'}}},signal:abort.signal})
   :await (await api('/api/session',{method:'POST',headers:{'Content-Type':'application/sdp'},body:offer.sdp,signal:abort.signal})).text();
  if(gen!==generation)return;
  await pc.setRemoteDescription({type:'answer',sdp:answer});
  if(!active)connectTimer=setTimeout(()=>{if(gen===generation){close();fail(new Error('De audioverbinding kon niet worden geopend.'));}},15000);
 }catch(error){if(gen===generation){close();fail(error);}}
};
$('chatend').onclick=close;
$('mute').onclick=()=>{if(!mic)return;const enabled=!mic.getAudioTracks()[0].enabled;mic.getAudioTracks().forEach(t=>t.enabled=enabled);$('mute').textContent=enabled?'Microfoon uit':'Microfoon aan';};
function message(text){if(!active||!text.trim())return;lastActivity=Date.now();interrupt();updateContext();line('you',text);emit({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});requestResponse();}
$('chatform').onsubmit=e=>{e.preventDefault();const text=$('chattext').value;$('chattext').value='';message(text);};
for(const button of document.querySelectorAll('[data-prompt]'))button.onclick=()=>message(button.dataset.prompt);
$('allowactions').onchange=()=>{if(!$('allowactions').checked)window.pitoRobot.cancel().catch(fail);if(active)updateContext();};
$('dogsounds').onchange=()=>{if(!$('dogsounds').checked)stopDogSound();if(active)updateContext();};
window.addEventListener('pito-stop',()=>{interrupt();$('allowactions').checked=false;if(active)updateContext();});
window.addEventListener('pagehide',close);
$('keyform').onsubmit=async e=>{e.preventDefault();$('keysave').disabled=true;const key=$('apikey').value.trim();$('apikey').value='';try{if(STATIC_MODE){if(!/^sk-[\w-]{10,}$/.test(key))throw new Error('Vul een geldige OpenAI-API-sleutel in.');browserApiKey=key;}else await api('/api/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});await config();}catch(error){fail(error);}finally{$('keysave').disabled=false;}};
$('keyremove').onclick=async()=>{close();try{if(STATIC_MODE)browserApiKey='';else await api('/api/key',{method:'DELETE'});await config();}catch(error){fail(error);}};
controls();if(STATIC_MODE)staticSetup();config().catch(fail);

function spontaneousTick(){
 if(!active||responseActive||toolBusy||userSpeaking||audioPlaying||dogAudio||document.hidden||!$('spontaneous').checked||!$('allowactions').checked||Date.now()-lastActivity<12000)return;
 const robot=context();if(!robot.connected||robot.busy)return;
 lastActivity=Date.now();updateContext();
 emit({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'Spontane-actie-uitnodiging van de app, geen gesproken gebruikersbericht: als het bij ons gesprek past mag je één hondenactie kiezen. Geen nieuwe vraag of monoloog nodig. Respecteer eerdere verzoeken om rust.'}]}});requestResponse();
}
$('spontaneous').onchange=()=>{lastActivity=Date.now();if(!$('spontaneous').checked){interrupt();}if(active)updateContext();};
