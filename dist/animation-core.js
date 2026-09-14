export const JOINTS=Object.freeze([
 {index:0,label:'Nek draaien',short:'Nek',min:-60,max:60},
 {index:8,label:'Linkervoorpoot · schouder',short:'LV schouder',min:-80,max:80},
 {index:9,label:'Rechtervoorpoot · schouder',short:'RV schouder',min:-80,max:80},
 {index:10,label:'Rechterachterpoot · heup',short:'RA heup',min:-90,max:90},
 {index:11,label:'Linkerachterpoot · heup',short:'LA heup',min:-90,max:90},
 {index:12,label:'Linkervoorpoot · knie',short:'LV knie',min:-90,max:90},
 {index:13,label:'Rechtervoorpoot · knie',short:'RV knie',min:-90,max:90},
 {index:14,label:'Rechterachterpoot · knie',short:'RA knie',min:-90,max:90},
 {index:15,label:'Linkerachterpoot · knie',short:'LA knie',min:-90,max:90}
]);
const BY_INDEX=Object.freeze(Object.fromEntries(JOINTS.map(joint=>[joint.index,joint])));
export const PRE_POSES=Object.freeze({balance:'kbalance',sit:'ksit',rest:'krest'});
export const DEFAULT_ANIMATION=Object.freeze({name:'Nieuwsgierig kijken',prePose:'balance',keyframes:[
 {time:0,joints:{0:0}},
 {time:800,joints:{0:30}},
 {time:1600,joints:{0:-30}},
 {time:2400,joints:{0:0}}
]});

const copy=animation=>({name:animation.name,prePose:animation.prePose,keyframes:animation.keyframes.map(frame=>({time:frame.time,joints:{...frame.joints}}))});
export function validateAnimation(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['name','prePose','keyframes'].includes(key)))throw new Error('Ongeldig animatiebestand.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80)throw new Error('Geef de animatie een naam van maximaal 80 tekens.');
 if(!Object.hasOwn(PRE_POSES,input.prePose))throw new Error('Onbekende veilige beginhouding.');
 if(!Array.isArray(input.keyframes)||input.keyframes.length<2||input.keyframes.length>24)throw new Error('Een animatie heeft 2–24 keyframes nodig.');
 const seen=new Set();const keyframes=[];
 for(const source of input.keyframes){
  if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(key=>!['time','joints'].includes(key))||!Number.isInteger(source.time)||source.time<0||source.time>30000)throw new Error('Keyframetijd moet een geheel getal tussen 0 en 30000 ms zijn.');
  if(seen.has(source.time))throw new Error('Elke keyframetijd moet uniek zijn.');seen.add(source.time);
  if(!source.joints||typeof source.joints!=='object'||Array.isArray(source.joints)||!Object.keys(source.joints).length)throw new Error('Selecteer minstens één motor voor ieder keyframe.');
  const joints={};
  for(const [key,value] of Object.entries(source.joints)){
   if(!Object.hasOwn(BY_INDEX,key)||!Number.isInteger(value))throw new Error('Onbekende motor of ongeldige hoek in een keyframe.');
   const joint=BY_INDEX[key];if(value<joint.min||value>joint.max)throw new Error(joint.label+' moet tussen '+joint.min+' en '+joint.max+' graden blijven.');joints[key]=value;
  }
  keyframes.push({time:source.time,joints});
 }
 keyframes.sort((a,b)=>a.time-b.time);
 if(keyframes[0].time!==0)throw new Error('Het eerste keyframe moet op 0 ms staan.');
 if(keyframes.at(-1).time<250)throw new Error('De animatie moet minstens 250 ms duren.');
 return copy({name:input.name.trim(),prePose:input.prePose,keyframes});
}

export function sampleAnimation(animation,time){
 const at=Math.max(0,Math.min(animation.keyframes.at(-1).time,time));const joints={};
 for(const joint of JOINTS){
  const frames=animation.keyframes.filter(frame=>Object.hasOwn(frame.joints,joint.index));if(!frames.length)continue;
  const before=[...frames].reverse().find(frame=>frame.time<=at)??frames[0];const after=frames.find(frame=>frame.time>=at)??frames.at(-1);
  if(before.time===after.time)joints[joint.index]=before.joints[joint.index];
  else{const ratio=(at-before.time)/(after.time-before.time);joints[joint.index]=Math.round(before.joints[joint.index]+(after.joints[joint.index]-before.joints[joint.index])*ratio);}
 }
 return joints;
}

