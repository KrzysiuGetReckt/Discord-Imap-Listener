require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const discord = require("./discord");
const { getMailPreview } = require("./funcitons/getMailPreview");
const { getRecipient } = require("./funcitons/getRecipient");



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

  watchedFolders: process.env.WATCHED_FOLDERS
    ? process.env.WATCHED_FOLDERS.split(",").map(f => f.trim())
    : []
};

const discordQueue = [];
let isSendingDiscord = false;

let connection;
let lastCheckMap = new Map();
let poolingInterval;
let isPooling = false;

function getLastCheck(mailbox) {
  if(!lastCheckMap.has(mailbox)) {
    lastCheckMap.set(mailbox, new Date(0));
}   
  return lastCheckMap.get(mailbox);
}

function updateLastCheck(mailbox) {
  lastCheckMap.set(mailbox, new Date());
}

async function connectImap() {

  try {
  connection = await imaps.connect({ imap: config.imap });
  await connection.openBox("INBOX");

  console.log("Connected to IMAP server.");

  setupListeners();
  startPooling();

  if (!config.watchedFolders.length) {
    console.warn("⚠️ No WATCHED_FOLDERS specified in environment variables.");
  }

  for (const mailbox of config.watchedFolders) {
    await checkMail(mailbox);
  } 

  } catch (error) {
    console.error("❌ IMAP connection failed:", error.message);
    retryConnect();
  }
}

function setupListeners() {
  //Imap idle event listener
  connection.on("mail", async () => {
    console.log("📩 IMAP IDLE: new mail detected (INBOX)");
    await checkMail("INBOX");
  });

  connection.on("close", () => {
    // IMAP Dropped connection -> Try Reconnect
    console.warn("⚠️ IMAP connection closed. Attempting to reconnect...");
    retryConnect();
  });

  connection.on("error", (err) => {
    console.error("❌ IMAP error:", err.message);
    retryConnect();
  });
}

function startPooling() {
  console.log("⏱️ Starting IMAP pooling fallback...");

  poolingInterval = setInterval(async () => {
    console.log("🔄 IMAP Pooling Fallback Triggered: checking connection...");

    console.log(
    "🕒 Poll tick",
    new Date().toISOString()
    );

    if (isPooling){ 
      console.log("⏭️ Poll skipped (already running)");
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
  if (!connection) return;

  try {
    if (!connection.box || connection.box.name !== mailbox) {
      await connection.openBox(mailbox, false);
    }
    
    const searchCriteria = [
      "UNSEEN",
      ["SINCE", getLastCheck(mailbox)]
    ];

    const fetchOptions = {
      bodies: [""],
      markSeen: true
    };

    const results = await connection.search(searchCriteria, fetchOptions);
    updateLastCheck(mailbox);

    for (const res of results) {
      const raw = res.parts[0].body;
      const mail = await simpleParser(raw);

      console.log(`📧 [${mailbox}]  ${mail.from.text} → ${mail.subject}`);

      const channel = await discord.channels.fetch(
        config.discord.channelId
      ).catch(() => null);

      if (!channel) {
        console.error("❌ Discord channel not found or inaccessible");
        return;
      }

      const preview = getMailPreview(mail, 500);

     enqueueDiscordMessage(channel, {
        content: `<@&${config.discord.roleId}>`,
        embeds: [{
          title: "📧 Nowy Mail",
          fields: [
            { name: "Folder", value: mailbox },
            { name: "Nadawca", value: mail.from.text, inline: true },
            { name: "Odbiorca", value: getRecipient(mail), inline: true },
            { name: "Temat", value: mail.subject || "(brak tematu)" },
            { name: "Opis", value: preview }
          ],
          timestamp: mail.date
        }]
      });
    }
  } catch (error) {
    console.error("❌ Error checking mail:", error.message);
  }
}


function retryConnect() {

  console.log("🔄 Retrying IMAP connection...");

  try {
    if (poolingInterval) clearInterval(poolingInterval);
    if (connection) connection.end();
  } catch {}

  setTimeout(() => {
    connectImap();
  }, 10000); // Retry after 10 seconds
}

discord.once("clientReady", () => {
  console.log("🤖 Discord bot ready");
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
        console.log("✅ Discord message sent");
      } catch (error) {
        console.error("❌ Error sending Discord message:", error.message);
      }
    }

    if (discordQueue.length) {
      await new Promise(res => setTimeout(res, intervalMs));
    }
  }

  isSendingDiscord = false;
}