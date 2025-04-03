# Polar Flow Weight Update

This Node.js script allows you to update your weight on the Polar Flow platform through automated authentication and direct form submission.

## Features

- Authenticates with Polar Flow automatically
- Stores cookies to avoid re-authentication on subsequent runs
- Updates weight through direct form submission for faster performance
- Supports individual and batch weight updates from CSV files
- Correctly handles date formats to ensure weights are entered on the right days
- Formats weight values to one decimal place as required by Polar Flow
- Automatically re-authenticates if session expires

## Setup

1. Clone this repository
2. Install dependencies with `npm install`
3. Create a `.env` file with your Polar Flow credentials:
   ```
   POLAR_USERNAME=your_email_here
   POLAR_PASSWORD=your_password_here
   ```

## Usage

### Single Weight Update

Run the script to update your weight for today or a specific date:

```bash
# Update weight for today with a specific value (in kg)
node index.js 75.5

# Update weight for a specific date (YYYY-MM-DD format)
node index.js 75.5 2023-05-15
```

### Batch Weight Updates from CSV

To upload multiple weight entries from a CSV file:

1. Prepare a CSV file with two columns: `date` and `weight`
   - Dates should be in YYYY-MM-DD format
   - Weights should be in kilograms

2. Optional: Clean and prepare your CSV file:
   ```bash
   node clean-weight.js
   ```
   This will read from `weight.csv` and create a cleaned version in `weight_cleaned.csv`

3. Upload all weight entries:
   ```bash
   node upload-weights.js
   ```

## How It Works

The script uses Puppeteer to automate browser interactions with Polar Flow:

1. It first tries to use stored cookies for authentication to avoid logging in again
2. For weight updates, it uses a direct form submission approach that's much faster than page navigation
3. If the direct method fails, it falls back to the traditional page navigation method
4. The script handles dates carefully to ensure weights are recorded on the correct days
5. Weight values are automatically rounded to one decimal place as required by Polar Flow

## Performance Optimization

The direct form submission method is significantly faster than traditional page navigation:

- **Traditional method**: ~10-15 seconds per weight update
- **Direct method**: ~2-5 seconds per weight update

For batch uploads, the script processes entries in batches and displays progress information.

## Troubleshooting

- If you encounter authentication issues, the script will save screenshots of the login process to help diagnose the problem:
  - `login-page.png`: The initial login page
  - `login-form-filled.png`: After filling in credentials
  - `after-login.png`: After attempting to log in

- If the direct weight update method fails, the script automatically falls back to the traditional page navigation method.

- You can disable the direct API method by setting an environment variable:
  ```
  DISABLE_DIRECT_API=true node index.js 75.5
  ```

## Notes

- This is an unofficial implementation and may break if Polar Flow changes their authentication or API.
- The script respects Polar Flow's format requirements (dates in DD.MM.YYYY format, weights with 1 decimal place).