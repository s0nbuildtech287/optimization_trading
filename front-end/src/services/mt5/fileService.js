/**
 * File service - handles all file operations
 */
class FileService {
  /**
   * Download file from browser
   */
  static downloadFile(filename, content) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  /**
   * Generate a ZIP file with multiple TPL files (client-side)
   * Returns a blob that can be downloaded
   */
  static createZipBlob(tplFiles) {
    // For client-side ZIP creation, we need a library like JSZip
    // This is a placeholder - will handle in exportService
    return null;
  }

  /**
   * Create a batch of TPL files as downloadable objects
   */
  static prepareTplFiles(tplFiles) {
    // Return array of {filename, content} for download
    return tplFiles;
  }
}

export default FileService;
