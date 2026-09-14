import {JOINTS,DEFAULT_ANIMATION,validateAnimation,sampleAnimation,cloneAnimation,parsePetoiRecording} from './animation-core.js';
const $=id=>document.getElementById(id);const STORAGE_KEY='bittle-animations-v1';
let animation=cloneAnimation(DEFAULT_ANIMATION),selected=0,currentTime=0,playing=false,recording=false,dragging=false;const controls=new Map();

function fail(error){$('anim-error').textContent=error.message??String(error);}
function clearError(){$('anim-error').textContent='';}
function formatTime(ms){return (ms/1000).toLocaleString('nl-BE',{minimumFractionDigits:ms%1000?1:0,maximumFractionDigits:2})+' s';}
function make(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element;}
function preparePlaybackControls(){
 const oldTime=$('anim-time'),readout=oldTime.parentElement,label=make('label','time-readout'),input=document.createElement('input'),readable=make('span','',formatTime(0));
 input.id='anim-time';input.type='number';input.min='0';input.max='30000';input.step='1';input.value='0';input.inputMode='numeric';readable.id='anim-time-readable';label.append(document.createTextNode('Afspeelkop (ms)'),input,readable);readout.replaceWith(label);
 const loop=make('label','toggle animation-loop'),checkbox=document.createElement('input');checkbox.id='anim-loop';checkbox.type='checkbox';loop.append(checkbox,document.createTextNode(' Animatie herhalen'));$('anim-stop').after(loop);
 const recorder=make('div','motion-recorder'),copy=make('div'),title=make('h3','', 'Opnemen door Bobby te bewegen'),description=make('p','note','Gebruik Petoi-feedbackservo’s om een beweging fysiek voor te doen. De opname wordt daarna als keyframes in deze tijdlijn geladen.'),recordButton=make('button','record-button','● Beweging opnemen'),recordStatus=make('p','note','Klaar voor een feedbackopname.'),details=document.createElement('details'),summary=make('summary','','Vereisten en veilige werkwijze'),requirements=make('p','note','Vereist: BiBoard, recente OpenCatESP32-firmware en Petoi-feedbackservo’s van na maart 2024. Tijdens de overgang kunnen gewrichten kort schokken. Ondersteun de robot, forceer nooit een gewricht en houd hem na de beweging twee seconden stil. De firmware stuurt geen exacte timestamps mee; de editor zet ontvangen frames eerst 200 ms uit elkaar zodat je de timing daarna kunt verfijnen.');
 recordButton.id='anim-record';recordButton.disabled=true;recordStatus.id='anim-record-status';details.append(summary,requirements);copy.append(title,description,recordStatus,details);recorder.append(copy,recordButton);$('anim-status').parentElement.insertBefore(recorder,$('anim-status'));
 const help=document.querySelector('.animation-panel > .note:last-child');if(help)help.textContent='Sleep de rode afspeelkop, klik op de tijdruler of stel het tijdstip exact in milliseconden in. Klik in een motortrack om daar meteen een keyframe te plaatsen; rechtsklik voor meer opties. Schakel Animatie herhalen in om vanaf het begin door te spelen totdat je Stoppen kiest of de herhaling uitzet. Het eerste keyframe blijft op 0 ms. Playback gebruikt lineaire interpolatie op vijf frames per seconde. Begin met kleine hoeken.';
}
preparePlaybackControls();
function readStored(){try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?Object.assign(Object.create(null),value):Object.create(null);}catch{return Object.create(null);}}
function writeStored(value){localStorage.setItem(STORAGE_KEY,JSON.stringify(value));}
function animationDuration(){return Math.max(250,animation.keyframes.at(-1)?.time??250);}
function viewDuration(){return Math.max(Number($('anim-zoom').value),animationDuration());}
function snapTime(ms){return Math.max(0,Math.min(viewDuration(),Math.round(ms/50)*50));}

