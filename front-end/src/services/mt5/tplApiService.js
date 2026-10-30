/**
 * TPL API Service - Call backend API to save TPL files
 */
class TplApiService {
  // Use relative path so it works on any domain/port
  static API_BASE = '/api';

  /**
   * Send TPL files to backend for saving to 2 locations
   */
  static async saveTplFilesToServer(outputFolderPath, tplFiles) {
    try {
      console.log(`📤 Sending ${tplFiles.length} TPL files to server for saving...`);
      
      const response = await fetch(`${this.API_BASE}/mt5/save-tpl-files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          outputFolderPath: outputFolderPath,
          tplFiles: tplFiles
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log(`✅ Server response:`, result);

      return {
        success: true,
        message: result.message,
        filesFolder: result.filesFolder,
        templatesFolder: result.templatesFolder,
        saved: result.saved,
        errors: result.errors,
        totalSaved: result.totalSaved,
        totalErrors: result.totalErrors
      };
    } catch (error) {
      console.error('❌ Error calling server:', error.message);
      throw new Error(`Failed to save files to server: ${error.message}`);
    }
  }

  /**
   * Validate MQL5 path with server
   */
  static async validatePath(folderPath) {
    try {
      const response = await fetch(`${this.API_BASE}/validate-path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderPath })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid path');
      }

      return result;
    } catch (error) {
      console.error('❌ Path validation error:', error.message);
      throw error;
    }
  }

  /**
   * Find actual .ex5 file in bot folder
   */
  static async findExpertFile(botFolderPath) {
    try {
      console.log(`🔍 Finding .ex5 file in: ${botFolderPath}`);
      
      const response = await fetch(`${this.API_BASE}/find-expert-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ botFolderPath })
      });

      const result = await response.json();

      if (!response.ok) {
        console.warn('❌ Failed to find expert file:', result.error);
        return null;
      }

      console.log(`✅ Expert file found: ${result.expertFile}`);
      return result.expertFile;
    } catch (error) {
      console.error('❌ Error finding expert file:', error.message);
      return null;
    }
  }

  /**
   * List all bot folders in EA folder
   * Auto-discover bot folder names from filesystem
   */
  static async listBotFolders(eaFolderPath) {
    try {
      console.log(`🔍 Listing bot folders in: ${eaFolderPath}`);
      
      const response = await fetch(`${this.API_BASE}/list-bot-folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ eaFolderPath })
      });

      const result = await response.json();

      if (!response.ok) {
        console.warn('❌ Failed to list bot folders:', result.error);
        return [];
      }

      console.log(`✅ Found ${result.folderCount} bot folder(s):`, result.folders);
      return result.folders;
    } catch (error) {
      console.error('❌ Error listing bot folders:', error.message);
      return [];
    }
  }

  /**
   * Check if server is available
   */
  static async checkServerAvailable() {
    try {
      await fetch(`${this.API_BASE}/validate-path`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderPath: 'C:\\test' }),
        timeout: 3000
      });
      return true;
    } catch (error) {
      console.warn('⚠️  Server not available:', error.message);
      return false;
    }
  }
}

export default TplApiService;
