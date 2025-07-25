/**
 * Link Validation Service
 * Validates URLs to ensure they return 200 status and are accessible
 */

interface ValidationResult {
  url: string;
  status: 'valid' | 'invalid' | 'timeout';
  statusCode?: number;
  error?: string;
  responseTime?: number;
}

export class LinkValidationService {
  private timeout: number;

  constructor(timeoutMs: number = 10000) {
    this.timeout = timeoutMs;
  }

  async validateUrl(url: string): Promise<ValidationResult> {
    const startTime = Date.now();
    
    try {
      // Validate URL format first
      new URL(url);
      
      console.log(`🔗 Validating link: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD request for faster validation
        signal: controller.signal,
        redirect: 'follow', // Follow redirects automatically
        headers: {
          'User-Agent': 'Twilio-RFP-Assistant/1.0 (Link Validator)'
        }
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`✅ Link valid: ${url} (${response.status}, ${responseTime}ms)`);
        return {
          url: response.url, // Use final URL after any redirects
          status: 'valid',
          statusCode: response.status,
          responseTime
        };
      } else {
        console.log(`❌ Link invalid: ${url} (${response.status}, ${responseTime}ms)`);
        return {
          url,
          status: 'invalid',
          statusCode: response.status,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`⏱️ Link timeout: ${url} (${responseTime}ms)`);
        return {
          url,
          status: 'timeout',
          responseTime,
          error: 'Request timeout'
        };
      }
      
      console.log(`❌ Link error: ${url} - ${error}`);
      return {
        url,
        status: 'invalid',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async validateUrls(urls: string[]): Promise<ValidationResult[]> {
    console.log(`🔍 Validating ${urls.length} links...`);
    
    // Process links in parallel with a reasonable concurrency limit
    const concurrency = 5;
    const results: ValidationResult[] = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.validateUrl(url))
      );
      results.push(...batchResults);
    }
    
    const validCount = results.filter(r => r.status === 'valid').length;
    console.log(`📊 Link validation complete: ${validCount}/${urls.length} valid`);
    
    return results;
  }

  extractUrls(text: string): string[] {
    // Extract URLs from text using regex
    const urlRegex = /https?:\/\/[^\s\]]+/g;
    const matches = text.match(urlRegex) || [];
    return Array.from(new Set(matches)); // Remove duplicates
  }
}

export const linkValidator = new LinkValidationService();