const config = require("../config");
const logger = require("../winston/winstonSetup");

function shouldProcessEmail(mail, mailbox) {
  // Sprawdzamy tylko folder
  return config.watchedFolders.includes(mailbox);
}

function getMessageSettings(mail, mailbox) {
  const recipients = [
    ...(mail.to?.value ?? []),
    ...(mail.cc?.value ?? []),
    ...(mail.bcc?.value ?? []),
  ].map(r => r.address?.toLowerCase().trim() || "");

  // Sprawdzenie, czy SPECJALNY odbiorca znajduje się w TO/CC/BCC
  const isSpecialRecipient = config.specialReportEmail &&
                             recipients.includes(config.specialReportEmail);

  logger.info("Odbiorcy maila:", recipients);
  logger.info("SPECIAL_REPORT_EMAIL:", config.specialReportEmail);
  logger.info("Czy special recipient?", isSpecialRecipient);

  if (isSpecialRecipient) {
    return {
      channelId: config.discord.reportChannelId || process.env.DISCORD_CHANNEL_RAPORTS,
      roleId: config.discord.roleId,
      color: 0xff9900,
      prefix: "📢 Zgłoszenie specjalne"
    };
  }

  // Normalny mail
  return getFolderSettings(mailbox);
}

function getFolderSettings(mailbox) {
  return config.folderSettings?.[mailbox] || {
    channelId: config.discord.channelId || process.env.DISCORD_CHANNEL_ID,
    roleId: config.discord.roleId,
    color: 0x5865F2,
    prefix: "📧 Nowy mail"
  };
}

module.exports = {
  shouldProcessEmail,
  getMessageSettings,
  getFolderSettings
};
