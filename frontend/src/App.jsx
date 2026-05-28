import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// ─── CONTAS ──────────────────────────────────────────────────────────────────
const INITIAL_ACCOUNTS = [
  { id:1, name:"confir MEI", color:"#7c3aed", colorLight:"#faf5ff", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:2, name:"Confidence Contabilidade", color:"#0ea5e9", colorLight:"#eff6ff", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:3, name:"Pessoal Odilei", color:"#f59e0b", colorLight:"#fffbeb", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
  { id:4, name:"Pet Family", color:"#ec4899", colorLight:"#fdf2f8", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"", enabled:false },
];

const LANES = [
  { id:"urgente", label:"Urgente", icon:"🔴", color:"#dc2626", bg:"#fee2e2", textColor:"#991b1b" },
  { id:"atendimento", label:"Atendimento", icon:"🟠", color:"#ea580c", bg:"#ffedd5", textColor:"#9a3412" },
  { id:"espera", label:"Espera", icon:"🟡", color:"#ca8a04", bg:"#fef3c7", textColor:"#854d0e" },
  { id:"concluido", label:"Concluído", icon:"🟢", color:"#16a34a", bg:"#dcfce7", textColor:"#166534" },
];

let uid = 1000;
const timeNow = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const getInitials = (n) => !n ? "??" : n.split(" ").map(x => x[0]).slice(0,2).join("").toUpperCase();

export default function App() {
  const [accounts, setAccounts] = useState(() => {
    const s = localStorage.getItem("multiatend_accounts");
    return s ? JSON.parse(s) : INITIAL_ACCOUNTS;
  });
  const [convs, setConvs] = useState(() => {
    const s = localStorage.getItem("multiatend_convs");
    return s ? JSON.parse(s) : [];
  });
  const [view, setView] = useState("lista");
  const [filterAccount, setFilterAccount] = useState("todas");
  const [filterLane, setFilterLane] = useState("todas");
  const [openChat, setOpenChat] = useState(null);
  const [setupAcc, setSetupAcc] = useState(null);
  const [toast, setToast] = useState("");
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => localStorage.setItem("multiatend_accounts", JSON.stringify(accounts)), [accounts]);
  useEffect(() => localStorage.setItem("multiatend_convs", JSON.stringify(convs)), [convs]);

  const toast_ = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ["websocket", "polling"], reconnection: true });
    socket.on("connect", () => toast_("🔌 Tempo real ativo"));
    socket.on("new_message", (msg) => {
      setConvs((p) => {
        const ex = p.find((c) => c.phone === msg.phone);
        if (ex) {
          return p.map((c) => c.phone === msg.phone ? {
            ...c, lastMsg: msg.message, time: msg.time, unread: c.unread + 1,
            lane: msg.lane, aiReason: msg.reason,
            messages: [...(c.messages || []), { from: "contact", text: msg.message, time: msg.time }],
          } : c);
        }
        return [{
          id: ++uid, accountId: 1, contact: msg.contact, phone: msg.phone,
          lastMsg: msg.message, time: msg.time, unread: 1, lane: msg.lane, aiReason: msg.reason,
          messages: [{ from: "contact", text: msg.message, time: msg.time }],
        }, ...p];
      });
    });
    return () => socket.disconnect();
  }, []);

  async function syncAccount(acc) {
    if (!acc.baseUrl || !acc.token) { toast_("⚠️ Configure a conta primeiro"); return; }
    toast_(`🔄 Sincronizando ${acc.name}...`);
    try {
      const r = await fetch(`/api/uazapi/chat/find?base=${encodeURIComponent(acc.baseUrl)}`, { headers: { token: acc.token } });
      const data = await r.json();
      toast_(`✅ ${Array.isArray(data) ? data.length : 0} conversas`);
    } catch { toast_("❌ Erro ao sincronizar"); }
  }

  const moveTo = (id, lane) => setConvs((p) => p.map((c) => c.id === id ? { ...c, lane } : c));
  const markRead = (id) => setConvs((p) => p.map((c) => c.id === id ? { ...c, unread: 0 } : c));

  const filteredConvs = convs.filter((c) => {
    if (filterAccount !== "todas" && c.accountId !== filterAccount) return false;
    if (filterLane !== "todas" && c.lane !== filterLane) return false;
    return true;
  });

  const counts = LANES.reduce((a, l) => {
    a[l.id] = convs.filter((c) => c.lane === l.id && (filterAccount === "todas" || c.accountId === filterAccount)).length;
    return a;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ background: "#075E54", color: "white", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24 }}>💬</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>MultiAtend</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{accounts.filter((a) => a.enabled).length} conta(s) · {convs.length} conversa(s)</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.15)", padding: 4, borderRadius: 8 }}>
          {[
            { id: "lista", label: "Lista", icon: "📋" },
            { id: "kanban", label: "Kanban", icon: "📊" },
            { id: "porconta", label: "Por Conta", icon: "📦" },
          ].map((m) => (
            <button key={m.id} onClick={() => setView(m.id)} style={{
              background: view === m.id ? "white" : "transparent",
              color: view === m.id ? "#075E54" : "white",
              border: "none", padding: "6px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
              fontWeight: view === m.id ? 600 : 400, transition: "all 0.2s",
            }}>{m.icon} {m.label}</button>
          ))}
        </div>
      </header>

      <div style={{ background: "#f8f9fa", padding: "10px 20px", display: "flex", gap: 8, overflowX: "auto", borderBottom: "1px solid #e0e0e0" }}>
        <button onClick={() => setFilterAccount("todas")} style={{
          background: filterAccount === "todas" ? "#25D366" : "white",
          color: filterAccount === "todas" ? "white" : "#666",
          padding: "5px 12px", border: filterAccount === "todas" ? "none" : "1px solid #ddd",
          borderRadius: 14, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
        }}>Todas ({convs.length})</button>
        {accounts.map((acc) => {
          const count = convs.filter((c) => c.accountId === acc.id).length;
          const active = filterAccount === acc.id;
          return (
            <button key={acc.id} onClick={() => setFilterAccount(acc.id)} style={{
              background: active ? acc.color : "white", color: active ? "white" : acc.color,
              padding: "5px 12px", border: `1px solid ${acc.color}`, borderRadius: 14,
              fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "white" : acc.color, display: "inline-block" }}></span>
              {acc.name} ({count}){!acc.enabled && <span style={{ fontSize: 10, opacity: 0.7 }}>📵</span>}
            </button>
          );
        })}
        <button onClick={() => setSetupAcc(accounts[0])} style={{
          marginLeft: "auto", background: "white", color: "#666", padding: "5px 12px",
          border: "1px solid #ddd", borderRadius: 14, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
        }}>⚙️ Configurar</button>
      </div>

      <div style={{ background: "white", padding: "8px 20px", display: "flex", gap: 6, borderBottom: "1px solid #e0e0e0", overflowX: "auto" }}>
        <button onClick={() => setFilterLane("todas")} style={{
          background: filterLane === "todas" ? "#333" : "transparent",
          color: filterLane === "todas" ? "white" : "#666",
          padding: "4px 10px", border: "1px solid #ddd", borderRadius: 12,
          fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
        }}>Todas</button>
        {LANES.map((lane) => (
          <button key={lane.id} onClick={() => setFilterLane(lane.id)} style={{
            background: filterLane === lane.id ? lane.bg : "transparent",
            color: filterLane === lane.id ? lane.textColor : "#666",
            padding: "4px 10px", border: `1px solid ${filterLane === lane.id ? lane.color : "#ddd"}`,
            borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
          }}>{lane.icon} {lane.label} ({counts[lane.id] || 0})</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {view === "lista" && <ListaView convs={filteredConvs} accounts={accounts} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} onMove={moveTo} />}
        {view === "kanban" && <KanbanView convs={filteredConvs} accounts={accounts} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} onMove={moveTo} />}
        {view === "porconta" && <PorContaView convs={convs} accounts={accounts} collapsed={collapsed} onToggleCollapse={(id) => setCollapsed((p) => ({ ...p, [id]: !p[id] }))} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} onMove={moveTo} onSync={syncAccount} onSetup={setSetupAcc} />}
      </div>

      {openChat && <ChatModal conv={openChat} accounts={accounts} onClose={() => setOpenChat(null)} onMove={moveTo} onSend={(text) => {
        setConvs((p) => p.map((c) => c.id === openChat.id ? { ...c, lastMsg: text, time: timeNow(), messages: [...(c.messages || []), { from: "me", text, time: timeNow() }] } : c));
        setOpenChat((p) => ({ ...p, messages: [...(p.messages || []), { from: "me", text, time: timeNow() }] }));
      }} />}

      {setupAcc && <SetupModal account={setupAcc} accounts={accounts} onClose={() => setSetupAcc(null)} onSave={(u) => { setAccounts((p) => p.map((a) => a.id === u.id ? u : a)); toast_(`✅ ${u.name} salvo`); setSetupAcc(null); }} onSwitch={setSetupAcc} />}

      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#333", color: "white", padding: "10px 20px", borderRadius: 8, fontSize: 13, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
}

