require("dotenv").config();
const discord = require("./discord");
const logger = require("./winston/winstonSetup");
const { connectImap } = require("./imapService");

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
});

discord.once("clientReady", () => {
    logger.info("🤖 Discord bot ready, starting IMAP connection...");
    connectImap();
});