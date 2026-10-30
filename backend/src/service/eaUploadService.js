const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * EA Upload Service - Handle EA folder upload and bot folder extraction
 * Files stored temporarily in memory only (no permanent storage)
 */
class EAUploadService {
  /**
   * Extract bot folders from uploaded files in memory
   * @param {Object} uploadedFiles - Object with file paths: { [filename]: Buffer }
   * @returns {string[]} - Array of unique bot folder names
   */
  static extractBotFoldersFromUpload(uploadedFiles) {
    const botFolders = new Set();

    // Group files by their folder structure
    // uploadedFiles might contain relative paths like: "112 - EWO_MA_RSI/112 - EWO_MA_RSI.ex5"
    for (const filePath of Object.keys(uploadedFiles)) {
      // Extract folder name (part before first filename)
      const parts = filePath.split(/[\\/]/);
      
      if (parts.length >= 1) {
        const potentialFolderName = parts[0];
        
        // Check if it matches bot folder pattern: "NNN - *" or "NNN-*"
        if (/^\d{3}\s*[-\s]/.test(potentialFolderName)) {
          botFolders.add(potentialFolderName);
        }
      }
    }

    const folderArray = Array.from(botFolders).sort();
    console.log(`✅ Extracted bot folders from uploaded files:`, folderArray);
    return folderArray;
  }

  /**
   * Extract bot folders from file structure
   * Used when files are temporarily stored
   * @param {string} tempFolderPath - Path to temporary folder containing extracted files
   * @returns {string[]} - Array of unique bot folder names
   */
  static extractBotFoldersFromPath(tempFolderPath) {
    try {
      if (!fs.existsSync(tempFolderPath)) {
        console.warn(`⚠️  Temp folder not found: ${tempFolderPath}`);
        return [];
      }

      const items = fs.readdirSync(tempFolderPath, { withFileTypes: true });
      
      const botFolders = items
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .filter(name => {
          // Must start with 3-digit number followed by space or dash
          // e.g., "112 - EWO_MA_RSI" or "113-RSI_Bollinger"
          return /^\d{3}\s*[-\s]/.test(name);
        })
        .sort();

      console.log(`✅ Extracted ${botFolders.length} bot folder(s) from path:`, botFolders);
      return botFolders;
    } catch (error) {
      console.error(`❌ Error extracting bot folders from path:`, error.message);
      return [];
    }
  }

  /**
   * Create temporary directory for uploads
   * @returns {string} - Path to temp directory
   */
  static createTempDirectory() {
    const tempDir = path.join(os.tmpdir(), `ea-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      console.log(`📁 Created temp directory: ${tempDir}`);
      return tempDir;
    } catch (error) {
      console.error(`❌ Error creating temp directory:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up temporary directory
   * @param {string} tempFolderPath - Path to temp directory to delete
   */
  static cleanupTempDirectory(tempFolderPath) {
    try {
      if (fs.existsSync(tempFolderPath)) {
        fs.rmSync(tempFolderPath, { recursive: true, force: true });
        console.log(`🗑️  Cleaned up temp directory: ${tempFolderPath}`);
      }
    } catch (error) {
      console.error(`❌ Error cleaning up temp directory:`, error.message);
      // Don't throw - cleanup failure shouldn't break the flow
    }
  }

  /**
   * Get all .ex5 files from uploaded EA folder
   * @param {string} tempFolderPath - Path to temp folder
   * @returns {string[]} - Array of .ex5 file paths
   */
  static getExpertFiles(tempFolderPath) {
    const expertFiles = [];

    try {
      const walkDir = (dir) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dir, item.name);

          if (item.isDirectory()) {
            walkDir(fullPath);
          } else if (item.name.toLowerCase().endsWith('.ex5')) {
            const relativePath = path.relative(tempFolderPath, fullPath);
            expertFiles.push(relativePath);
          }
        }
      };

      walkDir(tempFolderPath);
      console.log(`📦 Found ${expertFiles.length} .ex5 files`);
      return expertFiles;
    } catch (error) {
      console.error(`❌ Error scanning for .ex5 files:`, error.message);
      return [];
    }
  }
}

module.exports = EAUploadService;
