function getMailPreview(mail, maxLength = 500) {
  let text = mail.text || "";

  if (!text && mail.html) {
    text = mail.html.replace(/<[^>]*>/g, " ");
  }

  text = text
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > maxLength) {
    return text.slice(0, maxLength) + "…";
  }

  return text;
}

module.exports = {
  getMailPreview
};