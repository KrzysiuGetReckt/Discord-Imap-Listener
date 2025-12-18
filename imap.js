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
    port: process.env.IMAP_PORT,
    tls: true,
    authTimeout: 10000,
    keepalive: {
      interval: 10000,
      idleInterval: 300000, // 5 min
      forceNoop: true
    }
  }
};

let connection;
let lastCehck = new Date();
let poolingInterval;

async function connectImap() {

  try {
  connection = await imaps.connect(config);
  await connection.openBox("INBOX");

  console.log("Connected to IMAP server.");

  setupListeners();
  startPooling();

  // Initial mail check
  await checkMail();
  } catch (error) {
    console.error("❌ IMAP connection failed:", error.message);
    retryConnect();
  }
}

function setupListeners() {
  //Imap idle event listener
  connection.on("mail", async () => {
    console.log("📩 IMAP IDLE: new mail detected");
    await checkMail();
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
  poolingInterval = setInterval(() => {
    console.log("🔄 IMAP Pooling Fallback Triggered: checking connection...");
    checkMail();
  }, process.env.POOLING_INTERVAL_MS || 300000); // Default to 5 minutes
}

async function checkMail() {
  if (!connection) return;

  try {
    const searchCriteria = [
      "UNSEEN",
      ["SINCE", lastCehck]
    ];

    const fetchOptions = {
      bodies: [""],
      markSeen: true
    };

    const results = await connection.search(searchCriteria, fetchOptions);
    lastCehck = new Date();

    for (const res of results) {
      const raw = res.parts[0].body;
      const mail = await simpleParser(raw);

      console.log(`📧 ${mail.from.text} → ${mail.subject}`);

      const channel = await discord.channels.fetch(
        process.env.DISCORD_CHANNEL_ID
      );

      const preview = getMailPreview(mail, 500);

      await channel.send({
        content: `<@&${process.env.DISCORD_ROLE_ID}>`,
        embeds: [{
          title: "📧 Nowy Mail",
          fields: [
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

  retryConnect();
}

function retryConnect() {
  setTimeout(() => {
    connectImap();
  }, 10000); // Retry after 10 seconds
}

connectImap();