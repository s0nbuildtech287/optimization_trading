import ExcelService from './excelService';
import TplGenerator from './tplGenerator';
import TplApiService from './tplApiService';
import { SUFFIX_MAP, BATCH_SIZE, PERIOD_MAP } from './constants';

/**
 * Export service - main business logic
 */
class ExportService {
  /**
   * TimeFrame mapping (T in magic number)
   * 1: M1, 2: M5, 3: M15, 4: M30, 5: H1, 6: H4, 7: Daily, 8: Weekly
   */
  static TIMEFRAME_MAP = {
    'M1': '1',
    'M5': '2',
    'M15': '3',
    'M30': '4',
    'H1': '5',
    'H4': '6',
    'DAILY': '7',
    'D1': '7',
    'WEEKLY': '8',
    'W1': '8'
  };

  /**
   * Asset code mapping (BB in magic number) - hardcoded values
   */
  static ASSET_MAP = {
    'BTCUSD': '01',
    'ETHUSD': '02',
    'XAUUSD': '03',
    'XAGUSD': '04',
    'USOIL': '05',
    'US500': '06',
    'JP225': '07',
    'HK50': '08',
    'DE30': '09'
  };

  /**
   * Extract TimeFrame from filename (e.g., "112BTCUSDH1OB.xlsx" → "H1", "112US500H4OB" → "H4")
   */
  static extractTimeFrame(filename) {
    // Remove extension first (e.g., "112BTCUSDH1OB.xlsx" → "112BTCUSDH1OB")
    const nameWithoutExt = filename.replace(/\.(xlsx?|csv)$/i, '');
    
    // Match H1, H4, M1, M5, M15, M30, D1, W1, DAILY, WEEKLY
    // Lookahead ensures these are followed by command characters (OB, OS, etc.) or end of string
    const match = nameWithoutExt.match(/(M1|M5|M15|M30|H1|H4|DAILY|D1|WEEKLY|W1)(?=[A-Z]*$)/i);
    const tf = match ? match[1].toUpperCase() : 'H1'; // Default to H1
    
    console.log(`  ⏰ TimeFrame Extract: "${filename}" → "${nameWithoutExt}" → "${tf}"`);
    return tf;
  }

  /**
   * Get TimeFrame digit from TimeFrame code
   */
  static getTimeFrameDigit(timeframe) {
    return this.TIMEFRAME_MAP[timeframe.toUpperCase()] || '5'; // Default to H1 (5)
  }

  /**
   * Get SelectedTimeframe value from filename for MT5 input
   * e.g., "110JPP225H4OB.xlsx" → "H4" → "16388"
   * Uses PERIOD_MAP.input for the actual MT5 timeframe value
   */
  static getSelectedTimeframeValue(filename) {
    const timeFrame = this.extractTimeFrame(filename);
    const periodData = PERIOD_MAP[timeFrame];
    const value = periodData ? periodData.input : PERIOD_MAP['H1'].input;
    console.log(`  📊 SelectedTimeframe: "${filename}" → "${timeFrame}" → "${value}"`);
    return value;
  }

