const fs = require('fs');
const path = require('path');

/**
 * Helper function to properly parse CSV lines with quoted values
 * @param {string} line - A single line from the CSV file
 * @returns {string[]} - Array of parsed values from the line
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  return result;
}

/**
 * Process weight.csv to create a new CSV with just the latest weight for each day
 * @param {string} inputFile - Path to the input CSV file
 * @param {string} outputFile - Path to the output CSV file
 * @returns {Promise<{success: boolean, message: string, count: number}>} - Result of the operation
 */
function processWeightData(inputFile = 'weight.csv', outputFile = 'weight_cleaned.csv') {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Reading weight data from ${inputFile}...`);
      
      // Check if the file exists
      if (!fs.existsSync(inputFile)) {
        return reject(new Error(`File not found: ${inputFile}`));
      }
      
      // Read the CSV file
      const csvData = fs.readFileSync(inputFile, 'utf8');
      
      // Split the data into lines and remove the comment at the top if present
      const lines = csvData.split('\n').filter(line => !line.startsWith('//'));
      
      // Extract header and data
      const header = lines[0];
      const dataLines = lines.slice(1).filter(line => line.trim());
      
      console.log(`Found ${dataLines.length} data entries in the CSV file`);
      
      // Object to store the latest entry for each day
      const dailyLatestData = {};
      
      // Process each line
      dataLines.forEach(line => {
        // Parse the CSV line (handling quoted values)
        const columns = parseCSVLine(line);
        
        if (columns.length < 2) return; // Skip invalid lines
        
        // Extract date and weight
        const fullDateStr = columns[0].replace(/"/g, '');
        const weight = parseFloat(columns[1]);
        
        if (isNaN(weight)) return; // Skip entries with invalid weight
        
        // Extract just the date part (YYYY-MM-DD)
        const datePart = fullDateStr.split(' ')[0];
        
        // If this is the first entry for this date or has a later time than the stored one
        if (!dailyLatestData[datePart] || 
            fullDateStr > dailyLatestData[datePart].fullDateStr) {
          dailyLatestData[datePart] = {
            fullDateStr, 
            weight
          };
        }
      });
      
      // Create the new CSV content
      let newCSVContent = 'Date,Weight (kg)\n';
      
      // Sort dates in descending order (newest first)
      const sortedDates = Object.keys(dailyLatestData).sort().reverse();
      
      // Add each date's latest entry to the CSV
      sortedDates.forEach(date => {
        newCSVContent += `${date},${dailyLatestData[date].weight.toFixed(2)}\n`;
      });
      
      // Write to the output file
      fs.writeFileSync(outputFile, newCSVContent, 'utf8');
      
      console.log(`Cleaned weight data has been saved to ${outputFile}`);
      console.log(`Total unique days with weight data: ${sortedDates.length}`);
      
      resolve({
        success: true,
        message: `Cleaned weight data has been saved to ${outputFile}`,
        count: sortedDates.length
      });
    } catch (error) {
      console.error('Error processing weight data:', error);
      reject(error);
    }
  });
}

/**
 * Read processed weight data from a CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array<{date: string, weight: number}>>} - Array of weight entries
 */
function readWeightData(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        return reject(new Error(`File not found: ${filePath}`));
      }
      
      // Read the CSV file content
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const lines = fileContents.split('\n');
      
      // Skip header line and filter out empty lines
      const dataLines = lines.slice(1).filter(line => line.trim());
      
      // Parse each line to extract date and weight
      const weightEntries = dataLines.map(line => {
        const [dateStr, weightStr] = line.split(',');
        return {
          date: dateStr.trim(),
          weight: parseFloat(weightStr.trim())
        };
      }).filter(entry => !isNaN(entry.weight));
      
      console.log(`Loaded ${weightEntries.length} weight entries from CSV`);
      resolve(weightEntries);
      
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  parseCSVLine,
  processWeightData,
  readWeightData
};