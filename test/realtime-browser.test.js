import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSession} from '../dist/realtime-browser.js';

test('Pages maakt een tijdelijke token en gebruikt die voor de WebRTC-call',async()=>{
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/client_secrets'))return {ok:true,json:async()=>({value:'ek_test_tijdelijk'})};
  return {ok:true,text:async()=>'v=0\r\nantwoord'};
 };
 const session={type:'realtime',model:'gpt-realtime-2.1',audio:{output:{voice:'cedar'}}};
 const answer=await createBrowserSession({key:'sk-test_1234567890',sdp:'v=0\r\naanbod',session,fetchImpl});
 assert.equal(answer,'v=0\r\nantwoord');
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,'https://api.openai.com/v1/realtime/client_secrets');
 assert.equal(calls[0].options.headers.Authorization,'Bearer sk-test_1234567890');
 assert.deepEqual(JSON.parse(calls[0].options.body),{session});
 assert.equal(calls[1].url,'https://api.openai.com/v1/realtime/calls');
 assert.equal(calls[1].options.headers.Authorization,'Bearer ek_test_tijdelijk');
 assert.equal(calls[1].options.body,'v=0\r\naanbod');
});

test('Pages weigert sleutels en SDP die niet lokaal valideren',async()=>{
 await assert.rejects(createBrowserSession({key:'fout',sdp:'v=0',session:{type:'realtime',model:'gpt-realtime-2.1'}}),/geldige OpenAI/);
 await assert.rejects(createBrowserSession({key:'sk-test_1234567890',sdp:'geen sdp',session:{type:'realtime',model:'gpt-realtime-2.1'}}),/audioverbinding/);
});