  /**
   * Calculate Magic Number with 9-digit format: [A][BB][T][C]0[DDD]
   * A (1 digit): Backtest Group (user input 1-9)
   * BB (2 digits): Asset code (hardcoded mapping: BTCUSD→01, ETHUSD→02, etc.)
   * T (1 digit): TimeFrame (1=M1, 2=M5, 3=M15, 4=M30, 5=H1, 6=H4, 7=Daily, 8=Weekly)
   * C (1 digit): Command (0 for Sell/OS, 1 for Buy/OB)
   * 0: Fixed zero
   * DDD (3 digits): Bot code (extracted from first 3 digits of filename)
   * 
   * Example: File="112BTCUSDH1OB", backtestGroup=1
   * A=1, BB=01(BTCUSD), T=5(H1), C=1(OB), 0=0, DDD=112
   * Result: 101510112 (9 digits)
   */
  static calculateMagicNumber(backtestGroup, symbol, filename, command) {
    if (!backtestGroup) {
      throw new Error('Backtest Group (A) is required');
    }

    // Remove extension first (e.g., "112BTCUSDH1OB.xlsx" → "112BTCUSDH1OB")
    const nameWithoutExt = filename.replace(/\.(xlsx?|csv)$/i, '');

    // Ensure backtestGroup is string and single digit
    const groupStr = String(backtestGroup).trim().substring(0, 1);
    console.log(`  📊 Backtest Group (A): ${backtestGroup} → ${groupStr}`);

    // Extract 3-digit bot code from filename (e.g., "112BTCUSDH1OB" → "112")
    const botCodeMatch = nameWithoutExt.match(/^(\d{3})/);
    const botCode = botCodeMatch ? botCodeMatch[1] : '001';
    console.log(`  📊 Bot Code (DDD): ${nameWithoutExt} → ${botCode}`);

    // Get asset code from symbol mapping (ensure 2 digits)
    const assetCode = (this.ASSET_MAP[symbol] || '00').toString();
    console.log(`  📊 Asset Code (BB): ${symbol} → ${assetCode}`);

    // Extract TimeFrame from filename
    const timeFrame = this.extractTimeFrame(filename);
    const timeFrameDigit = this.getTimeFrameDigit(timeFrame);
    console.log(`  📊 TimeFrame (T): ${timeFrame} → ${timeFrameDigit}`);

    // Determine command digit: 1 = Buy/OB, 0 = Sell/OS
    // Check if filename (without extension) ends with OB (Buy) or OS (Sell)
    const isBuy = nameWithoutExt.toUpperCase().endsWith('OB');
    const commandDigit = isBuy ? '1' : '0';
    const commandStr = isBuy ? 'OB (Buy)' : 'OS (Sell)';
    console.log(`  📊 Command (C): ${nameWithoutExt.substring(nameWithoutExt.length - 2)} → ${commandDigit} (${commandStr})`);

    // Combine: [A][BB][T][C]0[DDD]
    const magicNumber = `${groupStr}${assetCode}${timeFrameDigit}${commandDigit}0${botCode}`;
    console.log(`  ✅ Magic Number Result: ${magicNumber}`);
    console.log(`     Format: [${groupStr}][${assetCode}][${timeFrameDigit}][${commandDigit}]0[${botCode}]`);

    return magicNumber;
  }

  /**
   * Extract command from filename (OB = Buy, OS = Sell)
   * Returns: 'OB' or 'OS'
   */
  static extractCommand(filename) {
    const match = filename.match(/([OU]S?)\./i) || filename.match(/([OU]S?)$/i);
    if (match) {
      return match[1].toUpperCase();
    }
    return 'OB'; // Default to Buy
  }