function buildTracks(){
 for(const joint of JOINTS){
  const row=make('div','animation-track');row.dataset.joint=joint.index;
  const label=make('label'),check=document.createElement('input');check.type='checkbox';check.checked=joint.index===0;label.append(check,document.createTextNode(joint.label));
  const range=document.createElement('input');range.type='range';range.min=joint.min;range.max=joint.max;range.step='1';range.value='0';range.setAttribute('aria-label',joint.label+' schuifregelaar');
  const number=document.createElement('input');number.type='number';number.min=joint.min;number.max=joint.max;number.step='1';number.value='0';number.setAttribute('aria-label',joint.label+' hoek');
  range.oninput=()=>number.value=range.value;number.oninput=()=>range.value=number.value;
  const enabled=()=>{range.disabled=number.disabled=!check.checked;row.classList.toggle('inactive',!check.checked);};check.onchange=enabled;enabled();
  row.append(label,range,number);$('anim-tracks').append(row);controls.set(joint.index,{row,check,range,number,joint});
 }
}

function refreshSaved(){
 const names=Object.keys(readStored()).sort((a,b)=>a.localeCompare(b,'nl'));$('anim-saved').replaceChildren();
 const empty=document.createElement('option');empty.value='';empty.textContent=names.length?'Kies een animatie':'Nog niets bewaard';$('anim-saved').append(empty);
 for(const name of names){const option=document.createElement('option');option.value=option.textContent=name;$('anim-saved').append(option);}
 $('anim-load').disabled=!$('anim-saved').value;
}

function setZoomFor(time){$('anim-zoom').value=time<=5000?'5000':time<=10000?'10000':'30000';}
function updatePlayhead(time=currentTime){
 const span=viewDuration(),at=Math.max(0,Math.min(span,time)),ratio=span?at/span:0,playhead=$('anim-playhead');
 playhead.style.setProperty('--playhead',ratio);playhead.setAttribute('aria-valuemax',span);playhead.setAttribute('aria-valuenow',Math.round(at));$('anim-time').value=String(Math.round(at));$('anim-time-readable').textContent=formatTime(Math.round(at));
}
function updateSelection(){
 $('anim-selection').textContent=selected>=0?'Keyframe '+(selected+1)+' van '+animation.keyframes.length:'Afspeelkop op '+formatTime(currentTime);
 $('anim-delete').disabled=playing||recording||selected<0||animation.keyframes.length<=2;$('anim-update').disabled=playing||recording||selected<0;$('anim-add').disabled=playing||recording;
}
function setCurrentTime(time,detach=true,snap=true){
 const value=Number(time);currentTime=snap?snapTime(value):Math.max(0,Math.min(30000,Math.round(value)));if(currentTime>Number($('anim-zoom').value))setZoomFor(currentTime);if(detach)selected=-1;const sampled=sampleAnimation(animation,currentTime);
 for(const [index,control] of controls)if(Object.hasOwn(sampled,index))control.range.value=control.number.value=String(sampled[index]);
 updatePlayhead();updateSelection();
}

function selectFrame(index){
 selected=Math.max(0,Math.min(animation.keyframes.length-1,index));const frame=animation.keyframes[selected];currentTime=frame.time;const sampled=sampleAnimation(animation,currentTime);
 for(const joint of JOINTS){const control=controls.get(joint.index),included=Object.hasOwn(frame.joints,joint.index);control.check.checked=included;control.range.disabled=control.number.disabled=!included;control.row.classList.toggle('inactive',!included);control.range.value=control.number.value=String(frame.joints[joint.index]??sampled[joint.index]??0);}
 renderTimeline();
}

