import { storage } from "../storage";
import { enhancedEmbeddingsService } from "./enhancedEmbeddings";
import { contentChunkerService } from "./contentChunker";
import crypto from "crypto";
import { CachingStatus, ReferenceDocument } from "@shared/schema";
import { parse } from 'csv-parse/sync';

// PDF parsing will be imported dynamically to avoid initialization issues

interface UploadDocumentParams {
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBuffer: Buffer;
}

class DocumentProcessor {
  private processingQueue = new Map<string, Promise<void>>();

  async uploadDocument(params: UploadDocumentParams): Promise<ReferenceDocument> {
    const { userId, fileName, fileType, fileSize, fileBuffer } = params;

    // Calculate file hash
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // Check if document with same content already exists for this user
    const existingDoc = await storage.getReferenceDocumentByHash(fileHash);
    if (existingDoc && existingDoc.userId === userId) {
      console.log(`📋 Duplicate document detected: "${fileName}" matches existing "${existingDoc.fileName}" (hash: ${fileHash.substring(0, 12)}...)`);
      
      // Return existing document with duplicate flag to avoid duplicate processing
      return {
        ...existingDoc,
        isDuplicate: true
      };
    }
    
    // Create standardized document name if it's a duplicate filename for this user
    let finalFileName = fileName;
    const userDocs = await storage.getUserReferenceDocuments(userId);
    const existingNames = userDocs.map(doc => doc.fileName);
    
    if (existingNames.includes(fileName)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = fileName.split('.').pop();
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
      finalFileName = `${nameWithoutExt}_${timestamp}.${extension}`;
      console.log(`📝 Renamed duplicate filename: "${fileName}" → "${finalFileName}"`);
    }

    // Create document record with standardized name
    const document = await storage.createReferenceDocument({
      userId,
      fileName: finalFileName,
      fileType,
      fileSize,
      fileHash,
      cachingStatus: 'pending' as CachingStatus,
      totalChunks: 0
    });
    
    console.log(`✅ New document created: "${finalFileName}" (${(fileSize / 1024).toFixed(1)}KB, hash: ${fileHash.substring(0, 12)}...)`);

    // Start async processing
    this.startProcessing(document.id, fileBuffer, fileType);

    return {
      ...document,
      isDuplicate: false
    };
  }

  private async startProcessing(documentId: string, fileBuffer: Buffer, fileType: string) {
    const processingPromise = this.processDocument(documentId, fileBuffer, fileType);
    this.processingQueue.set(documentId, processingPromise);

    try {
      await processingPromise;
    } finally {
      this.processingQueue.delete(documentId);
    }
  }

