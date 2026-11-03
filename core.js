export const NS = 'toolkit_v3';
export const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
export function normalizeCode(text) {return String(text || '').trim().toUpperCase();}
export function randomCode(cryptoObject=globalThis.crypto) {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',a=new Uint32Array(6);cryptoObject.getRandomValues(a);
  return Array.from(a,x=>alphabet[x%32]).join('');
}
export function uniqueId(){return 'r_'+crypto.randomUUID().replaceAll('-','');}
export function parseNames(text){
  const names=text.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length||names.length>20)throw Error('Nhập từ 1 đến 20 nhóm, mỗi dòng một nhóm.');
  if(names.some(n=>n.length>60))throw Error('Tên nhóm tối đa 60 ký tự.');
  if(new Set(names.map(n=>n.toLocaleLowerCase())).size!==names.length)throw Error('Tên các nhóm cần khác nhau.');
  return names;
}
export function makeState(names){return {closed:false,teams:Object.fromEntries(names.map((name,i)=>['g'+(i+1),{name,score:0}])),timer:{durationMs:300000,remainingMs:300000,startedAt:0,status:'idle',revision:'initial'},currentRound:{id:'waiting',number:0,phase:'closed',awarded:false}};}
export function timerRemaining(timer,now){if(!timer)return 0;return Math.max(0,timer.status==='running'?timer.remainingMs-(now-timer.startedAt):timer.remainingMs);}
export function clockText(ms){const sec=Math.ceil(Math.max(0,ms)/1000);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
export function orderedQueue(round){
  const entries=Object.values(round?.requests||{}).sort((a,b)=>a.at-b.at||a.uid.localeCompare(b.uid));
  const winner=round?.winner;
  return winner?[winner,...entries.filter(x=>x.uid!==winner.uid)]:entries;
}
export function isExpired(meta,now){return !meta||meta.expiresAt<=now;}
export function canBuzz(state,meta,round,uid,online,now){return Boolean(online&&uid&&state&&!state.closed&&!isExpired(meta,now)&&state.currentRound?.phase==='open'&&!round?.requests?.[uid]);}
export function adjustScore(state,teamId,delta){if(!state?.teams?.[teamId]||state.closed)return;state.teams[teamId].score=Math.max(0,Math.min(100000,state.teams[teamId].score+delta));return state;}
export function awardWinner(state,roundId,teamId){if(!state||state.closed||state.currentRound.id!==roundId||state.currentRound.awarded||!state.teams[teamId])return;state.currentRound.awarded=true;state.teams[teamId].score=Math.min(100000,state.teams[teamId].score+1);return state;}
// Server Security Rules arbitrate the first accepted atomic write. Each request
// and the winner are committed together. All later writes may add ONLY their
// own immutable request. No client clock is trusted to decide the winner.
export async function submitBuzz(api,roundPath,uid,member){
  const entry={uid,name:member.name,teamId:member.teamId,at:api.serverTimestamp()};
  try {await api.update(api.ref(api.db,roundPath),{winner:entry,['requests/'+uid]:entry});return 'winner';}
  catch(error){
    if(!String(error.code||error.message).toLowerCase().includes('permission'))throw error;
    const existing=(await api.get(api.ref(api.db,roundPath+'/requests/'+uid))).val();
    if(existing)return 'recorded';
    const winner=(await api.get(api.ref(api.db,roundPath+'/winner'))).val();
    if(!winner)throw error;
    await api.set(api.ref(api.db,roundPath+'/requests/'+uid),{...entry,at:api.serverTimestamp()});
    return 'queued';
  }
}
