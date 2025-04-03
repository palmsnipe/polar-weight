const { POLAR_FLOW_URL, timing } = require('./browser');

// Function to format date in Finnish locale format (DD.MM.YYYY) for Polar Flow
function formatDateFinnish(date) {
  // Use explicit year, month, day to avoid timezone issues
  // Either extract from date parameter or use the passed values
  let day, month, year;
  
  if (typeof date === 'string') {
    // If it's already a string like "2025-03-27", parse it directly
    const dateParts = date.split('-');
    year = parseInt(dateParts[0]);
    month = parseInt(dateParts[1]);
    day = parseInt(dateParts[2]);
  } else {
    // It's a Date object
    year = date.getFullYear();
    month = date.getMonth() + 1; // JavaScript months are 0-indexed
    day = date.getDate();
  }
  
  // Pad with zeros and format as DD.MM.YYYY
  day = String(day).padStart(2, '0');
  month = String(month).padStart(2, '0');
  
  return `${day}.${month}.${year}`;
}

// Function to extract CSRF token from Polar Flow
async function extractCsrfToken(page) {
  console.log('Extracting CSRF token from Polar Flow...');
  
  // Try different approaches to find the CSRF token
  const token = await page.evaluate(() => {
    // Look for the csrfToken in a hidden input (from the form example)
    const csrfTokenInput = document.querySelector('input[name="csrfToken"]');
    if (csrfTokenInput) return csrfTokenInput.value;
    
    // Other fallback methods
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) return metaToken.getAttribute('content');
    
    const tokenInput = document.querySelector('input[name="_csrf"]');
    if (tokenInput) return tokenInput.value;
    
    // Check page content for a token pattern
    const html = document.documentElement.innerHTML;
    const csrfMatch = html.match(/name="csrfToken"\s+value="([^"]+)"/i);
    if (csrfMatch && csrfMatch[1]) return csrfMatch[1];
    
    return null;
  });
  
  return token;
}

// Function to extract user ID from the page
async function extractUserId(page) {
  const userId = await page.evaluate(() => {
    // Look for the userId in a hidden input (from the form example)
    const userIdInput = document.querySelector('input[name="userId"]');
    if (userIdInput) return userIdInput.value;
    
    // Check page content for a user ID pattern
    const html = document.documentElement.innerHTML;
    const userIdMatch = html.match(/name="userId"\s+value="([^"]+)"/i);
    if (userIdMatch && userIdMatch[1]) return userIdMatch[1];
    
    return null;
  });
  
  return userId;
}

// Helper function to round weight to 1 decimal place
function roundWeight(weight) {
  // Ensure weight is a number
  const numWeight = parseFloat(weight);
  // Round to 1 decimal place
  return Math.round(numWeight * 10) / 10;
}

