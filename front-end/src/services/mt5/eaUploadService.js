/**
 * EA Upload Service - Upload EA folder and get bot folders
 */
class EAUploadService {
  static API_BASE = '/api/mt5';

  /**
   * Convert File to base64 string
   * @param {File} file - File object
   * @returns {Promise<string>} - Base64 encoded content
   */
  static fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:...;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extract MQL5 folder path from uploaded files
   * Example: AllBot/file.mq5 or AllBot/subfolder/file.mq5
   * Returns: the MQL5 directory that contains AllBot (or the parent folder)
   * @param {File[]} files - Array of File objects
   * @returns {string} - Extracted MQL5 path or empty string
   */
  static extractMQL5Path(files) {
    if (!files || files.length === 0) return '';
    
    // Get first file's relative path
    const firstFile = files[0];
    const relativePath = firstFile.webkitRelativePath || firstFile.name;
    
    console.log(`🔍 Extracting MQL5 path from: ${relativePath}`);
    
    // Split path by / or \
    const parts = relativePath.replace(/\\/g, '/').split('/');
    
    if (parts.length < 2) return '';
    
    // Remove the actual filename and last parts
    // If path is: AllBot/001-Bot/file.mq5 or AllBot/file.mq5
    // We want to remove file.mq5 to get AllBot folder level
    
    // For webkitdirectory, the folder name is usually at index 0 or 1
    // Example: "AllBot/001-Bot/file.mq5" -> parts = ["AllBot", "001-Bot", "file.mq5"]
    // We want to detect that user selected "AllBot" as the EA folder
    // So the MQL5 path would be parent of AllBot
    
    // Return the EA folder name (like "AllBot") - user will input full MQL5 path
    const eaFolderName = parts[0];
    console.log(`   📁 Detected EA folder: ${eaFolderName}`);
    
    return eaFolderName;
  }

  /**
   * Upload EA folder and extract bot folders
   * @param {File[]} files - Array of File objects from webkitdirectory input
   * @returns {Promise<{folders: string[], filesCount: number}>}
   */
  static async uploadEAFolder(files) {
    try {
      if (!files || files.length === 0) {
        throw new Error('No files selected');
      }

      console.log(`📤 Uploading ${files.length} files from EA folder...`);

      // Extract MQL5 folder name from uploaded files
      const eaFolderName = this.extractMQL5Path(files);

      // Convert files to base64 JSON format
      const filesData = [];
      
      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name;        
        // Convert file to base64
        const base64Content = await this.fileToBase64(file);
        
        filesData.push({
          path: relativePath,
          name: file.name,
          size: file.size,
          content: base64Content
        });
      }

      // Send JSON to backend
      const response = await fetch(`${this.API_BASE}/upload-ea-folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: filesData,
          eaFolderName: eaFolderName
        })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Server error: ${response.status}`;
        
        try {
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } else {
            // Likely HTML error page
            const text = await response.text();
            if (text.includes('<') || response.status >= 500) {
              errorMessage = `Server error (${response.status}). Please ensure the uploaded folder contains valid .mq5 or .ex5 files.`;
            } else {
              errorMessage = text || errorMessage;
            }
          }
        } catch (parseError) {
          // Failed to parse response
          errorMessage = `Server error (${response.status}). Invalid response format.`;
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      console.log(`✅ Upload successful:`, result);
      console.log(`   Bot folders found: ${result.folderCount}`);
      console.log(`   .ex5 files: ${result.expertFilesCount}`);
      if (result.mql5Path) {
        console.log(`   MQL5 Path: ${result.mql5Path}`);
      }

      return {
        success: true,
        folders: result.folders || [],
        folderCount: result.folderCount,
        filesCount: result.filesCount,
        expertFilesCount: result.expertFilesCount,
        eaFolderName: eaFolderName,
        mql5Indicator: result.mql5Indicator || '',
        mql5Path: result.mql5Path || '', // Add MQL5 path to return object
        message: result.message
      };
    } catch (error) {
      console.error('❌ Error uploading EA folder:', error.message);
      throw new Error(`Failed to upload EA folder: ${error.message}`);
    }
  }
}

export default EAUploadService;
