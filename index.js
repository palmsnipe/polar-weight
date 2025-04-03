require('dotenv').config();
const { timing, initBrowser, initPage, authenticate } = require('./lib/browser');
const { updateWeight } = require('./lib/weight');

// Main function
async function main() {
  timing.start('Total Execution');
  
  // Parse weight from command line argument
  const weight = process.argv[2] || 70; // Default weight or from command line
  
  // Parse date from command line argument (YYYY-MM-DD format) or use today
  let dateInput;
  if (process.argv[3]) {
    // Pass the date string directly instead of converting to Date object
    // This avoids timezone issues that could cause the date to shift
    dateInput = process.argv[3]; // Keep as string format "YYYY-MM-DD"
  }
  
  // Initialize the browser
  const browser = await initBrowser();
  
  try {
    // Create a page with optimized settings
    const page = await initPage(browser);
    
    // Try to update weight directly - this will also check authentication
    // Pass the date as a string if provided, otherwise use default (today)
    let weightUpdated = await updateWeight(page, weight, dateInput);
    
    // If updating weight failed due to authentication, try to authenticate and then update weight
    if (!weightUpdated) {
      console.log('Weight update failed, attempting to authenticate first...');
      const authSuccess = await authenticate(page);
      
      if (authSuccess) {
        console.log('Authentication successful, trying weight update again...');
        weightUpdated = await updateWeight(page, weight, dateInput);
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