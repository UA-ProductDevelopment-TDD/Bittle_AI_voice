const CLIENT_SECRET_URL='https://api.openai.com/v1/realtime/client_secrets';
const CALL_URL='https://api.openai.com/v1/realtime/calls';

async function apiError(response){
 if(response.status===401)return new Error('De API-sleutel is niet geldig.');
 if(response.status===429)return new Error('OpenAI-limiet of API-tegoed bereikt. Controleer je API-account.');
 return new Error('OpenAI kon het gesprek niet starten (HTTP '+response.status+'). Controleer modeltoegang en API-account.');
}

export async function createBrowserSession({key,sdp,session,fetchImpl=fetch,signal}={}){
 if(typeof key!=='string'||!/^sk-[\w-]{10,}$/.test(key))throw new Error('Vul een geldige OpenAI-API-sleutel in.');
 if(typeof sdp!=='string'||!sdp.startsWith('v=0'))throw new Error('Ongeldige audioverbinding.');
 if(!session||session.type!=='realtime'||typeof session.model!=='string')throw new Error('Ongeldige Realtime-configuratie.');

 const tokenResponse=await fetchImpl(CLIENT_SECRET_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({session}),signal});
 if(!tokenResponse.ok)throw await apiError(tokenResponse);
 const token=await tokenResponse.json();
 if(typeof token.value!=='string'||!token.value)throw new Error('OpenAI gaf geen tijdelijke gesprekssleutel terug.');

 const callResponse=await fetchImpl(CALL_URL,{method:'POST',headers:{Authorization:'Bearer '+token.value,'Content-Type':'application/sdp'},body:sdp,signal});
 if(!callResponse.ok)throw await apiError(callResponse);
 return callResponse.text();
}
