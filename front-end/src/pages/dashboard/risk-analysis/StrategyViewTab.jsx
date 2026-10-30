import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  TablePagination,
  Tooltip,
  Typography,
  Collapse,
  Alert
} from '@mui/material';
import {
  SearchOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  UpOutlined
} from '@ant-design/icons';
import CustomTablePagination from 'components/CustomTablePagination';
import MainCard from 'components/MainCard';
import { CardLoader } from 'components/CardLoader';

export default function StrategyViewTab({
  allStrategiesLive,
  strategyRiskMap,
  strategyPriorityMap,
  hardFlagsLive,
  softFlagsLive,
  passedCleanStrategiesCount,
  handleGoToRisk,
  isDarkMode,
  theme,
  openHelpModal,
  PRIORITY_RULES_HELP,
  HARD_FLAG_GROUPS,
  SOFT_FLAG_GROUPS,
  FILTER_GROUPS,
  loading,
  stratSearchInput,
  setStratSearchInput,
  stratSearch,
  setStratSearch,
  priorityFilter,
  setPriorityFilter,
  specificRiskFilter,
  setSpecificRiskFilter
}) {
  const [activeFilterGroup, setActiveFilterGroup] = useState('all');
  const [stratPage, setStratPage] = useState(1);
  const [stratPageSize, setStratPageSize] = useState(50);
  const [expandedStratRow, setExpandedStratRow] = useState(null);

  const STRAT_PAGE_SIZE = stratPageSize;

  const tooltipSlotProps = {
    popper: {
      modifiers: [
        {
          name: 'preventOverflow',
          options: {
            boundary: 'viewport'
          }
        }
      ]
    }
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setStratSearch(stratSearchInput), 250);
    return () => clearTimeout(t);
  }, [stratSearchInput]);

  // Handle page reset on filter changes
  useEffect(() => {
    setStratPage(1);
  }, [stratSearch, specificRiskFilter, priorityFilter, stratPageSize]);

  const makeStrategyKey = (backtest, id) => `${backtest || ''}:${id}`;

  // Compute filtered strategies
  const filteredStratView = useMemo(() => {
    return allStrategiesLive
      .filter((s) => {
        const sKey = makeStrategyKey(s.backtest, s.id);
        const matchSearch = s.id.toLowerCase().includes(stratSearch.toLowerCase());

        // Specific risk filter - check if strategy has ALL selected risks
        let matchSpecificRisk = true;
        if (specificRiskFilter.length > 0) {
          const risks = strategyRiskMap[sKey] || strategyRiskMap[s.id] || { hard: [], soft: [] };
          const allRiskIds = [...risks.hard.map((r) => r.riskId), ...risks.soft.map((r) => r.riskId)];
          if (specificRiskFilter.includes('clean')) {
            matchSpecificRisk = (s.hardCount ?? 0) === 0 && (s.softCount ?? 0) === 0;
          } else {
            matchSpecificRisk = specificRiskFilter.every((riskId) => allRiskIds.includes(riskId));
          }
        }

        // Priority filter
        let matchPriority = true;
        if (priorityFilter !== 'all') {
          const score = strategyPriorityMap[sKey] ?? strategyPriorityMap[s.id] ?? 0;
          if (priorityFilter === 'disqualified') matchPriority = score === 0;
          else if (priorityFilter === 'low') matchPriority = score > 0 && score < 50;
          else if (priorityFilter === 'medium') matchPriority = score >= 50 && score < 80;
          else if (priorityFilter === 'high') matchPriority = score >= 80;
        }

        return matchSearch && matchSpecificRisk && matchPriority;
      })
      .sort((a, b) => {
        return a.id.localeCompare(b.id);
      });
  }, [allStrategiesLive, stratSearch, specificRiskFilter, strategyRiskMap, priorityFilter, strategyPriorityMap]);

  const totalStratPages = Math.max(1, Math.ceil(filteredStratView.length / STRAT_PAGE_SIZE));

  const pagedStratView = useMemo(() => {
    const start = (stratPage - 1) * STRAT_PAGE_SIZE;
    return filteredStratView.slice(start, start + STRAT_PAGE_SIZE);
  }, [filteredStratView, stratPage, STRAT_PAGE_SIZE]);

  return (
    <Box>
      <MainCard sx={{ width: '100%' }}>
        {loading ? (
          <CardLoader height={300} size={32} message="Loading strategies..." />
        ) : (
        <>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
            Strategy View — Toàn cảnh chiến lược & Chẩn đoán chi tiết
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Bảng tổng hợp hiển thị các chỉ số quan trọng (EP, PF, RF, P/D), số lượng risk dính, và risk tags. Click vào tag risk để nhảy
            sang Risk View.
          </Typography>

          {/* Search Box */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                placeholder="Tìm strategy ID..."
                value={stratSearchInput}
                onChange={(e) => setStratSearchInput(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined />
                      </InputAdornment>
                    )
                  }
                }}
                sx={{ width: 280, '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
              />
            </Box>
          </Box>

          {/* Filter: Priority */}
          <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{ color: 'text.secondary', mr: 0.5, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
            >
              Priority:
              <IconButton
                size="small"
                onClick={() => openHelpModal('Quy tắc tính điểm Priority', PRIORITY_RULES_HELP)}
                sx={{ p: 0, color: 'primary.main', minWidth: 'auto' }}
              >
                <QuestionCircleOutlined style={{ fontSize: '12px' }} />
              </IconButton>
            </Typography>
            {[
              { id: 'all', label: 'Tất cả', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
              { id: 'high', label: '≥ 80 — Cao', color: '#0284c7', bg: 'rgba(2,132,199,0.08)' },
              { id: 'medium', label: '50–79 — TB', color: '#b45309', bg: 'rgba(180,83,9,0.08)' },
              { id: 'low', label: '1–49 — Thấp', color: '#e11d48', bg: 'rgba(225,29,72,0.08)' },
              { id: 'disqualified', label: '0 — Loại', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' }
            ].map((opt) => {
              const isActive = priorityFilter === opt.id;
              return (
                <Button
                  key={opt.id}
                  size="small"
                  onClick={() => setPriorityFilter(opt.id)}
                  sx={{
                    px: 1.5,
                    py: 0.25,
                    fontSize: '0.675rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#fff' : opt.color,
                    bgcolor: isActive ? opt.color : opt.bg,
                    borderRadius: 1.5,
                    textTransform: 'none',
                    border: '1px solid',
                    borderColor: isActive ? opt.color : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: isActive ? opt.color : `${opt.bg}` }
                  }}
                >
                  {opt.label}
                </Button>
              );
            })}
          </Box>

          {/* Filter: Specific Risk Indicators */}
          <Box sx={{ mb: 2.5 }}>
            {/* Horizontal Tab Switcher */}
            <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', mr: 1, fontSize: '0.75rem' }}>
                Bộ lọc nhóm rủi ro:
              </Typography>
              {FILTER_GROUPS.map((g) => {
                const isActive = activeFilterGroup === g.id;
                return (
                  <Button
                    key={g.id}
                    size="small"
                    onClick={() => setActiveFilterGroup(g.id)}
                    sx={{
                      px: 1.5,
                      py: 0.25,
                      fontSize: '0.675rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#ffffff' : 'text.secondary',
                      bgcolor: isActive
                        ? theme.palette.mode === 'dark'
                          ? 'primary.main'
                          : '#1e293b'
                        : theme.palette.mode === 'dark'
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(0, 0, 0, 0.03)',
                      borderRadius: 1.5,
                      textTransform: 'none',
                      boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                      border: '1px solid',
                      borderColor: isActive ? (theme.palette.mode === 'dark' ? 'primary.main' : '#1e293b') : 'transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        bgcolor: isActive
                          ? theme.palette.mode === 'dark'
                            ? 'primary.dark'
                            : '#0f172a'
                          : theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(0, 0, 0, 0.06)'
                      }
                    }}
                  >
                    {g.label}
                  </Button>
                );
              })}
            </Box>

            {/* Sleek, Clean Chips Panel without boxy container frames */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#fafafb',
                border: '1px solid',
                borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#f1f5f9',
                display: 'flex',
                gap: 0.75,
                flexWrap: 'wrap',
                alignItems: 'center',
                minHeight: 52
              }}
            >
              {(() => {
                const allGroups = [...HARD_FLAG_GROUPS, ...SOFT_FLAG_GROUPS];
                const groupsToRender = activeFilterGroup === 'all' ? allGroups : allGroups.filter((g) => g.id === activeFilterGroup);

                const chips = [];
                groupsToRender.forEach((group) => {
                  const isHard = group.id === 'G1' || group.id === 'G2' || group.id === 'G3';
                  group.ids.forEach((riskId) => {
                    const flag = isHard ? hardFlagsLive.find((f) => f.id === riskId) : softFlagsLive.find((f) => f.id === riskId);

                    if (!flag) return;
                    const isSelected = specificRiskFilter.includes(flag.id);

                    chips.push(
                      <Tooltip
                        key={flag.id}
                        title={`Nhóm: ${group.label} — ${flag.title}: ${flag.desc}`}
                        arrow
                        slotProps={tooltipSlotProps}
                      >
                        <Chip
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <span>{`#${flag.id} ${flag.title}`}</span>
                              <Box
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: isSelected
                                    ? 'rgba(255,255,255,0.3)'
                                    : isHard
                                      ? 'rgba(239, 68, 68, 0.15)'
                                      : 'rgba(217, 119, 6, 0.15)',
                                  color: isSelected ? '#ffffff' : isHard ? 'error.main' : 'warning.dark',
                                  borderRadius: '50%',
                                  minWidth: 16,
                                  height: 16,
                                  px: 0.5,
                                  fontSize: '0.625rem',
                                  fontWeight: 800
                                }}
                              >
                                {flag.count || 0}
                              </Box>
                            </Box>
                          }
                          size="small"
                          color={isHard ? 'error' : 'warning'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          onClick={() => {
                            if (isSelected) {
                              setSpecificRiskFilter((prev) => prev.filter((id) => id !== flag.id));
                            } else {
                              setSpecificRiskFilter((prev) => [...prev.filter((id) => id !== 'clean'), flag.id]);
                            }
                          }}
                          sx={{
                            fontSize: '0.675rem',
                            height: 24,
                            cursor: 'pointer',
                            fontWeight: isSelected ? 700 : 500,
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor: isSelected ? (isHard ? 'error.main' : 'warning.main') : 'divider',
                            transition: 'all 0.15s ease',
                            bgcolor: isSelected ? undefined : theme.palette.mode === 'dark' ? 'background.paper' : '#ffffff',
                            '&:hover': {
                              transform: 'translateY(-1px)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                              borderColor: isHard ? 'error.light' : 'warning.light'
                            }
                          }}
                        />
                      </Tooltip>
                    );
                  });
                });

                // Render 'clean' filter at the very end
                const isCleanSelected = specificRiskFilter.includes('clean');
                chips.push(
                  <Tooltip
                    key="clean"
                    title="Passed Clean: Các bộ chiến lược hoàn hảo, không dính bất kỳ cờ rủi ro (Hard/Soft Flags) nào."
                    arrow
                    slotProps={tooltipSlotProps}
                  >
                    <Chip
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <span>Passed Clean</span>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: isCleanSelected ? 'rgba(255,255,255,0.3)' : 'rgba(46, 125, 50, 0.15)',
                              color: isCleanSelected ? '#ffffff' : 'success.main',
                              borderRadius: '50%',
                              minWidth: 16,
                              height: 16,
                              px: 0.5,
                              fontSize: '0.625rem',
                              fontWeight: 800
                            }}
                          >
                            {passedCleanStrategiesCount || 0}
                          </Box>
                        </Box>
                      }
                      size="small"
                      color="success"
                      variant={isCleanSelected ? 'filled' : 'outlined'}
                      onClick={() => {
                        if (isCleanSelected) {
                          setSpecificRiskFilter([]);
                        } else {
                          setSpecificRiskFilter(['clean']);
                        }
                      }}
                      sx={{
                        fontSize: '0.675rem',
                        height: 24,
                        cursor: 'pointer',
                        fontWeight: isCleanSelected ? 700 : 500,
                        borderRadius: 1.5,
                        border: '1px solid',
                        borderColor: isCleanSelected ? 'success.main' : 'divider',
                        transition: 'all 0.15s ease',
                        bgcolor: isCleanSelected ? undefined : theme.palette.mode === 'dark' ? 'background.paper' : '#ffffff',
                        '&:hover': {
                          transform: 'translateY(-1px)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          borderColor: 'success.light'
                        }
                      }}
                    />
                  </Tooltip>
                );

                return chips;
              })()}
            </Box>

            {specificRiskFilter.length > 0 && (
              <Box
                sx={{
                  mt: 1.5,
                  p: 1,
                  bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc',
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#e2e8f0'
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                  Đang lọc theo {specificRiskFilter.length} rủi ro:{' '}
                  {specificRiskFilter
                    .map((id) => {
                      if (id === 'clean') return 'Passed Clean';
                      const allF = [...hardFlagsLive, ...softFlagsLive];
                      const match = allF.find((f) => f.id === id);
                      return `#${id} (${match ? match.title : ''})`;
                    })
                    .join(', ')}
                  <Button
                    size="small"
                    onClick={() => setSpecificRiskFilter([])}
                    sx={{ ml: 1.5, fontSize: '0.65rem', py: 0, minWidth: 'auto', textTransform: 'none', fontWeight: 700 }}
                  >
                    Xóa bộ lọc
                  </Button>
                </Typography>
              </Box>
            )}
          </Box>

          {/* Active Filters Summary */}
          {(stratSearch || specificRiskFilter.length > 0 || priorityFilter !== 'all') && (
            <Alert
              severity="info"
              sx={{ mb: 1.5, borderRadius: 1.5, py: 0.5 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setStratSearchInput('');
                    setSpecificRiskFilter([]);
                    setPriorityFilter('all');
                  }}
                  sx={{ fontWeight: 700, textTransform: 'none', fontSize: '0.7rem' }}
                >
                  Xóa tất cả filter
                </Button>
              }
            >
              <Typography variant="caption" fontWeight={600}>
                Đang hiển thị {filteredStratView.length} / {allStrategiesLive.length} strategies
                {stratSearch && ` · Tìm: "${stratSearch}"`}
                {specificRiskFilter.length > 0 &&
                  ` · Risks: ${specificRiskFilter.map((id) => (id === 'clean' ? 'Passed Clean' : `#${id}`)).join(', ')}`}
                {priorityFilter !== 'all' && ` · Priority: ${priorityFilter}`}
              </Typography>
            </Alert>
          )}
        </Box>

        <TableContainer
          component={Paper}
          sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Strategy ID
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Backtest Table
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Total Trades
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  EP
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  PF
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  RF
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  P/D
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Hard
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Soft
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Status
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    Priority
                    <IconButton
                      size="small"
                      onClick={() => openHelpModal('Quy tắc tính điểm Priority', PRIORITY_RULES_HELP)}
                      sx={{ p: 0, color: 'primary.main', minWidth: 'auto' }}
                    >
                      <QuestionCircleOutlined style={{ fontSize: '12px' }} />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Risk Tags (click → Risk View)
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Detail
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedStratView.map((s) => {
                const sKey = makeStrategyKey(s.backtest, s.id);
                const risks = strategyRiskMap[sKey] || strategyRiskMap[s.id] || { hard: [], soft: [] };
                const allRisks = [
                  ...risks.hard.map((r) => ({ ...r, tier: 'hard' })),
                  ...risks.soft.map((r) => ({ ...r, tier: 'soft' }))
                ];
                const visibleTags = allRisks.slice(0, 3);
                const hiddenCount = allRisks.length - visibleTags.length;
                const isExpanded = expandedStratRow === sKey;

                const hardCount = Math.max(risks.hard.length, s.hardCount ?? 0);
                const softCount = Math.max(risks.soft.length, s.softCount ?? 0);

                let statusLabel = 'ĐẠT';
                let statusColor = '#10b981';
                let statusBg = '#ecfdf5';
                let statusTooltip = 'Đạt tiêu chuẩn an toàn — 0 rủi ro phát hiện';

                if (hardCount > 0) {
                  statusLabel = 'LOẠI';
                  statusColor = '#ef4444';
                  statusBg = '#fef2f2';
                  statusTooltip = `Không đạt — Vi phạm ${hardCount} cờ Hard Flag tuyệt đối (Loại ngay)`;
                } else if (softCount >= 3) {
                  statusLabel = 'HẠ PRIORITY';
                  statusColor = '#dc2626';
                  statusBg = '#fef2f2';
                  statusTooltip = `Cảnh báo nặng — Vi phạm ${softCount} cờ Soft Flags (≥3 cờ, hạ Priority)`;
                } else if (softCount > 0) {
                  statusLabel = 'CẢNH BÁO';
                  statusColor = '#f97316';
                  statusBg = '#fff7ed';
                  statusTooltip = `Cảnh báo nhẹ — Vi phạm ${softCount} cờ Soft Flags (1-2 cờ)`;
                }

                const priorityScore = strategyPriorityMap[sKey] ?? strategyPriorityMap[s.id] ?? 0;
                let priorityTooltip = '';
                let priorityBg = '#ecfdf5';
                let priorityColor = '#10b981';

                if (hardCount > 0) {
                  const hardViolations = risks.hard.map((r) => `#${r.riskId}`).join(', ');
                  priorityTooltip = `Mức ưu tiên: 0 / 100 — Chiến lược bị LOẠI do vi phạm Hard Flags: ${hardViolations}`;
                  priorityBg = '#fef2f2';
                  priorityColor = '#ef4444';
                } else if (priorityScore === 100) {
                  priorityTooltip = 'Độ ưu tiên: 100 / 100 — Chiến lược hoàn hảo, đạt chuẩn khả năng xem xét deploy (0 cờ Soft)';
                } else {
                  const softDetails = risks.soft.map((r) => `#${r.riskId} (-${Number(r.penalty ?? 10)}đ)`).join(', ');
                  priorityTooltip = `Độ ưu tiên: ${priorityScore} / 100 — Trừ điểm các cờ Soft: [${softDetails}]`;
                  if (softCount >= 3) {
                    priorityTooltip += ' — Vi phạm ≥3 Soft Flags nên Priority bị giới hạn ở mức thấp (tối đa 49đ)';
                  }
                  if (priorityScore >= 80) {
                    priorityBg = '#f0f9ff';
                    priorityColor = '#0284c7';
                  } else if (priorityScore >= 50) {
                    priorityBg = '#fffbeb';
                    priorityColor = '#b45309';
                  } else {
                    priorityBg = '#fff1f2';
                    priorityColor = '#e11d48';
                  }
                }

                return (
                  <React.Fragment key={sKey}>
                    <TableRow hover>
                      <TableCell align="center" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {s.id}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {s.backtest || '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                        {s.trades || 0}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color: s.ep <= 0 ? 'error.main' : 'text.primary',
                          fontWeight: s.ep <= 0 ? 700 : 500,
                          fontSize: '0.75rem'
                        }}
                      >
                        {s.ep >= 0 ? '+' : ''}${s.ep.toFixed(2)}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color: s.pf < 1.2 ? 'error.main' : 'text.primary',
                          fontWeight: s.pf < 1.2 ? 700 : 500,
                          fontSize: '0.75rem'
                        }}
                      >
                        {s.pf.toFixed(2)}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color: s.rf < 1.0 ? 'error.main' : 'text.primary',
                          fontWeight: s.rf < 1.0 ? 700 : 500,
                          fontSize: '0.75rem'
                        }}
                      >
                        {s.rf.toFixed(2)}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          color: s.pd < 1.0 ? 'error.main' : 'text.primary',
                          fontWeight: s.pd < 1.0 ? 700 : 500,
                          fontSize: '0.75rem'
                        }}
                      >
                        {s.pd.toFixed(2)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={hardCount}
                          size="small"
                          color={hardCount > 0 ? 'error' : 'default'}
                          variant={hardCount > 0 ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 700, fontSize: '11px', minWidth: 28, height: 20 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={softCount}
                          size="small"
                          color={softCount >= 3 ? 'error' : softCount > 0 ? 'warning' : 'default'}
                          variant={softCount > 0 ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 700, fontSize: '11px', minWidth: 28, height: 20 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={statusTooltip} arrow slotProps={tooltipSlotProps}>
                          <Chip
                            label={statusLabel}
                            size="small"
                            sx={{
                              bgcolor: statusBg,
                              color: statusColor,
                              fontWeight: 800,
                              fontSize: '0.675rem',
                              height: 20,
                              cursor: 'help'
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={priorityTooltip} arrow slotProps={tooltipSlotProps}>
                          <Chip
                            label={`${priorityScore} / 100`}
                            size="small"
                            sx={{
                              bgcolor: priorityBg,
                              color: priorityColor,
                              fontWeight: 800,
                              fontSize: '0.65rem',
                              height: 20,
                              cursor: 'help'
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                          {allRisks.length === 0 && (
                            <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                              ✓ Không có risk
                            </Typography>
                          )}
                          {visibleTags.map((r, idx) => (
                            <Tooltip
                              key={idx}
                              title={`#${r.riskId} ${r.title} — ${r.val} · Click để xem trong Risk View`}
                              arrow
                              slotProps={tooltipSlotProps}
                            >
                              <Chip
                                label={`#${r.riskId}`}
                                size="small"
                                color={r.tier === 'hard' ? 'error' : 'warning'}
                                variant="outlined"
                                onClick={() => handleGoToRisk(r.riskId, r.tier)}
                                sx={{ fontSize: '10px', height: 18, cursor: 'pointer', fontWeight: 700, '&:hover': { opacity: 0.8 } }}
                              />
                            </Tooltip>
                          ))}
                          {hiddenCount > 0 && (
                            <Chip
                              label={`+${hiddenCount}`}
                              size="small"
                              variant="outlined"
                              onClick={() => setExpandedStratRow(isExpanded ? null : sKey)}
                              sx={{ fontSize: '10px', height: 18, cursor: 'pointer', fontWeight: 700 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={allRisks.length === 0}
                          onClick={() => setExpandedStratRow(isExpanded ? null : sKey)}
                          sx={{ fontSize: '10px', py: 0.25, borderRadius: 1.5, textTransform: 'none' }}
                        >
                          {isExpanded ? 'Thu' : 'Xem'}
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={13} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box
                            sx={{
                              m: 2,
                              p: 2.5,
                              bgcolor: 'background.default',
                              borderRadius: 2,
                              border: '1px solid',
                              borderColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'
                            }}
                          >
                            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: '#475569' }}>
                              Tất cả risk của {s.id}
                            </Typography>
                            {risks.hard.length > 0 && (
                              <Box sx={{ mb: 1.5 }}>
                                <Typography variant="caption" fontWeight={700} color="error.main" sx={{ display: 'block', mb: 0.75 }}>
                                  HARD FLAGS ({risks.hard.length})
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {risks.hard.map((r, idx) => (
                                    <Tooltip key={idx} title="Click → Risk View" arrow slotProps={tooltipSlotProps}>
                                      <Box
                                        onClick={() => handleGoToRisk(r.riskId, 'hard')}
                                        sx={{
                                          p: 1,
                                          borderRadius: 1.5,
                                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
                                          border: '1px solid',
                                          borderColor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.3)' : '#fecaca',
                                          cursor: 'pointer',
                                          '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.18)' : '#fee2e2' },
                                          minWidth: 140
                                        }}
                                      >
                                        <Typography variant="caption" fontWeight={700} color="error.main" sx={{ display: 'block' }}>
                                          #{r.riskId} {r.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {r.val}
                                        </Typography>
                                      </Box>
                                    </Tooltip>
                                  ))}
                                </Box>
                              </Box>
                            )}
                            {risks.soft.length > 0 && (
                              <Box>
                                <Typography variant="caption" fontWeight={700} color="warning.main" sx={{ display: 'block', mb: 0.75 }}>
                                  SOFT FLAGS ({risks.soft.length})
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  {risks.soft.map((r, idx) => (
                                    <Tooltip key={idx} title="Click → Risk View" arrow slotProps={tooltipSlotProps}>
                                      <Box
                                        onClick={() => handleGoToRisk(r.riskId, 'soft')}
                                        sx={{
                                          p: 1,
                                          borderRadius: 1.5,
                                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.1)' : '#fffbeb',
                                          border: '1px solid',
                                          borderColor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.3)' : '#fde68a',
                                          cursor: 'pointer',
                                          '&:hover': {
                                             bgcolor: theme.palette.mode === 'dark' ? 'rgba(245, 158, 11, 0.18)' : '#fef3c7'
                                          },
                                          minWidth: 140
                                        }}
                                      >
                                        <Typography variant="caption" fontWeight={700} color="warning.dark" sx={{ display: 'block' }}>
                                          #{r.riskId} {r.title}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {r.val}
                                        </Typography>
                                      </Box>
                                    </Tooltip>
                                  ))}
                                </Box>
                              </Box>
                            )}
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
        
        
        
        <CustomTablePagination
          count={filteredStratView.length}
          page={stratPage - 1}
          rowsPerPage={stratPageSize}
          onPageChange={(_, newPage) => setStratPage(newPage + 1)}
          onRowsPerPageChange={(e) => {
            setStratPageSize(parseInt(e.target.value, 10));
            setStratPage(1);
          }}
        />
        </>
        )}
      </MainCard>
    </Box>
  );
}
