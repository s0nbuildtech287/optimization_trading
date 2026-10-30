/**
 * Download Service - Handle downloading TPL files to local machine
 */

/**
 * Download TPL files as a ZIP archive
 * @param {Array} tplFiles - Array of TPL file objects with {filename, content}
 * @param {String} botVariantSuffix - Optional bot variant suffix to include in ZIP filename
 */
export const downloadTPLFiles = async (tplFiles, botVariantSuffix = '') => {
  if (!tplFiles || tplFiles.length === 0) {
    throw new Error('No TPL files to download');
  }

  try {
    // Dynamic import of JSZip
    const JSZip = (await import('jszip')).default;
    
    const zip = new JSZip();
    
    // Add each TPL file to the ZIP
    tplFiles.forEach(file => {
      zip.file(file.filename, file.content);
    });
    
    // Generate ZIP blob
    const blob = await zip.generateAsync({ type: 'blob' });
    
    // Create download link and trigger download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Build filename with optional suffix
    const timestamp = new Date().getTime();
    const suffixPart = botVariantSuffix ? `${botVariantSuffix}_` : '';
    link.download = `MT5_Templates_${suffixPart}${timestamp}.zip`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`✅ Downloaded ${tplFiles.length} TPL files as ZIP${botVariantSuffix ? ` (suffix: ${botVariantSuffix})` : ''}`);
  } catch (error) {
    console.error('❌ Error downloading TPL files:', error);
    throw new Error(`Failed to download files: ${error.message}`);
  }
};

/**
 * Download individual TPL files (alternative method without ZIP)
 * @param {Array} tplFiles - Array of TPL file objects with {filename, content}
 */
export const downloadTPLFilesIndividual = async (tplFiles) => {
  if (!tplFiles || tplFiles.length === 0) {
    throw new Error('No TPL files to download');
  }

  try {
    for (const file of tplFiles) {
      const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Small delay between downloads to avoid browser restrictions
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Downloaded ${tplFiles.length} TPL files individually`);
  } catch (error) {
    console.error('❌ Error downloading TPL files:', error);
    throw new Error(`Failed to download files: ${error.message}`);
  }
};
