import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

// ─── CONTAS PADRÃO ───────────────────────────────────────────────────────────
const DEFAULT_ACCOUNTS = [
  { id:1, name:"confir MEI", color:"#7c3aed", colorLight:"#faf5ff", baseUrl:"https://scpetfamily.uazapi.com", session:"confirMEI", sessionKey:"", token:"4b246ec4-afec-46af-8c9f-39cbabcc9775", gerenciador:"", enabled:true },
  { id:2, name:"Confidence Contabilidade", color:"#0ea5e9", colorLight:"#eff6ff", baseUrl:"https://scpetfamily.uazapi.com", session:"Confidence", sessionKey:"", token:"b611340c-989d-4975-9f97-bc937503202f", gerenciador:"", enabled:true },
  { id:3, name:"Pessoal Odilei", color:"#f59e0b", colorLight:"#fffbeb", baseUrl:"", session:"", sessionKey:"", token:"", gerenciador:"Odilei", enabled:false },
  { id:4, name:"Pet Family", color:"#ec4899", colorLight:"#fdf2f8", baseUrl:"https://scpetfamily.uazapi.com", session:"scpetfamily", sessionKey:"", token:"a5821f84-85d9-46e4-9212-c1c76e8beb58", gerenciador:"", enabled:true },
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

// ─── API HELPER ──────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const token = localStorage.getItem("multiatend_token");
  const r = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (r.status === 401) {
    localStorage.removeItem("multiatend_token");
    window.location.reload();
  }
  return r;
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("multiatend_token"));

  if (!token) {
    return <LoginScreen onLogin={(t) => { localStorage.setItem("multiatend_token", t); setToken(t); }} />;
  }

  return <MainApp onLogout={() => { localStorage.removeItem("multiatend_token"); setToken(null); }} />;
}

// ─── TELA DE LOGIN ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (data.ok) {
        onLogin(data.token);
      } else {
        setError("Senha incorreta");
      }
    } catch {
      setError("Erro de conexão");
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #075E54 0%, #128C7E 100%)",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "white",
        padding: 40,
        borderRadius: 16,
        boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        width: "90%",
        maxWidth: 400,
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💬</div>
          <h1 style={{ margin: 0, fontSize: 24, color: "#075E54" }}>MultiAtend</h1>
          <p style={{ margin: 0, color: "#666", fontSize: 13, marginTop: 4 }}>WhatsApp Manager com IA</p>
        </div>

        <form onSubmit={handleLogin}>
          <label style={{ display: "block", fontSize: 13, color: "#666", marginBottom: 6 }}>
            Senha de acesso
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite a senha"
            autoFocus
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ddd",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
              boxSizing: "border-box",
              marginBottom: 16,
            }}
          />
          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: "100%",
              background: "#25D366",
              color: "white",
              border: "none",
              padding: "12px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              opacity: loading || !password ? 0.6 : 1,
            }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ───────────────────────────────────────────────────────────