  /**
   * Extract relative EA folder path from full path
   * Input: C:\...\MQL5\Experts\AllBot
   * Output: Experts\AllBot
   */
  static extractEAFolderRelative(eaFolderPath) {
    // Match from "Experts" folder onwards
    // eslint-disable-next-line no-useless-escape
    const expertsMatch = eaFolderPath.match(/Experts[\/\\].+$/i);
    if (expertsMatch) {
      return expertsMatch[0].replace(/\//g, '\\');
    }
    throw new Error('Invalid EA path: Must contain Experts folder');
  }

  /**
   * Extract MQL5 folder from EA folder path
   * Input: C:\...\MQL5\Experts\AllBot
   * Output: C:\...\MQL5\Files
   */
  static extractMQL5FilesPath(eaFolderPath) {
    // Match MQL5 folder and everything up to it
    // eslint-disable-next-line no-useless-escape
    const mql5Match = eaFolderPath.match(/^(.+[\/\\]MQL5)[\/\\]/i);
    if (mql5Match) {
      return mql5Match[1] + '\\Files';
    }
    throw new Error('Invalid EA path: Must contain MQL5 folder');
  }

  /**
   * Process one Excel file
   * 
   * Matching Strategy:
   * 1. Extract 3-digit magic prefix from Excel filename (e.g., "112" from "112BTCUSDH1OB")
   * 2. Find bot folder with same prefix (e.g., "112 - EWO_MA_RSI")
   * 3. Search bot folder for actual .ex5 file (e.g., "112 - EWO_MA_RSI_Test.ex5")
   * 4. Use actual .ex5 filename in TPL template
   */
  static async processOneFile(excelFile, eaFolderPath, botFolders, outputFolderPath, isUploadMode = false) {

    // Extract 3-digit magic prefix from filename (e.g., "112BTCUSDH1OB" → "112")
    const magicPrefixMatch = excelFile.name.match(/^(\d{3})/);
    if (!magicPrefixMatch) {
      console.log(`  ❌ Skip - No 3-digit prefix`);
      return null;
    }
    const magicPrefix = magicPrefixMatch[1];
    console.log(`  Magic Number: ${magicPrefix}`);

    // Extract order number and timeframe from filename
    const orderMatch = excelFile.name.match(/^\d{3}/);
    if (!orderMatch) {
      console.log("  ❌ Skip (no 3-digit order)");
      return null;
    }

    const tfMatch = excelFile.name.match(/H[14][A-Z]{2}/);
    if (!tfMatch) {
      console.log("  ❌ Skip (invalid timeframe)");
      return null;
    }

    const suffix = SUFFIX_MAP[tfMatch[0]];
    if (!suffix) {
      console.log(`  ❌ Skip (unknown TF suffix: ${tfMatch[0]})`);
      return null;
    }

    const magicNumber = orderMatch[0] + suffix;
    console.log(`  Magic Number with Suffix: ${magicNumber}`);

    try {
      // Read Excel
      const rows = await ExcelService.readSheetFirstTab(excelFile);

      // Extract metadata
      const { symbol, periodChart, periodInput, expert } = ExcelService.extractMetadata(rows);
      console.log(`  Symbol: ${symbol}, Period: ${periodInput}, Expert: ${expert}`);

      // Parse inputs
      const inputs = ExcelService.parseInputs(rows);

      if (inputs.length === 0) {
        console.log("  ⚠️  No inputs found");
        return null;
      }

      // Get SelectedTimeframe value from filename instead of periodInput
      const selectedTimeframeValue = this.getSelectedTimeframeValue(excelFile.name);

      // Build inputs section with timeframe from filename
      const inputsSection = TplGenerator.buildInputsSection(inputs, magicNumber, selectedTimeframeValue);

      // Find bot folder by matching magic prefix
      let actualBotName = TplGenerator.findBotFolderByMagicPrefix(magicPrefix, botFolders);

      if (actualBotName) {
        console.log(`  ✅ Found bot folder: ${actualBotName}`);
      } else {
        // Fallback: extract bot name from expert string
        const botNameMatch = expert.match(/\d+\s*-\s*(.+)/);
        actualBotName = botNameMatch ? botNameMatch[1].trim() : expert;
        console.log(`  ⚠️  Using fallback bot name: ${actualBotName}`);
      }

      // Use actual bot name as .ex5 filename (will be replaced with real file discovery)
      let actualExFileName = `${actualBotName}.ex5`;
      console.log(`  📂 Bot folder: ${actualBotName}`);

      // Try to find actual .ex5 file from bot folder via backend
      // Only if path looks like a valid local MQL5 path (not upload mode)
      const isValidMQL5Path = /MQL5/i.test(eaFolderPath) && !isUploadMode;
      
      if (isValidMQL5Path) {
        try {
          // Build full bot folder path
          const botFolderFullPath = eaFolderPath + '\\' + actualBotName;
          console.log(`  🔍 Searching: ${botFolderFullPath}`);
          
          const foundExFile = await TplApiService.findExpertFile(botFolderFullPath);
          if (foundExFile) {
            actualExFileName = foundExFile;
            console.log(`  ✅ Found .ex5: ${actualExFileName}`);
          } else {
            console.log(`  ⚠️  No .ex5 found, using: ${actualExFileName}`);
          }
        } catch (error) {
          console.warn(`  ⚠️  Error finding .ex5:`, error.message);
        }
      } else {
        console.log(`  ℹ️  Skipping .ex5 lookup (upload mode) - using: ${actualExFileName}`);
      }

      // Extract relative EA folder path (e.g., "Experts\AllBot")
      // Only if it's a valid MQL5 path
      let eaFolderPathRelative = 'Experts\\AllBot'; // default fallback
      
      if (isValidMQL5Path || /MQL5/i.test(eaFolderPath)) {
        try {
          eaFolderPathRelative = this.extractEAFolderRelative(eaFolderPath);
        } catch (error) {
          console.warn(`  ⚠️  Using default EA path`);
        }
      }
      
      console.log(`  📁 Relative path: ${eaFolderPathRelative}`);
      console.log(`  📝 TPL output: name=${actualBotName}, file=${actualExFileName}`);

      // Generate TPL content with relative paths
      const tplContent = TplGenerator.generateTplContent(
        symbol, periodChart, periodInput, expert, inputsSection, 
        eaFolderPathRelative, actualBotName, actualExFileName
      );

      const tplName = excelFile.name.replace(/\.xlsx?$/i, '') + ".tpl";
      console.log(`  ✔️  Created: ${tplName}`);

      // Save TPL files to both locations
      if (outputFolderPath) {
        const savePaths = TplGenerator.saveTplFile(outputFolderPath, tplName, tplContent);
        if (savePaths) {
          console.log(`  📁 Will save to both locations`);
        }
      }

      return {
        filename: tplName,
        content: tplContent,
        metadata: { symbol, periodInput: selectedTimeframeValue, expert, magicNumber }
      };
    } catch (error) {
      console.error(`  ❌ Error processing ${excelFile.name}:`, error);
      return null;
    }
  }

  /**
   * Main export function - returns TPL files for download
   * Automatically derives save paths from EA folder path:
   * 1. MQL5/Files (auto-derived)
   * 2. MQL5/Profiles/Templates (auto-derived)
   */
  static async exportSettingsToSetFiles(excelFiles, eaFolderPath, botFolders, isUploadMode = false) {
    console.log("Starting exportSettingsToSetFiles...");
    console.log("Parameters:", { excelFilesCount: excelFiles.length, eaFolderPath, isUploadMode });

    if (excelFiles.length === 0) {
      throw new Error('No Excel files selected');
    }

    if (!eaFolderPath || eaFolderPath.trim() === '') {
      throw new Error('EA folder path is required');
    }

    // Auto-derive MQL5/Files path from EA folder path
    let outputFolderPath;
    
    if (isUploadMode) {
      // When upload mode: user provided MQL5 path, derive Files subfolder
      // Possible inputs:
      // - C:\Users\...\MQL5 (just MQL5 folder)
      // - C:\Users\...\MQL5\ (with trailing slash)
      // - C:\Users\...\MQL5\Files (already has Files subfolder)
      let mql5Path = eaFolderPath.trim();
      
      // Remove trailing slashes
      while (mql5Path.endsWith('\\') || mql5Path.endsWith('/')) {
        mql5Path = mql5Path.slice(0, -1);
      }
      
      // Check if contains MQL5 folder
      if (!mql5Path.toLowerCase().includes('mql5')) {
        throw new Error('Invalid MQL5 path: Must contain MQL5 folder');
      }
      
      const lowerPath = mql5Path.toLowerCase();
      
      // If path ends with /Files, use as-is (already the Files folder)
      if (lowerPath.endsWith('\\files') || lowerPath.endsWith('/files')) {
        outputFolderPath = mql5Path;
      }
      // If path ends with /MQL5, append /Files
      else if (lowerPath.endsWith('\\mql5') || lowerPath.endsWith('mql5')) {
        outputFolderPath = mql5Path + '\\Files';
      }
      // Otherwise append /MQL5/Files
      else {
        outputFolderPath = mql5Path + '\\MQL5\\Files';
      }
      
      console.log(`✔ Upload mode - User input: ${eaFolderPath.trim()}`);
      console.log(`✔ Normalized MQL5 path: ${mql5Path}`);
      console.log(`✔ Output folder: ${outputFolderPath}`);
    } else {
      // When local mode: derive from EA folder path containing Experts
      try {
        outputFolderPath = this.extractMQL5FilesPath(eaFolderPath);
        console.log(`✔ Derived MQL5/Files path: ${outputFolderPath}`);
      } catch (error) {
        throw new Error(`Failed to derive MQL5 path: ${error.message}`);
      }
    }

    const tplFiles = [];

    // Process in batches
    for (let i = 0; i < excelFiles.length; i += BATCH_SIZE) {
      const batch = excelFiles.slice(i, i + BATCH_SIZE);

      console.log(`🔷 Running batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)...`);

      const batchResults = await Promise.all(
        batch.map(f => this.processOneFile(f, eaFolderPath, botFolders, outputFolderPath, isUploadMode))
      );

      // Filter out null results
      const validResults = batchResults.filter(r => r !== null);
      tplFiles.push(...validResults);

      console.log(`✔ Batch ${Math.floor(i / BATCH_SIZE) + 1} completed.`);
    }

    console.log("🎉 DONE! All templates generated.");
    
    // Return with save path information
    const savePathInfo = {
      filesFolder: outputFolderPath,
      templatesFolder: outputFolderPath.replace(/Files$/i, 'Profiles\\Templates')
    };
    
    return {
      filesGenerated: tplFiles.length,
      tplFiles: tplFiles,
      savePaths: savePathInfo
    };
  }

  /**
   * Generate preview data - creates metadata only without actual file generation
   * Returns list of files with editable fields (magicNumber, riskMoney, baseLot)
   */
  static async generatePreview(excelFiles, eaFolderPath, botFolders, isUploadMode = false, backtestGroup = '', assetMap = {}) {
    console.log("Starting generatePreview...");
    console.log(`  Backtest Group (A): ${backtestGroup}`);
    console.log(`  Asset Map:`, assetMap);

    if (excelFiles.length === 0) {
      throw new Error('No Excel files selected');
    }

    if (!eaFolderPath || eaFolderPath.trim() === '') {
      throw new Error('EA folder path is required');
    }

    if (!backtestGroup) {
      throw new Error('Backtest Group (A) is required');
    }

    const previewFiles = [];

    // Process in batches
    for (let i = 0; i < excelFiles.length; i += BATCH_SIZE) {
      const batch = excelFiles.slice(i, i + BATCH_SIZE);

      console.log(`🔷 Preview batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)...`);

      const batchResults = await Promise.all(
        batch.map(async (f) => {
          // Extract 3-digit bot code from filename (e.g., "005BTCUSDH1OB" → "005")
          const botPrefixMatch = f.name.match(/^(\d{3})/);
          if (!botPrefixMatch) {
            console.log(`  ❌ ${f.name} - No 3-digit prefix`);
            return null;
          }

          const botPrefix = botPrefixMatch[1];

          // Extract command from filename (OB = Buy, OS = Sell)
          const command = this.extractCommand(f.name);

          console.log(`  📊 File: ${f.name}, Bot: ${botPrefix}, Command: ${command}`);

          try {
            // Read Excel
            const rows = await ExcelService.readSheetFirstTab(f);

            // Extract metadata
            const { symbol, periodChart, periodInput, expert } = ExcelService.extractMetadata(rows);

            // Parse inputs to extract RiskMoney and BaseLot
            const inputs = ExcelService.parseInputs(rows);
            console.log(`  📊 Inputs found: ${inputs.length}`, inputs.slice(0, 3));
            
            let riskMoney = '';
            let baseLot = '';
            let riskMoneyParamName = 'riskMoney'; // Track the actual parameter name

            // List of alternative risk parameter names to check
            const riskParamVariants = ['riskmoney', 'losspertrade', 'money_loss', 'losspetrade', 'maxloss', 'loss'];

            // Extract RiskMoney and BaseLot from inputs
            for (const input of inputs) {
              const lowerInput = input.toLowerCase();
              const paramName = input.split('=')[0].toLowerCase();
              
              // Check for risk-related parameters (various naming conventions)
              if (riskParamVariants.some(variant => paramName === variant)) {
                riskMoney = input.substring(input.indexOf('=') + 1).trim();
                riskMoneyParamName = input.split('=')[0]; // Store actual param name
                console.log(`  💰 Found Risk Parameter: ${riskMoneyParamName} = ${riskMoney}`);
              }
              
              if (lowerInput.startsWith('baselot=')) {
                baseLot = input.substring('baselot='.length).trim();
                console.log(`  📦 Found BaseLot: ${baseLot}`);
              }
            }

            if (!riskMoney) {
              console.log(`  ⚠️  Risk parameter not found in inputs`);
            }

            // Get SelectedTimeframe value from filename instead of periodInput
            const selectedTimeframeValue = this.getSelectedTimeframeValue(f.name);

            // Calculate new Magic Number with 8-digit format [A][BB][T][C]0[DDD]
            const magicNumber = this.calculateMagicNumber(backtestGroup, symbol, f.name, command);

            const tplName = f.name.replace(/\.xlsx?$/i, '') + ".tpl";

            return {
              filename: tplName,
              excelFile: f,
              metadata: {
                symbol,
                periodInput: selectedTimeframeValue,
                expert,
                magicNumber,
                riskMoney,  // Add to metadata for reference
                riskMoneyParamName, // Store actual parameter name (e.g., LossPerTrade)
                baseLot     // Add to metadata for reference
              },
              preview: {
                magicNumber,
                riskMoney,
                baseLot
              }
            };
          } catch (error) {
            console.warn(`⚠️ Error processing ${f.name}:`, error.message);
            return null;
          }
        })
      );

      // Filter out null results
      const validResults = batchResults.filter(r => r !== null);
      previewFiles.push(...validResults);

      console.log(`✔ Preview batch ${Math.floor(i / BATCH_SIZE) + 1} completed.`);
    }

    console.log("🎉 Preview generation complete.");

    return {
      previewFiles: previewFiles,
      count: previewFiles.length
    };
  }

  /**
   * Generate actual TPL files from preview data with edited values
   */
  static async generateFromPreview(excelFiles, previewFiles, eaFolderPath, botFolders, isUploadMode = false, backtestGroup = '', assetMap = {}, botVariantSuffix = '') {
    console.log("Starting generateFromPreview...");
    console.log(`  Backtest Group (A): ${backtestGroup}`);

    const tplFiles = [];

    // Process in batches
    for (let i = 0; i < previewFiles.length; i += BATCH_SIZE) {
      const batch = previewFiles.slice(i, i + BATCH_SIZE);

      console.log(`🔷 Generate batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)...`);

      const batchResults = await Promise.all(
        batch.map(async (preview) => {
          try {
            const excelFile = preview.excelFile;
            const { symbol, periodInput, expert, riskMoneyParamName } = preview.metadata;
            // periodInput now contains SelectedTimeframe value extracted from filename 
            // (e.g., "110JPP225H4OB" → "H4" → "16388"), not from Excel
            // Use values from preview.preview (user-edited values)
            const { magicNumber, riskMoney, baseLot, lotThreshold } = preview.preview;
            
            // Use the actual parameter name from metadata (could be riskMoney, LossPerTrade, Money_Loss, etc.)
            const actualRiskParamName = riskMoneyParamName || 'riskMoney';

            console.log(`  Processing: ${preview.filename}`);
            console.log(`    Magic: ${magicNumber}, Risk: ${riskMoney} (param: ${actualRiskParamName}), BaseLot: ${baseLot}, LotThreshold: ${lotThreshold}`);

            // Read Excel to get original inputs
            const rows = await ExcelService.readSheetFirstTab(excelFile);
            let inputs = ExcelService.parseInputs(rows);

            // Build new inputs with preview values
            // Replace existing values or add new ones
            let inputsUpdated = inputs.map(input => {
              const lowerInput = input.toLowerCase();
              const paramName = input.split('=')[0].toLowerCase();
              
              if (paramName === 'magicnumber') {
                return `MagicNumber=${magicNumber}`;
              }
              
              // Check if this is the risk parameter (handle multiple naming conventions)
              if (paramName === actualRiskParamName.toLowerCase()) {
                return `${actualRiskParamName}=${riskMoney || ''}`.trim();
              }
              
              if (paramName === 'baselot') {
                return `baseLot=${baseLot || ''}`.trim();
              }

              if (paramName === 'lotthreshold') {
                return `lotThreshold=${lotThreshold || ''}`.trim();
              }

              return input;
            });

            // Add missing fields if not in original inputs
            if (!inputsUpdated.some(i => i.toLowerCase().startsWith('magicnumber='))) {
              inputsUpdated.unshift(`MagicNumber=${magicNumber}`);
            }
            if (riskMoney && !inputsUpdated.some(i => i.split('=')[0].toLowerCase() === actualRiskParamName.toLowerCase())) {
              inputsUpdated.push(`${actualRiskParamName}=${riskMoney}`);
            } else if (!riskMoney && inputsUpdated.some(i => i.split('=')[0].toLowerCase() === actualRiskParamName.toLowerCase())) {
              // If user cleared risk value, remove it
              inputsUpdated = inputsUpdated.filter(i => i.split('=')[0].toLowerCase() !== actualRiskParamName.toLowerCase());
            }
            
            if (baseLot && !inputsUpdated.some(i => i.toLowerCase().startsWith('baselot='))) {
              inputsUpdated.push(`baseLot=${baseLot}`);
            } else if (!baseLot && inputsUpdated.some(i => i.toLowerCase().startsWith('baselot='))) {
              // If user cleared BaseLot, remove it
              inputsUpdated = inputsUpdated.filter(i => !i.toLowerCase().startsWith('baselot='));
            }

            if (lotThreshold && !inputsUpdated.some(i => i.toLowerCase().startsWith('lotthreshold='))) {
              inputsUpdated.push(`lotThreshold=${lotThreshold}`);
            } else if (!lotThreshold && inputsUpdated.some(i => i.toLowerCase().startsWith('lotthreshold='))) {
              // If user cleared LotThreshold, remove it
              inputsUpdated = inputsUpdated.filter(i => !i.toLowerCase().startsWith('lotthreshold='));
            }

            // Add or update SelectedTimeframe from filename
            if (periodInput && !inputsUpdated.some(i => i.toLowerCase().startsWith('selectedtimeframe='))) {
              inputsUpdated.push(`SelectedTimeframe=${periodInput}`);
            } else if (periodInput) {
              // Replace existing SelectedTimeframe
              inputsUpdated = inputsUpdated.map(i => 
                i.toLowerCase().startsWith('selectedtimeframe=') ? `SelectedTimeframe=${periodInput}` : i
              );
            }

            // Build inputs section
            const inputsSection = inputsUpdated.join('\n');

            // Find bot folder
            const magicPrefixMatch = excelFile.name.match(/^(\d{3})/);
            const magicPrefix = magicPrefixMatch ? magicPrefixMatch[1] : '';
            
            let actualBotName = TplGenerator.findBotFolderByMagicPrefix(magicPrefix, botFolders);
            if (!actualBotName) {
              const botNameMatch = expert.match(/\d+\s*-\s*(.+)/);
              actualBotName = botNameMatch ? botNameMatch[1].trim() : expert;
            }

            // Get timeframe
            const tfMatch = excelFile.name.match(/H[14][A-Z]{2}/);
            const periodChart = tfMatch ? tfMatch[0] : '';

            // Apply bot variant suffix only to .ex5 filename, not to folder path
            let actualExFileName = `${actualBotName}.ex5`;
            if (botVariantSuffix) {
              actualExFileName = `${actualBotName}${botVariantSuffix}.ex5`;
            }
            let eaFolderPathRelative = 'Experts\\AllBot';

            // Generate TPL content with updated inputs
            const tplContent = TplGenerator.generateTplContent(
              symbol, periodChart, periodInput, expert, inputsSection,
              eaFolderPathRelative, actualBotName, actualExFileName
            );

            const tplName = excelFile.name.replace(/\.xlsx?$/i, '') + ".tpl";

            return {
              filename: tplName,
              content: tplContent,
              metadata: {
                symbol,
                periodInput,
                expert,
                magicNumber,
                riskMoney,
                baseLot
              }
            };
          } catch (error) {
            console.error(`❌ Error in generateFromPreview:`, error);
            return null;
          }
        })
      );

      // Filter out null results
      const validResults = batchResults.filter(r => r !== null);
      tplFiles.push(...validResults);

      console.log(`✔ Generate batch ${Math.floor(i / BATCH_SIZE) + 1} completed.`);
    }

    console.log("🎉 Generation from preview complete.");

    return {
      filesGenerated: tplFiles.length,
      tplFiles: tplFiles
    };
  }
}

export default ExportService;