export function playbackFrames(input,interval=200){
 const animation=validateAnimation(input);if(!Number.isInteger(interval)||interval<100||interval>1000)throw new Error('Ongeldige afspeelinterval.');
 const duration=animation.keyframes.at(-1).time,frames=[];let previous='';
 for(let time=0;time<=duration;time+=interval){const joints=sampleAnimation(animation,time);const signature=JSON.stringify(joints);if(signature!==previous){frames.push({time,joints});previous=signature;}}
 if(frames.at(-1)?.time!==duration){const joints=sampleAnimation(animation,duration);if(JSON.stringify(joints)===previous)frames.at(-1).time=duration;else frames.push({time:duration,joints});}
 return {animation,frames,duration};
}

export function frameCommands(joints,maxBytes=256){
 if(!joints||typeof joints!=='object'||Array.isArray(joints))throw new Error('Ongeldig motorframe.');
 if(!Number.isInteger(maxBytes)||maxBytes<10||maxBytes>256)throw new Error('Ongeldige pakketgrootte.');
 const pairs=[];
 for(const joint of JOINTS)if(Object.hasOwn(joints,joint.index)){
  const angle=joints[joint.index];if(!Number.isInteger(angle)||angle<joint.min||angle>joint.max)throw new Error('Ongeldige hoek voor '+joint.label+'.');pairs.push([joint.index,angle]);
 }
 if(!pairs.length)throw new Error('Een motorframe mag niet leeg zijn.');
 const commands=[];let command='i';
 for(const [index,angle] of pairs){const addition=' '+index+' '+angle;if(new TextEncoder().encode(command+addition+'\n').length>maxBytes){if(command==='i')throw new Error('Motorwaarde past niet in transportpakket.');commands.push(command);command='i';}command+=addition;}
 commands.push(command);return commands;
}

export function parsePetoiRecording(text,{interval=200,maxFrames=24,name='Opgenomen beweging'}={}){
 if(typeof text!=='string'||!text.includes('=== Optimized Data ==='))throw new Error('Geen geoptimaliseerde Petoi-opname gevonden in de robotuitvoer.');
 if(!Number.isInteger(interval)||interval<100||interval>1000)throw new Error('De opname-interval moet tussen 100 en 1000 ms liggen.');
 if(!Number.isInteger(maxFrames)||maxFrames<2||maxFrames>24)throw new Error('De tijdlijn ondersteunt 2–24 opgenomen kernframes.');
 const optimized=text.slice(text.lastIndexOf('=== Optimized Data ===')),block=optimized.match(/\{([\s\S]*?)\}/);if(!block)throw new Error('De Petoi-opname is nog niet volledig ontvangen.');
 const rows=block[1].split(/\r?\n/).map(line=>(line.match(/-?\d+/g)??[]).map(Number)).filter(values=>values.length>=11).map((values,index)=>({sourceIndex:index,values:values.slice(0,11)}));
 if(rows.length<2)throw new Error('Er zijn te weinig verschillende houdingen opgenomen. Beweeg meerdere gewrichten en houd Bobby daarna twee seconden stil.');
 const chosen=rows.length<=maxFrames?rows:Array.from({length:maxFrames},(_,index)=>rows[Math.round(index*(rows.length-1)/(maxFrames-1))]);let clamped=0;
 const keyframes=chosen.map((row,index)=>{const joints={};for(let j=0;j<JOINTS.length;j++){const joint=JOINTS[j],sourcePosition=j===0?0:j+2,raw=Math.round(row.values[sourcePosition]),safe=Math.max(joint.min,Math.min(joint.max,raw));if(safe!==raw)clamped++;joints[joint.index]=safe;}return {time:index===chosen.length-1?Math.max(250,(rows.length-1)*interval):row.sourceIndex*interval,joints};});
 const animation=validateAnimation({name,prePose:'balance',keyframes});return {animation,sourceFrames:rows.length,keptFrames:keyframes.length,clamped};
}

export function cloneAnimation(animation){return copy(validateAnimation(animation));}
