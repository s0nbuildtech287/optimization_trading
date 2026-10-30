const JWT = require('google-auth-library').JWT;
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const sheetURLs = [
  'https://docs.google.com/spreadsheets/d/11yBNGnuNQvKakqh_4U6gWoY1OuLbYEKq87NEWNZCBuQ/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1c_nfGSSwPSRkChvbXDUdl6gjriyTpr-PUw5JDZL8Tpk/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1Mzqd8JDqOBKDuq6OHPNXeUmzcaX0fIeXtHpgwB19EXc/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/18xMNiqVjshOF0-n_7O10nJ9C-EC_Xo1y6LIC3tmLJ3c/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1R-MDgwPrbv5Myaj1SYbFlF3nWtyzRjypulVeoVU6uKg/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1Wz9Xo3b3mXxsgVIdzx8OHQ8wR7tkE4ciWBpDXWHkYr4/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/17IcUa_sGnMDmYSwgwzzxJyve8j8oUniZHej6jYDDwDc/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/12L0Uu-7DTgcE9-CbGid0JBIYBlVqIa6fvOs-4iGS52U/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1BAFvbvJDcmsVW6ximK8LVxKSkjwS8l5lbZL-grkXbwI/edit?gid=0#gid=0',
  'https://docs.google.com/spreadsheets/d/1BAFvbvJDcmsVW6ximK8LVxKSkjwS8l5lbZL-grkXbwI/edit?hl=en&forcehl=1&gid=0#gid=0'  
];

const saDir = path.join(__dirname, 'serviceAccounts');
const CREDENTIAL_FILES = fs.readdirSync(saDir)
  .filter(file => file.endsWith('.json'))
  .map(file => path.join(saDir, file));


let currentClientIndex = 0;

const getNextSheetsClient = () => {
  const credentialsFile = CREDENTIAL_FILES[currentClientIndex];
  const auth = new JWT({
    keyFile: credentialsFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  currentClientIndex = (currentClientIndex + 1) % CREDENTIAL_FILES.length;
  return sheets;
};

const getNextDriveClient = () => {
  const credentialsFile = CREDENTIAL_FILES[currentClientIndex];
  const auth = new JWT({
    keyFile: credentialsFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const drive = google.drive({ version: 'v3', auth });
  
  const saNumber = currentClientIndex + 1;
  console.log(`    Using Service Account ${saNumber}/${CREDENTIAL_FILES.length}`);
  
  currentClientIndex = (currentClientIndex + 1) % CREDENTIAL_FILES.length;
  return drive;
};

const listFilesInFolder = async (folderId) => {
  const drive = getNextDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)'
  });
  return res.data.files;
};

// Log số Service Accounts khi server start
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   SERVICE ACCOUNTS CONFIGURATION`);
console.log(`   Tổng số: ${CREDENTIAL_FILES.length} accounts`);
console.log(`   Đường dẫn: ${saDir}`);
CREDENTIAL_FILES.forEach((file, idx) => {
  const fileName = path.basename(file);
  console.log(`   ${idx + 1}. ${fileName}`);
});
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

module.exports = {
  getNextSheetsClient,
  getNextDriveClient,
  listFilesInFolder,
  CREDENTIAL_FILES,
};
