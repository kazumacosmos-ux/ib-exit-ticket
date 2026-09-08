import {initializeApp} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {getDatabase,ref,onValue,runTransaction,set} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {firebaseConfig} from "./Firebase設定.js";
const app=initializeApp(firebaseConfig),db=getDatabase(app);
const $=id=>document.getElementById(id);
let settings={start:"09:00",end:"17:00",slotMinutes:30,maxGroups:5,open:true},slots={},selectedSlot;
const toMin=t=>{const[h,m]=t.split(":").map(Number);return h*60+m};
const key=m=>String(Math.floor(m/60)).padStart(2,"0")+"-"+String(m%60).padStart(2,"0");
const createSlots=()=>{const r={};for(let m=toMin(settings.start);m<toMin(settings.end);m+=Number(settings.slotMinutes)){const e=m+Number(settings.slotMinutes);r[key(m)]={key:key(m),start:key(m).replace("-",":"),end:key(e).replace("-",":")}}return r};
function render(){const generated=createSlots();$("slot").innerHTML="";Object.values(generated).forEach(s=>{const c=Number(slots[s.key]?.count||0),o=document.createElement("option");o.value=s.key;o.textContent=`${s.start}～${s.end}（残り ${Math.max(0,Number(settings.maxGroups)-c)}組）`;o.disabled=c>=Number(settings.maxGroups);$("slot").appendChild(o)});updateInfo()}
function updateInfo(){selectedSlot=createSlots()[$("slot").value];$("slotInfo").textContent=selectedSlot?`${selectedSlot.start}～${selectedSlot.end}：${Number(slots[selectedSlot.key]?.count||0)}/${settings.maxGroups}組`:""}
onValue(ref(db,"Queue/settings"),s=>{settings={...settings,...(s.val()||{})};$("reserveArea").hidden=!settings.open;$("closedArea").hidden=!!settings.open;render()});
onValue(ref(db,"Queue/slots"),s=>{slots=s.val()||{};render()});
$("slot").onchange=updateInfo;
const saved=localStorage.getItem("ib_reservation");
if(saved)try{const r=JSON.parse(saved);$("myNumber").textContent=r.number;$("myName").textContent=r.name||"";$("mySlot").textContent=`${r.start}～${r.end}`;$("mySize").textContent=r.size;$("reserveArea").hidden=true;$("reservationArea").hidden=false}catch{}
$("reserve").onclick=async()=>{ $("error").textContent="";const name=$("name").value.trim(),size=Number($("size").value),s=createSlots()[$("slot").value];if(!name){$("error").textContent="名前を入力してください。";return}if(!s)return;
const cr=await runTransaction(ref(db,`Queue/slots/${s.key}/count`),n=>{const x=Number(n||0);return x>=Number(settings.maxGroups)?undefined:x+1});if(!cr.committed){$("error").textContent="その時間帯は満員です。";return}
const lr=await runTransaction(ref(db,"Queue/reservationLast"),n=>Number(n||0)+1);if(!lr.committed){await runTransaction(ref(db,`Queue/slots/${s.key}/count`),n=>Math.max(0,Number(n||0)-1));$("error").textContent="予約番号の取得に失敗しました。";return}
const r={number:lr.snapshot.val(),name,slot:s.key,start:s.start,end:s.end,size,type:"web",createdAt:Date.now()};await set(ref(db,`Queue/reservations/${r.number}`),r);localStorage.setItem("ib_reservation",JSON.stringify(r));$("myNumber").textContent=r.number;$("myName").textContent=name;$("mySlot").textContent=`${s.start}～${s.end}`;$("mySize").textContent=size;$("reserveArea").hidden=true;$("reservationArea").hidden=false};
