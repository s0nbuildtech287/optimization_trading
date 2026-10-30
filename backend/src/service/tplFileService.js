const fs = require('fs');
const path = require('path');

/**
 * TPL File Service - Handle saving TPL files to multiple locations
 */
class TplFileService {
  /**
   * Save TPL file to 2 locations:
   * 1. MQL5/Files
   * 2. MQL5/Profiles/Templates
   * @param {string} filesFolder - Path to MQL5/Files folder
   * @param {Array} tplFiles - Array of TPL file objects with {filename, content}
   * @param {string} templatesFolder - Path to MQL5/Profiles/Templates folder (optional)
   */
  static async saveTplFiles(filesFolder, tplFiles, templatesFolder = null) {
    if (!filesFolder || !tplFiles || tplFiles.length === 0) {
      throw new Error('Invalid parameters: filesFolder and tplFiles are required');
    }

    // If templatesFolder not provided, derive from filesFolder
    if (!templatesFolder) {
      templatesFolder = filesFolder.replace(/Files$/i, 'Profiles\\Templates');
    }

    console.log(`📁 Saving ${tplFiles.length} TPL files:`);
    console.log(`   Location 1: ${filesFolder}`);
    console.log(`   Location 2: ${templatesFolder}`);

    const results = {
      saved: [],
      errors: [],
      filesFolder: filesFolder,
      templatesFolder: templatesFolder
    };

    // Save each TPL file to both locations
    for (const tplFile of tplFiles) {
      try {
        const { filename, content } = tplFile;
        
        // Ensure directories exist
        this.ensureDirectoryExists(filesFolder);
        this.ensureDirectoryExists(templatesFolder);

        // Save to location 1: MQL5/Files
        const filesPath = path.join(filesFolder, filename);
        fs.writeFileSync(filesPath, content, 'utf8');
        console.log(`✅ Saved to MQL5/Files: ${filename}`);

        // Save to location 2: MQL5/Profiles/Templates
        const templatesPath = path.join(templatesFolder, filename);
        fs.writeFileSync(templatesPath, content, 'utf8');
        console.log(`✅ Saved to Templates: ${filename}`);

        results.saved.push({
          filename: filename,
          filesPath: filesPath,
          templatesPath: templatesPath
        });
      } catch (error) {
        console.error(`❌ Error saving ${tplFile.filename}:`, error.message);
        results.errors.push({
          filename: tplFile.filename,
          error: error.message
        });
      }
    }

    console.log(`\n✨ Complete! ${results.saved.length}/${tplFiles.length} files saved successfully`);

    if (results.errors.length > 0) {
      console.warn(`⚠️  ${results.errors.length} files failed to save`);
    }

    return results;
  }

