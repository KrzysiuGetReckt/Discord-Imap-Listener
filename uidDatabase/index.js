const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "uids.json");

let state = {};

/**
 * Load persisted UID state from disk
 */
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    state = JSON.parse(raw);
    console.log("📂 UID database loaded");
  }
} catch (err) {
  console.error("❌ Failed to load UID database:", err.message);
  state = {};
}

/**
 * Check if UID was already processed
 */
function hasProcessed(mailbox, uid) {
  return Boolean(state[mailbox]?.includes(uid));
}

/**
 * Mark UID as processed and persist to disk
 */
function markAsProcessed(mailbox, uid) {
  try {
    state[mailbox] = state[mailbox] || [];
    state[mailbox].push(uid);

    // Prevent unlimited growth
    if (state[mailbox].length > 5000) {
      state[mailbox].shift();
    }

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(state, null, 2)
    );
  } catch (err) {
    console.error(
      `❌ Failed to persist UID ${uid} for mailbox ${mailbox}:`,
      err.message
    );
  }
}

module.exports = {
  hasProcessed,
  markAsProcessed
};