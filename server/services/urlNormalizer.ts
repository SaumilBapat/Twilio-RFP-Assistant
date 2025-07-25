/**
 * URL normalization utilities to ensure consistent URL formatting
 * and prevent duplicates due to formatting differences
 */

export class URLNormalizer {
  /**
   * Normalize a URL to a consistent format
   */
  static normalize(url: string): string {
    try {
      // Remove leading/trailing whitespace
      url = url.trim();
      
      // Add https:// if no protocol is specified
      if (!url.match(/^https?:\/\//i)) {
        url = 'https://' + url;
      }
      
      // Parse the URL to normalize it
      const parsedUrl = new URL(url);
      
      // Convert hostname to lowercase
      parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
      
      // Remove trailing slash from pathname (unless it's just "/")
      if (parsedUrl.pathname !== '/' && parsedUrl.pathname.endsWith('/')) {
        parsedUrl.pathname = parsedUrl.pathname.slice(0, -1);
      }
      
      // Remove fragment (everything after #)
      parsedUrl.hash = '';
      
      // Sort query parameters for consistency
      if (parsedUrl.search) {
        const params = new URLSearchParams(parsedUrl.search);
        params.sort();
        parsedUrl.search = params.toString();
      }
      
      return parsedUrl.toString();
      
    } catch (error) {
      // If URL parsing fails, return the original URL trimmed
      console.warn(`Failed to normalize URL: ${url}`, error);
      return url.trim();
    }
  }
  
  /**
   * Check if a URL is valid and can be normalized
   */
  static isValid(url: string): boolean {
    try {
      const normalized = this.normalize(url);
      new URL(normalized);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Extract domain from URL for display purposes
   */
  static getDomain(url: string): string {
    try {
      const parsedUrl = new URL(this.normalize(url));
      return parsedUrl.hostname;
    } catch {
      return url;
    }
  }
  
  /**
   * Check if URL belongs to Twilio ecosystem
   */
  static isTwilioEcosystem(url: string): boolean {
    try {
      const domain = this.getDomain(url);
      const twilioEcosystemDomains = [
        'twilio.com',
        'sendgrid.com', 
        'segment.com'
      ];
      
      return twilioEcosystemDomains.some(twilioUrl => 
        domain === twilioUrl || domain.endsWith('.' + twilioUrl)
      );
    } catch {
      return false;
    }
  }
}

export const urlNormalizer = URLNormalizer;