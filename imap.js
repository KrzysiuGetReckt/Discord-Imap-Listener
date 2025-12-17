require("dotenv").config();
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
const discord = require("./discord");

const config = {
  imap: {
    user: process.env.EMAIL,
    password: process.env.EMAIL_PASSWORD,
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    tls: true,
    authTimeout: 10000
  }
};

async function startImap() {
  const connection = await imaps.connect(config);
  await connection.openBox("INBOX");

  console.log("IMAP connected. Waiting for new mail...");

  // IDLE mode
  connection.on("mail", async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const searchCriteria = ["UNSEEN", ["SINCE", new Date()]];
    const fetchOptions = { 
      bodies: [""],
      markSeen: true 
    };

    const results = await connection.search(searchCriteria, fetchOptions);

    for (const res of results) {
      const raw = res.parts[0].body;
      const mail = await simpleParser(raw);

      if (!mail.date || mail.date < fiveMinutesAgo) {
        continue; // Skip old emails
      }

      const channel = await discord.channels.fetch(
        process.env.DISCORD_CHANNEL_ID
      );

      await channel.send(
        `<@&${process.env.DISCORD_ROLE_ID}> 📧 **New Email**\n` +
        `**From:** ${mail.from.text}\n` +
        `**Subject:** ${mail.subject}`
      );
    }
  });
}

startImap().catch(console.error);