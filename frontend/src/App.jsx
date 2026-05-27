import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";

// ─── CONTAS ──────────────────────────────────────────────────────────────────
const INITIAL_ACCOUNTS = [
  { id:1, name:"confir MEI", type:"uazapi", color:"#7c3aed", dot:"#a78bfa", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:2, name:"Confidence", type:"uazapi", color:"#0ea5e9", dot:"#38bdf8", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:3, name:"Pessoal",    type:"uazapi", color:"#f59e0b", dot:"#fbbf24", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:4, name:"Pet Family", type:"uazapi", color:"#ec4899", dot:"#f472b6", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
];

const LANES = [
  { id:"espera",      label:"Espera",         icon:"⏳", color:"#64748b", bg:"#f1f5f9", dark:"#1e293b" },
  { id:"atendimento", label:"Em Atendimento", icon:"💬", color:"#0ea5e9", bg:"#e0f2fe", dark:"#082f49" },
  { id:"urgente",     label:"Urgente",        icon:"🔴", color:"#ef4444", bg:"#fee2e2", dark:"#450a0a" },
  { id:"concluido",   label:"Concluído",      icon:"✅", color:"#10b981", bg:"#d1fae5", dark:"#022c22" },
];

const DEMO_NAMES = ["Ana Costa","Pedro Lima","Juliana Torres","Carlos Ramos","Fernanda Melo","Diego Alves","Beatriz Nunes","Rafael Souza"];
const DEMO_MSGS  = [
  "Olá! Preciso de ajuda URGENTE com meu pedido!",
  "Qual o preço do produto premium?",
  "Boa tarde! Quando vocês abrem amanhã?",
  "MEU PRODUTO CHEGOU COM DEFEITO!!!",
  "Tenho interesse nos planos anuais.",
  "Muito obrigado pelo atendimento! 😊",
  "Não recebi meu reembolso, já faz 3 semanas!!!",
  "Qual o prazo de entrega para SP?",
];

function nowT(){ return new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
function nowDT(){ return new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
let uid = 2000;

// ─── UAZAPI via backend proxy ─────────────────────────────────────────────────
// O Vite redireciona /api/* para http://localhost:3001
async function uazGet(cfg, path){
  const qs = `?base=${encodeURIComponent(cfg.baseUrl)}`;
  const r = await fetch(`/api/uazapi${path}${qs}`, {
    headers:{ token: cfg.token, sessionkey: cfg.sessionKey }
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function uazPost(cfg, path, body){
  const qs = `?base=${encodeURIComponent(cfg.baseUrl)}`;
  const r = await fetch(`/api/uazapi${path}${qs}`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", token:cfg.token, sessionkey:cfg.sessionKey },
    body: JSON.stringify(body),
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchQR(cfg){
  try{ const d=await uazGet(cfg,"/qrcode"); return d.qrcode||d.base64||d.data||null; }catch{ return null; }
}
async function fetchStatus(cfg){
  try{ const d=await uazGet(cfg,"/status"); return d.status||d.result||"disconnected"; }catch{ return "error"; }
}
async function fetchChats(cfg){
  try{ const d=await uazGet(cfg,"/getContacts"); return Array.isArray(d)?d:(d.contacts||d.chats||[]); }catch{ return []; }
}
async function fetchHistory(cfg, phone, limit=50){
  try{
    const d = await uazGet(cfg,`/getMessages?phone=${encodeURIComponent(phone)}&limit=${limit}`);
    const raw = Array.isArray(d)?d:(d.messages||d.data||[]);
    return raw.map(m=>({
      from:  m.fromMe||m.from_me?"me":"contact",
      text:  m.body||m.text||m.content||"…",
      time:  typeof m.timestamp==="number"
        ? new Date(m.timestamp*1000).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})
        : m.datetime||nowT(),
    }));
  }catch{ return null; }
}
async function sendTextApi(cfg, phone, text){
  return uazPost(cfg,"/sendText",{ session:cfg.session, sessionkey:cfg.sessionKey, token:cfg.token, number:phone, text });
}

// ─── IA via backend proxy ─────────────────────────────────────────────────────
async function classifyMsg(contact, message){
  try{
    const r = await fetch("/api/classify",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ contact, message }),
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }catch{ return { lane:"espera", reason:"erro" }; }
}

// ─── BACKUP via localStorage ──────────────────────────────────────────────────
const BK_META = "multiatend:backups";
const BK_PFX  = "multiatend:bk:";

function saveBackup(convs, accounts, label="auto"){
  try{
    let meta = [];
    try{ meta = JSON.parse(localStorage.getItem(BK_META)||"[]"); }catch{}
    const id    = Date.now();
    const entry = { id, label, ts: nowDT(), count: convs.length };
    const data  = { convs, accounts: accounts.map(a=>({...a,token:"[oculto]"})) };
    localStorage.setItem(BK_PFX+id, JSON.stringify(data));
    meta = [entry,...meta].slice(0,10);
    localStorage.setItem(BK_META, JSON.stringify(meta));
    return { ok:true, entry };
  }catch(e){ return { ok:false, error:e.message }; }
}
function loadBackupMeta(){
  try{ return JSON.parse(localStorage.getItem(BK_META)||"[]"); }catch{ return []; }
}
function loadBackupData(id){
  try{ return JSON.parse(localStorage.getItem(BK_PFX+id)||"null"); }catch{ return null; }
}
function deleteBackup(id){
  localStorage.removeItem(BK_PFX+id);
  const meta = loadBackupMeta().filter(m=>m.id!==id);
  localStorage.setItem(BK_META,JSON.stringify(meta));
}

// ════════════════════════════════════════════════════════════════════════════
// MODAIS
// ════════════════════════════════════════════════════════════════════════════
function Overlay({ children, onClose }){
  return(
    <div onClick={onClose} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.65)",
      zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }}>
      {children}
    </div>
  );
}

function SetupUazapi({ acc, onSave, onClose }){
  const [f,setF]=useState({...acc});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <Overlay onClose={onClose}>
      <div style={MC(390)} onClick={e=>e.stopPropagation()}>
        <MH color={acc.color} title={`⚙️ ${acc.name} — Uazapi`} onClose={onClose}/>
        <div style={MP}>
          <FI label="Nome"        value={f.name}       onChange={v=>s("name",v)}/>
          <FI label="URL base da Uazapi" value={f.baseUrl} onChange={v=>s("baseUrl",v)} ph="https://api.uazapi.com"/>
          <FI label="Session"     value={f.session}    onChange={v=>s("session",v)}    ph="empresa1"/>
          <FI label="Session Key" value={f.sessionKey} onChange={v=>s("sessionKey",v)} ph="empresa1"/>
          <FI label="Token"       value={f.token}      onChange={v=>s("token",v)} type="password" ph="••••••"/>
          <FI label="Gerenciador / Responsável" value={f.gerenciador} onChange={v=>s("gerenciador",v)} ph="João Silva (opcional)"/>
          <Tgl label="Ativar conta" value={f.enabled}  onChange={v=>s("enabled",v)} color={acc.color}/>
          <PB color={acc.color} onClick={()=>{onSave(f);onClose();}}>💾 Salvar</PB>
        </div>
      </div>
    </Overlay>
  );
}


function QrModal({ acc, onClose }){
  const [qr,setQr]=useState(null);
  const [st,setSt]=useState("Conectando…");
  const t=useRef();
  const poll=useCallback(async()=>{
    const s=await fetchStatus(acc);
    if(s==="connected"||String(s).includes("connect")){ setSt("✅ Conectado!"); clearInterval(t.current); return; }
    const c=await fetchQR(acc);
    if(c){ setQr(c); setSt("📱 Escaneie no WhatsApp"); } else setSt("⏳ Gerando QR…");
  },[acc]);
  useEffect(()=>{ poll(); t.current=setInterval(poll,8000); return()=>clearInterval(t.current); },[poll]);
  return(
    <Overlay onClose={onClose}>
      <div style={MC(290)} onClick={e=>e.stopPropagation()}>
        <MH color={acc.color} title={`📱 ${acc.name}`} onClose={onClose}/>
        <div style={{ padding:20,textAlign:"center" }}>
          <p style={{ color:"#94a3b8",fontSize:13,marginBottom:14 }}>{st}</p>
          {qr ? <img src={qr.startsWith("data:")?qr:`data:image/png;base64,${qr}`}
              alt="QR" style={{ width:190,height:190,borderRadius:8,border:"1px solid #334155" }}/>
            : <div style={{ width:190,height:190,margin:"0 auto",background:"#0f172a",borderRadius:8,
                display:"flex",alignItems:"center",justifyContent:"center" }}><Spin color={acc.color} size={32}/></div>
          }
          <p style={{ fontSize:10,color:"#475569",marginTop:10 }}>Atualiza a cada 8s</p>
        </div>
      </div>
    </Overlay>
  );
}

function ChatModal({ conv, acc, onClose, onMoveLane }){
  const [input,setInput]=useState("");
  const [msgs,setMsgs]=useState(conv.messages||[{ from:"contact",text:conv.lastMsg,time:conv.time }]);
  const [busy,setBusy]=useState(false);
  const [loadingH,setLoadingH]=useState(false);
  const end=useRef();
  useEffect(()=>{ end.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  async function loadHistory(){
    setLoadingH(true);
    const hist=await fetchHistory(acc,conv.phone,50);
    if(hist&&hist.length>0){ setMsgs(hist); }
    else{ setMsgs(m=>[{ from:"system",text:"⚠️ Histórico indisponível.",time:nowT() },...m]); }
    setLoadingH(false);
  }

  async function send(){
    if(!input.trim()||busy) return;
    const text=input.trim(); setInput(""); setBusy(true);
    setMsgs(m=>[...m,{ from:"me",text,time:nowT() }]);
    try{
      if(acc.type==="uazapi") await sendTextApi(acc,conv.phone,text);
    }catch(e){ setMsgs(m=>[...m,{ from:"system",text:`❌ ${e.message}`,time:nowT() }]); }
    finally{ setBusy(false); }
  }

  const lane=LANES.find(l=>l.id===conv.lane)||LANES[0];

  return(
    <Overlay onClose={onClose}>
      <div style={{ ...MC(460),display:"flex",flexDirection:"column",maxHeight:"86vh" }} onClick={e=>e.stopPropagation()}>
        <div style={{ background:acc.color,padding:"13px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0 }}>
          <Av letter={conv.contact[0]} size={36} color="#fff" bg="rgba(255,255,255,.22)"/>
          <div style={{ flex:1 }}>
            <div style={{ color:"#fff",fontWeight:800,fontSize:14 }}>{conv.contact}</div>
            <div style={{ color:"rgba(255,255,255,.65)",fontSize:11 }}>{conv.phone}</div>
          </div>
          <span style={{ fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:20,
            background:"rgba(255,255,255,.22)",color:"#fff" }}>{lane.icon} {lane.label}</span>
          {acc.type==="uazapi"&&(
            <button onClick={loadHistory} disabled={loadingH} style={{
              background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:8,
              padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700,
              display:"flex",alignItems:"center",gap:4 }}>
              {loadingH?<Spin color="#fff" size={11}/>:"📜"} Histórico
            </button>
          )}
          <button onClick={onClose} style={X}>✕</button>
        </div>

        <div style={{ padding:"6px 12px",background:"#1a2332",borderBottom:"1px solid #334155",
          display:"flex",gap:4,flexShrink:0,overflowX:"auto",alignItems:"center" }}>
          <span style={{ fontSize:9,color:"#475569",fontWeight:700,marginRight:4,whiteSpace:"nowrap" }}>Mover:</span>
          {LANES.map(l=>(
            <button key={l.id} onClick={()=>onMoveLane(conv.id,l.id)} style={{
              fontSize:9,fontWeight:800,padding:"3px 9px",borderRadius:20,cursor:"pointer",whiteSpace:"nowrap",
              border:conv.lane===l.id?`2px solid ${l.color}`:"2px solid transparent",
              color:l.color,background:l.color+"18" }}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>

        <div style={{ flex:1,overflowY:"auto",padding:14,background:"#1a1a2e",
          display:"flex",flexDirection:"column",gap:8 }}>
          {msgs.map((m,i)=>(
            <div key={i} style={{ display:"flex",justifyContent:
              m.from==="me"?"flex-end":m.from==="system"?"center":"flex-start" }}>
              <div style={{ maxWidth:"76%",padding:"8px 12px",
                borderRadius:m.from==="me"?"16px 16px 4px 16px":m.from==="system"?"8px":"16px 16px 16px 4px",
                background:m.from==="me"?"#1d4e3a":m.from==="system"?"#2d2410":"#243040",
                boxShadow:"0 1px 2px rgba(0,0,0,.3)",fontSize:13,
                color:m.from==="system"?"#fbbf24":"#e2e8f0" }}>
                {m.text}
                <div style={{ fontSize:10,color:"#475569",marginTop:2,textAlign:"right" }}>{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={end}/>
        </div>

        <div style={{ padding:"10px 12px",background:"#0f172a",display:"flex",gap:8,flexShrink:0 }}>
          <input value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="Digite uma mensagem…"
            style={{ flex:1,border:"1px solid #334155",borderRadius:24,padding:"9px 15px",
              fontSize:13,outline:"none",fontFamily:"inherit",background:"#1e293b",color:"#f1f5f9" }}/>
          <button onClick={send} disabled={busy||!input.trim()} style={{
            background:busy?"#334155":acc.color,color:"#fff",border:"none",
            borderRadius:"50%",width:38,height:38,cursor:busy?"not-allowed":"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:15 }}>
            {busy?<Spin color="#fff" size={14}/>:"➤"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function BackupPanel({ onClose, convs, accounts, onRestore, toast_ }){
  const [meta,setMeta]     = useState(loadBackupMeta);
  const [saving,setSaving] = useState(false);

  function doBackup(label="manual"){
    setSaving(true);
    const r=saveBackup(convs,accounts,label);
    if(r.ok){ setMeta(loadBackupMeta()); toast_("✅ Backup salvo!"); }
    else toast_("❌ Erro: "+r.error);
    setSaving(false);
  }
  function doRestore(id){
    const data=loadBackupData(id);
    if(!data){ toast_("❌ Backup não encontrado."); return; }
    onRestore(data.convs);
    toast_(`✅ Restaurado: ${data.convs.length} conversa(s).`);
    onClose();
  }
  function doDelete(id){
    deleteBackup(id); setMeta(loadBackupMeta()); toast_("🗑️ Removido.");
  }

  return(
    <Overlay onClose={onClose}>
      <div style={{ ...MC(500),maxHeight:"88vh",display:"flex",flexDirection:"column" }} onClick={e=>e.stopPropagation()}>
        <MH color="#6366f1" title="💾 Gerenciar Backups" onClose={onClose}/>
        <div style={{ padding:20,display:"flex",flexDirection:"column",gap:16,flex:1,overflowY:"auto" }}>

          <div style={{ background:"#1e293b",borderRadius:10,padding:"14px 16px",
            border:"1px solid #334155",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800,fontSize:13,color:"#f1f5f9" }}>Backup Automático</div>
              <div style={{ fontSize:11,color:"#64748b",marginTop:3 }}>
                Salva automaticamente a cada <strong style={{ color:"#818cf8" }}>1 hora</strong> no localStorage.
                Últimos 10 backups mantidos.
              </div>
            </div>
            <button onClick={()=>doBackup("manual")} disabled={saving} style={{
              background:saving?"#334155":"#6366f1",color:"#fff",border:"none",borderRadius:8,
              padding:"7px 14px",fontSize:12,fontWeight:700,cursor:saving?"not-allowed":"pointer",
              display:"flex",alignItems:"center",gap:6 }}>
              {saving?<Spin color="#fff" size={12}/>:"💾"} Salvar agora
            </button>
          </div>

          <div style={{ display:"flex",gap:10 }}>
            {[
              { label:"Backups salvos",  value:meta.length,                               color:"#818cf8" },
              { label:"Conversas atual", value:convs.length,                              color:"#34d399" },
              { label:"Contas ativas",   value:accounts.filter(a=>a.enabled).length+"/4", color:"#fb923c" },
            ].map(s=>(
              <div key={s.label} style={{ flex:1,background:"#1e293b",borderRadius:9,padding:"10px 12px",border:"1px solid #334155" }}>
                <div style={{ fontSize:20,fontWeight:900,color:s.color }}>{s.value}</div>
                <div style={{ fontSize:10,color:"#475569",marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:11,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:.6 }}>Backups Salvos</div>

          {meta.length===0 && (
            <div style={{ textAlign:"center",padding:"20px 0",color:"#475569",fontSize:13 }}>
              Nenhum backup ainda.
            </div>
          )}
          {meta.map((m,i)=>(
            <div key={m.id} style={{ background:"#1e293b",borderRadius:10,padding:"12px 14px",
              marginBottom:4,border:"1px solid #334155",display:"flex",alignItems:"center",gap:12 }}>
              <div style={{ width:28,height:28,borderRadius:"50%",background:"#6366f118",
                color:"#818cf8",fontWeight:800,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center" }}>
                {meta.length-i}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700,fontSize:13,color:"#f1f5f9" }}>{m.ts}</span>
                  <span style={{ fontSize:9,fontWeight:800,padding:"1px 7px",borderRadius:20,
                    background:m.label==="auto"?"#6366f118":"#10b98118",
                    color:m.label==="auto"?"#818cf8":"#34d399" }}>
                    {m.label==="auto"?"AUTO":"MANUAL"}
                  </span>
                  {i===0&&<span style={{ fontSize:9,fontWeight:800,padding:"1px 7px",borderRadius:20,
                    background:"#f9731644",color:"#fb923c" }}>RECENTE</span>}
                </div>
                <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{m.count} conversa{m.count!==1?"s":""}</div>
              </div>
              <div style={{ display:"flex",gap:6 }}>
                <button onClick={()=>doRestore(m.id)} style={{
                  background:"#10b98118",color:"#34d399",border:"1px solid #10b98133",
                  borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer" }}>
                  ↩ Restaurar
                </button>
                <button onClick={()=>doDelete(m.id)} style={{
                  background:"#ef444418",color:"#f87171",border:"1px solid #ef444433",
                  borderRadius:7,padding:"5px 8px",fontSize:11,cursor:"pointer" }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

function KCard({ conv, accounts, onOpen, isClassifying }){
  const acc=accounts.find(a=>a.id===conv.accountId)||accounts[0];
  return(
    <div onClick={()=>!isClassifying&&onOpen(conv)} style={{
      background:"#1e293b",borderRadius:12,padding:"12px 13px",marginBottom:8,
      boxShadow:"0 2px 8px rgba(0,0,0,.3)",cursor:isClassifying?"default":"pointer",
      border:`1px solid ${acc.color}28`,position:"relative",overflow:"hidden",
      transition:"box-shadow .15s,transform .15s",opacity:isClassifying?.8:1,
    }}
      onMouseEnter={e=>{ if(!isClassifying){e.currentTarget.style.boxShadow=`0 4px 18px ${acc.color}33`;e.currentTarget.style.transform="translateY(-1px)"; }}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.3)";e.currentTarget.style.transform=""; }}>
      <div style={{ position:"absolute",left:0,top:0,right:0,height:3,background:acc.color }}/>
      <div style={{ display:"flex",alignItems:"flex-start",gap:9,marginTop:2 }}>
        <Av letter={conv.contact[0]} size={34} color={acc.color} bg={acc.color+"22"}/>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontWeight:700,fontSize:13,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130 }}>
              {conv.contact}
            </span>
            <span style={{ fontSize:10,color:"#475569",flexShrink:0 }}>{conv.time}</span>
          </div>
          <div style={{ fontSize:11,color:"#64748b",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
            {conv.lastMsg}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:5,marginTop:6,flexWrap:"wrap" }}>
            <span style={{ fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:20,
              color:acc.color,background:acc.color+"18" }}>{acc.name}</span>
            <span style={{ fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:20,
              color:acc.type==="uazapi"?"#818cf8":"#fbbf24",
              background:acc.type==="uazapi"?"#6366f118":"#f59e0b18" }}>
              {acc.type==="uazapi"?"UAZAPI":"NORMAL"}
            </span>
            {conv.unread>0&&<span style={{ background:acc.color,color:"#fff",borderRadius:"50%",
              minWidth:16,height:16,fontSize:9,fontWeight:800,
              display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px" }}>{conv.unread}</span>}
            {conv.aiReason&&<span style={{ fontSize:9,color:"#475569",fontStyle:"italic",overflow:"hidden",
              textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90 }}>🤖 {conv.aiReason}</span>}
          </div>
        </div>
      </div>
      {isClassifying&&(
        <div style={{ position:"absolute",inset:0,background:"rgba(15,23,42,.8)",
          display:"flex",alignItems:"center",justifyContent:"center",borderRadius:12,gap:7 }}>
          <Spin color="#818cf8" size={16}/><span style={{ fontSize:11,fontWeight:700,color:"#818cf8" }}>IA…</span>
        </div>
      )}
    </div>
  );
}

function Lane({ lane, convs, accounts, onOpen, classifyingIds }){
  return(
    <div style={{ flex:"1 1 220px",minWidth:220,maxWidth:295,display:"flex",flexDirection:"column" }}>
      <div style={{ background:lane.dark,borderRadius:12,padding:"11px 14px",marginBottom:10,border:`1.5px solid ${lane.color}33` }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:18 }}>{lane.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800,fontSize:14,color:lane.color }}>{lane.label}</div>
            <div style={{ fontSize:10,color:lane.color+"88" }}>{convs.length} conversa{convs.length!==1?"s":""}</div>
          </div>
          <div style={{ background:lane.color,color:"#fff",borderRadius:"50%",minWidth:24,height:24,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800 }}>{convs.length}</div>
        </div>
        <div style={{ display:"flex",gap:4,marginTop:8,flexWrap:"wrap" }}>
          {accounts.map(acc=>{ const n=convs.filter(c=>c.accountId===acc.id).length; if(!n) return null;
            return <span key={acc.id} style={{ fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:20,
              color:acc.color,background:acc.color+"22" }}>{acc.name}: {n}</span>; })}
        </div>
      </div>
      <div style={{ flex:1,overflowY:"auto",paddingRight:2 }}>
        {convs.length===0&&<div style={{ textAlign:"center",padding:"20px 12px",color:"#334155",fontSize:12 }}>Vazio</div>}
        {convs.map(c=><KCard key={c.id} conv={c} accounts={accounts} onOpen={onOpen} isClassifying={classifyingIds.has(c.id)}/>)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP
// ════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [accounts,setAccounts] = useState(()=>{
    try{ const s=localStorage.getItem("multiatend:accounts"); return s?JSON.parse(s):INITIAL_ACCOUNTS; }
    catch{ return INITIAL_ACCOUNTS; }
  });
  const [convs,setConvs]       = useState([]);
  const [setupAcc,setSetupAcc] = useState(null);
  const [qrAcc,setQrAcc]       = useState(null);
  const [chat,setChat]         = useState(null);
  const [syncing,setSyncing]   = useState({});
  const [classifying,setClass] = useState(new Set());
  const [showBackup,setShowBackup] = useState(false);
  const [bkStatus,setBkStatus] = useState(()=>{ const m=loadBackupMeta(); return m[0]||null; });
  const [toast,setToast]       = useState(null);
  const bkRef = useRef();

  function toast_(msg){ setToast(msg); setTimeout(()=>setToast(null),3500); }
  function saveAcc(cfg){
    const next=accounts.map(a=>a.id===cfg.id?cfg:a);
    setAccounts(next);
    localStorage.setItem("multiatend:accounts",JSON.stringify(next));
    toast_(`✅ ${cfg.name} salvo!`);
  }

  useEffect(()=>{ bkRef.current={ convs, accounts }; },[convs,accounts]);

  // Auto-backup 1h
  useEffect(()=>{
    const t=setInterval(()=>{
      const { convs:c,accounts:a }=bkRef.current;
      const r=saveBackup(c,a,"auto");
      if(r.ok){ setBkStatus(r.entry); toast_("💾 Backup automático salvo!"); }
    }, 60*60*1000);
    return()=>clearInterval(t);
  },[]);

  // ─── WebSocket para mensagens em tempo real ─────────────────────────────────
  useEffect(()=>{
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('🔌 WebSocket conectado');
      toast_('🔌 Conectado ao servidor em tempo real');
    });

    socket.on('new_message', (msg) => {
      console.log('📨 Nova mensagem via webhook:', msg);
      // Procura se já existe conversa com esse contato
      setConvs(p => {
        const existing = p.find(c => c.phone === msg.phone);
        if (existing) {
          // Atualiza conversa existente
          return p.map(c => c.phone === msg.phone ? {
            ...c,
            lastMsg: msg.message,
            time: msg.time,
            unread: c.unread + 1,
            lane: msg.lane,
            aiReason: msg.reason,
            messages: [...(c.messages || []), {
              from: 'contact',
              text: msg.message,
              time: msg.time
            }]
          } : c);
        } else {
          // Cria nova conversa
          return [{
            id: ++uid,
            accountId: 1, // Default pra primeira conta
            contact: msg.contact,
            phone: msg.phone,
            lastMsg: msg.message,
            time: msg.time,
            unread: 1,
            lane: msg.lane,
            aiReason: msg.reason,
            messages: [{ from: 'contact', text: msg.message, time: msg.time }]
          }, ...p];
        }
      });
    });

    socket.on('disconnect', () => {
      console.log('❌ WebSocket desconectado');
      toast_('⚠️ Conexão perdida com servidor');
    });

    return () => socket.disconnect();
  }, []);

  async function addConv(accountId,contact,phone,message){
    const id=++uid;
    setConvs(p=>[{ id,accountId,contact,phone,lastMsg:message,time:nowT(),
      unread:1,lane:"espera",aiReason:"",
      messages:[{ from:"contact",text:message,time:nowT() }] },...p]);
    setClass(s=>new Set([...s,id]));
    const r=await classifyMsg(contact,message);
    setConvs(p=>p.map(c=>c.id===id?{...c,lane:r.lane||"espera",aiReason:r.reason||""}:c));
    setClass(s=>{ const n=new Set(s); n.delete(id); return n; });
  }

  async function syncAcc(acc){
    if(!acc.baseUrl||!acc.token){ toast_("⚠️ Configure a conta Uazapi."); return; }
    setSyncing(s=>({...s,[acc.id]:true}));
    try{
      const raw=await fetchChats(acc);
      if(!raw.length){ toast_(`ℹ️ ${acc.name}: sem conversas.`); return; }
      const mapped=raw.map(c=>({ id:++uid,accountId:acc.id,
        contact:c.name||c.notify||"Desconhecido",
        phone:c.phone||c.id||"",
        lastMsg:c.lastMessage?.text||c.lastMsg||"…",
        time:c.lastMessage?.datetime||nowT(),
        unread:c.unread||0,lane:"espera",aiReason:"",messages:[] }));
      setConvs(p=>[...p.filter(c=>c.accountId!==acc.id),...mapped]);
      mapped.forEach(c=>{
        setClass(s=>new Set([...s,c.id]));
        classifyMsg(c.contact,c.lastMsg).then(r=>{
          setConvs(p=>p.map(x=>x.id===c.id?{...x,lane:r.lane,aiReason:r.reason}:x));
          setClass(s=>{ const n=new Set(s); n.delete(c.id); return n; });
        });
      });
      toast_(`✅ ${acc.name}: ${mapped.length} carregadas.`);
    }catch(e){ toast_(`❌ ${acc.name}: ${e.message}`); }
    finally{ setSyncing(s=>({...s,[acc.id]:false})); }
  }

  function addDemo(accountId){
    const contact=DEMO_NAMES[Math.floor(Math.random()*DEMO_NAMES.length)];
    const message=DEMO_MSGS[Math.floor(Math.random()*DEMO_MSGS.length)];
    const phone=`55119${String(Math.floor(Math.random()*89999999+10000000))}`;
    addConv(accountId,contact,phone,message);
  }

  function moveLane(id,lane){
    setConvs(p=>p.map(c=>c.id===id?{...c,lane}:c));
    setChat(p=>p?.id===id?{...p,lane}:p);
  }
  function openChat(conv){
    setConvs(p=>p.map(c=>c.id===conv.id?{...c,unread:0}:c));
    setChat({...conv});
  }

  const totalUnread=convs.reduce((a,c)=>a+c.unread,0);
  const chatAcc=chat?accounts.find(a=>a.id===chat.accountId):null;

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0b1120;font-family:'Inter',sans-serif;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:4px;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes glow{0%,100%{box-shadow:0 0 0 0 #6366f155}50%{box-shadow:0 0 0 5px transparent}}
      `}</style>
      <div style={{ minHeight:"100vh",background:"#0b1120" }}>
        {/* TOP BAR */}
        <div style={{ background:"#0f172a",borderBottom:"1px solid #1e293b",
          height:60,padding:"0 20px",display:"flex",alignItems:"center",gap:12 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ width:34,height:34,borderRadius:9,
              background:"linear-gradient(135deg,#7c3aed,#0ea5e9)",
              display:"flex",alignItems:"center",justifyContent:"center" }}><WaIcon/></div>
            <div>
              <div style={{ fontWeight:800,fontSize:14,color:"#f1f5f9",lineHeight:1.1 }}>MultiAtend</div>
              <div style={{ fontSize:9,color:"#475569",letterSpacing:.5 }}>IA · KANBAN · BACKUP</div>
            </div>
          </div>

          <div style={{ display:"flex",gap:5,marginLeft:6,flexWrap:"wrap" }}>
            {accounts.map(acc=>(
              <button key={acc.id} onClick={()=>setSetupAcc(acc)} style={{
                display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,
                background:acc.color+"14",border:`1px solid ${acc.color}33`,cursor:"pointer" }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:acc.dot,
                  animation:acc.enabled?"pulse 2s infinite":"none" }}/>
                <span style={{ fontSize:10,fontWeight:700,color:acc.color }}>{acc.name}</span>
                {acc.type==="uazapi"&&acc.enabled&&(
                  <>
                    <button onClick={e=>{e.stopPropagation();syncAcc(acc);}}
                      style={{ background:"none",border:"none",color:acc.color,cursor:"pointer",fontSize:11,padding:0 }}>
                      {syncing[acc.id]?<Spin color={acc.color} size={9}/>:"↻"}
                    </button>
                    <button onClick={e=>{e.stopPropagation();setQrAcc(acc);}}
                      style={{ background:"none",border:"none",color:acc.color,cursor:"pointer",fontSize:11,padding:0 }}>📱</button>
                  </>
                )}
              </button>
            ))}
          </div>

          <div style={{ flex:1 }}/>
          <div style={{ display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,
            background:"#6366f114",border:"1px solid #6366f133" }}>
            <div style={{ width:6,height:6,borderRadius:"50%",background:"#818cf8",animation:"glow 2s infinite" }}/>
            <span style={{ fontSize:9,fontWeight:800,color:"#818cf8" }}>IA ATIVA</span>
          </div>
          <div style={{ width:1,height:26,background:"#1e293b" }}/>
          <button onClick={()=>setShowBackup(true)} style={{
            display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,
            background:"#1e293b",border:"1px solid #334155",cursor:"pointer",color:"#94a3b8" }}>
            <span style={{ fontSize:12 }}>💾</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:10,fontWeight:700,color:"#94a3b8" }}>Backup</div>
              <div style={{ fontSize:9,color:"#475569" }}>{bkStatus?bkStatus.ts:"Nenhum"}</div>
            </div>
          </button>
          <div style={{ width:1,height:26,background:"#1e293b" }}/>
          <TopN label="Conversas" value={convs.length} color="#94a3b8"/>
          <div style={{ width:1,height:26,background:"#1e293b" }}/>
          <TopN label="Não lidas" value={totalUnread} color={totalUnread>0?"#f87171":"#334155"}/>
        </div>

        {/* KANBAN */}
        <div style={{ display:"flex",gap:12,padding:"16px 18px",
          overflowX:"auto",minHeight:"calc(100vh - 60px)",alignItems:"flex-start" }}>
          {LANES.map(lane=>(
            <Lane key={lane.id} lane={lane}
              convs={convs.filter(c=>c.lane===lane.id)}
              accounts={accounts} onOpen={openChat} classifyingIds={classifying}/>
          ))}
        </div>
      </div>

      {setupAcc&&setupAcc.type==="uazapi"&&<SetupUazapi acc={setupAcc} onSave={saveAcc} onClose={()=>setSetupAcc(null)}/>}
      {qrAcc&&<QrModal acc={qrAcc} onClose={()=>setQrAcc(null)}/>}
      {chat&&chatAcc&&<ChatModal conv={chat} acc={chatAcc} onClose={()=>setChat(null)} onMoveLane={moveLane}/>}
      {showBackup&&<BackupPanel onClose={()=>setShowBackup(false)} convs={convs} accounts={accounts}
        onRestore={c=>setConvs(c)} toast_={toast_}/>}

      {toast&&<div style={{ position:"fixed",bottom:18,left:"50%",transform:"translateX(-50%)",
        background:"#1e293b",color:"#f1f5f9",padding:"9px 20px",borderRadius:30,
        fontSize:12,fontWeight:700,zIndex:9999,animation:"fadeUp .2s ease",
        boxShadow:"0 4px 20px rgba(0,0,0,.6)",border:"1px solid #334155",whiteSpace:"nowrap" }}>
        {toast}</div>}
    </>
  );
}

// MICRO
function Av({letter,size,color,bg}){
  return <div style={{ width:size,height:size,borderRadius:"50%",background:bg,color,
    fontWeight:800,fontSize:size*.4,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{letter}</div>;
}
function TopN({label,value,color}){
  return <div style={{ textAlign:"center" }}>
    <div style={{ fontSize:17,fontWeight:900,color }}>{value}</div>
    <div style={{ fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:.4 }}>{label}</div>
  </div>;
}
function Spin({color="#fff",size=18}){
  return <div style={{ width:size,height:size,border:`2px solid ${color}33`,
    borderTop:`2px solid ${color}`,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0 }}/>;
}
function FI({label,value,onChange,type="text",ph=""}){
  return <label style={{ display:"flex",flexDirection:"column",gap:4 }}>
    <span style={{ fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:.5 }}>{label}</span>
    <input type={type} value={value} placeholder={ph} onChange={e=>onChange(e.target.value)}
      style={{ border:"1px solid #334155",borderRadius:8,padding:"8px 11px",fontSize:13,outline:"none",
        fontFamily:"inherit",background:"#0f172a",color:"#f1f5f9" }}/>
  </label>;
}
function Tgl({label,value,onChange,color}){
  return <div style={{ display:"flex",alignItems:"center",gap:9,cursor:"pointer" }} onClick={()=>onChange(!value)}>
    <div style={{ width:36,height:20,borderRadius:10,background:value?color:"#334155",position:"relative",transition:"background .2s" }}>
      <div style={{ width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",
        top:2,left:value?18:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.4)" }}/>
    </div>
    <span style={{ fontSize:13,color:"#cbd5e1" }}>{label}</span>
  </div>;
}
function PB({color,onClick,children}){
  return <button onClick={onClick} style={{ background:color,color:"#fff",border:"none",borderRadius:9,
    padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>{children}</button>;
}
function MH({color,title,onClose}){
  return <div style={{ background:color,padding:"13px 16px",display:"flex",alignItems:"center" }}>
    <span style={{ color:"#fff",fontWeight:800,fontSize:14,flex:1 }}>{title}</span>
    <button onClick={onClose} style={X}>✕</button>
  </div>;
}
function WaIcon(){
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>;
}
function MC(w){ return{ background:"#1e293b",borderRadius:16,width:w,maxWidth:"95vw",
  boxShadow:"0 24px 64px rgba(0,0,0,.7)",overflow:"hidden" }; }
const MP = { padding:22,display:"flex",flexDirection:"column",gap:13 };
const infoBox = { padding:"9px 12px",background:"#1e1a00",borderRadius:8,fontSize:12,color:"#fbbf24",border:"1px solid #78350f" };
const X = { background:"none",border:"none",color:"rgba(255,255,255,.7)",fontSize:17,cursor:"pointer",lineHeight:1,padding:2 };
