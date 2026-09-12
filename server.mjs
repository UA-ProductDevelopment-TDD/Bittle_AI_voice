import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {tools,personality} from './dist/pito-tools.js';
try{process.loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
export function createApp({apiKey=process.env.OPENAI_API_KEY??'',fetchImpl=fetch,model=process.env.OPENAI_REALTIME_MODEL??'gpt-realtime-2.1'}={}){
 let key=apiKey,starting=false;
 const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/chat.js':'chat.js','/pito-tools.js':'pito-tools.js'};
 return http.createServer(async(req,res)=>{
  const reply=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?JSON.stringify(body):body);};
  const host=req.headers.host;
  if(!host||!/^(127\.0\.0\.1|localhost):\d+$/.test(host))return reply(403,{error:'Alleen lokaal toegankelijk.'});
  const path=new URL(req.url,'http://'+host).pathname;
  if(path.startsWith('/api/')&&req.method!=='GET'&&req.headers.origin!=='http://'+host)return reply(403,{error:'Ongeldige herkomst.'});
  async function body(max){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max)throw new Error('Aanvraag te groot.');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');}
  try{
   if(path==='/api/config'&&req.method==='GET')return reply(200,{configured:!!key,model});
   if(path==='/api/key'&&req.method==='POST'){
    const data=JSON.parse(await body(4096));if(typeof data.key!=='string'||!/^sk-[\w-]{10,}$/.test(data.key.trim()))return reply(400,{error:'Vul een geldige OpenAI-API-sleutel in.'});
    key=data.key.trim();return reply(200,{configured:true});
   }
   if(path==='/api/key'&&req.method==='DELETE'){key='';return reply(200,{configured:false});}
   if(path==='/api/session'&&req.method==='POST'){
    if(!key)return reply(503,{error:'Stel eerst een OpenAI-API-sleutel in.'});
    if(starting)return reply(429,{error:'Er wordt al een gesprek gestart.'});
    const sdp=await body(65536);if(!sdp.startsWith('v=0'))return reply(400,{error:'Ongeldige audioverbinding.'});
    starting=true;
    try{
     const fd=new FormData();fd.set('sdp',sdp);fd.set('session',JSON.stringify({type:'realtime',model,instructions:personality,tools,tool_choice:'auto',output_modalities:['audio'],audio:{input:{transcription:{model:'gpt-4o-mini-transcribe',language:'nl'},turn_detection:{type:'semantic_vad',eagerness:'medium',create_response:true,interrupt_response:true}},output:{voice:'marin'}}}));
     const upstream=await fetchImpl('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:'Bearer '+key},body:fd,signal:AbortSignal.timeout(30000)});
     if(!upstream.ok){await upstream.text();return reply(upstream.status===401?401:502,{error:upstream.status===401?'De API-sleutel is niet geldig.':upstream.status===429?'OpenAI-limiet of API-tegoed bereikt. Controleer je API-account.':'OpenAI kon het gesprek niet starten (HTTP '+upstream.status+'). Controleer modeltoegang en API-account.'});}
     return reply(200,await upstream.text(),'application/sdp');
    }finally{starting=false;}
   }
   if(req.method!=='GET')return reply(405,{error:'Methode niet toegestaan.'});
   const file=files[path];if(!file)return reply(404,{error:'Niet gevonden'});
   reply(200,await readFile(new URL('./dist/'+file,import.meta.url)),file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');
  }catch{reply(500,{error:'Aanvraag mislukt. Controleer de invoer of internetverbinding.'});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createApp().listen(4173,'127.0.0.1',()=>console.log('Bittle Commander: http://127.0.0.1:4173'));
