/**
 * TPL Generator - creates MT5 template files
 */
class TplGenerator {
  /**
   * Find actual .ex5 file in bot subfolder
   * Scans for .ex5 files matching the bot name pattern
   * Example: botFolder="112 - EWO_MA_RSI"
   *          Returns: "112 - EWO_MA_RSI_Volata.ex5" (if exists)
   */
  static async findExpertFile(botFolderPath) {
    try {
      // In browser context, we can't directly access filesystem
      // This method should be called from backend or via IPC
      // For now, return null - backend will handle actual file discovery
      console.log(`Finding .ex5 file in: ${botFolderPath}`);
      return null;
    } catch (error) {
      console.error('Error finding expert file:', error);
      return null;
    }
  }

  /**
   * Find bot folder by matching prefix number from Excel filename
   * Example: Excel "113BTCUSDH4OB" → Extract "113"
   *          Folder "113 - EWO_CCI + MSI" → Has prefix "113"
   */
  static findBotFolderByMagicPrefix(magicPrefix, botFolders) {
    try {
      if (!botFolders || botFolders.length === 0) {
        console.warn(`No bot folders provided`);
        return null;
      }

      // Find folder that starts with the magic prefix (e.g., "113 - ")
      for (const folder of botFolders) {
        // Check if folder starts with the magic prefix
        if (folder.startsWith(magicPrefix + ' ') || folder.startsWith(magicPrefix + '-')) {
          console.log(`Matched by prefix: "${magicPrefix}" → "${folder}"`);
          return folder;
        }
      }

      console.warn(`No folder found with prefix: ${magicPrefix}`);
      return null;
    } catch (error) {
      console.error('Error finding bot folder by prefix:', error);
      return null;
    }
  }

  /**
   * Generate TPL template content
   * @param {string} symbol - Trading symbol (e.g., "EURUSD")
   * @param {string} periodChart - Chart period
   * @param {string} periodInput - Input period
   * @param {string} expert - Expert name from Excel (not used in output)
   * @param {string} inputsSection - Inputs configuration
   * @param {string} eaFolderPathRelative - Relative EA folder path (e.g., "Experts\AllBot")
   * @param {string} actualBotName - Actual bot folder name (e.g., "112 - EWO_MA_RSI") - USED for TPL name
   * @param {string} actualExFileName - Actual .ex5 filename found in bot folder (e.g., "112 - EWO_MA_RSI_Test.ex5")
   */
  static generateTplContent(symbol, periodChart, periodInput, expert, inputsSection, eaFolderPathRelative, actualBotName, actualExFileName) {
    // Build RELATIVE path for TPL using actual .ex5 file
    // e.g., "Experts\AllBot\112 - EWO_MA_RSI\112 - EWO_MA_RSI_Test.ex5"
    const expertPath = `${eaFolderPathRelative}\\${actualBotName}\\${actualExFileName}`;
    
    // Extract name from .ex5 filename (remove .ex5 extension)
    // e.g., "112 - EWO_MA_RSI_Test.ex5" → "112 - EWO_MA_RSI_Test"
    const expertName = actualExFileName.replace(/\.ex5$/i, '');

    return `<chart>
id=0
symbol=${symbol}
description=${symbol}
period_type=1
period_size=${periodChart}
digits=2
tick_size=0.000000
position_time=0
scale_fix=0
scale_fixed_min=0.000000
scale_fixed_max=0.000000
scale_fix11=0
scale_bar=0
scale_bar_val=1.000000
scale=16
mode=1
fore=0
grid=1
volume=1
scroll=1
shift=1
shift_size=19.385141
fixed_pos=0.000000
ticker=1
ohlc=0
one_click=0
one_click_btn=1
bidline=1
askline=0
lastline=0
days=0
descriptions=0
tradelines=1
tradehistory=1
window_left=0
window_top=0
window_right=0
window_bottom=0
window_type=1
floating=0
floating_left=0
floating_top=0
floating_right=0
floating_bottom=0
floating_type=1
floating_toolbar=1
floating_tbstate=
background_color=0
foreground_color=16777215
barup_color=65280
bardown_color=65280
bullcandle_color=0
bearcandle_color=16777215
chartline_color=65280
volumes_color=3329330
grid_color=10061943
bidline_color=10061943
askline_color=255
lastline_color=49152
stops_color=255
windows_total=1

<expert>
name=${expertName}
path=${expertPath}
expertmode=1
<inputs>
${inputsSection}
</inputs>
</expert>

<window>
height=100.000000
objects=0

<indicator>
name=Main
path=
apply=1
show_data=1
scale_inherit=0
scale_line=0
scale_line_percent=50
scale_line_value=0.000000
scale_fix_min=0
scale_fix_min_val=0.000000
scale_fix_max=0
scale_fix_max_val=0.000000
expertmode=0
fixed_height=-1
</indicator>
</window>
</chart>
`;
  }

  /**
   * Build inputs section with processing
   * @param {array} inputs - Input array from Excel
   * @param {string} magicNumber - Magic number for the EA
   * @param {string} periodInput - SelectedTimeframe value (MT5 timeframe value from filename, e.g., "16388" for H4)
   */
  static buildInputsSection(inputs, magicNumber, periodInput) {
    let inputsSection = inputs
      .map(input => {
        if (input.startsWith("MagicNumber=")) {
          return "MagicNumber=" + magicNumber;
        }
        if (input.startsWith("SelectedTimeframe=")) {
          // Replace with timeframe value from filename (extracted in exportService.getSelectedTimeframeValue())
          return "SelectedTimeframe=" + periodInput;
        }
        // Convert BaseLot to baseLot (lowercase first letter)
        if (input.startsWith("BaseLot=")) {
          return "baseLot=" + input.substring(8);
        }
        return input;
      })
      .join("\n");

    // If MagicNumber not found, add it
    if (!inputsSection.includes("MagicNumber=")) {
      inputsSection = "MagicNumber=" + magicNumber + "\n" + inputsSection;
    }

    // If SelectedTimeframe not found, add it (with timeframe from filename)
    if (!inputsSection.includes("SelectedTimeframe=")) {
      inputsSection = "SelectedTimeframe=" + periodInput + "\n" + inputsSection;
    }

    return inputsSection;
  }

  /**
   * Save TPL file to 2 locations:
   * 1. MQL5/Files (output folder)
   * 2. MQL5/Profiles/Templates (MT5 template folder)
   */
  static saveTplFile(outputFolderPath, filename, content) {
    try {
      // Save to MQL5/Files
      const filesFolder = outputFolderPath;
      
      // Save to MQL5/Profiles/Templates
      const templateFolderPath = filesFolder.replace(/Files$/i, 'Profiles\\Templates');
      
      return {
        filesPath: filesFolder,
        templatesPath: templateFolderPath,
        filename: filename,
        content: content
      };
    } catch (error) {
      console.error(`Error preparing TPL file save paths:`, error);
      return null;
    }
  }
}

export default TplGenerator;
