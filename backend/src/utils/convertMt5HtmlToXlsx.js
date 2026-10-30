const cheerio = require('cheerio');
const ExcelJS = require('exceljs');

function decodeReport(content) {
  if (!Buffer.isBuffer(content)) return String(content || '');
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
    return content.subarray(2).toString('utf16le');
  }
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    return Buffer.from(content.subarray(2)).swap16().toString('utf16le');
  }
  if (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    return content.subarray(3).toString('utf8');
  }
  return content.toString('utf8');
}

function toNumber(value) {
  if (value === null || value === undefined) return value;
  const cleaned = String(value).replace(/\xa0/g, '').replace(/ /g, '').replace(/,/g, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return value;
  const number = Number(cleaned);
  return Number.isSafeInteger(number) ? Number.parseInt(cleaned, 10) : number;
}

async function convertMt5HtmlToXlsxBuffer(reportContent, images = []) {
  const html = decodeReport(reportContent);
  const $ = cheerio.load(html);
  const tables = $('table');
  if (!tables.length) throw new Error('MT5 report does not contain HTML tables');

  const parseTableRows = ($table) => {
    const rows = [];
    $table.find('tr').each((_rowIndex, rowElement) => {
      const row = [];
      $(rowElement).find('td, th').each((_cellIndex, cellElement) => {
        const cell = $(cellElement);
        row.push(toNumber(cell.text().trim()));
        const colspan = Number.parseInt(cell.attr('colspan') || '1', 10);
        for (let index = 1; index < colspan; index += 1) row.push('');
      });
      if (row.some((cell) => cell !== null && cell !== '')) rows.push(row);
    });
    return rows;
  };

  const summaryRows = parseTableRows($(tables[0]));
  const detailRows = tables.length > 1 ? parseTableRows($(tables[1])) : [];
  if (!summaryRows.length) throw new Error('MT5 report summary is empty');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report');
  const defaultFont = { name: 'Times New Roman', size: 11 };
  const boldFont = { name: 'Times New Roman', size: 12, bold: true };
  const headerFont = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFF' } };
  const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DCE6F1' } };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '366092' } };
  const centered = { horizontal: 'center', vertical: 'middle' };
  const leftAligned = { horizontal: 'left', vertical: 'middle' };
  const sectionRows = new Set();
  let currentRow = 1;

  for (const rowData of summaryRows) {
    const values = rowData.filter((cell) => cell !== null && cell !== '');
    const section = values.length === 1 && ['Settings', 'Results'].includes(String(values[0]).trim());
    const row = worksheet.getRow(currentRow);
    if (section) {
      sectionRows.add(currentRow);
      for (let column = 1; column <= 12; column += 1) row.getCell(column).fill = sectionFill;
      row.getCell(1).value = String(values[0]).trim();
      row.getCell(1).font = boldFont;
      row.getCell(1).alignment = leftAligned;
    } else {
      rowData.forEach((value, index) => {
        if (value === null || value === '') return;
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.font = defaultFont;
        cell.alignment = leftAligned;
      });
    }
    currentRow += 1;
  }

  const mainImage = images.find((image) => {
    const name = String(image.name || '').toLowerCase();
    return name.endsWith('.png') && !name.includes('-holding') && !name.includes('-hst') && !name.includes('-mfemae');
  });
  if (mainImage?.buffer) {
    currentRow += 1;
    const imageId = workbook.addImage({ buffer: mainImage.buffer, extension: 'png' });
    worksheet.addImage(imageId, `A${currentRow}:G${currentRow + 9}`);
    currentRow += 10;
  }

  let nextRowIsHeader = false;
  for (const rowData of detailRows) {
    const values = rowData.filter((cell) => cell !== null && cell !== '');
    const section = values.length === 1 && ['Orders', 'Deals', 'Positions'].includes(String(values[0]).trim());
    if (section) {
      currentRow += 1;
      sectionRows.add(currentRow);
      const row = worksheet.getRow(currentRow);
      for (let column = 1; column <= 15; column += 1) row.getCell(column).fill = sectionFill;
      row.getCell(1).value = String(values[0]).trim();
      row.getCell(1).font = boldFont;
      row.getCell(1).alignment = leftAligned;
      nextRowIsHeader = true;
      currentRow += 1;
      continue;
    }

    const row = worksheet.getRow(currentRow);
    rowData.forEach((value, index) => {
      if (value === null || value === '') return;
      const cell = row.getCell(index + 1);
      cell.value = value;
      cell.font = nextRowIsHeader ? headerFont : defaultFont;
      cell.fill = nextRowIsHeader ? headerFill : { type: 'pattern', pattern: 'none' };
      cell.alignment = centered;
    });
    currentRow += 1;
    nextRowIsHeader = false;
  }

  if (Array.isArray(worksheet.columns)) {
    worksheet.columns.forEach((column) => {
      let maxLength = 8;
      column.eachCell({ includeEmpty: false }, (cell) => {
        if (sectionRows.has(cell.row)) return;
        maxLength = Math.max(maxLength, String(cell.value ?? '').length);
      });
      column.width = Math.min(maxLength + 3, 40);
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { convertMt5HtmlToXlsxBuffer };
