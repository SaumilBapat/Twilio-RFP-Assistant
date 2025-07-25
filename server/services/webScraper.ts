import * as cheerio from 'cheerio';
import crypto from 'crypto';

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  contentHash: string;
  metadata: {
    title: string;
    description?: string;
    timestamp: string;
    wordCount: number;
  };
}

export class WebScraperService {
  private readonly userAgent = 'Mozilla/5.0 (compatible; TwilioRFPBot/1.0)';
  private readonly timeout = 30000; // 30 seconds

  async scrapeUrl(url: string): Promise<ScrapedContent | null> {
    try {
      console.log(`🌐 Scraping URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        console.log(`❌ Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove script and style elements
      $('script, style, nav, header, footer, aside, .navigation, .nav, .menu').remove();

      // Extract title
      const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled';

      // Extract meta description
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || '';

      // Extract main content - prioritize main content areas
      let content = '';
      const contentSelectors = [
        'main', 
        '[role="main"]', 
        '.content', 
        '.main-content', 
        'article', 
        '.article',
        '.documentation',
        '.docs',
        'body'
      ];

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          content = element.text();
          break;
        }
      }

      if (!content) {
        content = $('body').text();
      }

      // Clean up content
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();

      if (content.length < 100) {
        console.log(`⚠️ Content too short for ${url}: ${content.length} characters`);
        return null;
      }

      // Generate content hash
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');

      const wordCount = content.split(/\s+/).length;

      console.log(`✅ Successfully scraped ${url}: ${wordCount} words`);

      return {
        url,
        title,
        content,
        contentHash,
        metadata: {
          title,
          description,
          timestamp: new Date().toISOString(),
          wordCount
        }
      };

    } catch (error) {
      console.error(`❌ Error scraping ${url}:`, error);
      return null;
    }
  }

  async isValidUrl(url: string): Promise<boolean> {
    try {
      // Check if URL is from Twilio ecosystem
      const twilioEcosystem = ['twilio.com', 'sendgrid.com', 'segment.com'];
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      
      if (!twilioEcosystem.some(d => domain.includes(d))) {
        return false;
      }

      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(10000)
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export const webScraperService = new WebScraperService();