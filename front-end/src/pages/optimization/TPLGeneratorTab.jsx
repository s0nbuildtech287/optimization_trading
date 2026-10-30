import React, { useState } from "react";
import {
  Box, Grid, Paper, Typography, Button, Alert, CircularProgress,
  TextField, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox
} from "@mui/material";
import { FolderOpen, Upload } from "lucide-react";
import ExportService from "../../services/mt5/exportService";
import EAUploadService from "../../services/mt5/eaUploadService";
import { downloadTPLFiles } from "../../services/mt5/downloadService";
import Select from "../../components/ui/Select";

const MAX_CHAR_LENGTH = 9;

const limitCharLength = (val) => {
  if (val === "" || val === "-") return val;
  const isNegative = val.startsWith("-");
  const numericPart = isNegative ? val.slice(1) : val;
  const totalLength = isNegative ? numericPart.length + 1 : numericPart.length;
  if (totalLength > MAX_CHAR_LENGTH) {
    return isNegative ? "-" + numericPart.slice(0, MAX_CHAR_LENGTH - 1) : numericPart.slice(0, MAX_CHAR_LENGTH);
  }
  return val;
};

const clampNumberBacktest = (val) => {
  if (val === "" || val === "-") return val;
  const num = Number(val);
  if (isNaN(num)) return val;
  if (num > 9) return String(9);
  if (num < 1) return String(1);
  return val;
};

const limitPositiveInteger = (val) => {
  if (val === "") return val;
  const numericOnly = val.replace(/[^0-9]/g, "");
  if (numericOnly === "") return "";
  return numericOnly.slice(0, MAX_CHAR_LENGTH);
};

