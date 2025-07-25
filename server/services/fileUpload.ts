import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import csv from 'csv-parser';
import { createReadStream } from 'fs';

export interface CSVValidationResult {
  isValid: boolean;
  headers: string[];
  rowCount: number;
  errors: string[];
  preview: Record<string, any>[];
}

export class FileUploadService {
  private uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create upload directory:', error);
    }
  }

  getMulterConfig() {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
      }
    });

    return multer({
      storage,
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB
      },
      fileFilter: (req, file, cb) => {
        // Allow CSV files for the main upload
        if (file.fieldname === 'csvFile') {
          if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
            cb(null, true);
          } else {
            cb(new Error('Main file must be a CSV file'));
          }
        }
        // Allow additional document types for additional files
        else if (file.fieldname.startsWith('additionalDoc_')) {
          const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown'
          ];
          const allowedExtensions = ['.pdf', '.doc', '.docx', '.txt', '.md'];
          
          if (allowedTypes.includes(file.mimetype) || 
              allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext))) {
            cb(null, true);
          } else {
            cb(new Error('Additional documents must be PDF, DOC, DOCX, TXT, or MD files'));
          }
        }
        else {
          cb(new Error('Unknown file field'));
        }
      }
    });
  }

  async validateCSV(filePath: string): Promise<CSVValidationResult> {
    const result: CSVValidationResult = {
      isValid: true,
      headers: [],
      rowCount: 0,
      errors: [],
      preview: []
    };

    try {
      const rows: Record<string, any>[] = [];
      
      await new Promise<void>((resolve, reject) => {
        createReadStream(filePath)
          .pipe(csv())
          .on('headers', (headers) => {
            // Only keep the first column (questions)
            const firstColumnHeader = headers[0];
            if (!firstColumnHeader) {
              result.isValid = false;
              result.errors.push('CSV must have at least one column');
              return;
            }
            
            result.headers = [firstColumnHeader]; // Only include first column
            
            // Validate headers
            if (result.headers.length === 0) {
              result.errors.push('CSV file has no headers');
              result.isValid = false;
            }
            
            // Check for required columns (basic validation)
            const hasQuestionColumn = headers.some((h: string) => 
              h.toLowerCase().includes('question') || 
              h.toLowerCase().includes('prompt') ||
              h.toLowerCase().includes('query')
            );
            
            if (!hasQuestionColumn) {
              result.errors.push('CSV should contain a question/prompt column');
            }
          })
          .on('data', (row) => {
            // Only keep the first column data
            const firstColumnKey = Object.keys(row)[0];
            const filteredRow = firstColumnKey ? { [result.headers[0]]: row[firstColumnKey] } : {};
            
            rows.push(filteredRow);
            result.rowCount++;
            
            // Store first 5 rows for preview
            if (result.preview.length < 5) {
              result.preview.push(filteredRow);
            }
          })
          .on('error', (error) => {
            result.errors.push(`CSV parsing error: ${error.message}`);
            result.isValid = false;
            reject(error);
          })
          .on('end', () => {
            // Validate row count
            if (result.rowCount === 0) {
              result.errors.push('CSV file is empty');
              result.isValid = false;
            } else if (result.rowCount > 5000) {
              result.errors.push('CSV file exceeds maximum of 5,000 rows');
              result.isValid = false;
            }
            
            resolve();
          });
      });

      return result;
    } catch (error) {
      result.isValid = false;
      result.errors.push(error instanceof Error ? error.message : 'Unknown validation error');
      return result;
    }
  }

  async parseCSVToArray(filePath: string): Promise<Record<string, any>[]> {
    const rows: Record<string, any>[] = [];
    let firstColumnHeader: string = '';
    
    return new Promise((resolve, reject) => {
      createReadStream(filePath)
        .pipe(csv())
        .on('headers', (headers) => {
          firstColumnHeader = headers[0]; // Store first column header
        })
        .on('data', (row) => {
          // Only keep the first column data
          const firstColumnKey = Object.keys(row)[0];
          const filteredRow = firstColumnKey ? { [firstColumnHeader]: row[firstColumnKey] } : {};
          rows.push(filteredRow);
        })
        .on('error', reject)
        .on('end', () => {
          resolve(rows);
        });
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  async generateCSVExport(data: Record<string, any>[], filename: string): Promise<string> {
    const csvContent = this.arrayToCSV(data);
    const exportPath = path.join(this.uploadDir, `export-${filename}`);
    
    await fs.writeFile(exportPath, csvContent, 'utf8');
    return exportPath;
  }

  private arrayToCSV(data: Record<string, any>[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        let value = row[header] || '';
        
        // Fix UTF-8 encoding issues (mojibake)
        if (typeof value === 'string') {
          value = this.fixEncodingIssues(value);
          
          // Escape CSV values that contain commas, quotes, or newlines
          if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
        }
        return value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  private fixEncodingIssues(text: string): string {
    // Comprehensive UTF-8 mojibake fix using replace method
    // These patterns occur when UTF-8 bytes are incorrectly decoded as Windows-1252/ISO-8859-1
    
    let fixedText = text;
    
    // Apply replacements in order, handling the most specific patterns first
    // Bullet points and list markers
    fixedText = fixedText.replace(/‚Ä¢/g, '•');        // U+2022 BULLET
    fixedText = fixedText.replace(/â€¢/g, '•');        // Alternative bullet encoding
    
    // Em dashes and en dashes  
    fixedText = fixedText.replace(/‚Äî/g, '—');        // U+2014 EM DASH
    fixedText = fixedText.replace(/â€"/g, '—');        // Alternative em dash
    fixedText = fixedText.replace(/‚Äì/g, '–');        // U+2013 EN DASH
    
    // Quotation marks
    fixedText = fixedText.replace(/‚Äú/g, '"');        // U+201C LEFT DOUBLE QUOTATION MARK
    fixedText = fixedText.replace(/â€œ/g, '"');        // Alternative left double quote
    fixedText = fixedText.replace(/‚Äù/g, '"');        // U+201D RIGHT DOUBLE QUOTATION MARK  
    fixedText = fixedText.replace(/â€/g, '"');         // Alternative right double quote
    fixedText = fixedText.replace(/‚Äô/g, "'");        // U+2018 LEFT SINGLE QUOTATION MARK
    fixedText = fixedText.replace(/â€˜/g, "'");        // Alternative left single quote
    fixedText = fixedText.replace(/‚Äõ/g, "'");        // U+2019 RIGHT SINGLE QUOTATION MARK
    fixedText = fixedText.replace(/â€™/g, "'");        // Alternative right single quote
    fixedText = fixedText.replace(/‚Äò/g, '„');        // U+201E DOUBLE LOW-9 QUOTATION MARK
    fixedText = fixedText.replace(/â€ž/g, '„');        // Alternative double low-9 quote
    fixedText = fixedText.replace(/‚Äó/g, '‚');        // U+201A SINGLE LOW-9 QUOTATION MARK
    fixedText = fixedText.replace(/â€š/g, '‚');        // Alternative single low-9 quote
    
    // Ellipsis
    fixedText = fixedText.replace(/‚Ä¶/g, '…');        // U+2026 HORIZONTAL ELLIPSIS
    fixedText = fixedText.replace(/â€¦/g, '…');        // Alternative ellipsis
    
    // Accented vowels (lowercase)
    fixedText = fixedText.replace(/Ã¡/g, 'á');         // U+00E1 LATIN SMALL LETTER A WITH ACUTE
    fixedText = fixedText.replace(/Ã¢/g, 'â');         // U+00E2 LATIN SMALL LETTER A WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã£/g, 'ã');         // U+00E3 LATIN SMALL LETTER A WITH TILDE
    fixedText = fixedText.replace(/Ã¤/g, 'ä');         // U+00E4 LATIN SMALL LETTER A WITH DIAERESIS
    fixedText = fixedText.replace(/Ã¥/g, 'å');         // U+00E5 LATIN SMALL LETTER A WITH RING ABOVE
    fixedText = fixedText.replace(/Ã¦/g, 'æ');         // U+00E6 LATIN SMALL LETTER AE
    fixedText = fixedText.replace(/Ã¨/g, 'è');         // U+00E8 LATIN SMALL LETTER E WITH GRAVE
    fixedText = fixedText.replace(/Ã©/g, 'é');         // U+00E9 LATIN SMALL LETTER E WITH ACUTE
    fixedText = fixedText.replace(/Ãª/g, 'ê');         // U+00EA LATIN SMALL LETTER E WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã«/g, 'ë');         // U+00EB LATIN SMALL LETTER E WITH DIAERESIS
    fixedText = fixedText.replace(/Ã¬/g, 'ì');         // U+00EC LATIN SMALL LETTER I WITH GRAVE
    fixedText = fixedText.replace(/Ã­/g, 'í');         // U+00ED LATIN SMALL LETTER I WITH ACUTE
    fixedText = fixedText.replace(/Ã®/g, 'î');         // U+00EE LATIN SMALL LETTER I WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã¯/g, 'ï');         // U+00EF LATIN SMALL LETTER I WITH DIAERESIS
    fixedText = fixedText.replace(/Ã°/g, 'ð');         // U+00F0 LATIN SMALL LETTER ETH
    fixedText = fixedText.replace(/Ã±/g, 'ñ');         // U+00F1 LATIN SMALL LETTER N WITH TILDE
    fixedText = fixedText.replace(/Ã²/g, 'ò');         // U+00F2 LATIN SMALL LETTER O WITH GRAVE
    fixedText = fixedText.replace(/Ã³/g, 'ó');         // U+00F3 LATIN SMALL LETTER O WITH ACUTE
    fixedText = fixedText.replace(/Ã´/g, 'ô');         // U+00F4 LATIN SMALL LETTER O WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ãµ/g, 'õ');         // U+00F5 LATIN SMALL LETTER O WITH TILDE
    fixedText = fixedText.replace(/Ã¶/g, 'ö');         // U+00F6 LATIN SMALL LETTER O WITH DIAERESIS
    fixedText = fixedText.replace(/Ã¸/g, 'ø');         // U+00F8 LATIN SMALL LETTER O WITH STROKE
    fixedText = fixedText.replace(/Ã¹/g, 'ù');         // U+00F9 LATIN SMALL LETTER U WITH GRAVE
    fixedText = fixedText.replace(/Ãº/g, 'ú');         // U+00FA LATIN SMALL LETTER U WITH ACUTE
    fixedText = fixedText.replace(/Ã»/g, 'û');         // U+00FB LATIN SMALL LETTER U WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã¼/g, 'ü');         // U+00FC LATIN SMALL LETTER U WITH DIAERESIS
    fixedText = fixedText.replace(/Ã½/g, 'ý');         // U+00FD LATIN SMALL LETTER Y WITH ACUTE
    fixedText = fixedText.replace(/Ã¿/g, 'ÿ');         // U+00FF LATIN SMALL LETTER Y WITH DIAERESIS
    
    // Accented vowels (uppercase) - using unicode escapes for problematic characters
    fixedText = fixedText.replace(/Ã€/g, 'À');         // U+00C0 LATIN CAPITAL LETTER A WITH GRAVE
    fixedText = fixedText.replace(/Ã\u0081/g, 'Á');    // U+00C1 LATIN CAPITAL LETTER A WITH ACUTE
    fixedText = fixedText.replace(/Ã‚/g, 'Â');         // U+00C2 LATIN CAPITAL LETTER A WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ãƒ/g, 'Ã');         // U+00C3 LATIN CAPITAL LETTER A WITH TILDE
    fixedText = fixedText.replace(/Ã„/g, 'Ä');         // U+00C4 LATIN CAPITAL LETTER A WITH DIAERESIS
    fixedText = fixedText.replace(/Ã…/g, 'Å');         // U+00C5 LATIN CAPITAL LETTER A WITH RING ABOVE
    fixedText = fixedText.replace(/Ã†/g, 'Æ');         // U+00C6 LATIN CAPITAL LETTER AE
    fixedText = fixedText.replace(/Ãˆ/g, 'È');         // U+00C8 LATIN CAPITAL LETTER E WITH GRAVE
    fixedText = fixedText.replace(/Ã‰/g, 'É');         // U+00C9 LATIN CAPITAL LETTER E WITH ACUTE
    fixedText = fixedText.replace(/ÃŠ/g, 'Ê');         // U+00CA LATIN CAPITAL LETTER E WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã‹/g, 'Ë');         // U+00CB LATIN CAPITAL LETTER E WITH DIAERESIS
    fixedText = fixedText.replace(/ÃŒ/g, 'Ì');         // U+00CC LATIN CAPITAL LETTER I WITH GRAVE
    fixedText = fixedText.replace(/Ã\u008D/g, 'Í');    // U+00CD LATIN CAPITAL LETTER I WITH ACUTE
    fixedText = fixedText.replace(/ÃŽ/g, 'Î');         // U+00CE LATIN CAPITAL LETTER I WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã\u008F/g, 'Ï');    // U+00CF LATIN CAPITAL LETTER I WITH DIAERESIS
    fixedText = fixedText.replace(/Ã\u0091/g, 'Ñ');    // U+00D1 LATIN CAPITAL LETTER N WITH TILDE
    fixedText = fixedText.replace(/Ã\u0092/g, 'Ò');    // U+00D2 LATIN CAPITAL LETTER O WITH GRAVE
    fixedText = fixedText.replace(/Ã"/g, 'Ó');         // U+00D3 LATIN CAPITAL LETTER O WITH ACUTE
    fixedText = fixedText.replace(/Ã"/g, 'Ô');         // U+00D4 LATIN CAPITAL LETTER O WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ã•/g, 'Õ');         // U+00D5 LATIN CAPITAL LETTER O WITH TILDE
    fixedText = fixedText.replace(/Ã–/g, 'Ö');         // U+00D6 LATIN CAPITAL LETTER O WITH DIAERESIS
    fixedText = fixedText.replace(/Ã˜/g, 'Ø');         // U+00D8 LATIN CAPITAL LETTER O WITH STROKE
    fixedText = fixedText.replace(/Ã™/g, 'Ù');         // U+00D9 LATIN CAPITAL LETTER U WITH GRAVE
    fixedText = fixedText.replace(/Ãš/g, 'Ú');         // U+00DA LATIN CAPITAL LETTER U WITH ACUTE
    fixedText = fixedText.replace(/Ã›/g, 'Û');         // U+00DB LATIN CAPITAL LETTER U WITH CIRCUMFLEX
    fixedText = fixedText.replace(/Ãœ/g, 'Ü');         // U+00DC LATIN CAPITAL LETTER U WITH DIAERESIS
    fixedText = fixedText.replace(/Ã\u009D/g, 'Ý');    // U+00DD LATIN CAPITAL LETTER Y WITH ACUTE
    
    // Other special Latin characters
    fixedText = fixedText.replace(/Ãž/g, 'Þ');         // U+00DE LATIN CAPITAL LETTER THORN
    fixedText = fixedText.replace(/ÃŸ/g, 'ß');         // U+00DF LATIN SMALL LETTER SHARP S
    fixedText = fixedText.replace(/Ã§/g, 'ç');         // U+00E7 LATIN SMALL LETTER C WITH CEDILLA
    fixedText = fixedText.replace(/Ã‡/g, 'Ç');         // U+00C7 LATIN CAPITAL LETTER C WITH CEDILLA
    
    // Currency and symbols
    fixedText = fixedText.replace(/â‚¬/g, '€');         // U+20AC EURO SIGN
    fixedText = fixedText.replace(/Â£/g, '£');         // U+00A3 POUND SIGN
    fixedText = fixedText.replace(/Â¥/g, '¥');         // U+00A5 YEN SIGN
    fixedText = fixedText.replace(/Â¢/g, '¢');         // U+00A2 CENT SIGN
    fixedText = fixedText.replace(/Â©/g, '©');         // U+00A9 COPYRIGHT SIGN
    fixedText = fixedText.replace(/Â®/g, '®');         // U+00AE REGISTERED SIGN
    fixedText = fixedText.replace(/Â°/g, '°');         // U+00B0 DEGREE SIGN
    fixedText = fixedText.replace(/Â±/g, '±');         // U+00B1 PLUS-MINUS SIGN
    fixedText = fixedText.replace(/Â²/g, '²');         // U+00B2 SUPERSCRIPT TWO
    fixedText = fixedText.replace(/Â³/g, '³');         // U+00B3 SUPERSCRIPT THREE
    fixedText = fixedText.replace(/Âµ/g, 'µ');         // U+00B5 MICRO SIGN
    fixedText = fixedText.replace(/Â¶/g, '¶');         // U+00B6 PILCROW SIGN
    fixedText = fixedText.replace(/Â·/g, '·');         // U+00B7 MIDDLE DOT
    fixedText = fixedText.replace(/Â¹/g, '¹');         // U+00B9 SUPERSCRIPT ONE
    fixedText = fixedText.replace(/Âº/g, 'º');         // U+00BA MASCULINE ORDINAL INDICATOR
    fixedText = fixedText.replace(/Â»/g, '»');         // U+00BB RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
    fixedText = fixedText.replace(/Â¼/g, '¼');         // U+00BC VULGAR FRACTION ONE QUARTER
    fixedText = fixedText.replace(/Â½/g, '½');         // U+00BD VULGAR FRACTION ONE HALF
    fixedText = fixedText.replace(/Â¾/g, '¾');         // U+00BE VULGAR FRACTION THREE QUARTERS
    fixedText = fixedText.replace(/Â¿/g, '¿');         // U+00BF INVERTED QUESTION MARK
    fixedText = fixedText.replace(/Ã—/g, '×');         // U+00D7 MULTIPLICATION SIGN
    fixedText = fixedText.replace(/Ã·/g, '÷');         // U+00F7 DIVISION SIGN
    
    return fixedText;
  }
}

export const fileUploadService = new FileUploadService();
