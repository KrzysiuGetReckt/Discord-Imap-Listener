function getRecipient(mail) {
    if (mail.to?.text) return mail.to.text;
    if (mail.cc?.text) return mail.cc.text;
    if (mail.bcc?.text) return mail.bcc.text;
    return "Unknown Recipient";
}

module.exports = {
    getRecipient
};