  /**
   * Find actual .ex5 file in bot folder
   * Searches for .ex5 files in the specified bot folder path
   * Priority:
   * 1. Match files by bot folder name prefix (e.g., "112" from "112 - EWO_MA_RSI")
   * 2. If multiple matches, prefer longest name (most specific)
   * 3. Otherwise return first .ex5 found
   * 
   * Example:
   * - Bot folder: "112 - EWO_MA_RSI"
   * - Files in folder: ["112 - EWO_MA_RSI_Test.ex5", "112 - EWO_MA_RSI_Volata.ex5"]
   * - Returns: "112 - EWO_MA_RSI_Volata.ex5" (longest matching file)
   * 
   * @param {string} botFolderPath - Full path to bot folder (e.g., C:\...\MQL5\Experts\AllBot\112 - EWO_MA_RSI)
   * @returns {string|null} - Actual .ex5 filename found or null
   */
  static findExpertFile(botFolderPath) {
    try {
      if (!botFolderPath || !fs.existsSync(botFolderPath)) {
        console.warn(`❌ Bot folder not found: ${botFolderPath}`);
        return null;
      }

      // Extract bot folder name (e.g., "112 - EWO_MA_RSI")
      const botFolderName = path.basename(botFolderPath);
      console.log(`🔍 Searching .ex5 files in: ${botFolderName}`);

      // List all files in the bot folder
      const files = fs.readdirSync(botFolderPath);
      
      // Filter for .ex5 files
      const ex5Files = files.filter(file => file.toLowerCase().endsWith('.ex5'));
      
      if (ex5Files.length === 0) {
        console.warn(`⚠️  No .ex5 file found in: ${botFolderPath}`);
        return null;
      }

      if (ex5Files.length === 1) {
        console.log(`✅ Found .ex5 file: ${ex5Files[0]}`);
        return ex5Files[0];
      }

      // Multiple .ex5 files found - try to match by magic prefix
      // Extract prefix from bot folder name (e.g., "112" from "112 - EWO_MA_RSI")
      const botPrefix = botFolderName.split(/[\s\-]+/)[0];
      console.log(`  Prefix: ${botPrefix}, Files: ${ex5Files.join(', ')}`);
      
      // Find files starting with the bot prefix
      const matchedByPrefix = ex5Files.filter(file => file.startsWith(botPrefix));
      
      if (matchedByPrefix.length > 0) {
        // Sort by length descending - prefer longer/more specific names
        matchedByPrefix.sort((a, b) => b.length - a.length);
        console.log(`✅ Matched by prefix "${botPrefix}": ${matchedByPrefix[0]}`);
        return matchedByPrefix[0];
      }

      // No prefix match - sort all by length and use longest
      ex5Files.sort((a, b) => b.length - a.length);
      console.log(`⚠️  No prefix match found, using longest name: ${ex5Files[0]}`);
      return ex5Files[0];
      
    } catch (error) {
      console.error(`❌ Error finding expert file:`, error.message);
      return null;
    }
  }

  /**
   * Ensure directory exists, create if needed
   */
  static ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`📁 Created directory: ${dirPath}`);
    }
  }

  /**
   * List all bot folder names in the EA folder
   * Returns folders that match pattern: "NNN - *" (with magic number prefix)
   * 
   * @param {string} eaFolderPath - Full path to EA folder (e.g., C:\...\MQL5\Experts\AllBot)
   * @returns {string[]} - Array of folder names (e.g., ["112 - EWO_MA_RSI", "113 - RSI_Bollinger"])
   */
  static listBotFolders(eaFolderPath) {
    try {
      if (!eaFolderPath || !fs.existsSync(eaFolderPath)) {
        console.warn(`❌ EA folder not found: ${eaFolderPath}`);
        return [];
      }

      console.log(`🔍 Scanning bot folders in: ${eaFolderPath}`);

      // List all items in the EA folder
      const items = fs.readdirSync(eaFolderPath, { withFileTypes: true });
      
      // Filter for directories and extract bot folder names
      const botFolders = items
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .filter(name => {
          // Must start with 3-digit number followed by space or dash
          // e.g., "112 - EWO_MA_RSI" or "113-RSI_Bollinger"
          return /^\d{3}\s*[-\s]/.test(name);
        })
        .sort();

      console.log(`✅ Found ${botFolders.length} bot folder(s):`);
      botFolders.forEach(folder => console.log(`   - ${folder}`));

      return botFolders;
    } catch (error) {
      console.error(`❌ Error listing bot folders:`, error.message);
      return [];
    }
  }

  /**
   * Validate MQL5 folder path
   */
  static validateMQL5Path(folderPath) {
    if (!folderPath || folderPath.trim() === '') {
      throw new Error('Folder path is required');
    }

    // Check if path contains MQL5 and Files
    if (!folderPath.match(/MQL5[\\\/]Files$/i)) {
      throw new Error('Invalid path: Must end with MQL5\\Files or MQL5/Files');
    }

    return true;
  }

  /**
   * Validate TPL files structure
   */
  static validateTplFiles(tplFiles) {
    if (!Array.isArray(tplFiles)) {
      throw new Error('tplFiles must be an array');
    }

    if (tplFiles.length === 0) {
      throw new Error('No TPL files provided');
    }

    // Validate each file has required properties
    for (const file of tplFiles) {
      if (!file.filename || !file.content) {
        throw new Error('Each TPL file must have "filename" and "content" properties');
      }
    }

    return true;
  }
}

module.exports = TplFileService;
