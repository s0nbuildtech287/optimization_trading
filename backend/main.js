const authorize = require('./server/config/oauth2');
const { google } = require('googleapis');

authorize(async (auth) => {
  const sheets = google.sheets({ version: 'v4', auth });
  
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '12Ex7GdKnyJp8OPVI_vEIHODhek9FNUJhZ1iYR8g4urk',
    range: '001XAUUSD15OB',
  });

});

