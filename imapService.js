const imaps = require("imap-simple");
const logger = require("./winston/winstonSetup");
const config = require("./config");
const { checkMail, resetMailboxLocks  } = require("./mailProcessor");

let connection;
let poolingInterval;
let isPooling = false;
let reconnectAttempts = 0;
let reconnecting = false;
let idleTimer;

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
        isPooling = false;
        resetMailboxLocks();
        setupListeners();
        startPooling();
        reconnecting = false;
    } catch (err) {
        logger.error("❌ Failed to connect:", err.message);
        reconnecting = false;
        connectImap();
    }
}

function setupListeners() {
    connection.on("mail", () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            logger.info("🔄 IDLE triggered full check");
            config.watchedFolders.forEach(mb => checkMail(connection, mb));
        }, 2000);
    });

    connection.on("close", () => {
        logger.warn("⚠️ IMAP connection closed. Reconnecting...");
        retryConnect();
    });

    connection.on("error", (err) => {
        logger.error("❌ IMAP error:", err.message);
        retryConnect();
    });
}

function startPooling() {
    logger.info("⏱️ Starting IMAP polling fallback...");
    poolingInterval = setInterval(async () => {
        if (isPooling) {
            logger.warn("Polling tick SKIPPED – still processing previous tick!");
            return;
        }
        isPooling = true;
        try {
            for (const mailbox of config.watchedFolders) {
                await checkMail(connection, mailbox);
            }
        } catch (err) {
            logger.error("Unexpected error in polling loop", err);
        } finally {
            isPooling = false;
        }
    }, config.polling.intervalMs);
}

function retryConnect() {
    if (reconnecting) return;
    reconnecting = true;
    if (poolingInterval) clearInterval(poolingInterval);
    if (idleTimer) clearTimeout(idleTimer);
    if (connection) safeEndConnection(connection);
    connection = null;

    const delay = Math.min(60000, 10000 * Math.pow(2, reconnectAttempts));
    reconnectAttempts++;
    logger.info(`🔄 Retrying IMAP connection in ${delay / 1000}s...`);

    setTimeout(async () => {
        reconnecting = false;
        await connectImap();
    }, delay);
}

async function safeConnect(timeout = 15000) {
    return Promise.race([
        imaps.connect({ imap: config.imap }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("IMAP connect timeout")), timeout))
    ]);
}

// Safe end connection
async function safeEndConnection(conn, timeout = 5000) {
    if (!conn) return;
    return Promise.race([
        new Promise(res => conn.end(() => res())),
        new Promise(res => setTimeout(res, timeout))
    ]);
}

module.exports = { connectImap };