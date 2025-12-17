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

    console.log("New mail detected, fetching...");

    const results = await connection.search(searchCriteria, fetchOptions);

    for (const res of results) {
      const raw = res.parts[0].body;
      const mail = await simpleParser(raw);

      if (!mail.date || mail.date < fiveMinutesAgo) {
        continue; // Skip old emails
      }

      console.log(`New email from: ${mail.from.text}, subject: ${mail.subject}`);

      const channel = await discord.channels.fetch(
        process.env.DISCORD_CHANNEL_ID
      );

      const preview = getMailPreview(mail, 500);

      await channel.send({
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
  });
}

startImap().catch(console.error);