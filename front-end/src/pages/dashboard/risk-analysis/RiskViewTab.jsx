import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import * as XLSX from 'xlsx';

// Icons
import StopOutlined from '@ant-design/icons/StopOutlined';
import WarningOutlined from '@ant-design/icons/WarningOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import PieChartOutlined from '@ant-design/icons/PieChartOutlined';
import FileExcelOutlined from '@ant-design/icons/FileExcelOutlined';

// Project imports
import MainCard from 'components/MainCard';
import DashboardKpiSummary from 'components/dashboard/DashboardKpiSummary';
import { CardLoader } from 'components/CardLoader';

export default function RiskViewTab({
  totalStrategiesChecked,
  passedCleanStrategiesCount,
  warningStrategiesCount,
  disqualifiedStrategiesCount,
  disqualificationRate,
  handleOpenRemarks,
  selectedTable,
  dateRange,
  passedStrategiesCount,
  toggleTier,
  hardFlagsLive,
  hardStratsCount,
  openHelpModal,
  tierCollapsed,
  renderHeaderActions,
  expandedHardRow,
  highlightedRiskId,
  HARD_FLAG_GROUPS,
  handleToggleHardRow,
  detailsSearch,
  setDetailsSearch,
  detailsPages,
  handleDetailsPageChange,
  allStrategiesLive,
  handleSelectStrategy,
  softFlagsLive,
  softStratsCount,
  expandedSoftRow,
  SOFT_FLAG_GROUPS,
  handleToggleSoftRow,
  loading
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // ====================================================================================
  // TẠM THỜI KHÔNG CỘNG INDICATOR 8 ("Profit 12 tháng gần nhất âm") VÀO TỔNG CỦA TIER 1 TITLE
  // Khi cần dùng lại code cũ (cộng tất cả 8 loại vào tổng), chỉ cần mở comment ở đoạn JSX bên dưới:
  // `{/* Tier 1 — Hard Flags ({hardFlagsLive.length} loại · {hardFlagsLive.reduce((a, f) => a + f.count, 0)} lượt dính · {hardStratsCount} chiến lược dính) */}`
  // ====================================================================================
  const hardFlagsLiveExcluding8 = React.useMemo(() => {
    return (hardFlagsLive || []).filter((f) => String(f.id) !== '8');
  }, [hardFlagsLive]);

  const displayHardTypesCount = hardFlagsLiveExcluding8.length;
  const displayHardHitsCount = React.useMemo(() => {
    return hardFlagsLiveExcluding8.reduce((a, f) => a + Number(f.count || 0), 0);
  }, [hardFlagsLiveExcluding8]);

  const displayHardStratsCount = React.useMemo(() => {
    if (Array.isArray(allStrategiesLive) && allStrategiesLive.length > 0) {
      return allStrategiesLive.filter((s) => {
        const flags = Array.isArray(s.hardFlags) ? s.hardFlags : [];
        return flags.some((fid) => String(fid) !== '8');
      }).length;
    }
    const stratSet = new Set();
    hardFlagsLiveExcluding8.forEach((flag) => {
      if (Array.isArray(flag.strats)) {
        flag.strats.forEach((s) => {
          const id = typeof s === 'string' ? s : (s.id || s.strategy_id || s.name);
          if (id) stratSet.add(id);
        });
      }
    });
    return stratSet.size > 0 ? stratSet.size : hardStratsCount;
  }, [allStrategiesLive, hardFlagsLiveExcluding8, hardStratsCount]);

  const handleExportFlagsExcel = (flagsList, tierTitle) => {
    if (!flagsList || flagsList.length === 0) return;

    const strategyMap = new Map();

    flagsList.forEach((flag) => {
      const flagKey = flag.disease || flag.title;
      const strats = Array.isArray(flag.strats) ? flag.strats : [];
      strats.forEach((s) => {
        const stratId = typeof s === 'string' ? s : (s.id || s.strategy_id || s.name);
        if (!stratId) return;
        const stratTable = typeof s === 'object' ? (s.backtest || s.table || s.sourceTable || selectedTable || '') : (selectedTable || '');
        const mapKey = stratId;

        if (!strategyMap.has(mapKey)) {
          strategyMap.set(mapKey, {
            id: stratId,
            table: stratTable || selectedTable || 'Tất cả Bảng',
            triggeredFlags: [],
            flagValues: {}
          });
        } else {
          const existing = strategyMap.get(mapKey);
          if ((!existing.table || existing.table === 'Tất cả Bảng') && stratTable) {
            existing.table = stratTable;
          }
        }

        const item = strategyMap.get(mapKey);
        if (!item.triggeredFlags.includes(flagKey)) {
          item.triggeredFlags.push(flagKey);
        }
        item.flagValues[flagKey] = (typeof s === 'object' && s.val) ? s.val : '❌ Dính';
      });
    });

    if (strategyMap.size === 0) {
      alert(`Không có chiến lược nào bị vi phạm ${tierTitle} để xuất Excel.`);
      return;
    }

    const rows = Array.from(strategyMap.values()).map((item, index) => {
      const rowObj = {
        'STT': index + 1,
        'Strategy ID': item.id,
        'Bảng Nguồn': item.table,
        'Tổng cờ vi phạm': item.triggeredFlags.length,
        'Danh sách cờ dính': item.triggeredFlags.join(', ')
      };

      flagsList.forEach((flag) => {
        const flagKey = flag.disease || flag.title;
        const headerName = `${flagKey} (${flag.title})`;
        rowObj[headerName] = item.flagValues[flagKey] ? `❌ Dính (${item.flagValues[flagKey]})` : '-';
      });

      return rowObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const colWidths = [
      { wch: 6 },
      { wch: 32 },
      { wch: 20 },
      { wch: 18 },
      { wch: 48 }
    ];
    flagsList.forEach(() => colWidths.push({ wch: 35 }));
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    const sheetName = tierTitle.includes('Hard') ? 'Hard_Flags_Violated' : 'Soft_Flags_Violated';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `Lotusquant_${sheetName}_Strategies_${nowStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleExportSingleFlagExcel = (flag) => {
    if (!flag || !flag.strats || flag.strats.length === 0) {
      alert(`Không có chiến lược nào vi phạm cờ ${flag.disease || flag.title} để xuất Excel.`);
      return;
    }

    const flagCode = flag.disease || flag.title;
    const stratMap = new Map();

    flag.strats.forEach((s) => {
      const stratId = typeof s === 'string' ? s : (s.id || s.strategy_id || s.name);
      if (!stratId) return;
      const stratTable = typeof s === 'object' ? (s.backtest || s.table || s.sourceTable || selectedTable || 'Tất cả Bảng') : (selectedTable || 'Tất cả Bảng');
      const val = (typeof s === 'object' && s.val) ? s.val : '❌ Dính';
      const key = `${stratTable}:${stratId}`;

      if (!stratMap.has(key)) {
        stratMap.set(key, { stratId, stratTable, val });
      }
    });

    const rows = Array.from(stratMap.values()).map((item, index) => ({
      'STT': index + 1,
      'Strategy ID': item.stratId,
      'Bảng Nguồn': item.stratTable,
      'Mã Cờ Vi Phạm': flagCode,
      'Tên Risk Indicator': flag.title,
      'Chỉ số / Chi tiết': item.val,
      'Mô tả Rủi ro': flag.desc || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const colWidths = [
      { wch: 6 },   // STT
      { wch: 25 },  // Strategy ID
      { wch: 20 },  // Bảng Nguồn
      { wch: 25 },  // Mã Cờ Vi Phạm
      { wch: 35 },  // Tên Risk Indicator
      { wch: 25 },  // Chỉ số / Chi tiết
      { wch: 55 }   // Mô tả Rủi ro
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Flag_Details');

    const cleanCode = flagCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const nowStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `Lotusquant_Flag_${cleanCode}_${nowStr}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  return (
    <Box>
      <DashboardKpiSummary
        title="Risk Screening Summary"
        items={[
          {
            label: 'Eligible Strategies',
            value: String(totalStrategiesChecked),
            sub: 'strategies with at least 100 trades',
            valueColor: 'text.primary',
            icon: <PieChartOutlined style={{ fontSize: 18, color: '#0288d1' }} />,
            iconBg: '#e3f2fd'
          },
          {
            label: 'Passed Clean',
            value: String(passedCleanStrategiesCount),
            sub: 'đạt chuẩn khả năng xem xét deploy (0 cờ)',
            valueColor: 'success.main',
            icon: <CheckCircleOutlined style={{ fontSize: 18, color: '#2e7d32' }} />,
            iconBg: '#edf7ed'
          },
          {
            label: 'Warning Strats',
            value: String(warningStrategiesCount),
            sub: 'có Soft Flags; từ 3 cờ sẽ hạ Priority',
            valueColor: 'warning.main',
            icon: <WarningOutlined style={{ fontSize: 18, color: '#e5a800' }} />,
            iconBg: '#fef7e0'
          },
          {
            label: 'Disqualified',
            value: String(disqualifiedStrategiesCount),
            sub: 'dính Hard Flags (bị loại)',
            valueColor: 'error.main',
            icon: <StopOutlined style={{ fontSize: 18, color: '#d32f2f' }} />,
            iconBg: '#fdeded'
          },
          {
            label: 'Disqualification Rate',
            value: `${disqualificationRate}%`,
            sub: 'tỷ lệ loại trừ',
            valueColor: 'error.main',
            icon: <WarningOutlined style={{ fontSize: 18, color: '#d32f2f' }} />,
            iconBg: '#fdeded'
          }
        ]}
        onDetailedReportClick={() => handleOpenRemarks('Quản trị Rủi ro (Risk Analysis Tab)', 'risk_tab', 'tab_remarks')}
        loading={loading}
        aiAnalysis={{
          title: 'AI Analysis — Risk Screening',
          subtitle: 'Class 3 · 25 Risk Indicators (8 Hard + 17 Soft)',
          badge: 'Risk Module',
          targetId: 'risk_tab',
          selectedTable: selectedTable,
          dateRange: dateRange,
          sections: [
            {
              heading: 'Tổng quan',
              body: `${disqualificationRate}% strategy (${disqualifiedStrategiesCount}/${totalStrategiesChecked}) bị loại trực tiếp do hard flags. Đây là lớp phòng vệ bắt buộc trước khi xét behavior hoặc ranking — không nên bỏ qua dù composite score cao. Hệ thống phân tích 25 risk indicators (8 Hard + 17 Soft) và 7 portfolio-level checks.`
            },
            {
              heading: 'Điểm nóng',
              body: '• Hard flags #1–#4 (EP, PF, RF, P/D) chiếm phần lớn disqualification.\n• Martingale triple flag (#5) và EoT > 10% (#7) cần review thủ công — backtest có thể che rủi ro ẩn.\n• 12 tháng gần âm (#8) gợi ý edge decay — ưu tiên so khớp với behavior tab annual stability.\n• Flag #24 kiểm tra Winrate toàn kỳ dưới 45%, không phải độ suy giảm Winrate 12 tháng.'
            },
            {
              heading: 'Khuyến nghị',
              body: `Giữ shortlist ≤ ${passedStrategiesCount} passed strategies. Với soft flags ≥ 3 trên một ID, hạ priority deploy. Chạy portfolio checks (tab 3) trước khi gom top N từ comparative ranking. Portfolio checks #25, #27, #29 có drill-down chi tiết để xem strategies bị ảnh hưởng.`
            }
          ]
        }}
      />

      {/* Section A: Hard Flags — collapsible tier */}
      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleTier('hard')}>
            <StopOutlined style={{ color: theme.palette.error.main }} />
            <Typography variant="subtitle1" fontWeight={600}>
              {/* CODE CŨ MẶC ĐỊNH (Mở comment dòng dưới nếu muốn cộng lại indicator 8 - Profit 12m âm vào tổng): */}
              {/* Tier 1 — Hard Flags ({hardFlagsLive.length} loại · {hardFlagsLive.reduce((a, f) => a + f.count, 0)} lượt dính · {hardStratsCount} chiến lược dính) */}

              {/* CODE MỚI (Tạm thời loại trừ indicator 8 - Profit 12m âm khỏi tổng): */}
              Tier 1 — Hard Flags ({displayHardTypesCount} loại · {displayHardHitsCount} lượt dính ·{' '}
              {displayHardStratsCount} chiến lược dính)
            </Typography>
            <Chip
              label="Dính 1 → Loại ngay"
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontSize: '10px', height: 18, ml: 1 }}
            />
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Tải file Excel gom nhóm chiến lược vi phạm Hard Flags (1 dòng / 1 strategy)">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExportFlagsExcel(hardFlagsLive, 'Tier 1 — Hard Flags');
                  }}
                  sx={{ color: 'success.main', p: 0.25, mr: 0.5 }}
                >
                  <FileExcelOutlined style={{ fontSize: '15px' }} />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  openHelpModal(
                    'Quy tắc phòng vệ Hard Flags',
                    'Hard flags là nhóm chỉ số chẩn đoán rủi ro tuyệt đối của Lotusquant. Bất kỳ chiến lược nào dính phải bất kỳ cờ nào thuộc nhóm này sẽ bị loại trừ ngay lập tức khỏi shortlist deploy live trading, không có ngoại lệ nhằm bảo vệ tối đa tính an toàn vốn.'
                  );
                }}
                sx={{ color: 'text.secondary', p: 0.25 }}
              >
                <QuestionCircleOutlined style={{ fontSize: '14px' }} />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {tierCollapsed.hard ? '▶ Mở' : '▼ Thu'}
              </Typography>
            </Box>
          </Box>
        }
        secondary={renderHeaderActions('Tier 1 — Hard Flags', `Phân tích nhóm chỉ báo Tier 1 — Hard Flags của danh mục`, hardFlagsLive)}
        sx={{ mb: 2, width: '100%' }}
      >
        {loading ? (
          <CardLoader height={160} size={28} />
        ) : (
        <Collapse in={!tierCollapsed.hard} timeout="auto">
          <TableContainer
            component={Paper}
            sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}
          >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell align="center" style={{ width: 50, fontWeight: 600 }}>
                    #
                  </TableCell>
                  <TableCell align="center" style={{ width: 220, fontWeight: 600 }}>
                    Risk Indicator
                  </TableCell>
                  <TableCell align="center" style={{ width: 180, fontWeight: 600 }}>
                    Diagnostic Code
                  </TableCell>
                  <TableCell align="center" style={{ fontWeight: 600 }}>
                    Risk Description
                  </TableCell>
                  <TableCell align="center" style={{ width: 160, fontWeight: 600 }}>
                    Triggered Strategies
                  </TableCell>
                  <TableCell align="center" style={{ width: 150, fontWeight: 600 }}>
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {hardFlagsLive.map((flag, idx) => {
                  const isExpanded = expandedHardRow === flag.id;
                  const isHighlighted = highlightedRiskId === flag.id;
                  const group = HARD_FLAG_GROUPS.find((g) => g.ids[0] === flag.id);
                  return (
                    <React.Fragment key={flag.id}>
                      {group && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{
                              py: 0.75,
                              px: 2,
                              bgcolor: 'rgba(239,68,68,0.04)',
                              borderTop: idx > 0 ? '2px solid' : 'none',
                              borderTopColor: 'error.lighter'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                label={group.label}
                                size="small"
                                color="error"
                                variant="outlined"
                                sx={{ fontWeight: 700, fontSize: '10px', height: 20, borderRadius: 1 }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
                                {group.desc}
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        hover
                        sx={{ bgcolor: isHighlighted ? 'rgba(239,68,68,0.08)' : 'transparent', transition: 'background 0.4s' }}
                      >
                        <TableCell align="center" sx={{ fontWeight: 600 }}>
                          {flag.id}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                            {isHighlighted && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'error.main', mr: 0.5 }} />}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.775rem', letterSpacing: '0.2px' }}
                            >
                              {flag.title}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => openHelpModal(`Giải thích: ${flag.title}`, flag.info)}
                              sx={{ p: 0.25, color: 'text.secondary' }}
                            >
                              <QuestionCircleOutlined style={{ fontSize: '12px' }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={flag.disease}
                            size="small"
                            variant="soft"
                            sx={{
                              fontWeight: 800,
                              fontSize: '10px',
                              height: 20,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(239, 68, 68, 0.08)',
                              color: 'error.main'
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          {flag.desc}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: 'error.main' }}>
                          {flag.count} Strategies
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, flexWrap: 'nowrap' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleToggleHardRow(flag.id)}
                              sx={{ fontSize: '10px', py: 0.25, px: 1, borderRadius: 1.5, textTransform: 'none', whiteSpace: 'nowrap' }}
                            >
                              {isExpanded ? 'Hide Details' : 'View Details'}
                            </Button>
                            <Tooltip title={`Tải file Excel chiến lược vi phạm ${flag.disease || flag.title}`}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportSingleFlagExcel(flag);
                                }}
                                sx={{ color: 'success.main', p: 0.25 }}
                              >
                                <FileExcelOutlined style={{ fontSize: '14px' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          style={{
                            paddingBottom: 0,
                            paddingTop: 0,
                            borderBottom: isExpanded ? `1px solid ${theme.palette.divider}` : 'none'
                          }}
                        >
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box
                              sx={{
                                margin: '16px 20px 20px 20px',
                                p: 2.5,
                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.02)' : 'background.default',
                                borderRadius: 2.5,
                                border: '1px solid',
                                borderColor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.25)' : '#fee2e2'
                              }}
                            >
                              {(() => {
                                const filteredStrats = flag.strats.filter((s) =>
                                  s.id.toLowerCase().includes(detailsSearch.toLowerCase())
                                );
                                const pageSize = 5;
                                const totalPages = Math.ceil(filteredStrats.length / pageSize);
                                const rawPage = detailsPages[flag.id] || 1;
                                const currentPage = Math.min(rawPage, Math.max(1, totalPages));
                                const paginatedStrats = filteredStrats.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                                return (
                                  <>
                                    <Box
                                      sx={{
                                        mb: 1.5,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 1
                                      }}
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                                          Chiến lược vi phạm ({filteredStrats.length} / {flag.strats.length} strategies)
                                        </Typography>
                                        <Tooltip title={`Xuất danh sách ${flag.strats.length} chiến lược dính cờ ${flag.disease || flag.title} ra Excel`}>
                                          <IconButton
                                            size="small"
                                            onClick={() => handleExportSingleFlagExcel(flag)}
                                            sx={{ color: 'success.main', p: 0.25 }}
                                          >
                                            <FileExcelOutlined style={{ fontSize: '14px' }} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                      <TextField
                                        size="small"
                                        placeholder="Tìm nhanh ID..."
                                        value={detailsSearch}
                                        onChange={(e) => {
                                          setDetailsSearch(e.target.value);
                                          handleDetailsPageChange(flag.id, 1);
                                        }}
                                        slotProps={{
                                          input: {
                                            startAdornment: (
                                              <InputAdornment position="start">
                                                <SearchOutlined style={{ fontSize: 13, color: '#94a3b8' }} />
                                              </InputAdornment>
                                            )
                                          }
                                        }}
                                        sx={{
                                          width: 180,
                                          '& .MuiOutlinedInput-root': {
                                            borderRadius: 1.5,
                                            height: 28,
                                            fontSize: '0.75rem',
                                            bgcolor: 'background.paper'
                                          }
                                        }}
                                      />
                                    </Box>

                                    <TableContainer
                                      component={Paper}
                                      sx={{
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1.5,
                                        bgcolor: 'background.paper',
                                        overflowX: 'auto'
                                      }}
                                    >
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Strategy ID
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Backtest Table
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Total Trades
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Giá trị vi phạm
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Hành động
                                            </TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {paginatedStrats.map((s, sIdx) => {
                                            const info = allStrategiesLive.find(
                                              (item) => item.id === s.id && (!s.backtest || item.backtest === s.backtest)
                                            ) || {};
                                            const backtestName = info.backtest || '-';
                                            const totalTrades = info.trades || 0;
                                            return (
                                              <TableRow key={sIdx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                                <TableCell
                                                  align="center"
                                                  sx={{
                                                    py: 0.5,
                                                    fontFamily: 'monospace',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    color: 'text.primary'
                                                  }}
                                                >
                                                  {s.id}
                                                </TableCell>
                                                <TableCell
                                                  align="center"
                                                  sx={{ py: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}
                                                >
                                                  {backtestName}
                                                </TableCell>
                                                <TableCell align="center" sx={{ py: 0.5, fontSize: '0.75rem' }}>
                                                  {totalTrades}
                                                </TableCell>
                                                <TableCell
                                                  align="center"
                                                  sx={{ py: 0.5, fontWeight: 700, fontSize: '0.75rem', color: 'error.main' }}
                                                >
                                                  {s.val}
                                                </TableCell>
                                                <TableCell align="center" sx={{ py: 0.5 }}>
                                                  <Button
                                                    variant="text"
                                                    size="small"
                                                    onClick={() => handleSelectStrategy(s.id)}
                                                    sx={{
                                                      fontSize: '0.675rem',
                                                      p: 0,
                                                      minWidth: 'auto',
                                                      textTransform: 'none',
                                                      fontWeight: 600
                                                    }}
                                                  >
                                                    Inspect
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                          {filteredStrats.length === 0 && (
                                            <TableRow>
                                              <TableCell
                                                colSpan={5}
                                                align="center"
                                                sx={{ py: 2, color: 'text.secondary', fontSize: '0.75rem' }}
                                              >
                                                Không tìm thấy strategy ID tương ứng
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>

                                    {totalPages > 1 && (
                                      <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
                                        <Button
                                          size="small"
                                          disabled={currentPage === 1}
                                          onClick={() => handleDetailsPageChange(flag.id, currentPage - 1)}
                                          sx={{
                                            fontSize: '11px',
                                            textTransform: 'none',
                                            py: 0.25,
                                            fontWeight: 600,
                                            color: isDarkMode ? '#38bdf8' : 'primary.main',
                                            '&:hover': {
                                              bgcolor: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(21, 101, 192, 0.08)',
                                              color: isDarkMode ? '#ffffff' : 'primary.dark'
                                            },
                                            '&.Mui-disabled': {
                                              color: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)'
                                            }
                                          }}
                                        >
                                          Trang trước
                                        </Button>
                                        
                                        <Button
                                          size="small"
                                          disabled={currentPage === totalPages}
                                          onClick={() => handleDetailsPageChange(flag.id, currentPage + 1)}
                                          sx={{
                                            fontSize: '11px',
                                            textTransform: 'none',
                                            py: 0.25,
                                            fontWeight: 600,
                                            color: isDarkMode ? '#38bdf8' : 'primary.main',
                                            '&:hover': {
                                              bgcolor: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(21, 101, 192, 0.08)',
                                              color: isDarkMode ? '#ffffff' : 'primary.dark'
                                            },
                                            '&.Mui-disabled': {
                                              color: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)'
                                            }
                                          }}
                                        >
                                          Trang sau
                                        </Button>
                                      </Box>
                                    )}
                                  </>
                                );
                              })()}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
        )}
      </MainCard>

      {/* Section B: Soft Flags — collapsible tier */}
      <MainCard
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => toggleTier('soft')}>
            <WarningOutlined style={{ color: '#ad6800' }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Tier 2 — Soft Flags ({softFlagsLive.length} loại · {softFlagsLive.reduce((a, f) => a + f.count, 0)} lượt dính ·{' '}
              {softStratsCount} chiến lược dính)
            </Typography>
            <Chip
              label="Dính ≥3 → Hạ priority"
              size="small"
              color="warning"
              variant="outlined"
              sx={{ fontSize: '10px', height: 18, ml: 1 }}
            />
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Tải file Excel gom nhóm chiến lược vi phạm Soft Flags (1 dòng / 1 strategy)">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExportFlagsExcel(softFlagsLive, 'Tier 2 — Soft Flags');
                  }}
                  sx={{ color: 'success.main', p: 0.25, mr: 0.5 }}
                >
                  <FileExcelOutlined style={{ fontSize: '15px' }} />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  openHelpModal(
                    'Quy tắc chẩn đoán Soft Flags',
                    'Soft flags là tập hợp các chỉ báo đo lường rủi ro tinh vi (outliers, sample size nhỏ, suy giảm edge, lỗi fee...). Một soft flag đơn lẻ chưa đủ để loại bỏ chiến lược, tuy nhiên nếu một chiến lược dính đồng thời từ 3 soft flags trở lên, hệ thống sẽ gắn mác cảnh báo cao độ để loại trừ.'
                  );
                }}
                sx={{ color: 'text.secondary', p: 0.25 }}
              >
                <QuestionCircleOutlined style={{ fontSize: '14px' }} />
              </IconButton>
              <Typography variant="caption" color="text.secondary">
                {tierCollapsed.soft ? '▶ Mở' : '▼ Thu'}
              </Typography>
            </Box>
          </Box>
        }
        secondary={renderHeaderActions('Tier 2 — Soft Flags', `Phân tích nhóm chỉ báo Tier 2 — Soft Flags của danh mục`, softFlagsLive)}
        sx={{ mb: 2 }}
      >
        {loading ? (
          <CardLoader height={160} size={28} />
        ) : (
        <Collapse in={!tierCollapsed.soft} timeout="auto">
          <TableContainer
            component={Paper}
            sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}
          >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell align="center" style={{ width: 50, fontWeight: 600 }}>
                    #
                  </TableCell>
                  <TableCell align="center" style={{ width: 220, fontWeight: 600 }}>
                    Risk Indicator
                  </TableCell>
                  <TableCell align="center" style={{ width: 180, fontWeight: 600 }}>
                    Mã chẩn đoán
                  </TableCell>
                  <TableCell align="center" style={{ fontWeight: 600 }}>
                    Risk Description
                  </TableCell>
                  <TableCell align="center" style={{ width: 160, fontWeight: 600 }}>
                    Triggered Strategies
                  </TableCell>
                  <TableCell align="center" style={{ width: 150, fontWeight: 600 }}>
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {softFlagsLive.map((flag, idx) => {
                  const isExpanded = expandedSoftRow === flag.id;
                  const isHighlighted = highlightedRiskId === flag.id;
                  const group = SOFT_FLAG_GROUPS.find((g) => g.ids.includes(flag.id));
                  const prevGroup = idx > 0 ? SOFT_FLAG_GROUPS.find((g) => g.ids.includes(softFlagsLive[idx - 1].id)) : null;
                  const showGroupHeader = !!group && (!prevGroup || prevGroup.id !== group.id);
                  return (
                    <React.Fragment key={flag.id}>
                      {showGroupHeader && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{
                              py: 0.75,
                              px: 2,
                              bgcolor: 'rgba(245,158,11,0.04)',
                              borderTop: idx > 0 ? '2px solid' : 'none',
                              borderTopColor: 'warning.lighter'
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Chip
                                label={group.label}
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ fontWeight: 700, fontSize: '10px', height: 20, borderRadius: 1 }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
                                {group.desc}
                              </Typography>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        hover
                        sx={{ bgcolor: isHighlighted ? 'rgba(245,158,11,0.08)' : 'transparent', transition: 'background 0.4s' }}
                      >
                        <TableCell align="center" sx={{ fontWeight: 600 }}>
                          {flag.id}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                            {isHighlighted && (
                              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main', mr: 0.5 }} />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.775rem', letterSpacing: '0.2px' }}
                            >
                              {flag.title}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => openHelpModal(`Giải thích: ${flag.title}`, flag.info)}
                              sx={{ p: 0.25, color: 'text.secondary' }}
                            >
                              <QuestionCircleOutlined style={{ fontSize: '12px' }} />
                            </IconButton>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={flag.disease}
                            size="small"
                            variant="soft"
                            sx={{
                              fontWeight: 800,
                              fontSize: '10px',
                              height: 20,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(245, 158, 11, 0.08)',
                              color: 'warning.dark'
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          {flag.desc}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: 'warning.main' }}>
                          {flag.count} Chiến lược
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, flexWrap: 'nowrap' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleToggleSoftRow(flag.id)}
                              sx={{ fontSize: '10px', py: 0.25, px: 1, borderRadius: 1.5, textTransform: 'none', whiteSpace: 'nowrap' }}
                            >
                              {isExpanded ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                            </Button>
                            <Tooltip title={`Tải file Excel chiến lược vi phạm ${flag.disease || flag.title}`}>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportSingleFlagExcel(flag);
                                }}
                                sx={{ color: 'success.main', p: 0.25 }}
                              >
                                <FileExcelOutlined style={{ fontSize: '14px' }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>

                      {/* Expandable row showing violated strategy list with click-through drill down */}
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          style={{
                            paddingBottom: 0,
                            paddingTop: 0,
                            borderBottom: isExpanded ? `1px solid ${theme.palette.divider}` : 'none'
                          }}
                        >
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box
                              sx={{
                                margin: '16px 20px 20px 20px',
                                p: 2.5,
                                bgcolor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.02)' : '#fbfcfd',
                                borderRadius: 2.5,
                                border: '1px solid',
                                borderColor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.25)' : '#fef3c7',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)'
                              }}
                            >
                              {(() => {
                                const filteredStrats = flag.strats.filter((s) =>
                                  s.id.toLowerCase().includes(detailsSearch.toLowerCase())
                                );
                                const pageSize = 5;
                                const totalPages = Math.ceil(filteredStrats.length / pageSize);
                                const rawPage = detailsPages[flag.id] || 1;
                                const currentPage = Math.min(rawPage, Math.max(1, totalPages));
                                const paginatedStrats = filteredStrats.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                                return (
                                  <>
                                    <Box
                                      sx={{
                                        mb: 1.5,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 1
                                      }}
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <WarningOutlined style={{ color: '#d97706', fontSize: '15px' }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                          Strategies triggering {flag.title} — ({filteredStrats.length} / {flag.strats.length})
                                        </Typography>
                                        <Tooltip title={`Xuất danh sách ${flag.strats.length} chiến lược dính cờ ${flag.disease || flag.title} ra Excel`}>
                                          <IconButton
                                            size="small"
                                            onClick={() => handleExportSingleFlagExcel(flag)}
                                            sx={{ color: 'success.main', p: 0.25 }}
                                          >
                                            <FileExcelOutlined style={{ fontSize: '14px' }} />
                                          </IconButton>
                                        </Tooltip>
                                      </Box>
                                      <TextField
                                        size="small"
                                        placeholder="Tìm nhanh ID..."
                                        value={detailsSearch}
                                        onChange={(e) => {
                                          setDetailsSearch(e.target.value);
                                          handleDetailsPageChange(flag.id, 1);
                                        }}
                                        slotProps={{
                                          input: {
                                            startAdornment: (
                                              <InputAdornment position="start">
                                                <SearchOutlined style={{ fontSize: 13, color: '#94a3b8' }} />
                                              </InputAdornment>
                                            )
                                          }
                                        }}
                                        sx={{
                                          width: 180,
                                          '& .MuiOutlinedInput-root': {
                                            borderRadius: 1.5,
                                            height: 28,
                                            fontSize: '0.75rem',
                                            bgcolor: 'background.paper'
                                          }
                                        }}
                                      />
                                    </Box>

                                    <TableContainer
                                      component={Paper}
                                      sx={{
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1.5,
                                        bgcolor: 'background.paper',
                                        overflowX: 'auto'
                                      }}
                                    >
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Strategy ID
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Backtest Table
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Total Trades
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Giá trị vi phạm
                                            </TableCell>
                                            <TableCell
                                              align="center"
                                              sx={{
                                                py: 0.75,
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                                                color: 'text.primary'
                                              }}
                                            >
                                              Hành động
                                            </TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {paginatedStrats.map((s, sIdx) => {
                                            const info = allStrategiesLive.find(
                                              (item) => item.id === s.id && (!s.backtest || item.backtest === s.backtest)
                                            ) || {};
                                            const backtestName = info.backtest || '-';
                                            const totalTrades = info.trades || 0;
                                            return (
                                              <TableRow key={sIdx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                                <TableCell
                                                  align="center"
                                                  sx={{
                                                    py: 0.5,
                                                    fontFamily: 'monospace',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    color: 'text.primary'
                                                  }}
                                                >
                                                  {s.id}
                                                </TableCell>
                                                <TableCell
                                                  align="center"
                                                  sx={{ py: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}
                                                >
                                                  {backtestName}
                                                </TableCell>
                                                <TableCell align="center" sx={{ py: 0.5, fontSize: '0.75rem' }}>
                                                  {totalTrades}
                                                </TableCell>
                                                <TableCell
                                                  align="center"
                                                  sx={{ py: 0.5, fontWeight: 700, fontSize: '0.75rem', color: 'warning.dark' }}
                                                >
                                                  {s.val}
                                                </TableCell>
                                                <TableCell align="center" sx={{ py: 0.5 }}>
                                                  <Button
                                                    variant="text"
                                                    size="small"
                                                    onClick={() => handleSelectStrategy(s.id)}
                                                    sx={{
                                                      fontSize: '0.675rem',
                                                      p: 0,
                                                      minWidth: 'auto',
                                                      textTransform: 'none',
                                                      fontWeight: 600
                                                    }}
                                                  >
                                                    Inspect
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                          {filteredStrats.length === 0 && (
                                            <TableRow>
                                              <TableCell
                                                colSpan={5}
                                                align="center"
                                                sx={{ py: 2, color: 'text.secondary', fontSize: '0.75rem' }}
                                              >
                                                Không tìm thấy strategy ID tương ứng
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>

                                    {totalPages > 1 && (
                                      <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
                                        <Button
                                          size="small"
                                          disabled={currentPage === 1}
                                          onClick={() => handleDetailsPageChange(flag.id, currentPage - 1)}
                                          sx={{
                                            fontSize: '11px',
                                            textTransform: 'none',
                                            py: 0.25,
                                            fontWeight: 600,
                                            color: isDarkMode ? '#38bdf8' : 'primary.main',
                                            '&:hover': {
                                              bgcolor: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(21, 101, 192, 0.08)',
                                              color: isDarkMode ? '#ffffff' : 'primary.dark'
                                            },
                                            '&.Mui-disabled': {
                                              color: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)'
                                            }
                                          }}
                                        >
                                          Trang trước
                                        </Button>
                                        
                                        <Button
                                          size="small"
                                          disabled={currentPage === totalPages}
                                          onClick={() => handleDetailsPageChange(flag.id, currentPage + 1)}
                                          sx={{
                                            fontSize: '11px',
                                            textTransform: 'none',
                                            py: 0.25,
                                            fontWeight: 600,
                                            color: isDarkMode ? '#38bdf8' : 'primary.main',
                                            '&:hover': {
                                              bgcolor: isDarkMode ? 'rgba(56, 189, 248, 0.15)' : 'rgba(21, 101, 192, 0.08)',
                                              color: isDarkMode ? '#ffffff' : 'primary.dark'
                                            },
                                            '&.Mui-disabled': {
                                              color: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)'
                                            }
                                          }}
                                        >
                                          Trang sau
                                        </Button>
                                      </Box>
                                    )}
                                  </>
                                );
                              })()}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
        )}
      </MainCard>
    </Box>
  );
}
