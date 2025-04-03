const { POLAR_FLOW_URL, timing } = require('./browser');

// Function to format date in Finnish locale format (DD.MM.YYYY) for Polar Flow
function formatDateFinnish(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
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

module.exports = {
  formatDateFinnish,
  updateWeight
};