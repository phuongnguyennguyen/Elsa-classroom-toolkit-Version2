import * as F from './sdk.js';
import {firebaseConfig} from './firebase-config.js';
import {NS,CODE_RE,normalizeCode,timerRemaining,clockText,isExpired} from './core.js';
export const $=id=>document.getElementById(id);
export function el(tag,text='',cls=''){const x=document.createElement(tag);x.textContent=text;if(cls)x.className=cls;return x;}
export function message(text,kind='info'){const box=$('message');if(!box)return;box.hidden=!text;box.textContent=text;box.dataset.kind=kind;}
export function errorText(e){
 const code=String(e?.code||'').toLowerCase();
 if(code.includes('operation-not-allowed'))return 'Chưa bật phương thức đăng nhập trong Firebase. Xem hướng dẫn cài đặt Authentication.';
 if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra tài khoản giảng viên.';
 if(code.includes('too-many-requests'))return 'Firebase đang giới hạn số lần thử. Chờ một chút rồi thử lại; nếu cả lớp mới vào cùng lúc, cho các nhóm vào lần lượt.';
 if(code.includes('permission'))return 'Thao tác chưa được Firebase cho phép. Lượt có thể đã đóng, phòng hết hạn, hoặc Rules/quyền giảng viên chưa được thiết lập đúng.';
 if(code.includes('network'))return 'Không kết nối được. Kiểm tra Internet rồi thử lại.';
 return e?.message||'Không thực hiện được thao tác. Vui lòng thử lại.';
}
export async function createClient(role){
 if(location.protocol==='file:')throw Error('Hãy mở trang qua địa chỉ HTTPS sau khi tải lên GitHub/Cloudflare. Không mở trực tiếp file HTML để dùng realtime.');
 const app=F.initializeApp(firebaseConfig,'elsa-'+role+'-v3'),auth=F.getAuth(app),db=F.getDatabase(app);
 await F.setPersistence(auth,role==='teacher'?F.browserSessionPersistence:F.browserLocalPersistence);
 await auth.authStateReady();
 const c={...F,app,auth,db,online:false,offset:0,onConnection:()=>{},now(){return Date.now()+this.offset;}};
 F.onValue(F.ref(db,'.info/serverTimeOffset'),s=>{c.offset=Number(s.val())||0;});
 F.onValue(F.ref(db,'.info/connected'),s=>{c.online=s.val()===true;const badge=$('connection');if(badge){badge.textContent=c.online?'● Đã kết nối':'○ Đang kết nối lại…';badge.dataset.online=String(c.online);}c.onConnection(c.online);});
 return c;
}
export function roomPath(code){return NS+'/rooms/'+code;}
export function codeFromURL(){return normalizeCode(new URL(location.href).searchParams.get('room'));}
export function checkCode(code){if(!CODE_RE.test(code))throw Error('Mã phòng gồm 6 ký tự. Kiểm tra lại mã cô cung cấp.');return code;}
export function studentLink(code,group=''){const u=new URL('student.html',location.href);u.searchParams.set('room',code);if(group)u.searchParams.set('group',group);return u.href;}
export function setRoomURL(code){const u=new URL(location.href);u.searchParams.set('room',code);history.replaceState(null,'',u);}
export async function copyText(text){try{await navigator.clipboard.writeText(text);message('Đã sao chép.');}catch{const box=$('copyFallback');if(box){box.hidden=false;box.value=text;box.focus();box.select();message('Bấm Ctrl+C để sao chép dòng đã chọn.');}else message('Không sao chép tự động được. Hãy chọn địa chỉ trên màn hình rồi sao chép.');}}
export function fillScores(container,teams,onScore){container.replaceChildren();for(const[id,g]of Object.entries(teams||{})){
 const card=el('div','','score-card');const plus=el(onScore?'button':'div',g.name,'score-name');const number=el('strong',g.score,'score-number');
 if(onScore){plus.type='button';plus.dataset.control='';plus.title='Cộng 1 điểm';plus.onclick=()=>onScore(id,1);const minus=el('button','−','minus');minus.type='button';minus.dataset.control='';minus.setAttribute('aria-label','Trừ 1 điểm '+g.name);minus.onclick=()=>onScore(id,-1);card.append(plus,number,minus);}else card.append(plus,number);
 container.append(card);
}}
export function fillQueue(container,round,teams,entries){container.replaceChildren();if(!entries.length){container.append(el('p','Chưa có lượt bấm.','muted'));return;}
 entries.forEach((x,i)=>{const row=el('li','','queue-row');row.append(el('span',i===0?'★':String(i+1),'queue-rank'),el('strong',x.name),el('span',teams?.[x.teamId]?.name||'Nhóm đã thay đổi','muted'));container.append(row);});}
export class RoomWatch {
 constructor(client,code,render){this.c=client;this.code=code;this.render=render;this.meta=null;this.state=null;this.round=null;this.roundReady=false;this.roundId='';this.unsubs=[];this.unRound=null;this.loaded=false;}
 start(){const {c}=this;const fail=e=>message(errorText(e),'error');
 this.unsubs.push(c.onValue(c.ref(c.db,roomPath(this.code)+'/meta'),s=>{this.meta=s.val();this.loaded=true;this.emit();},fail));
 this.unsubs.push(c.onValue(c.ref(c.db,roomPath(this.code)+'/state'),s=>{this.state=s.val();const id=this.state?.currentRound?.id||'';if(id!==this.roundId){this.unRound?.();this.roundId=id;this.round=null;this.roundReady=false;if(id)this.unRound=c.onValue(c.ref(c.db,roomPath(this.code)+'/rounds/'+id),r=>{if(this.roundId===id){this.round=r.val();this.roundReady=true;this.emit();}},fail);}this.emit();},fail));return this;
 }
 emit(){this.render(this);}
 stop(){this.unsubs.forEach(fn=>fn());this.unRound?.();}
 get ended(){return this.state?.closed||isExpired(this.meta,this.c.now());}
}
let sound=null,soundEnabled=false;
export function toggleSound(){soundEnabled=!soundEnabled;if(soundEnabled){const A=window.AudioContext||window.webkitAudioContext;if(A){sound??=new A();sound.resume().catch(()=>{});}else soundEnabled=false;}if($('sound'))$('sound').textContent=soundEnabled?'♪ Âm thanh bật':'♪ Bật âm thanh';return soundEnabled;}
export function beep(){if(!soundEnabled||!sound)return;const o=sound.createOscillator(),g=sound.createGain();o.connect(g);g.connect(sound.destination);o.frequency.value=740;g.gain.setValueAtTime(.12,sound.currentTime);g.gain.exponentialRampToValueAtTime(.001,sound.currentTime+.35);o.start();o.stop(sound.currentTime+.35);}
export function paintClock(timer,now){const ms=timerRemaining(timer,now);const clock=$('clock');if(clock){clock.textContent=clockText(ms);clock.classList.toggle('time-up',timer?.status==='finished'||(timer?.status==='running'&&ms<=0));}return ms;}
export function bootFailure(error){$('loading')?.setAttribute('hidden','');message(errorText(error),'error');}