function timeFromPointer(event,element){const box=element.getBoundingClientRect();return snapTime((event.clientX-box.left)/box.width*viewDuration());}
function captureJoints(indices=[...controls.keys()].filter(index=>controls.get(index).check.checked)){
 const joints={};for(const index of indices){const control=controls.get(index),value=Number(control.number.value);if(!Number.isInteger(value)||value<control.joint.min||value>control.joint.max)throw new Error(control.joint.label+' moet tussen '+control.joint.min+' en '+control.joint.max+' graden staan.');joints[index]=value;}
 if(!Object.keys(joints).length)throw new Error('Vink minstens één motortrack aan.');return joints;
}
function addJointsAt(time,joints){
 clearError();currentTime=Math.max(0,Math.min(30000,Math.round(time)));let frame=animation.keyframes.find(item=>item.time===currentTime);
 if(frame)Object.assign(frame.joints,joints);else{frame={time:currentTime,joints:{...joints}};animation.keyframes.push(frame);animation.keyframes.sort((a,b)=>a.time-b.time);}
 selected=animation.keyframes.indexOf(frame);selectFrame(selected);
}
function addTrackAt(index,time){
 setCurrentTime(time);const sampled=sampleAnimation(animation,currentTime),control=controls.get(index);control.check.checked=true;control.range.disabled=control.number.disabled=false;control.row.classList.remove('inactive');
 const candidate=sampled[index]??Number(control.number.value),value=Number.isFinite(candidate)?candidate:0;control.range.value=control.number.value=String(value);addJointsAt(currentTime,{[index]:value});
}
function removeTrackAt(index,time){
 const frame=animation.keyframes.find(item=>item.time===time);if(!frame||!Object.hasOwn(frame.joints,index))return;
 if(Object.keys(frame.joints).length===1){removeFrameAt(time);return;}delete frame.joints[index];selected=animation.keyframes.indexOf(frame);selectFrame(selected);
}
function removeFrameAt(time){
 const index=animation.keyframes.findIndex(item=>item.time===time);if(index<0)return;if(time===0)throw new Error('Het eerste keyframe op 0 ms kan niet worden verwijderd.');if(animation.keyframes.length<=2)throw new Error('Minstens twee keyframes zijn nodig.');animation.keyframes.splice(index,1);selected=Math.max(0,index-1);selectFrame(selected);
}

function hideContext(){$('anim-context').hidden=true;}
function menuButton(label,action,danger=false){const button=make('button',danger?'danger':'',label);button.type='button';button.setAttribute('role','menuitem');button.onclick=()=>{hideContext();try{clearError();action();}catch(error){fail(error);}};$('anim-context').append(button);}
function showContext(event,index,time){
 event.preventDefault();event.stopPropagation();if(playing)return;setCurrentTime(time);const menu=$('anim-context');menu.replaceChildren();const joint=controls.get(index).joint,frame=animation.keyframes.find(item=>item.time===currentTime);
 menuButton('Keyframe op '+joint.short,()=>addTrackAt(index,currentTime));
 menuButton('Aangevinkte tracks hier',()=>addJointsAt(currentTime,captureJoints()));
 menuButton('Alle 9 tracks hier',()=>{const sampled=sampleAnimation(animation,currentTime),joints={};for(const item of JOINTS){const candidate=sampled[item.index]??Number(controls.get(item.index).number.value);joints[item.index]=Number.isFinite(candidate)?candidate:0;}addJointsAt(currentTime,joints);});
 if(frame&&Object.hasOwn(frame.joints,index))menuButton('Deze trackmarkering verwijderen',()=>removeTrackAt(index,currentTime),true);
 if(frame)menuButton('Volledig keyframe verwijderen',()=>removeFrameAt(currentTime),true);
 menu.hidden=false;const left=Math.min(event.clientX,window.innerWidth-245),top=Math.min(event.clientY,window.innerHeight-220);menu.style.left=Math.max(8,left)+'px';menu.style.top=Math.max(8,top)+'px';
}

function renderTimeline(playbackTime=null){
 const duration=animationDuration(),span=viewDuration();$('anim-duration').textContent='Animatie '+formatTime(duration);$('anim-timeline').replaceChildren();$('anim-ruler').replaceChildren();
 for(let mark=0;mark<=4;mark++){const label=make('span','ruler-label',formatTime(Math.round(span*mark/4)));label.style.left=(mark*25)+'%';$('anim-ruler').append(label);}
 for(const joint of JOINTS){
  const row=make('div','timeline-row'),label=make('span','timeline-label',joint.short),lane=make('div','timeline-lane');lane.dataset.joint=joint.index;lane.setAttribute('aria-label',joint.label+' tijdlijn');
  lane.onclick=event=>{if(event.target===lane)addTrackAt(joint.index,timeFromPointer(event,lane));};lane.oncontextmenu=event=>showContext(event,joint.index,timeFromPointer(event,lane));
  animation.keyframes.forEach((frame,index)=>{if(!Object.hasOwn(frame.joints,joint.index))return;const marker=make('button','keyframe-marker'+(index===selected?' selected':''));marker.type='button';marker.style.left=(frame.time/span*100)+'%';marker.title=formatTime(frame.time)+' · '+joint.short+' '+frame.joints[joint.index]+'°';marker.setAttribute('aria-label',marker.title);marker.onclick=event=>{event.stopPropagation();selectFrame(index);};marker.oncontextmenu=event=>showContext(event,joint.index,frame.time);lane.append(marker);});
  row.append(label,lane);$('anim-timeline').append(row);
 }
 updatePlayhead(playbackTime??currentTime);updateSelection();updateConnection();
}

