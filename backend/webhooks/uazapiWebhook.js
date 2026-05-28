// backend/webhooks/uazapiWebhook.js
// Webhook universal da UAZAPI
// Recebe texto, imagem, áudio, documento, vídeo, sticker, localização e contato.

function pegarPrimeiroValor(...valores) {
  for (const valor of valores) {
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return "";
}

function limparTelefone(rawId) {
  return String(rawId || "")
    .replace("@s.whatsapp.net", "")
    .replace("@c.us", "")
    .replace("@g.us", "");
}

function detectarTipoMensagem(data = {}) {
  const msgType = String(
    data.messageType ||
    data.type ||
    data.mimetype ||
    data.mediaType ||
    "text"
  ).toLowerCase();

  return {
    msgType,
    isAudio: msgType.includes("audio") || msgType.includes("ptt") || msgType.includes("voice"),
    isImage: msgType.includes("image") || msgType.includes("photo"),
    isVideo: msgType.includes("video"),
    isDoc: msgType.includes("document") || msgType.includes("file"),
    isSticker: msgType.includes("sticker"),
    isLocation: msgType.includes("location"),
    isContact: msgType.includes("contact") || msgType.includes("vcard"),
  };
}

function montarTextoExibicao({ text, isAudio, isImage, isVideo, isDoc, isSticker, isLocation, isContact }) {
  if (isAudio) return "🎤 [ÁUDIO]";
  if (isImage) return text || "📷 [IMAGEM]";
  if (isVideo) return text || "🎥 [VÍDEO]";
  if (isDoc) return text || "📄 [DOCUMENTO]";
  if (isSticker) return "😂 [STICKER]";
  if (isLocation) return "📍 [LOCALIZAÇÃO]";
  if (isContact) return "👤 [CONTATO]";
  return text || "📩 [MENSAGEM RECEBIDA]";
}

function registrarWebhookUazapi(app, io, deps = {}) {
  const {
    TOKEN_TO_ACCOUNT = {},
    loadGroups = () => ({}),
    saveGroups = () => false,
    classifyMsg = async () => ({ lane: "espera", reason: "" }),
  } = deps;

  const OWNER_TO_ACCOUNT = {
    "554792285773": 1, // confir MEI
    "554792189753": 2, // Confidence
    "554732125603": 4, // Pet Family
  };

  async function receberWebhook(req, res) {
    try {
      const body = req.body || {};
      const data = body.data || body.message || body.messages || body.payload || body;
      const content = data.content || {};

      console.log("📥 WEBHOOK RECEBIDO:", JSON.stringify(body).slice(0, 3000));

      const rawId = pegarPrimeiroValor(
        data.chatid,
        data.chatId,
        data.from,
        data.sender,
        data.phone,
        data.number,
        data.remoteJid,
        data.key?.remoteJid
      );

      const text = pegarPrimeiroValor(
        content.text,
        content.caption,
        data.caption,
        data.body,
        data.text,
        data.message,
        data.conversation,
        data.extendedTextMessage?.text
      );

      const mediaUrl = pegarPrimeiroValor(
        data.mediaUrl,
        data.url,
        data.fileUrl,
        data.audioUrl,
        data.imageUrl,
        data.videoUrl,
        data.documentUrl,
        data.link
      );

      const fromMe = Boolean(
        data.fromMe ||
        data.fromme ||
        data.isFromMe ||
        data.key?.fromMe
      );

      if (fromMe) {
        return res.json({ ok: true, ignored: "fromMe" });
      }

      const contact = pegarPrimeiroValor(
        data.groupName,
        data.senderName,
        data.pushName,
        data.notifyName,
        data.name,
        data.chatName,
        rawId
      );

      const isGroup = String(rawId).includes("@g.us");
      const phone = limparTelefone(rawId);

      const tipos = detectarTipoMensagem(data);
      const displayText = montarTextoExibicao({ text, ...tipos });

      const token = pegarPrimeiroValor(body.token, body.Token, data.token);
      const owner = pegarPrimeiroValor(body.owner, body.Owner, data.owner, body.instance, body.Instance);

      let accountId = TOKEN_TO_ACCOUNT[token];

      if (!accountId) {
        const ownerClean = String(owner).replace(/\D/g, "");
        accountId = OWNER_TO_ACCOUNT[ownerClean];
      }

      if (!accountId) accountId = 1;

      let groupEnabled = true;

      if (isGroup) {
        const groups = loadGroups();

        if (!groups[rawId]) {
          groups[rawId] = {
            name: contact,
            enabled: true,
            accountId,
            lastSeen: new Date().toISOString(),
          };
          console.log(`👥 Novo grupo detectado: ${contact}`);
        } else {
          groups[rawId].name = contact;
          groups[rawId].lastSeen = new Date().toISOString();
          groupEnabled = groups[rawId].enabled !== false;
        }

        saveGroups(groups);
      }

      const classified = await classifyMsg(contact, text || displayText);

      console.log(
        `🔔 [Conta ${accountId}] ${isGroup ? "[GRUPO]" : "[CLIENTE]"} ${contact}: ${displayText}`
      );

     io.emit("new_message", {
  accountId,
  phone,
  contact,

  // IMPORTANTE
  isGroup,
  area: isGroup ? "groups" : "chats",

  message: displayText,
  originalText: text,

  mediaUrl,
  msgType,

  isAudio,
  isImage,
  isVideo,
  isDoc,
  isSticker,
  isLocation,
  isContact,

  time: new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }),
});

      return res.json({
        ok: true,
        received: true,
        type: tipos.msgType,
        isGroup,
      });
    } catch (err) {
      console.error("❌ ERRO WEBHOOK:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  app.post("/api/webhook", receberWebhook);
  app.post("/api/webhook/messages/text", receberWebhook);
  app.post("/api/webhook/messages/image", receberWebhook);
  app.post("/api/webhook/messages/audio", receberWebhook);
  app.post("/api/webhook/messages/video", receberWebhook);
  app.post("/api/webhook/messages/document", receberWebhook);
  app.post("/api/webhook/messages/sticker", receberWebhook);
  app.post("/api/webhook/*", receberWebhook);
}

module.exports = { registrarWebhookUazapi };
