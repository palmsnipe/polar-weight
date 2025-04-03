require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Constants
const POLAR_FLOW_URL = 'https://flow.polar.com';
const POLAR_AUTH_URL = 'https://auth.polar.com/login';
const COOKIE_FILE_PATH = path.join(__dirname, 'cookies.json');

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

// Function to format date in Finnish locale format (DD.MM.YYYY)
function formatDateFinnish(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Function to authenticate with Polar Flow using an existing page
async function authenticate(page) {
  timing.start('Authentication');
  
  try {
    console.log('Starting authentication process...');
    
    // Navigate to Polar Flow login page
    console.log('Navigating to Polar Flow login page...');
    await page.goto(POLAR_AUTH_URL, { 
      waitUntil: 'networkidle2',  // Changed back to networkidle2 for reliability
      timeout: 20000
    });
    
    // Wait for the login form to be available (it's dynamically loaded)
    console.log('Waiting for login form to load...');
    await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 })
      .catch(() => console.log('Email field not found, will try to find any input field'));
    
    // Fill in the email/username field
    console.log('Entering username/email...');
    const emailSelector = await page.$('input[name="email"]') || 
                          await page.$('input[type="email"]') || 
                          await page.$('input:not([type="password"]):not([type="checkbox"])');
    
    if (emailSelector) {
      await emailSelector.type(process.env.POLAR_USERNAME, { delay: 0 }); // Removed typing delay
    } else {
      throw new Error('Could not find email/username input field');
    }
    
    // Fill in the password field
    console.log('Entering password...');
    const passwordSelector = await page.$('input[name="password"]') || 
                             await page.$('input[type="password"]');
    
    if (passwordSelector) {
      await passwordSelector.type(process.env.POLAR_PASSWORD, { delay: 0 }); // Removed typing delay
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
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }), // Changed back to networkidle2
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

// Function to update weight on Polar Flow for a specific date
async function updateWeight(page, weight, dateObj = new Date()) {
  timing.start('Weight Update');
  
  try {
    // Format the date in Finnish locale format
    const dateStr = formatDateFinnish(dateObj);
    console.log(`Attempting to update weight to ${weight}kg for date ${dateStr}...`);
    
    // Navigate directly to the daily page for the specified date
    const dailyUrl = `${POLAR_FLOW_URL}/training/day/${dateStr}`;
    console.log(`Navigating to: ${dailyUrl}`);
    
    // Load the page and wait for it to be loaded
    await page.goto(dailyUrl, { 
      waitUntil: 'networkidle2',  // Changed back to networkidle2 for reliability
      timeout: 20000
    });
    
    // Check if we're redirected to login page (not authenticated)
    if (page.url().includes('auth.polar.com')) {
      console.log('Not authenticated. Need to log in first.');
      timing.end('Weight Update');
      return false;
    }
    
    // Find the dailyDataForm
    console.log('Looking for the dailyDataForm...');
    // Wait for the form to be loaded
    await page.waitForSelector('#dailyDataForm', { timeout: 10000 })
      .catch(() => console.log('dailyDataForm not found in DOM, will check via evaluate'));
    
    const formExists = await page.evaluate(() => {
      return document.getElementById('dailyDataForm') !== null;
    });
    
    if (!formExists) {
      throw new Error('Could not locate weight input form');
    }
    
    // More efficient form data collection
    const formDetails = await page.evaluate(() => {
      const form = document.getElementById('dailyDataForm');
      return {
        action: form.action,
        method: form.method
      };
    });
    
    // Find and wait for the weight input field
    console.log('Accessing weight input field...');
    await page.waitForSelector('#weight, input[name="weight"]', { timeout: 10000 })
      .catch(() => console.log('Weight input not found in DOM via selector'));
    
    // Clear and update the weight field directly in page context for better performance
    const weightUpdated = await page.evaluate((weightValue) => {
      const weightField = document.getElementById('weight') || document.querySelector('input[name="weight"]');
      if (!weightField) return false;
      
      // Clear the field and set the new value
      weightField.value = '';
      weightField.value = weightValue.toString();
      return true;
    }, weight);
    
    if (!weightUpdated) {
      console.error('Could not find or update weight input field');
      timing.end('Weight Update');
      return false;
    }
    
    // Click the save button and wait for navigation - all done in page context
    console.log('Submitting weight update...');
    
    const success = await Promise.race([
      // Wait for navigation
      page.waitForNavigation({ 
        waitUntil: 'networkidle2',  // Changed back to networkidle2 for reliability
        timeout: 15000 
      }).then(() => true).catch(() => {
        console.log('Navigation timeout - will check if update succeeded anyway');
        return null;
      }),
      
      // Click the save button using page.evaluate for better performance
      page.evaluate(() => {
        const saveButton = document.getElementById('saveDailyDataBtn');
        if (saveButton) {
          saveButton.click();
          return true;
        }
        
        // If specific button not found, try any button with "Save" text
        const buttons = Array.from(document.querySelectorAll('button, a.btn'));
        const saveBtn = buttons.find(btn => {
          const text = (btn.innerText || btn.textContent || '').toLowerCase();
          return text.includes('save');
        });
        
        if (saveBtn) {
          saveBtn.click();
          return true;
        }
        
        // Last resort: submit the form directly
        const form = document.getElementById('dailyDataForm');
        if (form) {
          form.submit();
          return true;
        }
        
        return false;
      }).then(clicked => {
        if (!clicked) {
          console.log('Failed to click save button or submit form');
          return false;
        }
        return null; // Continue waiting for navigation
      })
    ]);
    
    // Wait longer to ensure page has updated after form submission
    await page.waitForTimeout(1000);
    
    // Verify the weight was updated by checking the input value
    const updatedWeight = await page.evaluate(() => {
      const weightInput = document.querySelector('#weight, input[name="weight"]');
      return weightInput ? weightInput.value : null;
    });
    
    console.log(`Weight value after form submission: ${updatedWeight}`);
    
    if (updatedWeight && parseFloat(updatedWeight) === parseFloat(weight)) {
      console.log(`Weight successfully updated to ${weight}kg for date ${dateStr}`);
      timing.end('Weight Update');
      return true;
    } else {
      console.log('Weight update verification failed');
      timing.end('Weight Update');
      return false;
    }
  } catch (error) {
    console.error('Error updating weight:', error.message);
    timing.end('Weight Update');
    return false;
  }
}

