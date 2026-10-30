import * as XLSX from 'xlsx';
import { PERIOD_MAP } from './constants';

/**
 * Excel service - handles Excel file reading
 */
class ExcelService {
  /**
   * Read first sheet from Excel file
   */
  static readSheetFirstTab(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          const firstSheet = wb.SheetNames[0];
          const sheet = wb.Sheets[firstSheet];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          resolve(rows);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract metadata from Excel (Symbol, Period, Expert)
   */
  static extractMetadata(rows) {
    let symbol = "";
    let periodChart = "";
    let periodInput = "";
    let expert = "";

    for (let r of rows) {
      if (r[0] === "Expert:" && r[3]) {
        expert = r[3].toString().trim();
      }
      if (r[0] === "Symbol:" && r[3]) {
        symbol = r[3].toString().trim();
      }
      if (r[0] === "Period:" && r[3]) {
        const periodStr = r[3].toString().trim();
        const periodCode = periodStr.split(" ")[0];
        const periodValues = PERIOD_MAP[periodCode] || { chart: periodCode, input: periodCode };
        periodChart = periodValues.chart;
        periodInput = periodValues.input;
      }
    }

    return { symbol, periodChart, periodInput, expert };
  }

  /**
   * Parse inputs section from Excel
   */
  static parseInputs(rows) {
    let inputs = [];
    let inInputs = false;

    for (let r of rows) {
      if (r[0] === "Inputs:") {
        inInputs = true;
        continue;
      }
      if (inInputs && (r[0] === "Company:" || !r[3])) break;
      if (inInputs && r[3]) inputs.push(r[3].toString().trim());
    }

    return inputs;
  }
}

export default ExcelService;
