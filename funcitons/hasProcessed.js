function hasProcessed(mailbox, uid) {
  if (!processedUids.has(mailbox)) {
    processedUids.set(mailbox, new Set());
  }
  return processedUids.get(mailbox).has(uid);
}

function markAsProcessed(mailbox, uid) {
    processedUids.get(mailbox).add(uid);

    if (processedUids.get(mailbox).size > 5000) {
        processedUids.get(mailbox).delete(
            processedUids.get(mailbox).values().next().value
        );
    }
}
 module.exports = { hasProcessed, markAsProcessed };