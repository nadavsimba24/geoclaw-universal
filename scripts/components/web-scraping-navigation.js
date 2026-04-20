#!/usr/bin/env node
// Web Scraping & Navigation for Geoclaw
// Advanced web data extraction and browser automation
// Users can scrape websites, navigate pages, extract structured data

const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class WebScrapingNavigation {
  constructor(config = {}) {
    this.config = {
      enabled: process.env.GEOCLAW_WEB_SCRAPING_ENABLED === 'true',
      puppeteer: {
        headless: process.env.GEOCLAW_PUPPETEER_HEADLESS !== 'false',
        slowMo: parseInt(process.env.GEOCLAW_PUPPETEER_SLOWMO) || 0,
        timeout: parseInt(process.env.GEOCLAW_PUPPETEER_TIMEOUT) || 30000
      },
      rateLimit: {
        enabled: process.env.GEOCLAW_RATE_LIMIT_ENABLED === 'true',
        requestsPerSecond: parseInt(process.env.GEOCLAW_REQUESTS_PER_SECOND) || 2,
        delayMs: parseInt(process.env.GEOCLAW_REQUEST_DELAY_MS) || 500
      },
      storage: {
        dataDir: process.env.GEOCLAW_SCRAPING_DATA_DIR || path.join(process.cwd(), 'scraped-data'),
        screenshotsDir: process.env.GEOCLAW_SCREENSHOTS_DIR || path.join(process.cwd(), 'screenshots')
      },
      ...config
    };
    
    this.browser = null;
    this.page = null;
    this.connected = false;
    
    console.log("🌐 Web Scraping & Navigation initialized");
    console.log(`   Enabled: ${this.config.enabled}`);
    if (this.config.enabled) {
      console.log(`   Puppeteer: ${this.config.puppeteer.headless ? 'Headless' : 'Visible'}`);
      console.log(`   Rate limiting: ${this.config.rateLimit.enabled ? 'Enabled' : 'Disabled'}`);
    }
  }
  
  async start() {
    if (!this.config.enabled) {
      console.log("⚠️  Web scraping is disabled");
      console.log("   Enable it in .env: GEOCLAW_WEB_SCRAPING_ENABLED=true");
      return false;
    }
    
    console.log("🚀 Starting web scraping engine...");
    
    try {
      // Ensure storage directories
      this.ensureStorageDirs();
      
      // Launch browser (but don't create page yet)
      this.browser = await puppeteer.launch({
        headless: this.config.puppeteer.headless ? 'new' : false,
        slowMo: this.config.puppeteer.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      this.connected = true;
      console.log("✅ Web scraping engine ready!");
      console.log(`   Browser: ${this.config.puppeteer.headless ? 'Headless Chrome' : 'Visible Chrome'}`);
      console.log(`   Data directory: ${this.config.storage.dataDir}`);
      console.log(`   Screenshots directory: ${this.config.storage.screenshotsDir}`);
      console.log("   Commands available via Geoclaw");
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start web scraping engine: ${error.message}`);
      return false;
    }
  }
  
  ensureStorageDirs() {
    const dirs = [
      this.config.storage.dataDir,
      this.config.storage.screenshotsDir,
      path.join(this.config.storage.dataDir, 'html'),
      path.join(this.config.storage.dataDir, 'json'),
      path.join(this.config.storage.dataDir, 'csv')
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    console.log(`✅ Storage directories created`);
  }
  
  async createPage() {
    if (!this.connected) {
      throw new Error('Web scraping not connected. Call start() first.');
    }
    
    if (!this.page) {
      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewport({
        width: 1920,
        height: 1080
      });
      
      // Set user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Geoclaw/3.0'
      );
      
      // Set default timeout
      this.page.setDefaultTimeout(this.config.puppeteer.timeout);
      
      console.log("🌐 New browser page created");
    }
    
    return this.page;
  }
  
  async scrapeUrl(url, options = {}) {
    if (!this.connected) {
      throw new Error('Web scraping not connected. Call start() first.');
    }
    
    console.log(`🌐 Scraping URL: ${url}`);
    console.log(`   Options: ${JSON.stringify(options)}`);
    
    const method = options.method || 'http'; // 'http' or 'browser'
    const saveData = options.saveData !== false;
    const takeScreenshot = options.screenshot || false;
    const extractPatterns = options.extract || {};
    
    try {
      let html, title, screenshotPath;
      
      if (method === 'browser') {
        // Use Puppeteer for JavaScript-heavy sites
        const page = await this.createPage();
        
        console.log(`   Method: Browser (Puppeteer)`);
        
        // Navigate to URL
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: this.config.puppeteer.timeout
        });
        
        // Wait if specified
        if (options.waitFor) {
          await page.waitForSelector(options.waitFor, {
            timeout: this.config.puppeteer.timeout
          });
        }
        
        // Get page content
        html = await page.content();
        title = await page.title();
        
        // Take screenshot if requested
        if (takeScreenshot) {
          screenshotPath = await this.takeScreenshot(page, url);
        }
        
        // Close page if not keeping it open
        if (!options.keepPageOpen) {
          await page.close();
          this.page = null;
        }
      } else {
        // Use HTTP request for simple sites
        console.log(`   Method: HTTP request`);
        
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Geoclaw/3.0 Web Scraper'
          },
          timeout: 10000
        });
        
        html = response.data;
        title = this.extractTitle(html);
      }
      
      // Extract data based on patterns
      const extractedData = this.extractData(html, extractPatterns);
      
      // Save data if requested
      let savedFiles = [];
      if (saveData) {
        savedFiles = await this.saveScrapedData(url, {
          html,
          title,
          url,
          extractedData,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`✅ Successfully scraped: ${title || 'No title'}`);
      console.log(`   HTML size: ${html.length} bytes`);
      console.log(`   Extracted items: ${Object.keys(extractedData).length}`);
      
      return {
        success: true,
        url,
        title,
        htmlLength: html.length,
        extractedData,
        screenshot: screenshotPath,
        savedFiles,
        note: `Scraped ${url} using ${method} method.`
      };
    } catch (error) {
      console.error(`❌ Failed to scrape URL: ${error.message}`);
      
      return {
        success: false,
        url,
        error: error.message,
        note: `Failed to scrape ${url}. Check URL accessibility and network.`
      };
    }
  }
  
  extractTitle(html) {
    try {
      const $ = cheerio.load(html);
      return $('title').text().trim() || 'No title';
    } catch (error) {
      return 'No title';
    }
  }
  
  extractData(html, patterns = {}) {
    const $ = cheerio.load(html);
    const result = {};
    
    // Default extraction patterns if none provided
    const defaultPatterns = {
      title: 'title',
      headings: 'h1, h2, h3',
      links: 'a[href]',
      paragraphs: 'p',
      images: 'img[src]'
    };
    
    const extractionPatterns = Object.keys(patterns).length > 0 ? patterns : defaultPatterns;
    
    for (const [key, selector] of Object.entries(extractionPatterns)) {
      if (typeof selector === 'string') {
        const elements = $(selector);
        result[key] = elements.map((i, el) => {
          const element = $(el);
          if (selector.includes('a[href]')) {
            return {
              text: element.text().trim(),
              href: element.attr('href')
            };
          } else if (selector.includes('img[src]')) {
            return {
              alt: element.attr('alt') || '',
              src: element.attr('src')
            };
          } else {
            return element.text().trim();
          }
        }).get();
      } else if (typeof selector === 'function') {
        result[key] = selector($);
      }
    }
    
    return result;
  }
  
  async takeScreenshot(page, url) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${hostname}_${timestamp}.png`;
    const filepath = path.join(this.config.storage.screenshotsDir, filename);
    
    await page.screenshot({
      path: filepath,
      fullPage: true
    });
    
    console.log(`   Screenshot saved: ${filepath}`);
    
    return filepath;
  }
  
  async saveScrapedData(url, data) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${hostname}_${timestamp}`;
    
    const savedFiles = [];
    
    // Save HTML
    const htmlFile = path.join(this.config.storage.dataDir, 'html', `${baseFilename}.html`);
    fs.writeFileSync(htmlFile, data.html);
    savedFiles.push({ type: 'html', path: htmlFile });
    
    // Save JSON data
    const jsonFile = path.join(this.config.storage.dataDir, 'json', `${baseFilename}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
    savedFiles.push({ type: 'json', path: jsonFile });
    
    // Save CSV if there's tabular data
    if (data.extractedData && Object.keys(data.extractedData).length > 0) {
      const csvFile = path.join(this.config.storage.dataDir, 'csv', `${baseFilename}.csv`);
      const csvContent = this.convertToCsv(data.extractedData);
      fs.writeFileSync(csvFile, csvContent);
      savedFiles.push({ type: 'csv', path: csvFile });
    }
    
    console.log(`   Data saved to ${savedFiles.length} files`);
    
    return savedFiles;
  }
  
  convertToCsv(data) {
    const rows = [];
    
    // Find the array with most items
    let maxLength = 0;
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > maxLength) {
        maxLength = value.length;
      }
    }
    
    // Create header
    const headers = Object.keys(data).filter(key => Array.isArray(data[key]));
    rows.push(headers.join(','));
    
    // Create rows
    for (let i = 0; i < maxLength; i++) {
      const row = headers.map(header => {
        const value = data[header][i];
        if (value === undefined || value === null) {
          return '';
        } else if (typeof value === 'object') {
          return JSON.stringify(value).replace(/"/g, '""');
        } else {
          return String(value).replace(/"/g, '""');
        }
      });
      rows.push(row.join(','));
    }
    
    return rows.join('\n');
  }
  
  async navigateAndScrape(startUrl, navigationRules = {}) {
    if (!this.connected) {
      throw new Error('Web scraping not connected. Call start() first.');
    }
    
    console.log(`🧭 Starting navigation scraping from: ${startUrl}`);
    console.log(`   Rules: ${JSON.stringify(navigationRules)}`);
    
    const page = await this.createPage();
    const results = [];
    
    try {
      // Start at initial URL
      await page.goto(startUrl, {
        waitUntil: 'networkidle2',
        timeout: this.config.puppeteer.timeout
      });
      
      let currentUrl = startUrl;
      let pageCount = 0;
      const maxPages = navigationRules.maxPages || 10;
      
      while (pageCount < maxPages) {
        pageCount++;
        
        console.log(`   Page ${pageCount}: ${currentUrl}`);
        
        // Scrape current page
        const scrapeResult = await this.scrapeUrl(currentUrl, {
          method: 'browser',
          keepPageOpen: true,
          screenshot: navigationRules.screenshot,
          extract: navigationRules.extract
        });
        
        results.push({
          page: pageCount,
          url: currentUrl,
          ...scrapeResult
        });
        
        // Find next page link
        let nextUrl = null;
        
        if (navigationRules.nextSelector) {
          const nextElement = await page.$(navigationRules.nextSelector);
          if (nextElement) {
            nextUrl = await page.evaluate(el => el.href, nextElement);
          }
        } else if (navigationRules.paginationPattern) {
          // Generate next page URL based on pattern
          const pattern = navigationRules.paginationPattern;
          nextUrl = pattern.replace('{page}', pageCount + 1);
        }
        
        // Navigate to next page if found
        if (nextUrl && nextUrl !== currentUrl) {
          await page.goto(nextUrl, {
            waitUntil: 'networkidle2',
            timeout: this.config.puppeteer.timeout
          });
          currentUrl = nextUrl;
          
          // Rate limiting
          if (this.config.rateLimit.enabled) {
            await this.delay(this.config.rateLimit.delayMs);
          }
        } else {
          // No next page found
          break;
        }
      }
      
      await page.close();
      this.page = null;
      
      console.log(`✅ Navigation scraping completed`);
      console.log(`   Pages scraped: ${results.length}`);
      
      return {
        success: true,
        startUrl,
        pagesScraped: results.length,
        results,
        note: `Navigation scraping completed. Scraped ${results.length} pages.`
      };
    } catch (error) {
      console.error(`❌ Navigation scraping failed: ${error.message}`);
      
      if (page && !page.isClosed()) {
        await page.close();
        this.page = null;
      }
      
      return {
        success: false,
        startUrl,
        error: error.message,
        results,
        note: 'Navigation scraping failed. Check network and selectors.'
      };
    }
  }
  
  async fillFormAndSubmit(url, formData = {}) {
    if (!this.connected) {
      throw new Error('Web scraping not connected. Call start() first.');
    }
    
    console.log(`📝 Filling form at: ${url}`);
    console.log(`   Form data: ${JSON.stringify(formData)}`);
    
    const page = await this.createPage();
    
    try {
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.config.puppeteer.timeout
      });
      
      // Fill form fields
      for (const [selector, value] of Object.entries(formData.fields || {})) {
        await page.type(selector, value);
      }
      
      // Select dropdowns
      for (const [selector, value] of Object.entries(formData.selects || {})) {
        await page.select(selector, value);
      }
      
      // Check checkboxes
      for (const selector of formData.checkboxes || []) {
        await page.click(selector);
      }
      
      // Click submit button
      if (formData.submitSelector) {
        await page.click(formData.submitSelector);
        
        // Wait for navigation
        await page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: this.config.puppeteer.timeout
        });
      }
      
      // Take screenshot of result
      const screenshotPath = await this.takeScreenshot(page, url);
      
      await page.close();
      this.page = null;
      
      console.log(`✅ Form submitted successfully`);
      
      return {
        success: true,
        url,
        formData,
        screenshot: screenshotPath,
        note: 'Form filled and submitted successfully.'
      };
    } catch (error) {
      console.error(`❌ Form submission failed: ${error.message}`);
      
      if (page && !page.isClosed()) {
        await page.close();
        this.page = null;
      }
      
      return {
        success: false,
        url,
        error: error.message,
        note: 'Form submission failed. Check selectors and page structure.'
      };
    }
  }
  
  delay(ms) {
    return new