function MainApp({ onLogout }) {
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [convs, setConvs] = useState([]);
  const [view, setView] = useState("lista");
  const [filterAccount, setFilterAccount] = useState("todas");
  const [filterLane, setFilterLane] = useState("todas");
  const [openChat, setOpenChat] = useState(null);
  const [setupAcc, setSetupAcc] = useState(null);
  const [showGroups, setShowGroups] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [showTickets, setShowTickets] = useState(false);
  const [toast, setToast] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [loaded, setLoaded] = useState(false);

  const toast_ = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  // ─── Carrega config do servidor ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/config");
        if (r.ok) {
          const data = await r.json();
          if (data.accounts && data.accounts.length > 0) {
            setAccounts(data.accounts);
          }
          if (data.convs) setConvs(data.convs);
          if (data.tickets) setTickets(data.tickets);
          toast_("✅ Configuração carregada");
        }
      } catch {
        toast_("⚠️ Erro ao carregar config");
      }
      setLoaded(true);
    })();
  }, []);

  // ─── Salva config no servidor (com debounce) ───────────────────────────────
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(async () => {
      try {
        await api("/api/config", {
          method: "POST",
          body: JSON.stringify({ accounts, convs, tickets }),
        });
      } catch (e) {
        console.error("Erro ao salvar:", e);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [accounts, convs, tickets, loaded]);

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socket.on("connect", () => toast_("🔌 Tempo real ativo"));

    socket.on("new_message", (msg) => {
      const aId = msg.accountId || 1;
      const isGroupMsg = msg.isGroup || msg.area === "groups";

      const newMsg = {
        from: "contact",
        text: msg.message,
        time: msg.time,
        mediaUrl: msg.mediaUrl,
        isImage: msg.isImage,
        isAudio: msg.isAudio,
        isDoc: msg.isDoc,
        isGroup: isGroupMsg,
      };

      setConvs((p) => {
        const ex = p.find(
          (c) => c.phone === msg.phone && c.accountId === aId
        );

        if (ex) {
          return p.map((c) =>
            c.phone === msg.phone && c.accountId === aId
              ? {
                  ...c,
                  lastMsg: msg.message,
                  time: msg.time,
                  unread: (c.unread || 0) + 1,
                  lane: msg.lane || c.lane || "espera",
                  aiReason: msg.reason || c.aiReason || "",
                  isGroup: isGroupMsg,
                  area: isGroupMsg ? "groups" : "chats",
                  messages: [...(c.messages || []), newMsg],
                }
              : c
          );
        }

        return [
          {
            id: ++uid,
            accountId: aId,
            contact: msg.contact,
            phone: msg.phone,

            isGroup: isGroupMsg,
            area: isGroupMsg ? "groups" : "chats",

            lastMsg: msg.message,
            time: msg.time,
            unread: 1,
            lane: msg.lane || "espera",
            aiReason: msg.reason || "",
            messages: [newMsg],
          },
          ...p,
        ];
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
  const isGroupConv = c.isGroup || c.area === "groups";

  // ESCONDE grupos da tela principal
  if (isGroupConv) return false;

  if (
    filterAccount !== "todas" &&
    c.accountId !== filterAccount
  ) {
    return false;
  }

  if (
    filterLane !== "todas" &&
    c.lane !== filterLane
  ) {
    return false;
  }

  return true;
});

  const counts = LANES.reduce((a, l) => {
    a[l.id] = convs.filter((c) => c.lane === l.id && (filterAccount === "todas" || c.accountId === filterAccount)).length;
    return a;
  }, {});

  if (!loaded) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
      <div style={{ textAlign: "center", color: "#666" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        Carregando configurações...
      </div>
    </div>;
  }

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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          <button onClick={() => { if(confirm("Limpar TODAS as conversas? (as contas e grupos continuam salvos)")) { setConvs([]); toast_("🗑️ Conversas limpas"); } }} title="Limpar conversas" style={{
            background: "rgba(255,255,255,0.15)", color: "white", border: "none",
            padding: "6px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer",
          }}>🗑️</button>
          <button onClick={() => setShowNewChat(true)} title="Nova conversa" style={{
            background: "rgba(255,255,255,0.15)", color: "white", border: "none",
            padding: "6px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer",
          }}>✏️ Novo</button>
          <button onClick={() => setShowTickets(true)} title="Chamados" style={{
            background: "rgba(255,255,255,0.15)", color: "white", border: "none",
            padding: "6px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer",
          }}>🎫 Chamados{tickets.filter(t => t.status !== "fechado").length > 0 ? ` (${tickets.filter(t => t.status !== "fechado").length})` : ""}</button>
          <button
<button
  onClick={() => setShowGroups(true)}
  title="Grupos"
  style={{
    background: "rgba(255,255,255,0.15)",
    color: "white",
    border: "none",
    padding: "6px 10px",
    fontSize: 12,
    borderRadius: 6,
    cursor: "pointer",
  }}
>
  👥 Grupos
</button>
          <button onClick={onLogout} title="Sair" style={{
            background: "rgba(255,255,255,0.15)", color: "white", border: "none",
            padding: "6px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer",
          }}>🚪 Sair</button>
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
        {view === "lista" && <ListaView convs={filteredConvs} accounts={accounts} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} />}
        {view === "kanban" && <KanbanView convs={filteredConvs} accounts={accounts} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} />}
        {view === "porconta" && <PorContaView convs={convs} accounts={accounts} collapsed={collapsed} onToggleCollapse={(id) => setCollapsed((p) => ({ ...p, [id]: !p[id] }))} onOpen={(c) => { setOpenChat(c); markRead(c.id); }} onSync={syncAccount} onSetup={setSetupAcc} />}
      </div>

      {openChat && (() => {
        const liveConv = convs.find((c) => c.id === openChat.id) || openChat;
        return <ChatModal conv={liveConv} accounts={accounts} toast_={toast_} onClose={() => setOpenChat(null)} onMove={moveTo} onTicket={(c) => {
          const newTicket = {
            id: Date.now(), convId: c.id, contact: c.contact, phone: c.phone,
            accountId: c.accountId, title: `Atendimento - ${c.contact}`,
            status: "aberto", createdAt: new Date().toISOString(),
          };
          setTickets((p) => [newTicket, ...p]);
          toast_("🎫 Chamado aberto!");
        }} onSend={(text) => {
          setConvs((p) => p.map((c) => c.id === openChat.id ? { ...c, lastMsg: text, time: timeNow(), messages: [...(c.messages || []), { from: "me", text, time: timeNow() }] } : c));
        }} />;
      })()}

      {setupAcc && <SetupModal account={setupAcc} accounts={accounts} onClose={() => setSetupAcc(null)} onSave={(u) => { setAccounts((p) => p.map((a) => a.id === u.id ? u : a)); toast_(`✅ ${u.name} salvo no servidor`); setSetupAcc(null); }} onSwitch={setSetupAcc} />}

      {showGroups && <GroupsModal accounts={accounts} onClose={() => setShowGroups(false)} toast_={toast_} />}

      {showNewChat && <NewChatModal accounts={accounts} onClose={() => setShowNewChat(false)} toast_={toast_} onStarted={(conv) => {
        setConvs((p) => [conv, ...p]);
        setShowNewChat(false);
        setOpenChat(conv);
      }} />}

      {showTickets && <TicketsModal tickets={tickets} setTickets={setTickets} convs={convs} accounts={accounts} onClose={() => setShowTickets(false)} toast_={toast_} onOpenConv={(c) => { setShowTickets(false); setOpenChat(c); }} />}

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

function ChatModal({ conv, accounts, onClose, onMove, onSend, toast_, onTicket }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const acc = accounts.find((a) => a.id === conv.accountId) || accounts[0];
  const msgsEnd = useRef(null);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);

  useEffect(() => msgsEnd.current?.scrollIntoView({ behavior: "smooth" }), [conv.messages]);

  const QUICK_REPLIES = [
    "Olá! Como posso ajudar? 😊",
    "Obrigado pelo contato! Já vou verificar.",
    "Pode me enviar mais detalhes, por favor?",
    "Seu atendimento foi registrado! 👍",
    "Em breve retornarei com a resposta.",
  ];

  // Enviar texto real via API
  async function sendReal(msgText, type = "text", fileData = null, fname = null) {
    setSending(true);
    try {
      const r = await api("/api/send", {
        method: "POST",
        body: JSON.stringify({
          accountId: conv.accountId,
          phone: conv.phone,
          type,
          text: msgText,
          file: fileData,
          filename: fname,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        onSend(type === "text" ? msgText : `[${type === "image" ? "📷 Imagem" : type === "audio" ? "🎤 Áudio" : "📄 " + (fname || "Arquivo")}]`);
        toast_("✅ Enviado!");
      } else {
        toast_("❌ Erro ao enviar");
      }
    } catch {
      toast_("❌ Erro de conexão");
    }
    setSending(false);
  }

  // Upload de arquivo → base64
  function handleFile(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      sendReal(text, type, base64, file.name);
      setText("");
    };
    reader.readAsDataURL(file);
  }

  // Gerar resumo
  async function genSummary() {
    toast_("🤖 Gerando resumo...");
    try {
      const r = await api("/api/summary", {
        method: "POST",
        body: JSON.stringify({ messages: conv.messages || [] }),
      });
      const data = await r.json();
      setSummary(data.summary || "Sem resumo");
    } catch {
      toast_("❌ Erro ao resumir");
    }
  }

  // Transcrever áudio
  async function transcribe(audioUrl) {
    toast_("🤖 Transcrevendo...");
    try {
      const r = await api("/api/transcribe", {
        method: "POST",
        body: JSON.stringify({ audioUrl }),
      });
      const data = await r.json();
      toast_("✅ Transcrito!");
      return data.text;
    } catch {
      toast_("❌ Erro ao transcrever");
      return "";
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#e5ddd5", width: "90%", maxWidth: 520, height: "85vh", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#075E54", color: "white", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: acc.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14 }}>{getInitials(conv.contact)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{conv.contact}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{conv.phone} · {acc.name}</div>
          </div>
          <button onClick={genSummary} title="Resumo IA" style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>🤖 Resumo</button>
          <button onClick={() => { if(onTicket) onTicket(conv); }} title="Abrir chamado" style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "white", padding: "6px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>🎫 Chamado</button>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Lanes */}
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

        {/* Resumo (se houver) */}
        {summary && (
          <div style={{ background: "#fff8e1", padding: "10px 16px", borderBottom: "1px solid #ffe082", fontSize: 12, color: "#5d4037" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong>🤖 Resumo da conversa:</strong>
              <button onClick={() => setSummary("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            {summary}
          </div>
        )}

        {/* Mensagens */}
        <div style={{ flex: 1, padding: 16, overflowY: "auto", background: "#e5ddd5" }}>
          {(conv.messages || []).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.from === "me" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ background: m.from === "me" ? "#dcf8c6" : "white", padding: "8px 12px", borderRadius: 8, maxWidth: "75%", fontSize: 13, boxShadow: "0 1px 1px rgba(0,0,0,0.1)" }}>
                {m.mediaUrl && m.isImage && <img src={m.mediaUrl} alt="" style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 4 }} />}
                {m.mediaUrl && m.isAudio && (
                  <div>
                    <audio controls src={m.mediaUrl} style={{ maxWidth: 200, height: 32 }} />
                    <button onClick={async () => { const t = await transcribe(m.mediaUrl); if(t) alert("Transcrição:\n\n" + t); }} style={{ display: "block", marginTop: 4, background: "#075E54", color: "white", border: "none", padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>🎤 Transcrever</button>
                  </div>
                )}
                <div>{m.text}</div>
                <div style={{ fontSize: 10, color: "#888", textAlign: "right", marginTop: 2 }}>{m.time}</div>
              </div>
            </div>
          ))}
          <div ref={msgsEnd}></div>
        </div>

        {/* Respostas rápidas */}
        {showQuick && (
          <div style={{ background: "white", borderTop: "1px solid #ddd", padding: 8, maxHeight: 150, overflowY: "auto" }}>
            {QUICK_REPLIES.map((q, i) => (
              <div key={i} onClick={() => { sendReal(q); setShowQuick(false); }} style={{ padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13, marginBottom: 4, background: "#f5f5f5" }}>{q}</div>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: 10, background: "#f0f0f0", display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setShowQuick(!showQuick)} title="Respostas rápidas" style={{ background: showQuick ? "#25D366" : "white", color: showQuick ? "white" : "#666", border: "1px solid #ddd", width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 16 }}>⚡</button>
          <button onClick={() => imgInputRef.current?.click()} title="Imagem" style={{ background: "white", border: "1px solid #ddd", width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 16 }}>📷</button>
          <button onClick={() => fileInputRef.current?.click()} title="Arquivo" style={{ background: "white", border: "1px solid #ddd", width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 16 }}>📎</button>
          <input ref={imgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e, "image")} />
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={(e) => handleFile(e, "document")} />
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !sending) { sendReal(text); setText(""); } }} placeholder="Digite uma mensagem..." style={{ flex: 1, padding: "10px 14px", border: "none", borderRadius: 20, fontSize: 13, outline: "none" }} />
          <button onClick={() => { if (text.trim() && !sending) { sendReal(text); setText(""); } }} disabled={sending} style={{ background: sending ? "#aaa" : "#25D366", color: "white", border: "none", padding: "10px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: sending ? "wait" : "pointer" }}>{sending ? "..." : "Enviar"}</button>
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "90%", maxWidth: 500, borderRadius: 12, overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
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
        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ background: "#e8f5e9", padding: 10, borderRadius: 6, fontSize: 12, color: "#2e7d32", marginBottom: 16 }}>
            💾 As configurações são salvas <strong>no servidor</strong> e persistem entre dispositivos!
          </div>
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
          <button onClick={() => onSave(form)} style={{ background: form.color, color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>💾 Salvar</button>
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
        width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box",
      }} />
    </div>
  );
}

// ─── MODAL DE GRUPOS ─────────────────────────────────────────────────────────
function GroupsModal({ accounts, onClose, toast_ }) {
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/groups");
        if (r.ok) setGroups(await r.json());
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function toggleGroup(id) {
    const updated = { ...groups, [id]: { ...groups[id], enabled: !groups[id].enabled } };
    setGroups(updated);
    try {
      await api("/api/groups", { method: "POST", body: JSON.stringify(updated) });
      toast_(updated[id].enabled ? "✅ Grupo ativado" : "🔕 Grupo desativado");
    } catch {
      toast_("❌ Erro ao salvar");
    }
  }

  const groupList = Object.entries(groups).sort((a, b) =>
    (b[1].lastSeen || "").localeCompare(a[1].lastSeen || "")
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "90%", maxWidth: 550, borderRadius: 12, overflow: "hidden", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#075E54", color: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>👥 Gerenciar Grupos</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Escolha quais grupos quer receber</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <div style={{ background: "#e3f2fd", padding: 12, borderRadius: 8, fontSize: 12, color: "#1565c0", marginBottom: 16 }}>
            💡 Os grupos aparecem aqui automaticamente quando recebem mensagens. Ative ✅ os que você quer acompanhar no app.
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>⏳ Carregando grupos...</div>
          ) : groupList.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
              📭 Nenhum grupo detectado ainda<br />
              <span style={{ fontSize: 12 }}>Quando um grupo receber mensagem, ele aparecerá aqui</span>
            </div>
          ) : (
            groupList.map(([id, g]) => {
              const acc = accounts.find((a) => a.id === g.accountId) || accounts[0];
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px",
                  borderBottom: "1px solid #f0f0f0",
                  background: g.enabled ? "#f1f8e9" : "white",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: acc.color, color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>👥</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>
                      <span style={{ background: acc.color, color: "white", padding: "1px 6px", borderRadius: 4 }}>{acc.name}</span>
                    </div>
                  </div>
                  <label style={{ position: "relative", display: "inline-block", width: 48, height: 26, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={g.enabled}
                      onChange={() => toggleGroup(id)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: "absolute", inset: 0,
                      background: g.enabled ? "#25D366" : "#ccc",
                      borderRadius: 26, transition: "0.3s",
                    }}>
                      <span style={{
                        position: "absolute", height: 20, width: 20,
                        left: g.enabled ? 24 : 4, bottom: 3,
                        background: "white", borderRadius: "50%", transition: "0.3s",
                      }}></span>
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #eee", textAlign: "center" }}>
          <button onClick={onClose} style={{ background: "#25D366", color: "white", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Pronto</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL NOVA CONVERSA ─────────────────────────────────────────────────────
function NewChatModal({ accounts, onClose, toast_, onStarted }) {
  const [accountId, setAccountId] = useState(accounts.find(a => a.enabled)?.id || 1);
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function start() {
    if (!phone.trim() || !text.trim()) { toast_("⚠️ Preencha número e mensagem"); return; }
    setSending(true);
    const cleanPhone = phone.replace(/\D/g, "");
    try {
      const r = await api("/api/send", {
        method: "POST",
        body: JSON.stringify({ accountId, phone: cleanPhone, type: "text", text }),
      });
      const data = await r.json();
      if (data.ok) {
        toast_("✅ Conversa iniciada!");
        onStarted({
          id: Date.now(), accountId, contact: contact || cleanPhone, phone: cleanPhone,
          lastMsg: text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          unread: 0, lane: "atendimento", aiReason: "",
          messages: [{ from: "me", text, time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }],
        });
      } else {
        toast_("❌ Erro ao enviar");
      }
    } catch { toast_("❌ Erro de conexão"); }
    setSending(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "90%", maxWidth: 450, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ background: "#075E54", color: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>✏️ Nova Conversa</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 20 }}>
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Conta para enviar</label>
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}>
            {accounts.filter(a => a.enabled).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Número (com DDD, ex: 5547999998888)</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5547999998888" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Nome do contato (opcional)</label>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="João Silva" style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Mensagem</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá! Tudo bem?" rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box", resize: "vertical" }} />
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #eee", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "white", border: "1px solid #ddd", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={start} disabled={sending} style={{ background: sending ? "#aaa" : "#25D366", color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: sending ? "wait" : "pointer", fontSize: 13, fontWeight: 600 }}>{sending ? "Enviando..." : "Iniciar Conversa"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL CHAMADOS/TICKETS ──────────────────────────────────────────────────
function TicketsModal({ tickets, setTickets, convs, accounts, onClose, toast_, onOpenConv }) {
  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState("abertos");

  const TICKET_STATUS = {
    aberto: { label: "Aberto", color: "#ea580c", bg: "#ffedd5" },
    andamento: { label: "Em andamento", color: "#0ea5e9", bg: "#e0f2fe" },
    fechado: { label: "Fechado", color: "#16a34a", bg: "#dcfce7" },
  };

  function addTicket() {
    if (!newTitle.trim()) return;
    setTickets((p) => [{
      id: Date.now(), title: newTitle, status: "aberto",
      createdAt: new Date().toISOString(), convId: null,
    }, ...p]);
    setNewTitle("");
    toast_("🎫 Chamado criado!");
  }

  function updateStatus(id, status) {
    setTickets((p) => p.map((t) => t.id === id ? { ...t, status } : t));
  }

  function deleteTicket(id) {
    setTickets((p) => p.filter((t) => t.id !== id));
    toast_("🗑️ Chamado removido");
  }

  const filtered = tickets.filter((t) => {
    if (filter === "abertos") return t.status !== "fechado";
    if (filter === "fechados") return t.status === "fechado";
    return true;
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", width: "90%", maxWidth: 550, borderRadius: 12, overflow: "hidden", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#075E54", color: "white", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>🎫 Chamados / Tarefas</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{tickets.filter(t => t.status !== "fechado").length} aberto(s)</div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "white", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Criar novo */}
        <div style={{ padding: 12, background: "#f5f5f5", display: "flex", gap: 8 }}>
          <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTicket()} placeholder="Novo chamado/tarefa..." style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13 }} />
          <button onClick={addTicket} style={{ background: "#25D366", color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Criar</button>
        </div>

        {/* Filtros */}
        <div style={{ padding: "8px 12px", display: "flex", gap: 6, borderBottom: "1px solid #eee" }}>
          {["abertos", "fechados", "todos"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? "#075E54" : "white", color: filter === f ? "white" : "#666",
              border: "1px solid #ddd", padding: "4px 12px", borderRadius: 12, fontSize: 11, cursor: "pointer", textTransform: "capitalize",
            }}>{f}</button>
          ))}
        </div>

        {/* Lista */}
        <div style={{ padding: 12, overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#888" }}>📭 Nenhum chamado</div>
          ) : (
            filtered.map((t) => {
              const st = TICKET_STATUS[t.status] || TICKET_STATUS.aberto;
              const acc = accounts.find((a) => a.id === t.accountId);
              const conv = convs.find((c) => c.id === t.convId);
              return (
                <div key={t.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 8, borderLeft: `4px solid ${st.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                      {t.contact && <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>👤 {t.contact} {acc && `· ${acc.name}`}</div>}
                      <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{new Date(t.createdAt).toLocaleString("pt-BR")}</div>
                    </div>
                    <span style={{ background: st.bg, color: st.color, padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 500 }}>{st.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {t.status !== "aberto" && <button onClick={() => updateStatus(t.id, "aberto")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #ea580c", background: "white", color: "#ea580c", cursor: "pointer" }}>Reabrir</button>}
                    {t.status === "aberto" && <button onClick={() => updateStatus(t.id, "andamento")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #0ea5e9", background: "white", color: "#0ea5e9", cursor: "pointer" }}>▶ Andamento</button>}
                    {t.status !== "fechado" && <button onClick={() => updateStatus(t.id, "fechado")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #16a34a", background: "white", color: "#16a34a", cursor: "pointer" }}>✓ Fechar</button>}
                    {conv && <button onClick={() => onOpenConv(conv)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #075E54", background: "white", color: "#075E54", cursor: "pointer" }}>💬 Abrir conversa</button>}
                    <button onClick={() => deleteTicket(t.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #dc2626", background: "white", color: "#dc2626", cursor: "pointer", marginLeft: "auto" }}>🗑️</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
