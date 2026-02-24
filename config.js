// ./config.js
require("dotenv").config();

module.exports = {
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
    reportChannelId: process.env.DISCORD_CHANNEL_RAPORTS,
    roleId: process.env.DISCORD_ROLE_ID,
    rateLimit: {
      messagesPerInterval: Number(process.env.DISCORD_RATE_LIMIT_COUNT) || 5,
      intervalMs: Number(process.env.DISCORD_RATE_LIMIT_INTERVAL_MS) || 5000
    }
  },

  reportSettings: {
    channelId: process.env.DISCORD_CHANNEL_RAPORTS,
    roleId: process.env.DISCORD_ROLE_ID,
    color: 0xff9900,
    prefix: "📩 Nowe zgłoszenie"
  },

  specialReportEmail: process.env.SPECIAL_REPORT_EMAIL
  ? process.env.SPECIAL_REPORT_EMAIL.trim().toLowerCase()
  : null,

  ignoredEmails: process.env.IGNORED_EMAILS
  ?.split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean) || [],          // zabezpieczenie przed undefined
  
  watchedFolders: process.env.WATCHED_FOLDERS
    ? process.env.WATCHED_FOLDERS.split(",").map(f => f.trim())
    : ["INBOX"],

};