function bindTimeline(){
 $('anim-ruler').onclick=event=>{if(!playing)setCurrentTime(timeFromPointer(event,$('anim-ruler')));};
 const playhead=$('anim-playhead'),lane=()=>$('anim-timeline').querySelector('.timeline-lane');const move=event=>{const target=lane();if(target)setCurrentTime(timeFromPointer(event,target));};
 const begin=event=>{if(playing)return;event.preventDefault();dragging=true;if(event.pointerId!==undefined)try{playhead.setPointerCapture(event.pointerId);}catch{}move(event);};
 playhead.onpointerdown=begin;playhead.onmousedown=begin;
 document.addEventListener('pointermove',event=>{if(dragging)move(event);});document.addEventListener('mousemove',event=>{if(dragging&&event.buttons===1)move(event);});
 document.addEventListener('pointerup',()=>dragging=false);document.addEventListener('mouseup',()=>dragging=false);playhead.onpointercancel=()=>dragging=false;
 playhead.onkeydown=event=>{if(playing||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();setCurrentTime(currentTime+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?250:50));};
 document.addEventListener('click',event=>{if(!event.target.closest?.('#anim-context'))hideContext();});document.addEventListener('keydown',event=>{if(event.key==='Escape')hideContext();});window.addEventListener('resize',()=>updatePlayhead());
}

function syncMetadata(){animation.name=$('anim-name').value;animation.prePose=$('anim-prepose').value;}
function updateConnection(){const connected=!!window.pitoRobot?.status?.().connected;$('anim-play').disabled=playing||recording||!connected;$('anim-stop').disabled=!playing;$('anim-record').disabled=playing||recording||!connected;if(!playing&&!recording&&!connected)$('anim-status').textContent='Verbind de robot of start testmodus om af te spelen.';}
function loadAnimation(value,message){animation=cloneAnimation(value);$('anim-name').value=animation.name;$('anim-prepose').value=animation.prePose;setZoomFor(animationDuration());selected=0;selectFrame(0);$('anim-status').textContent=message;}

