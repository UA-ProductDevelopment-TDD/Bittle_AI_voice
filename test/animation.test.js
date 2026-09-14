import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JOINTS,DEFAULT_ANIMATION,validateAnimation,sampleAnimation,frameCommands,parsePetoiRecording} from '../dist/animation-core.js';

test('animatie valideert negen begrensde motortracks',()=>{
 const animation=validateAnimation(DEFAULT_ANIMATION);assert.equal(JOINTS.length,9);assert.equal(animation.keyframes.length,4);
 for(const invalid of [
  {...DEFAULT_ANIMATION,name:''},
  {...DEFAULT_ANIMATION,keyframes:[{time:100,joints:{0:0}},{time:500,joints:{0:20}}]},
  {...DEFAULT_ANIMATION,keyframes:[{time:0,joints:{0:0}},{time:500,joints:{0:61}}]},
  {...DEFAULT_ANIMATION,keyframes:[{time:0,joints:{7:0}},{time:500,joints:{7:1}}]},
  {...DEFAULT_ANIMATION,keyframes:[{time:0,joints:{0:0}},{time:0,joints:{0:20}}]}
 ])assert.throws(()=>validateAnimation(invalid));
});

test('lineaire interpolatie gebruikt alleen opgenomen tracks',()=>{
 const animation=validateAnimation({name:'Knik',prePose:'sit',keyframes:[{time:0,joints:{0:0,8:-20}},{time:1000,joints:{0:40}},{time:2000,joints:{0:0,8:20}}]});
 assert.deepEqual(sampleAnimation(animation,500),{0:20,8:-10});
 assert.deepEqual(sampleAnimation(animation,1500),{0:20,8:10});
});

test('motorframes worden voor BLE op maximaal twintig bytes gesplitst',()=>{
 const frame=Object.fromEntries(JOINTS.map((joint,index)=>[joint.index,index%2?-45:45]));const commands=frameCommands(frame,20);
 assert.ok(commands.length>1);assert.deepEqual(Object.keys(frame).length,9);
 for(const command of commands)assert.ok(new TextEncoder().encode(command+'\n').length<=20);
 assert.equal(frameCommands({0:30},20)[0],'i 0 30');
});

test('Petoi-feedbackopname wordt naar veilige tijdlijn-keyframes vertaald',()=>{
 const raw='ruis\r\n=== Optimized Data ===\r\n{\r\n0,0,0,18,-18,22,-22,-35,-35,35,35,\r\n18,0,0,25,-25,16,-16,-48,-42,48,42,\r\n-14,0,0,12,-12,28,-28,-30,-52,30,52,\r\n}\r\n';
 const parsed=parsePetoiRecording(raw,{name:'Voorgedaan'});assert.equal(parsed.sourceFrames,3);assert.equal(parsed.animation.keyframes.length,3);assert.equal(parsed.animation.keyframes[1].time,200);assert.equal(parsed.animation.keyframes.at(-1).time,400);assert.deepEqual(parsed.animation.keyframes[1].joints,{0:18,8:25,9:-25,10:16,11:-16,12:-48,13:-42,14:48,15:42});
 assert.throws(()=>parsePetoiRecording('geen opname'));
});
