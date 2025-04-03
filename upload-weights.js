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
    // Read the weight data from the CSV - sort ascending by date (oldest first)
    const weightEntries = await readWeightData(WEIGHT_FILE_PATH);
    
    if (weightEntries.length === 0) {
      console.log('No weight entries found in the CSV file');
      return;
    }
    
    // Sort by date (oldest first) to ensure consistent updates
    weightEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    console.log(`Loaded ${weightEntries.length} weight entries from CSV`);
    console.log(`Date range: ${weightEntries[0].date} to ${weightEntries[weightEntries.length-1].date}`);
    
    // Initialize the browser and page
    browser = await initBrowser();
    const page = await initPage(browser);
    
    // Track success and failures
    const results = {
      successful: 0,
      failed: 0,
      skipped: 0
    };
    
    // Don't try to authenticate first - instead try to update weights directly
    // and only authenticate if needed (same approach as index.js)
    console.log('Starting weight upload process...');
    
    // Process entries in batches for better performance monitoring
    const batchSize = 10;
    const totalBatches = Math.ceil(weightEntries.length / batchSize);
    const totalEntries = weightEntries.length;
    
    let authenticationPerformed = false;
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, weightEntries.length);
      const batchEntries = weightEntries.slice(start, end);
      
      console.log(`\nProcessing batch ${batchIndex + 1}/${totalBatches} (entries ${start + 1}-${end} of ${totalEntries})`);
      
      for (let i = 0; i < batchEntries.length; i++) {
        const entry = batchEntries[i];
        const globalIndex = start + i;
        
        console.log(`\nProcessing entry ${globalIndex + 1}/${totalEntries}: ${entry.date}, ${entry.weight}kg`);
        
        // Pass the date string directly instead of converting to Date object
        // This avoids timezone issues that could cause the date to shift
        let success = await updateWeight(page, entry.weight, entry.date);
        
        // If failed and we haven't tried authentication yet, try to authenticate and retry
        if (!success && !authenticationPerformed) {
          console.log('Weight update failed, attempting to authenticate first...');
          const authSuccess = await authenticate(page);
          authenticationPerformed = true;
          
          if (authSuccess) {
            console.log('Authentication successful, trying weight update again...');
            success = await updateWeight(page, entry.weight, entry.date);
          } else {
            console.error('Authentication failed. Please check your credentials in the .env file.');
            // No point continuing if authentication fails
            return;
          }
        }
        
        if (success) {
          results.successful++;
          console.log(`✓ Successfully updated weight for ${entry.date}`);
        } else {
          results.failed++;
          console.log(`✗ Failed to update weight for ${entry.date}`);
        }
      }
      
      // Print batch summary
      console.log(`\nBatch ${batchIndex + 1}/${totalBatches} completed:`);
      console.log(`Successful in this batch: ${batchEntries.filter((_, i) => 
        i + start < totalEntries && i + start >= results.skipped + results.failed && 
        i + start < results.successful + results.skipped + results.failed).length}`);
      console.log(`Failed in this batch: ${batchEntries.filter((_, i) => 
        i + start < totalEntries && i + start >= results.successful + results.skipped && 
        i + start < results.successful + results.failed + results.skipped).length}`);
      console.log(`Cumulative progress: ${results.successful}/${totalEntries} successful (${(results.successful/totalEntries*100).toFixed(1)}%)`);
    }
    
    // Print summary of results
    console.log('\n===============================');
    console.log('Weight Upload Summary:');
    console.log(`Total entries processed: ${weightEntries.length}`);
    console.log(`Successful updates: ${results.successful}`);
    console.log(`Failed updates: ${results.failed}`);
    if (results.skipped > 0) {
      console.log(`Skipped entries: ${results.skipped}`);
    }
    console.log(`Success rate: ${(results.successful/weightEntries.length*100).toFixed(1)}%`);
    console.log('===============================\n');
    
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    // Record total execution time and close the browser
    const totalTime = timing.end('Total Execution');
    const totalMinutes = Math.floor(totalTime / 60000);
    const totalSeconds = ((totalTime % 60000) / 1000).toFixed(2);
    
    console.log(`\nTotal execution time: ${totalTime}ms (${totalMinutes}m ${totalSeconds}s)`);
    
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