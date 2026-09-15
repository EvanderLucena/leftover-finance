// Extrai texto de PDFs com pdf-parse v2 e fallback via pdfreader
const { PDFParse } = require('pdf-parse');

async function pdfToText(buffer) {
  if (!buffer) return '';
  try {
    const parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    if (res && res.text) return res.text;
  } catch (e) {
    // Fallback silencioso para pdfreader se pdf-parse falhar
  }

  return new Promise((resolve) => {
    try {
      const { PdfReader } = require('pdfreader');
      const lines = [];
      new PdfReader().parseBuffer(buffer, (err, item) => {
        if (err) return resolve('');
        if (!item) return resolve(lines.join('\n'));
        if (item.text) lines.push(item.text);
      });
    } catch (err) {
      resolve('');
    }
  });
}

module.exports = { pdfToText };