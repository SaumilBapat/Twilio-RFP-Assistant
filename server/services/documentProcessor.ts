import { storage } from "../storage";
import { enhancedEmbeddingsService } from "./enhancedEmbeddings";
import { contentChunkerService } from "./contentChunker";
import crypto from "crypto";
import { CachingStatus, ReferenceDocument } from "@shared/schema";

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
      } else if (fileType === 'text/plain' || fileType === 'text/csv') {
        textContent = fileBuffer.toString('utf-8');
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