// Function to update weight directly via direct form submission without loading the page each time
async function updateWeightDirect(page, weight, dateObj = new Date()) {
  timing.start('Direct Weight Update');
  
  try {
    // Format the date properly, handling both Date objects and date strings
    const dateStr = typeof dateObj === 'string' ? formatDateFinnish(dateObj) : formatDateFinnish(dateObj);
    
    // Round weight to 1 decimal place
    const roundedWeight = roundWeight(weight);
    console.log(`Attempting direct weight update to ${roundedWeight}kg for date ${dateStr}...`);

    // We need to visit the page at least once to get the form details
    if (!global.polarFlowFormData) {
      console.log('No form data found, fetching from Polar Flow page...');
      
      // Visit the daily page for today or the specified date to get the form details
      const dailyUrl = `${POLAR_FLOW_URL}/training/day/${dateStr}`;
      console.log(`Visiting page to extract form data: ${dailyUrl}`);
      
      await page.goto(dailyUrl, { 
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      
      // Check if we're redirected to login page (not authenticated)
      if (page.url().includes('auth.polar.com')) {
        console.log('Not authenticated. Need to log in first.');
        timing.end('Direct Weight Update');
        return false;
      }
      
      // Extract the form action and data from the page
      global.polarFlowFormData = await page.evaluate(() => {
        const form = document.getElementById('dailyDataForm');
        if (!form) return null;
        
        // Get the form action URL
        const formAction = form.action;
        
        // Get the CSRF token
        const csrfTokenInput = form.querySelector('input[name="csrfToken"]');
        const csrfToken = csrfTokenInput ? csrfTokenInput.value : null;
        
        // Get the user ID
        const userIdInput = form.querySelector('input[name="userId"]');
        const userId = userIdInput ? userIdInput.value : null;
        
        // Get the date input
        const dateInput = form.querySelector('input[name="date"]');
        const date = dateInput ? dateInput.value : null;
        
        return {
          formAction: formAction,
          csrfToken: csrfToken,
          userId: userId,
          date: date
        };
      });
      
      if (!global.polarFlowFormData) {
        console.log('Could not extract form data, falling back to page navigation method');
        timing.end('Direct Weight Update');
        return null; // Signal to fall back to the regular method
      }
      
      console.log('Form data extracted successfully');
    }
    
    // We have the form data, now we can update the weight for any date without loading the page
    console.log(`Using form action: ${global.polarFlowFormData.formAction}`);
    console.log(`Using CSRF token: ${global.polarFlowFormData.csrfToken.substring(0, 10)}...`);
    
    // Prepare the form data for the request
    const formData = {
      csrfToken: global.polarFlowFormData.csrfToken,
      userId: global.polarFlowFormData.userId,
      date: dateStr,
      weight: roundedWeight.toFixed(1), // Ensure consistent 1 decimal format
      feeling: "",  // Optional but included in the form
      note: ""      // Optional but included in the form
    };
    
    // Submit the form directly using fetch API
    const response = await page.evaluate(async (formData, formAction) => {
      try {
        // Create a URLSearchParams object for the form data
        const params = new URLSearchParams();
        for (const key in formData) {
          params.append(key, formData[key]);
        }
        
        // Submit the form using fetch API
        const response = await fetch(formAction, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'text/html,application/xhtml+xml,application/xml'
          },
          body: params,
          credentials: 'include', // Include cookies
          redirect: 'follow'      // Follow redirects
        });
        
        // Return the response status and URL
        return {
          status: response.status,
          ok: response.ok,
          redirected: response.redirected,
          url: response.url
        };
      } catch (error) {
        return {
          error: error.message,
          ok: false
        };
      }
    }, formData, global.polarFlowFormData.formAction);
    
    if (response.error) {
      console.log(`Form submission error: ${response.error}`);
      timing.end('Direct Weight Update');
      return null; // Signal to fall back to the regular method
    }
    
    // Check if the form submission was successful
    if (response.ok) {
      console.log(`Direct weight update successful! Status: ${response.status}`);
      
      // Optionally verify the update - we're assuming success based on response
      // You could navigate to the page to verify if needed
      
      timing.end('Direct Weight Update');
      return true;
    } else {
      console.log(`Form submission failed with status: ${response.status}`);
      console.log(`Redirected to: ${response.url}`);
      
      // If the token is expired, clear the stored form data to force a refresh
      if (response.status === 403) {
        console.log('CSRF token may be expired, clearing stored form data for next attempt');
        global.polarFlowFormData = null;
      }
      
      timing.end('Direct Weight Update');
      return null; // Signal to fall back to the regular method
    }
  } catch (error) {
    console.error('Error in direct weight update:', error.message);
    timing.end('Direct Weight Update');
    return null; // Signal to fall back to the regular method
  }
}

// Original function to update weight on Polar Flow for a specific date
async function updateWeight(page, weight, dateObj = new Date()) {
  // Try the direct API method first if it's not explicitly disabled
  if (process.env.DISABLE_DIRECT_API !== 'true') {
    const directResult = await updateWeightDirect(page, weight, dateObj);
    
    // If direct method succeeded, return true
    if (directResult === true) {
      return true;
    }
    
    // If direct method returned null, fall back to the page navigation method
    // If it returned false, it means authentication failed, so don't try again
    if (directResult === false) {
      return false;
    }
    
    console.log('Falling back to page navigation method...');
  }
  
  timing.start('Weight Update');
  
  try {
    // Format the date properly, handling both Date objects and date strings
    const dateStr = typeof dateObj === 'string' ? formatDateFinnish(dateObj) : formatDateFinnish(dateObj);
    
    // Round weight to 1 decimal place
    const roundedWeight = roundWeight(weight);
    console.log(`Attempting to update weight to ${roundedWeight}kg for date ${dateStr}...`);
    
    // Navigate directly to the daily page for the specified date
    const dailyUrl = `${POLAR_FLOW_URL}/training/day/${dateStr}`;
    console.log(`Navigating to: ${dailyUrl}`);
    
    // Load the page and wait for it to be loaded
    await page.goto(dailyUrl, { 
      waitUntil: 'networkidle2',
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
    }, roundedWeight.toFixed(1)); // Send rounded weight with 1 decimal
    
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
        waitUntil: 'networkidle2',
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
    
    if (updatedWeight && parseFloat(updatedWeight) === parseFloat(roundedWeight.toFixed(1))) {
      console.log(`Weight successfully updated to ${roundedWeight}kg for date ${dateStr}`);
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

module.exports = {
  formatDateFinnish,
  updateWeight,
  roundWeight
};