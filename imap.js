require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const discord = require("./discord");
const { getMailPreview } = require("./funcitons/getMailPreview");
const { getRecipient } = require("./funcitons/getRecipient");
const { hasProcessed, markAsProcessed } = require("./uidDatabase");
const logger = require("./winston/winstonSetup");

const config = {
  imap: {
    user: process.env.EMAIL,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT),
    tls: true,
    authTimeout: 10000,
    keepalive: {
      interval: 10000,
      idleInterval: 300000,
      forceNoop: true
    }
  },

  polling: {
    intervalMs: Number(process.env.POOLING_INTERVAL_MS) || 15000
  },

  discord: {
    channelId: process.env.DISCORD_CHANNEL_ID,
    roleId: process.env.DISCORD_ROLE_ID,
    rateLimit: {
      messagesPerInterval: Number(process.env.DISCORD_RATE_LIMIT_COUNT) || 5,
      intervalMs: Number(process.env.DISCORD_RATE_LIMIT_INTERVAL_MS) || 5000
    }
  },

  ignoredEmails: process.env.IGNORED_EMAILS,
  watchedFolders: process.env.WATCHED_FOLDERS
    ? process.env.WATCHED_FOLDERS.split(",").map(f => f.trim())
    : []
};

const mailboxLocks = new Set();
const discordQueue = [];
let isSendingDiscord = false;

let connection;
let poolingInterval;
let isPooling = false;
let idleTimer;
let reconnectAttempts = 0;
let reconnecting = false;

async function connectImap() {
  if (reconnecting) return;
  reconnecting = true;

  if (connection) {
    await safeEndConnection(connection);
    connection = null;
  }

  const delay = Math.min(60000, 10000 * Math.pow(2, reconnectAttempts));
  reconnectAttempts++;
  logger.info(`🔄 Connecting in ${delay / 1000}s...`);
  await new Promise(res => setTimeout(res, delay));

  try {
    connection = await safeConnect();
    reconnectAttempts = 0;
    logger.info("✅ Connected to IMAP");
    setupListeners();
    startPooling();
    reconnecting = false;
  } catch (err) {
    logger.error("❌ Failed to connect:", err.message);
    reconnecting = false;
    connectImap(); // retry again
  }
}

function setupListeners() {
  connection.on("mail", async () => {
    if (isPooling) {
      logger.info("⏭️ IDLE ignored (polling active)");
      return;
    }

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      checkMail("INBOX");
    }, 500);
  });

  connection.on("close", () => {
    // IMAP Dropped connection -> Try Reconnect
    console.warn("⚠️ IMAP connection closed. Attempting to reconnect...");
    retryConnect();
  });

  connection.on("error", (err) => {
    logger.error("❌ IMAP error:", err.message);
    retryConnect();
  });
}

function startPooling() {
  logger.info("⏱️ Starting IMAP pooling fallback...");

  poolingInterval = setInterval(async () => {
    logger.info("🔄 IMAP Pooling Fallback Triggered: checking connection...");

    logger.info(
    "🕒 Poll tick",
    new Date().toISOString()
    );

    if (isPooling){ 
      logger.info("⏭️ Poll skipped (already running)");
      return;
    }
    isPooling = true;

    try {
      for (const mailbox of config.watchedFolders) {
        await checkMail(mailbox);
      }
    } finally {
      isPooling = false;
    }
  }, config.polling.intervalMs || 300000); // Default to 5 minutes
}

async function checkMail(mailbox = "INBOX") {
  if (mailboxLocks.has(mailbox)) {
    logger.info(`⏭️ ${mailbox} check skipped (already running)`);
    return;
  }

  mailboxLocks.add(mailbox);

  try {
    if (!connection.box || connection.box.name !== mailbox) {
      await connection.openBox(mailbox, false);
    }

    const results = await connection.search(
      ["UNSEEN"],
      {
        bodies: [""],
        struct: true,
        markSeen: false
      }
    );

    for (const res of results) {
      const uid = res.attributes.uid;

      if (hasProcessed(mailbox, uid)) continue;
      markAsProcessed(mailbox, uid); 

      const raw = res.parts[0].body;
      const mail = await simpleParser(raw);

     const sender = mail.from?.value?.[0]?.address?.toLowerCase() || "";
     const recipients = [
      ...(mail.to?.value ?? []),
      ...(mail.cc?.value ?? []),
      ...(mail.bcc?.value ?? []),
     ].map(r => r.address.toLowerCase());

      const isIgnored =
        config.ignoredEmails.includes(sender) ||
        recipients.some(r => config.ignoredEmails.includes(r));

      if (isIgnored) {
        logger.info(`⏭️ Ignored mail | from: ${sender} | to: ${recipients.join(", ")}`);
        markAsProcessed(mailbox, uid);
        continue; 
      }

      logger.info(`📧 [${mailbox}] ${mail.subject}`);

      const channel = await discord.channels
        .fetch(config.discord.channelId)
        .catch(() => null);

      if (!channel) continue;

      enqueueDiscordMessage(channel, {
        content: `<@&${config.discord.roleId}>`,
        embeds: [{
          title: "📧 Nowy Mail",
          fields: [
            { name: "Folder", value: mailbox },
            { name: "Nadawca", value: mail.from.text, inline: true },
            { name: "Odbiorca", value: getRecipient(mail), inline: true },
            { name: "Temat", value: mail.subject || "(brak tematu)" },
            { name: "Opis", value: getMailPreview(mail, 500) }
          ],
          timestamp: mail.date
        }]
      });
    }

  } catch (err) {
    logger.error(`❌ Error checking ${mailbox}:`, err.message);
  } finally {
    mailboxLocks.delete(mailbox);
  }
}

async function retryConnect() {
  if (reconnecting) return; // prevent multiple reconnects
  reconnecting = true;

  if (poolingInterval) clearInterval(poolingInterval);
  if (idleTimer) clearTimeout(idleTimer);

  if (connection) await safeEndConnection(connection);
  connection = null;

  const delay = Math.min(60000, 10000 * Math.pow(2, reconnectAttempts));
  reconnectAttempts++;
  logger.info(`🔄 Retrying IMAP connection in ${delay/1000}s...`);

  setTimeout(async () => {
    reconnecting = false;
    await connectImap();
  }, delay);
}

discord.once("clientReady", () => {
  logger.info("🤖 Discord bot ready");
  connectImap();
});

function enqueueDiscordMessage(channel, payload) {
  discordQueue.push({ channel, payload });
  processDiscordQueue();
}

async function processDiscordQueue() {
  if (isSendingDiscord) return;
  isSendingDiscord = true;

  const { messagesPerInterval, intervalMs } = config.discord.rateLimit;

  while (discordQueue.length) {
    const batch = discordQueue.splice(0, messagesPerInterval);

    for (const { channel, payload } of batch) {
      try {
        await channel.send(payload);
        logger.info("✅ Discord message sent");
      } catch (error) {
        logger.error("❌ Error sending Discord message:", error.message);
      }
    }

    if (discordQueue.length) {
      await new Promise(res => setTimeout(res, intervalMs));
    }
  }

  isSendingDiscord = false;
}

async function safeConnect(timeout = 15000) {
  return Promise.race([
    imaps.connect({ imap: config.imap }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("IMAP connect timeout")), timeout))
  ]);
}

async function safeEndConnection(conn, timeout = 5000) {
  if (!conn) return;
  return Promise.race([
    new Promise(res => conn.end(() => res())),
    new Promise(res => setTimeout(res, timeout))
  ]);
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});