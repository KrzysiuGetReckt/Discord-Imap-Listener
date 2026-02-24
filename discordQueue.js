const logger = require("./winston/winstonSetup");
const config = require("./config");

const discordQueue = [];
let isSendingDiscord = false;

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

module.exports = { enqueueDiscordMessage };