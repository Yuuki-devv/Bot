require("../config.js");
const {
  jidNormalizedUser,
  proto,
  getContentType,
  areJidsSameUser
} = require("baileys");

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch (e) {
    return {};
  }
};

const normalizeJid = async (conn, jid) => {
  if (!jid) return jid;
  try {
    jid = String(jid);
    if (typeof conn.decodeJid === "function") jid = await conn.decodeJid(jid);
    if (/@s\.whatsapp\.net$/.test(jid) && typeof conn.toLid === "function") {
      return await conn.toLid(jid);
    }
  } catch (e) {}
  return jid;
};

const normalizeNumberOnly = (value = "") => String(value).replace(/[^0-9]/g, "");

const serialize = async (conn, m) => {
  if (!m) return m;

  const { WebMessageInfo } = proto;

  if (m.key) {
    m.id = m.key.id;
    m.chat = await normalizeJid(conn, m.key.remoteJid);

    m.isBaileys = m.id
      ? (
          m.id.startsWith("3EB0") ||
          m.id.startsWith("B1E") ||
          m.id.startsWith("BAE") ||
          m.id.startsWith("3F8") ||
          m.id.length < 32 ||
          m.id.length === 18
        )
      : false;

    m.fromMe = m.key.fromMe;

    const botId = await normalizeJid(conn, conn.user?.id || "");
    m.botNumber = conn.user?.lid
      ? String(conn.user.lid).split(":")[0] + "@lid"
      : botId;

    const ownerJid = `${global.owner}@s.whatsapp.net`;
    const ownerNum = await normalizeJid(conn, ownerJid);

    m.isChannel = String(m.chat || "").endsWith("@newsletter");
    m.isGroup = String(m.chat || "").endsWith("@g.us");

    let sender = await conn.decodeJid(
      m.fromMe ? (conn.user?.id || m.botNumber) : (m.participant || m.key.participant || m.chat)
    );

    // Simpan nomor asli sebelum diubah ke @lid. Ini penting untuk akses/status,
    // karena database premium biasanya pakai nomor 628xxx, bukan LID WhatsApp.
    m.senderNumber = normalizeNumberOnly(sender);
    m.accessNumber = m.senderNumber;

    m.sender = await normalizeJid(conn, sender);

    m.isOwner = m.sender === m.botNumber || m.sender === ownerNum;

    if (m.isGroup) {
      m.participant = await normalizeJid(conn, m.key.participant || m.participant);
    }
  }

  if (m.message) {
    m.mtype = getContentType(m.message);
    m.prefix = ".";

    const content = m.message[m.mtype];
    m.msg =
      m.mtype === "viewOnceMessage"
        ? m.message[m.mtype].message[
            getContentType(m.message[m.mtype].message)
          ]
        : content;

    const interactiveId = m.mtype === "interactiveResponseMessage"
      ? safeJsonParse(m.msg?.nativeFlowResponseMessage?.paramsJson)?.id
      : "";

    m.body =
      m?.message?.conversation ||
      m?.msg?.caption ||
      m?.msg?.text ||
      (m.mtype === "extendedTextMessage" && m.msg.text) ||
      (m.mtype === "buttonsResponseMessage" && m.msg.selectedButtonId) ||
      interactiveId ||
      (m.mtype === "templateButtonReplyMessage" && m.msg.selectedId) ||
      (m.mtype === "listResponseMessage" &&
        m.msg.singleSelectReply?.selectedRowId) ||
      "";

    const quotedMessage = (m.quoted = m.msg?.contextInfo?.quotedMessage || null);
    m.mentionedJid = m.msg?.contextInfo?.mentionedJid || [];

    if (quotedMessage) {
      let qType = getContentType(quotedMessage);
      m.quoted = quotedMessage[qType];

      if (qType === "productMessage") {
        qType = getContentType(m.quoted);
        m.quoted = m.quoted[qType];
      }

      if (typeof m.quoted === "string") m.quoted = { text: m.quoted };

      if (m.quoted) {
        const qParticipant = await normalizeJid(conn, m.msg.contextInfo.participant);

        m.quoted.key = {
          remoteJid: m.msg.contextInfo.remoteJid || m.chat,
          participant: qParticipant,
          fromMe: areJidsSameUser(
            jidNormalizedUser(m.msg.contextInfo.participant || ""),
            jidNormalizedUser(conn.user?.id || "")
          ),
          id: m.msg.contextInfo.stanzaId
        };

        m.quoted.mtype = qType;
        m.quoted.chat = await normalizeJid(conn, m.quoted.key.remoteJid);
        m.quoted.id = m.quoted.key.id;
        m.quoted.isBaileys = m.quoted.id
          ? (
              m.quoted.id.startsWith("3EB0") ||
              m.quoted.id.startsWith("B1E") ||
              m.quoted.id.startsWith("3F8") ||
              m.quoted.id.startsWith("BAE") ||
              m.quoted.id.length < 32
            )
          : false;

        m.quoted.sender = await normalizeJid(conn, m.quoted.key.participant);
        m.quoted.fromMe = m.quoted.sender === m.botNumber;
        m.quoted.text =
          m.quoted.text ||
          m.quoted.caption ||
          m.quoted.conversation ||
          m.quoted.contentText ||
          m.quoted.selectedDisplayText ||
          m.quoted.title ||
          "";
        m.quoted.mentionedJid = m.msg.contextInfo?.mentionedJid || [];

        const fakeObj = (m.quoted.fakeObj = WebMessageInfo.fromObject({
          key: m.quoted.key,
          message: quotedMessage,
          ...(m.isGroup ? { participant: m.quoted.sender } : {})
        }));

        m.quoted.download = (saveToFile = false) =>
          conn.downloadMediaMessage(
            m.quoted,
            m.quoted.mtype.replace(/message/i, ""),
            saveToFile
          );
      }
    }
  }

  if (m.msg?.url) {
    m.download = (saveToFile = false) =>
      conn.downloadMediaMessage(
        m.msg,
        m.mtype.replace(/message/i, ""),
        saveToFile
      );
  }

  m.text = m.body;

  m.reply = async (text, options = {}) => {
    const chatId = options.chat || m.chat;
    const quoted = options.quoted || m;
    const rawMentions = [...String(text).matchAll(/@(\d{5,20})/g)].map(
      v => `${v[1]}@s.whatsapp.net`
    );

    const mentions = [];
    for (const jid of rawMentions) {
      mentions.push(await normalizeJid(conn, jid));
    }

    return conn.sendMessage(
      chatId,
      { text, mentions, ...options },
      { quoted }
    );
  };

  return m;
};

module.exports = serialize;
