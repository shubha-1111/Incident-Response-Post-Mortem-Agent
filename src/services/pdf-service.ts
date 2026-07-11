import PDFKit from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { renderExecutiveSummary, renderTechnicalDeepDive } from './report-templates.js';

const PDF_OUTPUT_DIR = process.env.PDF_OUTPUT_DIR || path.join(process.cwd(), 'reports', 'pdfs');

const ensureOutputDir = () => {
  if (!fs.existsSync(PDF_OUTPUT_DIR)) {
    fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
  }
};

export interface PDFOptions {
  format?: 'A4' | 'letter' | 'legal';
  margin?: number;
}

export const generatePDF = (
  html: string,
  filename: string,
  options: PDFOptions = {}
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      ensureOutputDir();
      const pdfPath = path.join(PDF_OUTPUT_DIR, `${filename}.pdf`);
      const doc = new PDFKit({
        size: options.format || 'A4',
        margin: options.margin || 40,
      });

      const stream = fs.createWriteStream(pdfPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#1f2937').text(filename, { align: 'center' });
      doc.moveDown();

      // Simple text extraction from HTML (basic approach)
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      doc.fontSize(12).fillColor('#333').text(textContent, {
        lineGap: 5,
        paragraphGap: 10,
      });

      doc.end();

      stream.on('finish', () => resolve(pdfPath));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
};

export const generateIncidentPDF = async (
  incidentId: string,
  type: 'executive-summary' | 'technical-deep-dive',
  data: any
): Promise<{ success: boolean; pdfPath?: string; error?: string }> => {
  try {
    let html: string;
    let filename: string;

    if (type === 'executive-summary') {
      html = renderExecutiveSummary(data);
      filename = `executive-summary-${incidentId}`;
    } else {
      html = renderTechnicalDeepDive(data);
      filename = `technical-deep-dive-${incidentId}`;
    }

    const pdfPath = await generatePDF(html, filename);
    return { success: true, pdfPath };
  } catch (err: any) {
    console.error(`[PDF Service] Failed to generate ${type} PDF for ${incidentId}:`, err);
    return { success: false, error: err.message };
  }
};

export const getPDF = (filename: string): Buffer | null => {
  const pdfPath = path.join(PDF_OUTPUT_DIR, `${filename}.pdf`);
  if (fs.existsSync(pdfPath)) {
    return fs.readFileSync(pdfPath);
  }
  return null;
};

export { PDF_OUTPUT_DIR };