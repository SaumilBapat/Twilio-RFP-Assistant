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
        const value = row[header] || '';
        // Escape CSV values that contain commas or quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
}

export const fileUploadService = new FileUploadService();
