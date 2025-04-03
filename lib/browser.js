const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Constants
const POLAR_FLOW_URL = 'https://flow.polar.com';
const POLAR_AUTH_URL = 'https://auth.polar.com/login';
const COOKIE_FILE_PATH = path.join(__dirname, '..', 'cookies.json');

// Helper function to measure execution time
const timing = {
  start: (label) => {
    if (!timing.times) timing.times = {};
    timing.times[label] = Date.now();
    console.log(`Starting: ${label}`);
  },
  end: (label) => {
    if (timing.times && timing.times[label]) {
      const elapsed = Date.now() - timing.times[label];
      console.log(`Completed: ${label} (${elapsed}ms)`);
      return elapsed;
    }
    return 0;
  }
};

// Function to save cookies to a file
async function saveCookies(cookies) {
  try {
    fs.writeFileSync(COOKIE_FILE_PATH, JSON.stringify(cookies));
    console.log('Cookies saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving cookies:', error.message);
    return false;
  }
}

// Function to load cookies from a file
function loadCookiesFromFile() {
  try {
    if (fs.existsSync(COOKIE_FILE_PATH)) {
      const cookiesData = fs.readFileSync(COOKIE_FILE_PATH, 'utf8');
      const cookies = JSON.parse(cookiesData);
      console.log('Cookies loaded successfully');
      return cookies;
    }
  } catch (error) {
    console.error('Error loading cookies:', error.message);
  }
  return null;
}

// Function to authenticate with Polar Flow using an existing page
async function authenticate(page) {
  timing.start('Authentication');
  
  try {
    console.log('Starting authentication process...');
    
    // Navigate to Polar Flow login page
    console.log('Navigating to Polar Flow login page...');
    await page.goto(POLAR_AUTH_URL, { 
      waitUntil: 'networkidle2',
      timeout: 20000
    });
    
    // Wait for the login form to be available
    console.log('Waiting for login form to load...');
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })
      .catch(() => console.log('Email field not found, will try to find any input field'));
    
    // Fill in the email/username field
    console.log('Entering username/email...');
    const emailSelector = await page.$('input[name="email"]') || 
                          await page.$('input[type="email"]') || 
                          await page.$('input:not([type="password"]):not([type="checkbox"])');
    
    if (emailSelector) {
      await emailSelector.type(process.env.POLAR_USERNAME, { delay: 0 });
    } else {
      throw new Error('Could not find email/username input field');
    }
    
    // Fill in the password field
    console.log('Entering password...');
    const passwordSelector = await page.$('input[name="password"]') || 
                             await page.$('input[type="password"]');
    
    if (passwordSelector) {
      await passwordSelector.type(process.env.POLAR_PASSWORD, { delay: 0 });
    } else {
      throw new Error('Could not find password input field');
    }
    
    // Click the login button
    console.log('Clicking login button...');
    const loginButtonSelector = await page.$('button[type="submit"]') || 
                                await page.$('input[type="submit"]') || 
                                await page.$('button:contains("Login")');
    
    if (loginButtonSelector) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
        loginButtonSelector.click()
      ]).catch(e => console.log('Navigation after login click timed out or failed:', e.message));
    } else {
      throw new Error('Could not find login button');
    }
    
    // Get all cookies from the browser
    const cookies = await page.cookies();
    
    // Save cookies for future use
    await saveCookies(cookies);
    
    console.log('Authentication successful!');
    timing.end('Authentication');
    return true;
  } catch (error) {
    console.error('Authentication error:', error.message);
    timing.end('Authentication');
    return false;
  }
}

// Function to initialize a browser
async function initBrowser() {
  timing.start('Browser Launch');

  // Find Chrome executable path - only on non-Linux platforms
  let executablePath = null;
  if (process.platform !== 'linux') {
    const possibleChromePaths = process.platform === 'darwin' 
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] 
      : ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
    
    for (const path of possibleChromePaths) {
      if (fs.existsSync(path)) {
        executablePath = path;
        console.log(`Found Chrome at: ${path}`);
        break;
      }
    }
  }
  
  // Launch a browser with optimized settings
  console.log('Launching browser in headless mode...');
  const browser = await puppeteer.launch({
    headless: 'new', // Use headless mode with the new implementation
    executablePath: executablePath,
    slowMo: 0,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas', 
      '--disable-gpu',
      '--window-size=1280,800',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--mute-audio'
    ],
    defaultViewport: {
      width: 1280,
      height: 800
    },
    ignoreHTTPSErrors: true
  });

  timing.end('Browser Launch');
  return browser;
}

// Function to initialize a page with optimized settings
async function initPage(browser) {
  // Create a page
  const page = await browser.newPage();
  
  // Set request interception to block unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    // Block images, fonts, stylesheets, and other non-essential resources
    const resourceType = request.resourceType();
    if (['image', 'font', 'stylesheet', 'media', 'other'].includes(resourceType)) {
      request.abort();
    } else {
      request.continue();
    }
  });
  
  // Load cookies if available
  const cookies = loadCookiesFromFile();
  if (cookies) {
    await page.setCookie(...cookies);
  }
  
  return page;
}

module.exports = {
  POLAR_FLOW_URL,
  timing,
  authenticate,
  initBrowser,
  initPage
};