// Main function
async function main() {
  timing.start('Total Execution');
  
  // Parse weight from command line argument
  const weight = process.argv[2] || 70; // Default weight or from command line
  
  // Parse date from command line argument (YYYY-MM-DD format) or use today
  let dateObj = new Date();
  if (process.argv[3]) {
    const dateStr = process.argv[3];
    const dateParts = dateStr.split('-');
    if (dateParts.length === 3) {
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // JavaScript months are 0-indexed
      const day = parseInt(dateParts[2]);
      dateObj = new Date(year, month, day);
    }
  }
  
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
  
  // Launch a browser with optimized settings - always in headless mode
  timing.start('Browser Launch');
  console.log('Launching browser in headless mode...');
  const browser = await puppeteer.launch({
    headless: 'new', // Always use headless mode with the new implementation
    executablePath: executablePath,
    slowMo: 0, // No slowdown for better performance
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
  
  try {
    // Create a single page for all operations
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
    
    // Try to update weight directly - this will also check authentication
    let weightUpdated = await updateWeight(page, weight, dateObj);
    
    // If updating weight failed due to authentication, try to authenticate and then update weight
    if (!weightUpdated) {
      console.log('Weight update failed, attempting to authenticate first...');
      const authSuccess = await authenticate(page);
      
      if (authSuccess) {
        console.log('Authentication successful, trying weight update again...');
        weightUpdated = await updateWeight(page, weight, dateObj);
      } else {
        console.error('Authentication failed. Please check your credentials in the .env file.');
      }
    }
    
    if (weightUpdated) {
      console.log(`Weight successfully updated to ${weight}kg`);
    } else {
      console.log('Failed to update weight.');
    }
    
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    // Record total execution time and close the browser
    const totalTime = timing.end('Total Execution');
    console.log(`\nTotal execution time: ${totalTime}ms (${(totalTime/1000).toFixed(2)} seconds)`);
    
    // Always close the browser immediately when done
    await browser.close();
    console.log('Browser closed');
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  timing.end('Total Execution');
  process.exit(1);
});