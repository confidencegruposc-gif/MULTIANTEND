// backend/webhooks/uazapiWebhook.js
// Webhook universal da UAZAPI

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
    "554792285773": 1,
    "554792189753": 2,
    "554732125603": 4,
  };

  async function receberWebhook(req, res) {
    try {
      const body = req.body || {};

      // Ignora eventos que NÃO são mensagens reais
      if (
        body.EventType === "messages_update" ||
        body.type === "ReadReceipt" ||
        body.type === "DeletedMessage" ||
        body.state === "Read" ||
        body.state === "Delivered" ||
        body.state === "Played"
      ) {
        return res.json({ ok: true, ignored: "status_update" });
      }

      const data = body.message || body.data || body.payload || body;
      const content = typeof data.content === "object" ? data.content : {};

      console.log("WEBHOOK RECEBIDO:", JSON.stringify(body).slice(0, 3000));

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
        typeof data.content === "string" ? data.content : "",
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
  data.link,

  content.URL,
  content.url,
  content.mediaUrl,
  content.fileUrl,
  content.imageUrl
);

      const fromMe = Boolean(
        data.fromMe ||
        data.fromme ||
        data.isFromMe ||
        data.key?.fromMe
      );
    

      const contact = pegarPrimeiroValor(
        data.groupName,
        data.senderName,
        data.pushName,
        data.notifyName,
        data.name,
        data.chatName,
        rawId
      );

      const isGroup = Boolean(
        data.isGroup ||
        data.IsGroup ||
        String(rawId).includes("@g.us")
      );

      const phone = limparTelefone(rawId);

      const tipos = detectarTipoMensagem(data);
      const displayText = montarTextoExibicao({ text, ...tipos });

      const token = pegarPrimeiroValor(body.token, body.Token, data.token);
      const owner = pegarPrimeiroValor(
        body.owner,
        body.Owner,
        data.owner,
        body.instance,
        body.Instance
      );

      let accountId = TOKEN_TO_ACCOUNT[token];

      if (!accountId) {
        const ownerClean = String(owner).replace(/\D/g, "");
        accountId = OWNER_TO_ACCOUNT[ownerClean];
      }

      if (!accountId) accountId = 1;

    if (isGroup) {
  const groups = loadGroups();

  if (!groups[rawId]) {
    groups[rawId] = {
      name: contact,
      enabled: true,
      accountId,
      phone: rawId,
      lastSeen: new Date().toISOString(),
    };

    console.log("[GRUPO NOVO]", contact);
  } else {
    groups[rawId].name = contact;
    groups[rawId].accountId = accountId;
    groups[rawId].phone = rawId;
    groups[rawId].lastSeen = new Date().toISOString();
  }

  saveGroups(groups);
}

    const classified = await classifyMsg(contact, text || displayText);

console.log(
  "[CONTA]",
  accountId,
  isGroup ? "[GRUPO]" : "[CLIENTE]",
  contact,
  displayText
);

io.emit("new_message", {
        accountId,
       phone: isGroup ? rawId : phone,
        contact,
  
        fromMe,
  
        isGroup,
        area: isGroup ? "groups" : "chats",

        message: displayText,
        originalText: text,

        mediaUrl,
        msgType: tipos.msgType,

        isAudio: tipos.isAudio,
        isImage: tipos.isImage,
        isVideo: tipos.isVideo,
        isDoc: tipos.isDoc,
        isSticker: tipos.isSticker,
        isLocation: tipos.isLocation,
        isContact: tipos.isContact,

        lane: classified.lane,
        reason: classified.reason,

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
      console.error("ERRO WEBHOOK:", err);
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
