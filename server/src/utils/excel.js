const ExcelJS = require('exceljs');

/**
 * 生成并输出 xlsx：headers 表头，rows 二维数组
 */
async function sendExcel(res, filename, headers, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  ws.columns.forEach(col => { col.width = 18; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { sendExcel };
