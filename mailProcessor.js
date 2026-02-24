
const { simpleParser } = require("mailparser");
const logger = require("./winston/winstonSetup");
const { shouldProcessEmail, getMessageSettings } = require("./functions/shouldProcessEmail");
const { getMailPreview } = require("./functions/getMailPreview");
const { hasProcessed, markAsProcessed } = require("./uidDatabase");
const config = require("./config");
const discord = require("./discord");

const mailboxLocks = new Set();

async function checkMail(connection, mailbox = "INBOX", timeoutMs = 45000) {
    logger.info('Starting to check mailboxes');
  if (mailboxLocks.has(mailbox)) {
    logger.debug(`checkMail dla ${mailbox} pominięty – lock aktywny`);
    return;
  }

  mailboxLocks.add(mailbox);

  logger.info('Adding mailboxLocks to set()', mailbox);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`checkMail timeout dla ${mailbox}`)), timeoutMs)
  );

  try {
    await Promise.race([
      (async () => {
        logger.info('Checking for email in list');
        if (!connection.box || connection.box.name !== mailbox) {
          await connection.openBox(mailbox, false); 
        }

        const results = await connection.search(
          ["UNSEEN"],
          {
            bodies: [""],
            struct: true,
            markSeen: false
          }
        );
        logger.info('Checking for unseen mails');

        if (results.length === 0) {
          logger.debug(`Brak nowych wiadomości w ${mailbox}`);
          return;
        }

        logger.info(`Znaleziono ${results.length} nowych wiadomości w ${mailbox}`);

        for (const res of results) {
          const uid = res.attributes.uid;

          if (hasProcessed(mailbox, uid)) {
            logger.debug(`UID ${uid} w ${mailbox} już przetworzony – pomijam`);
            continue;
          }

          try {
            const raw = res.parts[0].body;
            const mail = await simpleParser(raw);
            const sender = mail.from?.value?.[0]?.address?.toLowerCase() || "(brak nadawcy)";
            logger.info('Checking if the email should be processed.');

            if (!shouldProcessEmail(mail, mailbox)) {
              logger.debug(`Mail UID ${uid} w ${mailbox} nie pasuje do filtrów – oznaczam jako przetworzony`);
              markAsProcessed(mailbox, uid);
              continue;
            }

            const allRecipients = [
              ...(mail.to?.value ?? []),
              ...(mail.cc?.value ?? []),
              ...(mail.bcc?.value ?? []),
            ]
              .map(r => r.address)
              .filter(Boolean);

            logger.info('Creating allRecipients', allRecipients);

            const recipientsText = allRecipients.length > 0 ? allRecipients.join(", ") : "(brak)";

            const ignoredSet = new Set(config.ignoredEmails.map(email => email.toLowerCase()));

            logger.info('Starting to check for ignored');

            const isIgnored =
            Array.from(ignoredSet).some(ignored => sender.startsWith(ignored)) ||
            allRecipients.some(r => Array.from(ignoredSet).some(ignored => r.startsWith(ignored)));

            if (isIgnored) {
              logger.info(`⏭️ Ignorowany (mimo filtra) | UID ${uid} | ${mailbox} | od: ${sender}`);
              markAsProcessed(mailbox, uid);
              continue;
            }

            logger.info(`📧 Przetwarzam | UID ${uid} | ${mailbox} | "${mail.subject || "(brak tematu)"}"`);

            const settings = getMessageSettings(mail, mailbox);

            const channel = await discord.channels
              .fetch(settings.channelId)
              .catch(err => {
                logger.warn(`Nie udało się pobrać kanału ${settings.channelId}: ${err.message}`);
                return null;
              });

            if (!channel) {
              logger.warn(`Kanał niedostępny dla UID ${uid} (${mailbox}) – retry za następnym razem`);
              continue; 
            }

            enqueueDiscordMessage(channel, {
              content: settings.roleId ? `<@&${settings.roleId}>` : "",
              embeds: [{
                color: settings.color || 0x5865F2,
                title: settings.prefix || "📧 Nowy mail",
                fields: [
                  { name: "Folder", value: mailbox, inline: true },
                  { name: "Nadawca", value: mail.from?.text || "(brak)", inline: true },
                  { name: "Odbiorca", value: recipientsText, inline: true },
                  { name: "Temat", value: mail.subject || "(brak tematu)" },
                  { name: "Opis", value: getMailPreview(mail, 500) || "(brak podglądu)" }
                ],
                timestamp: mail.date?.toISOString(),
                footer: { text: `UID: ${uid} • ${mailbox}` }
              }]
            });
            markAsProcessed(mailbox, uid);
            logger.info(`✅ UID ${uid} w ${mailbox} wysłany na Discord`);
          } catch (innerErr) {
            logger.error(`Błąd podczas przetwarzania UID ${uid} w ${mailbox}: ${innerErr.message}`);
          }
        }
      })(),
      timeoutPromise
    ]);
  } catch (err) {
    logger.error(`checkMail (${mailbox}) zakończony błędem lub timeoutem: ${err.message}`);
  } finally {
    mailboxLocks.delete(mailbox);
  }
}

function resetMailboxLocks() {
  mailboxLocks.clear();
}
// Forward to discordQueue.js
const { enqueueDiscordMessage } = require("./discordQueue");

module.exports = { checkMail, resetMailboxLocks };