  private async processDocument(documentId: string, fileBuffer: Buffer, fileType: string) {
    try {
      // Update status to processing
      await storage.updateReferenceDocument(documentId, { 
        cachingStatus: 'processing' as CachingStatus 
      });

      // Extract text content based on file type
      let textContent = '';
      
      if (fileType === 'application/pdf') {
        try {
          // Ensure we're passing a buffer, not a file path
          if (!Buffer.isBuffer(fileBuffer)) {
            throw new Error('PDF processing requires a valid buffer');
          }
          
          console.log(`🔍 Processing PDF buffer of ${fileBuffer.length} bytes for document ${documentId}`);
          
          // Try multiple approaches to PDF parsing
          let pdfData;
          try {
            // Approach 1: Direct import and call
            const pdfParse = (await import('pdf-parse')).default;
            pdfData = await pdfParse(fileBuffer);
          } catch (directError) {
            console.log(`Direct PDF parse failed, trying alternative approach:`, directError.message);
            
            // Approach 2: Create a fresh buffer copy to avoid any reference issues
            const cleanBuffer = Buffer.from(fileBuffer);
            const pdfParse = (await import('pdf-parse')).default;
            pdfData = await pdfParse(cleanBuffer);
          }
          
          textContent = pdfData.text || '';
          
          if (!textContent || textContent.trim().length === 0) {
            console.warn('PDF processed but no text content extracted for document:', documentId);
            // Get document info for fallback content
            const document = await storage.getReferenceDocument(documentId);
            if (document) {
              textContent = `PDF document: ${document.fileName} (${(document.fileSize / 1024).toFixed(1)}KB)\nContent extraction completed but no readable text was found. This may be a scanned PDF or contain only images.`;
            } else {
              textContent = 'PDF file processed but no readable text content was found.';
            }
          } else {
            console.log(`📄 PDF processed successfully: ${textContent.length} characters extracted`);
          }
          
        } catch (pdfError) {
          console.error('PDF parsing error for document:', documentId, pdfError);
          
          // Get document info for fallback content
          const document = await storage.getReferenceDocument(documentId);
          if (document) {
            textContent = `PDF document: ${document.fileName} (${(document.fileSize / 1024).toFixed(1)}KB)\nContent extraction failed due to parsing error. Document is available for reference but text content could not be processed.`;
            console.log(`⚠️ Using fallback content for PDF ${documentId} due to parsing error`);
          } else {
            // If we can't even get document details, mark as failed
            await storage.updateReferenceDocument(documentId, { 
              cachingStatus: 'failed' as CachingStatus
            });
            console.log(`❌ PDF document ${documentId} marked as failed - skipping`);
            return;
          }
        }
      } else if (fileType === 'text/plain') {
        textContent = fileBuffer.toString('utf-8');
      } else if (fileType === 'text/csv') {
        // Intelligent CSV handling with contextual row representations
        const csvString = fileBuffer.toString('utf-8');
        
        // Parse CSV using proper parser that handles quoted fields, escapes, etc.
        let records: any[] = [];
        let parseSuccessful = false;
        
        // Try multiple parsing strategies
        const parsingStrategies = [
          // Strategy 1: Tab-delimited (common for exports)
          {
            delimiter: '\t',
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            trim: true,
            quote: '"',
            escape: '"',
            relax_quotes: true
          },
          // Strategy 2: Comma-delimited with quotes
          {
            delimiter: ',',
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            trim: true,
            quote: '"',
            escape: '"',
            relax_quotes: true
          },
          // Strategy 3: More relaxed parsing for complex files
          {
            delimiter: ',',
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true,
            trim: true,
            quote: false, // Disable quote parsing if causing issues
            escape: false,
            relax_quotes: true
          }
        ];
        
        for (const strategy of parsingStrategies) {
          try {
            console.log(`Trying CSV parsing strategy with delimiter: ${strategy.delimiter}, quote: ${strategy.quote}`);
            records = parse(csvString, strategy);
            
            // Check if parsing was successful (got meaningful data)
            if (records.length > 0 && Object.keys(records[0]).length > 1) {
              parseSuccessful = true;
              console.log(`✅ CSV parsed successfully: ${records.length} records, ${Object.keys(records[0]).length} columns`);
              break;
            }
          } catch (parseError: any) {
            console.log(`CSV parsing strategy failed: ${parseError.message}`);
            continue;
          }
        }
        
        // If all parsing strategies fail, try a manual fallback approach
        if (!parseSuccessful) {
          console.log('All CSV parsing strategies failed, attempting manual parsing fallback');
          
          try {
            const lines = csvString.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
              // Manual parsing as last resort
              const headerLine = lines[0];
              // Try to detect delimiter
              const tabCount = (headerLine.match(/\t/g) || []).length;
              const commaCount = (headerLine.match(/,/g) || []).length;
              const delimiter = tabCount > commaCount ? '\t' : ',';
              
              const headers = headerLine.split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim());
              
              records = [];
              for (let i = 1; i < Math.min(lines.length, 100); i++) { // Limit to first 100 rows for large files
                try {
                  const values = lines[i].split(delimiter).map(v => v.replace(/^["']|["']$/g, '').trim());
                  if (values.length >= headers.length * 0.5) { // Allow some missing columns
                    const record: any = {};
                    headers.forEach((header, idx) => {
                      record[header] = values[idx] || '';
                    });
                    records.push(record);
                  }
                } catch (rowError) {
                  console.log(`Skipping problematic row ${i}`);
                  continue;
                }
              }
              
              if (records.length > 0) {
                parseSuccessful = true;
                console.log(`✅ Manual CSV parsing recovered ${records.length} records`);
              }
            }
          } catch (manualParseError) {
            console.error('Manual CSV parsing also failed:', manualParseError);
          }
        }
        
        if (!parseSuccessful || records.length === 0) {
          // Last resort: treat as plain text with structure hints
          console.log('Unable to parse CSV structure, treating as structured text');
          textContent = `CSV Document: ${(fileBuffer.length / 1024).toFixed(1)}KB\n\n`;
          textContent += `This appears to be a complex CSV file that could not be fully parsed.\n`;
          textContent += `Raw content preview:\n\n`;
          textContent += csvString.substring(0, 10000); // First 10KB of content
          
          // Still try to provide some structure
          const lines = csvString.split('\n').slice(0, 20);
          if (lines.length > 0) {
            textContent += `\n\nStructured preview of first 20 lines:\n`;
            lines.forEach((line, idx) => {
              textContent += `Line ${idx + 1}: ${line.substring(0, 500)}\n`;
            });
          }
        } else {
          // Successfully parsed - continue with normal processing
          console.log(`Processing ${records.length} CSV records`);
          
          const headers = Object.keys(records[0]);
          
          // Build contextual representation optimized for telecommunications data
          let contextualContent = `Telecommunications Dataset: ${records.length} entries with ${headers.length} attributes\n\n`;
          
          // Identify key fields for better context
          const localeField = headers.find(h => h.toLowerCase().includes('locale') || h.toLowerCase().includes('country'));
          const capabilityFields = headers.filter(h => 
            h.toLowerCase().includes('support') || 
            h.toLowerCase().includes('available') || 
            h.toLowerCase().includes('enabled') ||
            h.toLowerCase().includes('allow')
          );
          
          contextualContent += `Key Attributes: ${headers.join(', ')}\n\n`;
          contextualContent += `=== Detailed Service Specifications ===\n\n`;
          
          // Process each record with intelligent grouping
          records.forEach((record, index) => {
            const primaryIdentifier = localeField ? record[localeField] : `Entry ${index + 1}`;
            
            // Start with primary identifier
            contextualContent += `${primaryIdentifier}:\n`;
            
            // Group attributes by category for better semantic understanding
            const capabilities = [];
            const specifications = [];
            const restrictions = [];
            const identifiers = [];
            
            for (const [header, value] of Object.entries(record)) {
              // Skip empty or placeholder values
              if (!value || value === '---' || value === 'N/A' || value === '' || value === 'null') {
                continue;
              }
              
              const headerLower = header.toLowerCase();
              const valueStr = String(value).trim();
              
              // Categorize attributes for better context
              if (headerLower.includes('support') || headerLower.includes('available') || headerLower.includes('enabled')) {
                if (valueStr.toLowerCase() === 'yes' || valueStr.toLowerCase() === 'supported' || valueStr.toLowerCase() === 'true') {
                  capabilities.push(`${header} is supported`);
                } else if (valueStr.toLowerCase() === 'no' || valueStr.toLowerCase() === 'not supported' || valueStr.toLowerCase() === 'false') {
                  restrictions.push(`${header} is not supported`);
                } else {
                  specifications.push(`${header}: ${valueStr}`);
                }
              } else if (headerLower.includes('code') || headerLower.includes('dialing') || headerLower.includes('iso') || headerLower.includes('region')) {
                identifiers.push(`${header}: ${valueStr}`);
              } else if (headerLower.includes('consideration') || headerLower.includes('restriction') || headerLower.includes('limit')) {
                // For compliance and restrictions, include more context
                if (valueStr.length > 200) {
                  restrictions.push(`${header}: ${valueStr.substring(0, 200)}...`);
                } else {
                  restrictions.push(`${header}: ${valueStr}`);
                }
              } else {
                // General specifications
                if (valueStr.length > 150) {
                  specifications.push(`${header}: ${valueStr.substring(0, 150)}...`);
                } else {
                  specifications.push(`${header}: ${valueStr}`);
                }
              }
            }
            
            // Build comprehensive entry description
            if (identifiers.length > 0) {
              contextualContent += `Identifiers: ${identifiers.join(', ')}\n`;
            }
            if (capabilities.length > 0) {
              contextualContent += `Supported Features: ${capabilities.join(', ')}\n`;
            }
            if (specifications.length > 0) {
              contextualContent += `Specifications: ${specifications.join(', ')}\n`;
            }
            if (restrictions.length > 0) {
              contextualContent += `Restrictions and Considerations: ${restrictions.join(', ')}\n`;
            }
            
            contextualContent += '\n';
          });
          
          // Add searchable summary
          contextualContent += `\n=== Search Index ===\n`;
          contextualContent += `This telecommunications dataset contains detailed specifications for ${records.length} service configurations.\n`;
          contextualContent += `Coverage includes capabilities, restrictions, compliance requirements, and technical specifications.\n`;
          contextualContent += `Each entry can be matched against specific requirements for service availability, feature support, and regulatory compliance.\n`;
          
          textContent = contextualContent;
        }
      } else if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                 fileType === 'application/vnd.ms-excel.sheet.macroEnabled.12') {
        // Handle Excel files (.xlsx and .xlsm)
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        
        let allSheetsContent = '';
        workbook.SheetNames.forEach((sheetName, index) => {
          const worksheet = workbook.Sheets[sheetName];
          const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Add sheet header
          allSheetsContent += `\n\n=== Sheet: ${sheetName} ===\n`;
          
          // Convert sheet data to text
          (sheetData as any[]).forEach((row: any[]) => {
            if (row && Array.isArray(row) && row.length > 0) {
              const rowText = row.map(cell => cell ? String(cell).trim() : '').join(' | ');
              if (rowText.trim()) {
                allSheetsContent += rowText + '\n';
              }
            }
          });
        });
        
        textContent = allSheetsContent.trim();
      } else if (fileType === 'application/msword' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For Word documents, we'll use a simple text extraction
        // In production, you'd use a proper library like mammoth
        textContent = fileBuffer.toString('utf-8', 0, Math.min(fileBuffer.length, 1000000));
        // Remove non-printable characters
        textContent = textContent.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
      }

      if (!textContent || textContent.trim().length === 0) {
        throw new Error('No text content extracted from document');
      }

      // Chunk the content
      const chunks = contentChunkerService.chunkContent(textContent, `document://${documentId}`);

      // Generate content hash
      const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');

      // Create embeddings for each chunk
      let totalChunks = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Create reference cache entry with document reference
        await enhancedEmbeddingsService.createReferenceChunk({
          url: null, // No URL for documents
          documentId,
          contentHash,
          chunkIndex: i,
          chunkText: chunk.text,
          metadata: {
            fileName: (await storage.getReferenceDocument(documentId))?.fileName,
            fileType,
            chunkPosition: `${i + 1}/${chunks.length}`
          }
        });
        
        totalChunks++;
      }

      // Update document status
      await storage.updateReferenceDocument(documentId, {
        cachingStatus: 'completed' as CachingStatus,
        totalChunks
      });

      console.log(`✅ Document ${documentId} processed: ${totalChunks} chunks created`);

    } catch (error) {
      console.error(`Failed to process document ${documentId}:`, error);
      await storage.updateReferenceDocument(documentId, {
        cachingStatus: 'error' as CachingStatus
      });
    }
  }

  async deleteDocument(documentId: string) {
    // Delete all chunks associated with this document
    const chunks = await storage.getReferenceChunksByDocumentId(documentId);
    
    for (const chunk of chunks) {
      await storage.deleteReferenceChunk(chunk.id);
    }

    // Delete the document record
    await storage.deleteReferenceDocument(documentId);
  }

  async getProcessingStatus(documentId: string): Promise<CachingStatus | undefined> {
    const document = await storage.getReferenceDocument(documentId);
    return document?.cachingStatus as CachingStatus | undefined;
  }
}

export const documentProcessor = new DocumentProcessor();