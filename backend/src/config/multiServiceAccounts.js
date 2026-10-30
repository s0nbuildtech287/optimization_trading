const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const saDir = path.join(__dirname, 'serviceAccounts');
const authClients = fs.readdirSync(saDir)
  .filter(file => file.endsWith('.json'))
  .map(file => {
    const key = require(path.join(saDir, file));
    return new google.auth.JWT(
      key.client_email,
      null,
      key.private_key,
      [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly', 
      ]
    );
  });

module.exports = authClients;