function ListaView({ convs, accounts, onOpen }) {
  if (convs.length === 0) return <div style={{ background: "white", padding: 40, textAlign: "center", color: "#888", borderRadius: 8 }}>📭 Nenhuma conversa ainda<div style={{ fontSize: 12, marginTop: 8 }}>As mensagens vão aparecer aqui automaticamente</div></div>;
  return (
    <div style={{ background: "white", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      {convs.map((conv) => {
        const acc = accounts.find((a) => a.id === conv.accountId) || accounts[0];
        const lane = LANES.find((l) => l.id === conv.lane) || LANES[2];
        return (
          <div key={conv.id} onClick={() => onOpen(conv)} style={{
            display: "flex", padding: "12px 16px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
            alignItems: "center", gap: 12, borderLeft: `4px solid ${lane.color}`, transition: "background 0.2s",
          }} onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")} onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: acc.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>{getInitials(conv.contact)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>{conv.contact}</div>
                <div style={{ fontSize: 11, color: conv.unread > 0 ? lane.color : "#888", fontWeight: conv.unread > 0 ? 600 : 400 }}>{conv.time}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                <div style={{ fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{conv.lastMsg}</div>
                {conv.unread > 0 && <div style={{ background: "#25D366", color: "white", borderRadius: "50%", width: 20, height: 20, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>{conv.unread}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                <span style={{ fontSize: 10, background: acc.color, color: "white", padding: "2px 6px", borderRadius: 4 }}>{acc.name}</span>
                {conv.aiReason && <span style={{ fontSize: 10, color: "#888" }}>🤖 {conv.aiReason}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanView({ convs, accounts, onOpen }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {LANES.map((lane) => {
        const items = convs.filter((c) => c.lane === lane.id);
        return (
          <div key={lane.id} style={{ background: "white", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: lane.bg, color: lane.textColor, fontWeight: 600, fontSize: 13, display: "flex", justifyContent: "space-between" }}>
              <span>{lane.icon} {lane.label}</span>
              <span style={{ background: "white", padding: "1px 8px", borderRadius: 10, fontSize: 11 }}>{items.length}</span>
            </div>
            <div style={{ padding: 8, minHeight: 100 }}>
              {items.length === 0 ? <div style={{ textAlign: "center", padding: 20, color: "#bbb", fontSize: 12 }}>Vazio</div> : items.map((conv) => {
                const acc = accounts.find((a) => a.id === conv.accountId) || accounts[0];
                return (
                  <div key={conv.id} onClick={() => onOpen(conv)} style={{
                    background: "white", border: "1px solid #e0e0e0", borderLeft: `3px solid ${acc.color}`,
                    padding: 10, borderRadius: 6, marginBottom: 8, cursor: "pointer", fontSize: 12,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{conv.contact}</div>
                      {conv.unread > 0 && <div style={{ background: "#25D366", color: "white", borderRadius: "50%", width: 18, height: 18, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{conv.unread}</div>}
                    </div>
                    <div style={{ color: "#666", fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lastMsg}</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6, fontSize: 9 }}>
                      <span style={{ background: acc.color, color: "white", padding: "1px 5px", borderRadius: 3 }}>{acc.name}</span>
                      <span style={{ color: "#888" }}>⏱ {conv.time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PorContaView({ convs, accounts, collapsed, onToggleCollapse, onOpen, onSync, onSetup }) {
  return (
    <div>
      {accounts.map((acc) => {
        const accConvs = convs.filter((c) => c.accountId === acc.id);
        const isCollapsed = collapsed[acc.id];
        return (
          <div key={acc.id} style={{ background: "white", borderRadius: 8, marginBottom: 12, overflow: "hidden", borderTop: `4px solid ${acc.color}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div onClick={() => onToggleCollapse(acc.id)} style={{ padding: "12px 16px", background: acc.colorLight, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: acc.color }}></div>
                <span style={{ fontWeight: 600, fontSize: 14, color: acc.color }}>{acc.name}</span>
                <span style={{ fontSize: 11, color: "#666", background: "white", padding: "2px 8px", borderRadius: 10 }}>{accConvs.length} conversa(s)</span>
                {!acc.enabled && <span style={{ fontSize: 11, color: "#999" }}>📵 Desconectado</span>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {acc.enabled && <button onClick={(e) => { e.stopPropagation(); onSync(acc); }} style={{ background: "white", border: `1px solid ${acc.color}`, color: acc.color, padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>🔄 Sync</button>}
                <button onClick={(e) => { e.stopPropagation(); onSetup(acc); }} style={{ background: "white", border: "1px solid #ddd", color: "#666", padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>⚙️ Config</button>
                <span style={{ fontSize: 16, color: acc.color }}>{isCollapsed ? "▶" : "▼"}</span>
              </div>
            </div>
            {!isCollapsed && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, padding: 10 }}>
                {LANES.map((lane) => {
                  const items = accConvs.filter((c) => c.lane === lane.id);
                  return (
                    <div key={lane.id} style={{ background: lane.bg, borderRadius: 6, padding: 8, minHeight: 80 }}>
                      <div style={{ fontSize: 11, color: lane.textColor, fontWeight: 600, marginBottom: 6 }}>{lane.icon} {lane.label} ({items.length})</div>
                      {items.length === 0 ? <div style={{ fontSize: 10, color: "#aaa", textAlign: "center", padding: 8 }}>Vazio</div> : items.map((conv) => (
                        <div key={conv.id} onClick={() => onOpen(conv)} style={{ background: "white", padding: "6px 8px", borderRadius: 4, fontSize: 11, marginBottom: 4, cursor: "pointer" }}>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{conv.contact}</div>
                          <div style={{ color: "#888", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lastMsg}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChatModal({ conv, accounts, onClose, onMove, onSend }) {
  const [text, setText] = useState("");
  const acc = accounts.find((a) => a.id === conv.accountId) || accounts[0];
  const msgsEnd = useRef(null);
  useEffect(() => msgsEnd.current?.scrollIntoView({ behavior: "smooth" }), [conv.messages]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#e5ddd5", width: "90%", maxWidth: 500, height: "80vh", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: "#075E54", color: "white", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: acc.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14 }}>{getInitials(conv.contact)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{conv.contact}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{conv.phone} · {acc.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 8, background: "white", borderBottom: "1px solid #ddd", display: "flex", gap: 4, overflowX: "auto" }}>
          {LANES.map((lane) => (
            <button key={lane.id} onClick={() => onMove(conv.id, lane.id)} style={{
              background: conv.lane === lane.id ? lane.bg : "white",
              color: conv.lane === lane.id ? lane.textColor : "#666",
              border: `1px solid ${conv.lane === lane.id ? lane.color : "#ddd"}`,
              padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
            }}>{lane.icon} {lane.label}</button>
          ))}
        </div>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", background: "#e5ddd5" }}>
          {(conv.messages || []).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "me" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ background: m.from === "me" ? "#dcf8c6" : "white", padding: "8px 12px", borderRadius: 8, maxWidth: "75%", fontSize: 13, boxShadow: "0 1px 1px rgba(0,0,0,0.1)" }}>
                <div>{m.text}</div>
                <div style={{ fontSize: 10, color: "#888", textAlign: "right", marginTop: 2 }}>{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={msgsEnd}></div>
        </div>
        <div style={{ padding: 10, background: "#f0f0f0", display: "flex", gap: 8 }}>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onSend(text); setText(""); } }} placeholder="Digite uma mensagem..." style={{ flex: 1, padding: "10px 14px", border: "none", borderRadius: 20, fontSize: 13, outline: "none" }} />
          <button onClick={() => { if (text.trim()) { onSend(text); setText(""); } }} style={{ background: "#25D366", color: "white", border: "none", padding: "10px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Enviar</button>
        </div>
      </div>
    </div>
  );
}

function SetupModal({ account, accounts, onClose, onSave, onSwitch }) {
  const [form, setForm] = useState(account);
  useEffect(() => setForm(account), [account.id]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "90%", maxWidth: 500, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: form.color, color: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Configurar Conta</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{form.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 12, background: "#f0f0f0", display: "flex", gap: 6, overflowX: "auto" }}>
          {accounts.map((a) => (
            <button key={a.id} onClick={() => onSwitch(a)} style={{
              background: form.id === a.id ? a.color : "white",
              color: form.id === a.id ? "white" : a.color,
              border: `1px solid ${a.color}`, padding: "4px 10px", borderRadius: 12,
              fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
            }}>{a.name}</button>
          ))}
        </div>
        <div style={{ padding: 20 }}>
          <Field label="Nome da Conta" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Gerenciador / Responsável" value={form.gerenciador} onChange={(v) => setForm({ ...form, gerenciador: v })} placeholder="Ex: Odilei" />
          <Field label="URL Uazapi (base)" value={form.baseUrl} onChange={(v) => setForm({ ...form, baseUrl: v })} placeholder="https://sua-instancia.uazapi.com" />
          <Field label="Session" value={form.session} onChange={(v) => setForm({ ...form, session: v })} placeholder="confirMEI" />
          <Field label="Token" value={form.token} onChange={(v) => setForm({ ...form, token: v })} placeholder="seu-token" />
          <Field label="Session Key (opcional)" value={form.sessionKey} onChange={(v) => setForm({ ...form, sessionKey: v })} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Conta ativa
          </label>
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #eee", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "white", border: "1px solid #ddd", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={() => onSave(form)} style={{ background: form.color, color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>{label}</label>
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{
        width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, outline: "none",
      }} />
    </div>
  );
}
