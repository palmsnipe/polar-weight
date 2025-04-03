const { processWeightData } = require('./lib/csv');

/**
 * Main function to process the weight CSV file
 */
async function main() {
  try {
    console.log('Starting weight data processing...');
    
    // Process the weight data - this will create weight_cleaned.csv
    const result = await processWeightData('weight.csv', 'weight_cleaned.csv');
    
    console.log(`Success! ${result.count} weight entries processed and saved to weight_cleaned.csv`);
  } catch (error) {
    console.error('Error processing weight data:', error.message);
    process.exit(1);
  }
}

// Run the main function
main();