$('anim-add').onclick=()=>{try{clearError();syncMetadata();addJointsAt(currentTime,captureJoints());}catch(error){fail(error);}};
$('anim-update').onclick=()=>{try{clearError();syncMetadata();if(selected<0)throw new Error('Selecteer eerst een bestaande keyframe-markering.');animation.keyframes[selected].joints=captureJoints();validateAnimation(animation);selectFrame(selected);}catch(error){fail(error);}};
$('anim-delete').onclick=()=>{try{clearError();if(selected<0)throw new Error('Selecteer eerst een keyframe.');removeFrameAt(animation.keyframes[selected].time);}catch(error){fail(error);}};
$('anim-new').onclick=()=>{if(window.confirm&&!window.confirm('De huidige, niet-bewaarde wijzigingen vervangen door het voorbeeld?'))return;clearError();loadAnimation(DEFAULT_ANIMATION,'Nieuwe voorbeeldanimatie geladen.');};
$('anim-save').onclick=()=>{try{clearError();syncMetadata();animation=validateAnimation(animation);const stored=readStored();stored[animation.name]=animation;writeStored(stored);refreshSaved();$('anim-saved').value=animation.name;$('anim-load').disabled=false;$('anim-status').textContent='“'+animation.name+'” is lokaal in deze browser bewaard.';}catch(error){fail(error);}};
$('anim-saved').onchange=()=>$('anim-load').disabled=!$('anim-saved').value;
$('anim-load').onclick=()=>{try{clearError();const value=readStored()[$('anim-saved').value];if(!value)throw new Error('Kies eerst een bewaarde animatie.');loadAnimation(value,'Bewaarde animatie geladen.');}catch(error){fail(error);}};
$('anim-zoom').onchange=()=>{currentTime=Math.min(currentTime,viewDuration());renderTimeline();};
$('anim-time').oninput=()=>{const value=Number($('anim-time').value);if(Number.isInteger(value)&&value>=0&&value<=30000)setCurrentTime(value,true,false);};
$('anim-time').onchange=()=>{const value=Number($('anim-time').value);if(!Number.isFinite(value)){fail(new Error('Voer een tijd tussen 0 en 30000 ms in.'));updatePlayhead();return;}clearError();setCurrentTime(value,true,false);};
$('anim-loop').onchange=()=>{if(playing&&!$('anim-loop').checked)$('anim-status').textContent='Herhalen uit — de huidige ronde wordt afgemaakt.';};
$('anim-record').onclick=async()=>{if(playing||recording)return;const state=window.pitoRobot?.status?.();if(state?.mode!=='test'&&window.confirm&&!window.confirm('De motoren worden tijdelijk losgelaten om feedbackposities te meten. Ondersteun Bobby en forceer geen gewrichten. De huidige niet-bewaarde tijdlijn wordt na een geslaagde opname vervangen. Doorgaan?'))return;try{clearError();recording=true;updateSelection();updateConnection();$('anim-record').textContent='● Opname actief…';$('anim-record-status').textContent='Opname voorbereiden…';const result=await window.pitoRobot.recordMotion(message=>$('anim-record-status').textContent=message),name='Opgenomen beweging '+new Date().toLocaleTimeString('nl-BE',{hour:'2-digit',minute:'2-digit'}),parsed=parsePetoiRecording(result.raw,{name});loadAnimation(parsed.animation,'Feedbackopname in de tijdlijn geladen.');const reduction=parsed.sourceFrames>parsed.animation.keyframes.length?' Teruggebracht van '+parsed.sourceFrames+' naar '+parsed.animation.keyframes.length+' kernframes.':'';const clamped=parsed.clamped?' '+parsed.clamped+' gemeten hoeken zijn tot het veilige editorbereik begrensd.':'';$('anim-record-status').textContent=(result.status==='simulated'?'Demo-opname':'Feedbackopname')+' klaar: '+parsed.animation.keyframes.length+' keyframes.'+reduction+clamped;}catch(error){fail(error);$('anim-record-status').textContent='Opname niet geladen.';}finally{recording=false;$('anim-record').textContent='● Beweging opnemen';renderTimeline();}};
$('anim-export').onclick=()=>{try{clearError();syncMetadata();animation=validateAnimation(animation);const blob=new Blob([JSON.stringify(animation,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=animation.name.toLocaleLowerCase('nl').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0);$('anim-status').textContent='Animatie als JSON geëxporteerd.';}catch(error){fail(error);}};
$('anim-import').onchange=async()=>{try{clearError();const file=$('anim-import').files?.[0];if(!file)return;if(file.size>100000)throw new Error('Animatiebestand is te groot.');loadAnimation(JSON.parse(await file.text()),'Animatie uit JSON geïmporteerd.');}catch(error){fail(error);}finally{$('anim-import').value='';}};
$('anim-play').onclick=async()=>{if(playing)return;try{clearError();syncMetadata();animation=validateAnimation(animation);playing=true;renderTimeline(0);$('anim-status').textContent='Animatie voorbereiden…';const duration=animationDuration();const result=await window.pitoRobot.playAnimation(animation,(progress,round)=>{updatePlayhead(progress*duration);$('anim-status').textContent=($('anim-loop').checked?'Ronde '+round+' · ':'Afspelen · ')+Math.round(progress*100)+'%';},()=>$('anim-loop').checked);const rounds=result.iterations>1?' · '+result.iterations+' rondes':'';$('anim-status').textContent=(result.status==='simulated'?'Testanimatie':'Animatie')+' voltooid · '+result.frames+' frames'+rounds+'.';}catch(error){if(error.message!=='Animatie gestopt.')fail(error);else $('anim-status').textContent='Animatie gestopt.';}finally{playing=false;renderTimeline();}};
$('anim-stop').onclick=async()=>{try{await window.pitoRobot.stopAnimation();}catch(error){fail(error);}};
window.addEventListener('pito-status',updateConnection);

try{buildTracks();bindTimeline();refreshSaved();loadAnimation(DEFAULT_ANIMATION,'Voorbeeld geladen. Kies testmodus om het veilig uit te proberen.');}catch(error){console.error('Animatie-editor kon niet starten:',error);fail(error);}
