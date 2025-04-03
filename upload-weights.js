require('dotenv').config();
const path = require('path');
const { timing, initBrowser, initPage, authenticate } = require('./lib/browser');
const { updateWeight } = require('./lib/weight');
const { readWeightData } = require('./lib/csv');

// Constants
const WEIGHT_FILE_PATH = path.join(__dirname, 'weight_cleaned.csv');

// Main function
async function main() {
  timing.start('Total Execution');
  let browser = null;
  
  try {
    // Read the weight data from the CSV
    const weightEntries = await readWeightData(WEIGHT_FILE_PATH);
    
    if (weightEntries.length === 0) {
      console.log('No weight entries found in the CSV file');
      return;
    }
    
    // Initialize the browser and page
    browser = await initBrowser();
    const page = await initPage(browser);
    
    // Try to authenticate first
    console.log('Authenticating with Polar Flow...');
    const authSuccess = await authenticate(page);
    
    if (!authSuccess) {
      console.error('Authentication failed. Please check your credentials in the .env file.');
      return;
    }
    
    console.log('Authentication successful. Starting weight upload process...');
    
    // Track success and failures
    const results = {
      successful: 0,
      failed: 0
    };
    
    // Process each weight entry
    for (let i = 0; i < weightEntries.length; i++) {
      const entry = weightEntries[i];
      
      console.log(`\nProcessing entry ${i+1}/${weightEntries.length}: ${entry.date}, ${entry.weight}kg`);
      
      // Convert date string to Date object
      const dateObj = new Date(entry.date);
      
      // Update weight for this date
      const success = await updateWeight(page, entry.weight, dateObj);
      
      if (success) {
        results.successful++;
      } else {
        results.failed++;
      }
      
      // Add a small delay between requests to avoid overwhelming the server
      await page.waitForTimeout(1000);
    }
    
    // Print summary of results
    console.log('\n===============================');
    console.log('Weight Upload Summary:');
    console.log(`Total entries processed: ${weightEntries.length}`);
    console.log(`Successful updates: ${results.successful}`);
    console.log(`Failed updates: ${results.failed}`);
    console.log('===============================\n');
    
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    // Record total execution time and close the browser
    const totalTime = timing.end('Total Execution');
    console.log(`\nTotal execution time: ${totalTime}ms (${(totalTime/1000).toFixed(2)} seconds)`);
    
    // Close the browser if it was opened
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  timing.end('Total Execution');
  process.exit(1);
});