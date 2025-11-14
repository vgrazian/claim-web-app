# Claim Management Web Application

A browser-based application that replicates the functionality of the Rust CLI tool for managing Monday.com claims.

## Features

- **Week View**: Display current week with all working days
- **Date Navigation**: Navigate between weeks using date picker or navigation buttons
- **Real-time Data**: Query and display existing entries from Monday.com
- **Batch Operations**: Add multiple entries for the entire week at once
- **Visual Feedback**: Clear visual indicators for successful operations
- **API Key Management**: Secure storage of Monday.com API key in browser

## Try It Now

<https://vgrazian.github.io/claim-web-app/>

## Setup

1. **Get Your Monday.com API Key**:

- Log in to your Monday.com account
- Go to <https://your\-account\.monday\.com/admin/integrations/api\>
- Generate a new API key or use an existing one

2. **Run the Application**:

- Open the live demo link above or index\.html in a modern web browser
- Enter your API key in the top-right corner and click "Save API Key"
- The application will validate your API key and load your user information

## Usage

### Viewing Entries

- The application automatically loads entries for the current week
- Each day card shows existing entries with details
- The week summary shows total hours, entries, and filled days

### Adding Entries

1. Fill in the form for each day:

- Select activity type from dropdown
- Enter customer name
- Enter work item
- Add optional comment
- Set hours (default 8)

2. Click "Add All Entries" to submit all filled forms
3. Successfully added entries will show a green checkmark

### Navigation

- Use the date picker to select a specific week
- Use the arrow buttons to navigate to previous/next weeks
- Click "Refresh" to reload data from Monday.com

### Activity Types

- Use the activity type grid to quickly set the same activity type for all days
- Click any activity type to apply it to all days in the current week

## Security

- API keys are stored in browser's local storage
- All API calls are made directly from the browser to Monday.com
- No data is stored on any intermediate server

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Troubleshooting

**API Key Issues**:

- Ensure your API key has proper permissions
- Check that you're using the correct Monday.com account

**Data Not Loading**:

- Verify your board ID matches the expected structure
- Check browser console for error messages

**Entries Not Adding**:

- Ensure all required fields are filled
- Check that you have write permissions on the Monday.com board

## Development

To run locally:

1. Clone the repository
2. Open index\.html in a web browser
3. Follow the setup instructions above

The application is hosted on GitHub Pages at: <https://vgrazian.github.io/claim-web-app/>