const MT5TemplateGenerator = () => {
  const [excelFiles, setExcelFiles] = useState([]);
  const [eaFiles, setEaFiles] = useState([]);
  const [botFolders, setBotFolders] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [backtestGroup, setBacktestGroup] = useState("");
  const [expandedCell, setExpandedCell] = useState(null);
  const [botVariantSuffix, setBotVariantSuffix] = useState("");
  const [csvData, setCsvData] = useState({});
  const [filterByCSV, setFilterByCSV] = useState(false);
  const [csvMismatchInfo, setCsvMismatchInfo] = useState(null);
  const [excelSelectionAttempted, setExcelSelectionAttempted] = useState(false);

  const noSpinnerSx = {
    '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none' },
    '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none' },
    '& input[type=number]': { MozAppearance: 'textfield' },
  };

  const handleExcelFolderChange = (e) => {
    setExcelSelectionAttempted(true);
    const allFiles = Array.from(e.target.files);
    const excelOnly = allFiles.filter(
      (f) => f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls"),
    );
    setExcelFiles(excelOnly);
  };

  const handleEAFolderUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      setStatus(null); setBotFolders([]); setBotVariantSuffix(""); return;
    }
    setEaFiles(files);
    setStatus({ type: "loading", message: "🔍 Extracting bot folders..." });
    try {
      const result = await EAUploadService.uploadEAFolder(files);
      if (result.folders.length > 0) {
        setBotFolders(result.folders);
        setBotVariantSuffix("");
        const hint = result.mql5Indicator || "Experts folder detected";
        setStatus({ type: "success", message: `✅ Found ${result.folders.length} bot folder(s) - ${result.expertFilesCount} .ex5 file(s). ${hint}` });
      } else {
        setBotFolders([]); setBotVariantSuffix("");
        setStatus({ type: "warning", message: "⚠️ No bot folders found" });
      }
    } catch (error) {
      setStatus({ type: "error", message: `❌ ${error.message}` });
    }
  };

  const parseCSVFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csv = event.target.result;
          const lines = csv.trim().split("\n");
          if (lines.length < 2) { reject(new Error("CSV file is empty")); return; }
          const headers = lines[0].split(",").map((h) => h.trim());
          const strategyIdIdx = headers.indexOf("strategy_id");
          const riskMoneyIdx = headers.indexOf("risk_money");
          const lotThresholdIdx = headers.indexOf("lot_threshold") !== -1
            ? headers.indexOf("lot_threshold") : headers.indexOf("lotThreshold");
          const lotSizeIdx = headers.indexOf("lot_size");
          if (strategyIdIdx === -1) { reject(new Error("CSV must contain strategy_id column")); return; }
          if (riskMoneyIdx === -1 && lotThresholdIdx === -1 && lotSizeIdx === -1) {
            reject(new Error("CSV must contain at least one of: risk_money, lot_threshold, lotThreshold, or lot_size columns")); return;
          }
          const data = {};
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",").map((v) => v.trim());
            if (values.length > strategyIdIdx) {
              const strategyId = values[strategyIdIdx];
              if (strategyId) {
                data[strategyId] = {
                  riskMoney: riskMoneyIdx !== -1 ? values[riskMoneyIdx] : lotSizeIdx !== -1 ? values[lotSizeIdx] : "",
                  lotThreshold: lotThresholdIdx !== -1 ? values[lotThresholdIdx] : "",
                };
              }
            }
          }
          resolve(data);
        } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(new Error("Failed to read CSV file"));
      reader.readAsText(file);
    });
  };

  const handleCSVFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatus({ type: "loading", message: "📖 Reading CSV file..." });
      const data = await parseCSVFile(file);
      setCsvData(data);
      setStatus({ type: "success", message: `✅ CSV loaded! Found ${Object.keys(data).length} strategy records.` });
    } catch (error) {
      setStatus({ type: "error", message: `❌ CSV Error: ${error.message}` });
    }
  };

  const handleAutoFillFromCSV = () => {
    if (Object.keys(csvData).length === 0) {
      setStatus({ type: "warning", message: "⚠️ No CSV data loaded. Please upload a CSV file first." }); return;
    }
    const matchedRecords = [], missedRecords = [], orphanedCSVRecords = [];
    const previewFileIds = new Set(previewFiles.map((f) => f.filename.split(".")[0]));
    for (const csvId of Object.keys(csvData)) {
      if (!previewFileIds.has(csvId)) orphanedCSVRecords.push(csvId);
    }
    const updated = previewFiles.map((file) => {
      const filename = file.filename.split(".")[0];
      const csvValue = csvData[filename];
      if (csvValue) {
        matchedRecords.push(filename);
        return { ...file, preview: { ...file.preview, riskMoney: csvValue.riskMoney || file.preview?.riskMoney || "", lotThreshold: csvValue.lotThreshold || file.preview?.lotThreshold || "" }, metadata: { ...file.metadata, riskMoneyParamName: file.metadata?.riskMoneyParamName || "riskMoney" } };
      }
      missedRecords.push(filename); return file;
    });
    setPreviewFiles(updated);
    const matched = matchedRecords.length, missed = missedRecords.length;
    if (missedRecords.length > 0 || orphanedCSVRecords.length > 0) {
      setCsvMismatchInfo({ matched, matchedRecords, missed, missedRecords, orphaned: orphanedCSVRecords.length, orphanedRecords: orphanedCSVRecords });
    }
    let msg = `✅ Auto-filled ${matched} template(s) from CSV!`;
    if (missed > 0) msg += ` - ${missed} not found in CSV`;
    if (orphanedCSVRecords.length > 0) msg += ` - ${orphanedCSVRecords.length} CSV record(s) not in templates`;
    msg += filterByCSV ? " Only matched templates will be generated." : " All templates will be generated.";
    setStatus({ type: missed > 0 || orphanedCSVRecords.length > 0 ? "warning" : "success", message: msg });
  };

  const handlePreview = async () => {
    if (excelFiles.length === 0) { setStatus({ type: "error", message: "❌ Please select Excel files" }); return; }
    if (eaFiles.length === 0) { setStatus({ type: "error", message: "❌ Please upload EA folder" }); return; }
    if (botFolders.length === 0) { setStatus({ type: "error", message: "❌ EA folder upload failed. Please upload a valid folder." }); return; }
    if (!backtestGroup) { setStatus({ type: "error", message: "❌ Please enter Backtest Group (A)" }); return; }
    setLoading(true);
    setStatus({ type: "loading", message: "⏳ Generating preview..." });
    setPreviewFiles([]);
    try {
      const result = await ExportService.generatePreview(excelFiles, "C:\\MQL5", botFolders, true, backtestGroup);
      if (result.previewFiles && result.previewFiles.length > 0) {
        setPreviewFiles(result.previewFiles); setShowPreview(true);
        setStatus({ type: "success", message: `✅ Preview loaded! ${result.previewFiles.length} file(s) ready. Adjust Magic #, Risk Money, LotThreshold then Generate.` });
      } else {
        setStatus({ type: "warning", message: "⚠️ No valid files found in preview" });
      }
    } catch (error) { setStatus({ type: "error", message: `❌ ${error.message}` }); }
    finally { setLoading(false); }
  };

  const handlePreviewChange = (index, field, value) => {
    let finalValue = value;
    if (field === "magicNumber") finalValue = limitPositiveInteger(value);
    else if (["riskMoney", "lotThreshold"].includes(field)) finalValue = limitCharLength(value);
    const updated = [...previewFiles];
    updated[index] = { ...updated[index], preview: { ...updated[index].preview, [field]: finalValue } };
    setPreviewFiles(updated);
  };

  const getPreviewValue = (file, field) =>
    file.preview?.[field] !== undefined ? file.preview[field] : file.metadata?.[field] || "";

  const getCsvMatchedPreviewFiles = () => {
    if (!filterByCSV || Object.keys(csvData).length === 0) return previewFiles;
    return previewFiles.filter((file) => csvData[file.filename.split(".")[0]]);
  };

  const getMissingRequiredFields = (files) => {
    const emptyFields = [];
    files.forEach((file) => {
      const missingFields = [];
      if (!getPreviewValue(file, "magicNumber")) missingFields.push("Magic #");
      if (!getPreviewValue(file, "riskMoney")) missingFields.push("Risk Money");
      if (!getPreviewValue(file, "lotThreshold")) missingFields.push("LotThreshold");
      if (missingFields.length > 0) emptyFields.push({ filename: file.filename, fields: missingFields });
    });
    return emptyFields;
  };

  const handleGenerateFromPreview = async () => {
    if (previewFiles.length === 0) { setStatus({ type: "error", message: "❌ No preview files to generate" }); return; }
    const filesToValidate = filterByCSV ? getCsvMatchedPreviewFiles() : previewFiles;
    if (filesToValidate.length === 0) { setStatus({ type: "warning", message: "⚠️ No templates matched CSV data." }); return; }
    const missingFields = getMissingRequiredFields(filesToValidate);
    if (missingFields.length > 0) {
      const emptyList = missingFields.map((item) => `${item.filename}: ${item.fields.join(", ")}`).join("\n");
      setStatus({ type: "error", message: `❌ Empty required fields. Fill Magic #, Risk Money, LotThreshold:\n\n${emptyList}` }); return;
    }
    let filesToGenerate = filterByCSV ? getCsvMatchedPreviewFiles() : previewFiles;
    setLoading(true);
    setStatus({ type: "loading", message: "⏳ Generating templates with updated values..." });
    setGeneratedFiles([]);
    try {
      const inputValues = {};
      filesToGenerate.forEach((file) => {
        const filename = file.filename.split(".")[0];
        inputValues[filename] = { lotThreshold: file.preview?.lotThreshold || file.metadata?.lotThreshold || "", riskMoney: file.preview?.riskMoney || file.metadata?.riskMoney || "" };
      });
      const result = await ExportService.generateFromPreview(excelFiles, filesToGenerate, "C:\\MQL5", botFolders, true, backtestGroup, inputValues, botVariantSuffix);
      setGeneratedFiles(result.tplFiles);
      setStatus({ type: "loading", message: "⬇️ Preparing files for download..." });
      await downloadTPLFiles(result.tplFiles, botVariantSuffix);
      const suffixInfo = botVariantSuffix ? ` with suffix <code>${botVariantSuffix}</code>` : '';
      const instructions = `<br/><strong>✅ Downloaded! Next steps:</strong><br/>1. Open ZIP: <code>MT5_Templates_${botVariantSuffix ? botVariantSuffix + '_' : ''}*.zip</code><br/>2. Extract .tpl files to: <code>MQL5\\Files</code><br/>3. Refresh MT5 Template Manager`;
      setStatus({ type: "success", message: `✅ Generated and downloaded ${result.filesGenerated} file(s)${suffixInfo}.${instructions}` });
      setShowPreview(false); setPreviewFiles([]);
    } catch (error) { setStatus({ type: "error", message: `❌ ${error.message}` }); }
    finally { setLoading(false); }
  };

  const filesCurrentlyVisibleToGenerate = filterByCSV ? getCsvMatchedPreviewFiles() : previewFiles;
  const hasMissingRequiredFields = getMissingRequiredFields(filesCurrentlyVisibleToGenerate).length > 0;

  return (
    <Box sx={{ width: '100%' }}>

      {/* Status Alert */}
      {status && (
        <Alert
          severity={status.type === 'error' ? 'error' : status.type === 'warning' ? 'warning' : status.type === 'loading' ? 'info' : 'success'}
          sx={{ mb: 2 }} onClose={() => setStatus(null)}
        >
          <div dangerouslySetInnerHTML={{ __html: status.message }} />
        </Alert>
      )}

      {/* Configuration Form — dọc theo rows */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2}>

          {/* Row 1: Excel + EA Folder */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" fontWeight="600" color="text.secondary"
              sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Excel Files Folder
            </Typography>
            <Button variant="outlined" component="label" size="small"
              startIcon={<FolderOpen size={14} />} disabled={loading}>
              Choose Folder
              <input type="file" hidden webkitdirectory="true" directory="" accept=".xlsx,.xls" onChange={handleExcelFolderChange} />
            </Button>
            <Box sx={{ mt: 1 }}>
              {excelFiles.length > 0 ? (
                <Alert severity="success" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                  {excelFiles.length} file(s) found
                </Alert>
              ) : excelSelectionAttempted ? (
                <Alert severity="warning" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                  No Excel files found
                </Alert>
              ) : (
                <Typography variant="caption" color="text.secondary">No folder selected yet</Typography>
              )}
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" fontWeight="600" color="text.secondary"
              sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              EA Folder
            </Typography>
            <Button variant="outlined" component="label" size="small"
              startIcon={<FolderOpen size={14} />} disabled={loading} onClick={() => setStatus(null)}>
              Choose EA Folder
              <input type="file" hidden webkitdirectory="true" directory="" accept=".mq5,.ex5,.mqh" onChange={handleEAFolderUpload} />
            </Button>
            <Box sx={{ mt: 1 }}>
              {botFolders.length > 0 ? (
                <Alert severity="success" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                  {botFolders.length} bot folder(s) — ready
                </Alert>
              ) : (
                <Typography variant="caption" color="text.secondary">Upload EA folder to see bot list</Typography>
              )}
            </Box>
          </Grid>

          {/* Row 2: Bot Folder Names — full width */}
          <Grid size={12}>
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              <Typography variant="caption" fontWeight="600" color="text.secondary"
                sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Bot Folder Names ({botFolders.length})
              </Typography>
              {botFolders.length > 0 ? (
                <Box sx={{
                  maxHeight: 80, overflowY: 'auto',
                  border: '1px solid', borderColor: 'divider', borderRadius: '6px',
                  p: 1, bgcolor: 'grey.50',
                  display: 'flex', flexWrap: 'wrap', gap: 0.5
                }}>
                  {botFolders.map((folder, idx) => (
                    <Box key={idx} sx={{
                      px: 1.5, py: 0.3, bgcolor: 'white', border: '1px solid', borderColor: 'grey.200',
                      borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary'
                    }}>
                      {folder}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">Upload EA folder to see bot list</Typography>
              )}
            </Box>
          </Grid>

          {/* Row 3: Magic Number Settings — full width */}
          <Grid size={12}>
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              <Typography variant="caption" fontWeight="600" color="text.secondary"
                sx={{ display: 'block', mb: 1.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⚙️ Magic Number Settings
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <TextField
                  label="Backtest Group (A)" type="number" value={backtestGroup}
                  inputProps={{ min: 1, max: 9, step: 1 }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  onKeyDown={(e) => { if (['.', '-', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                  onChange={(e) => {
                    const positiveOnly = limitPositiveInteger(e.target.value);
                    setBacktestGroup(positiveOnly === '' ? '' : clampNumberBacktest(positiveOnly));
                  }}
                  disabled={loading} placeholder="1-9"
                  size="small" sx={{ ...noSpinnerSx, minWidth: 200 }}
                />
                {botFolders.length > 0 && (
                  <Box sx={{ minWidth: 240 }}>
                    <Select
                      label="Bot Variant Suffix"
                      value={botVariantSuffix}
                      onChange={(val) => setBotVariantSuffix(val)}
                      options={[
                        { value: '_TirsRisk', label: '_TirsRisk' },
                        { value: '_VolatilityRange', label: '_VolatilityRange' },
                      ]}
                      placeholder="No suffix (default)"
                      showPlaceholder={true}
                      disabled={loading}
                      full
                    />
                  </Box>
                )}
              </Box>
            </Box>
          </Grid>

          {/* Row 4: CSV Data File — full width */}
          <Grid size={12}>
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              <Typography variant="caption" fontWeight="600" color="text.secondary"
                sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📊 CSV Data File
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Button variant="outlined" component="label" size="small"
                  startIcon={<Upload size={14} />} disabled={loading}>
                  Upload CSV
                  <input type="file" hidden accept=".csv" onChange={handleCSVFileUpload} />
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Optional — auto-fills Risk Money &amp; LotThreshold
                </Typography>
                {Object.keys(csvData).length > 0 && (
                  <Alert severity="success" sx={{ py: 0.25, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                    {Object.keys(csvData).length} strategy records
                  </Alert>
                )}
              </Box>
            </Box>
          </Grid>

          {/* Row 5: Preview Button */}
          <Grid size={12}>
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
              <Button
                variant="contained" color="primary"
                onClick={handlePreview}
                disabled={loading || excelFiles.length === 0 || botFolders.length === 0}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
              >
                {loading ? 'Loading...' : '👁️ Preview Templates'}
              </Button>
            </Box>
          </Grid>

        </Grid>
      </Paper>

      {/* Preview/Edit Table */}
      {showPreview && previewFiles.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight="600">👁️ Preview Templates</Typography>
              <Typography variant="caption" color="text.secondary">
                Adjust Magic #, Risk Money, LotThreshold then click Generate.
              </Typography>
            </Box>
            {Object.keys(csvData).length > 0 && (
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" color="success" size="small" onClick={handleAutoFillFromCSV}>
                  Auto-Fill from CSV
                </Button>
                <FormControlLabel
                  control={<Checkbox checked={filterByCSV} onChange={(e) => setFilterByCSV(e.target.checked)} size="small" />}
                  label={<Typography variant="body2">Only CSV-matched</Typography>}
                  sx={{ m: 0 }}
                />
              </Box>
            )}
          </Box>

          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size="small" sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  {['Filename','Symbol','Timeframe','Expert','Magic #','Risk Money','LotThreshold'].map((col) => (
                    <TableCell key={col} sx={{ fontWeight: 'bold', fontSize: '0.75rem', whiteSpace: 'nowrap', py: 1.5 }}>{col}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {previewFiles
                  .filter((file) => !(filterByCSV && Object.keys(csvData).length > 0) || Boolean(csvData[file.filename.split('.')[0]]))
                  .map((file, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', py: 0.75, whiteSpace: 'nowrap' }}>{file.filename}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.symbol || '-'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.periodInput || '-'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', py: 0.75, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.metadata?.expert || ''}>
                        {file.metadata?.expert || '-'}
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField type="number" size="small"
                          value={file.preview?.magicNumber !== undefined ? file.preview.magicNumber : (file.metadata?.magicNumber || '')}
                          onKeyDown={(e) => { if (['.', '-', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
                          onChange={(e) => handlePreviewChange(idx, 'magicNumber', e.target.value)}
                          onClick={() => setExpandedCell({ idx, field: 'magicNumber' })}
                          sx={{ ...noSpinnerSx, width: 90, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField type="number" size="small" inputProps={{ step: 'any' }}
                          value={file.preview?.riskMoney !== undefined ? file.preview.riskMoney : (file.metadata?.riskMoney || '')}
                          onKeyDown={(e) => { if (['e', 'E'].includes(e.key)) e.preventDefault(); }}
                          onChange={(e) => handlePreviewChange(idx, 'riskMoney', e.target.value)}
                          onClick={() => setExpandedCell({ idx, field: 'riskMoney' })}
                          sx={{ ...noSpinnerSx, width: 90, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }} />
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>
                        <TextField type="number" size="small" inputProps={{ step: 'any' }}
                          value={file.preview?.lotThreshold !== undefined ? file.preview.lotThreshold : (file.metadata?.lotThreshold || '')}
                          onKeyDown={(e) => { if (['e', 'E'].includes(e.key)) e.preventDefault(); }}
                          onChange={(e) => handlePreviewChange(idx, 'lotThreshold', e.target.value)}
                          onClick={() => setExpandedCell({ idx, field: 'lotThreshold' })}
                          sx={{ ...noSpinnerSx, width: 90, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8rem' } }} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
            <Button variant="contained" color="success" size="small"
              onClick={handleGenerateFromPreview}
              disabled={loading || hasMissingRequiredFields}
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : null}
              title={hasMissingRequiredFields ? 'Fill all Magic #, Risk Money, LotThreshold first' : undefined}
            >
              {loading ? 'Generating...' : 'Generate Templates'}
            </Button>
            <Button variant="outlined" color="secondary" size="small"
              onClick={() => { setShowPreview(false); setStatus(null); }} disabled={loading}>
              Cancel
            </Button>
          </Box>
        </Paper>
      )}

      {/* Generated Files Table */}
      {generatedFiles.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="600" sx={{ mb: 1.5 }}>
            Generated Files ({generatedFiles.length})
          </Typography>
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size="small" sx={{ minWidth: 550 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  {['Filename','Symbol','Timeframe','Expert','Magic #'].map((col) => (
                    <TableCell key={col} sx={{ fontWeight: 'bold', fontSize: '0.75rem', whiteSpace: 'nowrap', py: 1.5 }}>{col}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {generatedFiles.map((file, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', py: 0.75 }}>{file.filename}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.symbol || '-'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.periodInput || '-'}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.expert || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', fontSize: '0.8rem', py: 0.75 }}>{file.metadata?.magicNumber || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Expanded Cell Dialog */}
      <Dialog open={Boolean(expandedCell)} onClose={() => setExpandedCell(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {expandedCell?.field === 'riskMoney' ? '💰 Risk Money' : expandedCell?.field === 'lotThreshold' ? '📦 LotThreshold' : '🔮 Magic #'}
        </DialogTitle>
        <DialogContent>
          {expandedCell && (
            <Box sx={{ mt: 1 }}>
              <TextField fullWidth
                label={expandedCell.field === 'riskMoney' ? 'Risk Money' : expandedCell.field === 'lotThreshold' ? 'LotThreshold' : 'Magic #'}
                type="number" inputProps={{ step: 'any' }}
                value={previewFiles[expandedCell.idx]?.preview?.[expandedCell.field] !== undefined
                  ? previewFiles[expandedCell.idx].preview[expandedCell.field]
                  : (previewFiles[expandedCell.idx]?.metadata?.[expandedCell.field] || '')}
                onKeyDown={(e) => {
                  if (expandedCell.field === 'magicNumber') { if (['.', '-', 'e', 'E'].includes(e.key)) e.preventDefault(); }
                  else { if (['e', 'E', '-'].includes(e.key)) e.preventDefault(); }
                }}
                onChange={(e) => handlePreviewChange(expandedCell.idx, expandedCell.field, e.target.value)}
                onFocus={(e) => e.target.select()}
                autoFocus size="small" sx={noSpinnerSx}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                File: {previewFiles[expandedCell.idx]?.filename}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" size="small" onClick={() => setExpandedCell(null)}>Done</Button>
        </DialogActions>
      </Dialog>

      {/* CSV Mismatch Report Dialog */}
      <Dialog open={Boolean(csvMismatchInfo)} onClose={() => setCsvMismatchInfo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>CSV Auto-Fill Report</DialogTitle>
        <DialogContent dividers>
          {csvMismatchInfo && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Alert severity="success">
                <strong>{csvMismatchInfo.matched}</strong> template(s) successfully filled
                {csvMismatchInfo.matchedRecords?.length > 0 && (
                  <Box sx={{ maxHeight: 120, overflowY: 'auto', mt: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {csvMismatchInfo.matchedRecords.map((r, i) => <div key={i}>✓ {r}</div>)}
                  </Box>
                )}
              </Alert>
              {csvMismatchInfo.missed > 0 && (
                <Alert severity="warning">
                  <strong>{csvMismatchInfo.missed}</strong> template(s) not found in CSV
                  <Box sx={{ maxHeight: 150, overflowY: 'auto', mt: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {csvMismatchInfo.missedRecords.map((r, i) => <div key={i}>{r}</div>)}
                  </Box>
                </Alert>
              )}
              {csvMismatchInfo.orphaned > 0 && (
                <Alert severity="error">
                  <strong>{csvMismatchInfo.orphaned}</strong> CSV record(s) not matching any template
                  <Box sx={{ maxHeight: 150, overflowY: 'auto', mt: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {csvMismatchInfo.orphanedRecords.map((r, i) => <div key={i}>{r}</div>)}
                  </Box>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" size="small" onClick={() => setCsvMismatchInfo(null)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default MT5TemplateGenerator;


