# Polar Flow Weight Update

This Node.js script allows you to update your weight on the Polar Flow platform through automated authentication and API interaction.

## Setup

1. Clone this repository
2. Install dependencies with `npm install`
3. Update the `.env` file with your Polar Flow credentials:
   ```
   POLAR_USERNAME=your_email_here
   POLAR_PASSWORD=your_password_here
   ```

## Usage

Run the script to update your weight:

```bash
# Update weight with a specific value (in kg)
node index.js 75.5

# Or run without a parameter to use the default weight (70kg)
node index.js
```

## Features

- Authenticates with Polar Flow
- Stores cookies to avoid re-authentication on subsequent runs
- Updates weight through the Polar Flow web API
- Automatically re-authenticates if session expires

## Notes

- This is an unofficial implementation and may break if Polar Flow changes their authentication or API.
- The exact endpoints for weight updates may need adjustments based on actual Polar Flow API behavior.