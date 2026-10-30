import React, { Fragment } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  QuestionCircleOutlined,
  UpOutlined,
  DownOutlined,
  RobotOutlined
} from '@ant-design/icons';
import MainCard from 'components/MainCard';
import CardLoader from 'components/CardLoader';

export default function BotComparisonTab({
  botViewData,
  expandedBotRows,
  handleToggleBotRow,
  isDarkMode,
  searchVal,
  setSearchVal,
  selectedSymbol,
  setSelectedSymbol,
  selectedDirection,
  setSelectedDirection,
  selectedTimeframe,
  setSelectedTimeframe,
  selectedStatus,
  setSelectedStatus,
  selectedOverallStatus,
  setSelectedOverallStatus,
  colors,
  tooltipSlotProps,
  theme,
  getHardFlagsTooltipText,
  getSoftFlagsTooltipText,
  getPriorityRiskChip,
  getFinalScoreValue,
  handleInspectChildStrategy,
  openHelpModal,
  dimensionsLoading
}) {
  return (
    <Box>
      {(searchVal ||
        selectedSymbol !== 'all' ||
        selectedDirection !== 'all' ||
        selectedTimeframe !== 'all' ||
        selectedStatus !== 'all' ||
        selectedOverallStatus !== 'all') && (
        <Box
          sx={{
            mb: 2.5,
            p: 1.75,
            bgcolor: isDarkMode ? 'rgba(24, 144, 255, 0.05)' : '#e6f7ff',
            border: '1px solid',
            borderColor: isDarkMode ? 'rgba(24, 144, 255, 0.2)' : '#bae7ff',
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, color: isDarkMode ? '#69c0ff' : '#0050b3' }}>
            Đang áp dụng bộ lọc:
            {searchVal && ` ID chứa "${searchVal}"`}
            {selectedSymbol !== 'all' && ` · Symbol: ${selectedSymbol}`}
            {selectedDirection !== 'all' && ` · Direction: ${selectedDirection}`}
            {selectedTimeframe !== 'all' && ` · TF: ${selectedTimeframe}`}
            {selectedStatus !== 'all' && ` · Status: ${selectedStatus}`}
            {selectedOverallStatus !== 'all' && ` · Overall Status: ${selectedOverallStatus}`}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              setSearchVal('');
              setSelectedSymbol('all');
              setSelectedDirection('all');
              setSelectedTimeframe('all');
              setSelectedStatus('all');
              setSelectedOverallStatus('all');
            }}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              fontWeight: 700,
              px: 2,
              py: 0.5,
              bgcolor: isDarkMode ? 'primary.main' : '#1890ff',
              '&:hover': { bgcolor: isDarkMode ? 'primary.dark' : '#096dd9' }
            }}
          >
            Reset bộ lọc
          </Button>
        </Box>
      )}
      <MainCard sx={{ width: '100%' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Strategy Bot — Phân tích xếp hạng Dòng Bot Gốc
              </Typography>
              <IconButton
                size="small"
                onClick={() =>
                  openHelpModal(
                    'PHÂN TÍCH XẾP HẠNG DÒNG BOT GỐC (STRATEGY BOT ANALYSIS)',
                    `Giao diện gom nhóm toàn bộ các cấu hình con (child configurations) theo mã Bot gốc (3 chữ số đầu tiên của Strategy ID) đang hiển thị dưới các bộ lọc hiện tại.\n\nÝ nghĩa các chỉ số & cột:\n- Dòng Bot: Mã định danh 3 số của Bot cha (ví dụ: 001, 002, 003...).\n- Số cấu hình: Tổng số cấu hình con đang hoạt động tương ứng với bộ lọc.\n- Phân bổ chất lượng (Quality Distribution):\n   + Passed (Xanh lá): Đạt chuẩn an toàn cao (Priority Score >= 80, không dính cờ rủi ro Hard/Soft).\n   + Warning (Vàng): Trung bình, cần theo dõi thêm (Priority Score từ 50 đến 79).\n   + Disqualified (Đỏ): Rủi ro cao hoặc bị loại (Priority Score < 50 hoặc vi phạm cờ Hard).\n- Avg Final Score: Điểm số hiệu suất chuẩn hóa trung bình (0-100) của tất cả cấu hình con.\n- Avg Priority: Điểm ưu tiên rủi ro trung bình (0-100) của tất cả cấu hình con.\n- Total Profit: Tổng lợi nhuận ròng lũy kế của toàn bộ dòng Bot.\n- Avg PF: Chỉ số Profit Factor trung bình.\n- Max Drawdown: Mức sụt giảm tài sản tạm thời lớn nhất (worst-case drawdown) ghi nhận trong nhóm.\n\nQuy tắc đánh giá chung (Overall Status):\n- EXCELLENT (Thành công xuất sắc): Khi có >= 70% số cấu hình con đạt trạng thái Passed.\n- GOOD (Tốt / Khuyến nghị): Khi có >= 40% số cấu hình con đạt trạng thái Passed.\n- MONITOR (Cần theo dõi): Trạng thái mặc định khi hiệu suất trung bình.\n- DISQUALIFIED (Bị loại bỏ): Khi >= 50% số cấu hình con bị cắm cờ hoặc dính lỗi Disqualified.`
                  )
                }
              >
                <QuestionCircleOutlined style={{ fontSize: '14px' }} />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Gom nhóm xếp hạng các cấu hình con theo dòng Bot gốc (3 chữ số đầu tiên của Strategy ID) dựa trên các bộ lọc đang chọn.
            </Typography>
          </Box>

          <FormControl size="small" sx={{ minWidth: 200, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
            <InputLabel id="overall-status-filter-label" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Overall Status
            </InputLabel>
            <Select
              labelId="overall-status-filter-label"
              value={selectedOverallStatus}
              label="Overall Status"
              onChange={(e) => setSelectedOverallStatus(e.target.value)}
              sx={{
                height: 38,
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: 1.5,
                bgcolor: isDarkMode ? 'background.default' : '#ffffff'
              }}
            >
              <MenuItem value="all" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Tất cả trạng thái
              </MenuItem>
              <MenuItem value="EXCELLENT" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.success.text }}>
                EXCELLENT
              </MenuItem>
              <MenuItem value="GOOD" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.info.text }}>
                GOOD
              </MenuItem>
              <MenuItem value="MONITOR" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.warning.text }}>
                MONITOR
              </MenuItem>
              <MenuItem value="DISQUALIFIED" sx={{ fontSize: '0.8rem', fontWeight: 600, color: colors.error.text }}>
                DISQUALIFIED
              </MenuItem>
            </Select>
          </FormControl>
        </Box>

        {dimensionsLoading ? (
          <CardLoader height={320} size={35} message="Đang tải dữ liệu xếp hạng Bot..." />
        ) : (
          <TableContainer
            component={Paper}
            sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto' }}
          >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell style={{ width: 40 }} />
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Bot Family
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Strategies
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, width: 220 }}>
                  Quality Distribution
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg Final Score
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg Priority
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Total Profit
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg PF
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg RF
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg P/D
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Avg Drawdown
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Overall Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {botViewData.map((bot) => {
                const isExpanded = !!expandedBotRows[bot.botId];
                const passedPct = bot.totalConfigs > 0 ? (bot.passedCount / bot.totalConfigs) * 100 : 0;
                const warningPct = bot.totalConfigs > 0 ? (bot.warningCount / bot.totalConfigs) * 100 : 0;
                const disqualifiedPct = bot.totalConfigs > 0 ? (bot.disqualifiedCount / bot.totalConfigs) * 100 : 0;

                return (
                  <Fragment key={bot.botId}>
                    <TableRow hover onClick={() => handleToggleBotRow(bot.botId)} sx={{ cursor: 'pointer' }}>
                      <TableCell
                        align="center"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleBotRow(bot.botId);
                        }}
                      >
                        <IconButton size="small">
                          {isExpanded ? <UpOutlined style={{ fontSize: '12px' }} /> : <DownOutlined style={{ fontSize: '12px' }} />}
                        </IconButton>
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'primary.main' }}>
                        {bot.botId}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {bot.totalConfigs} strategies
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Tooltip
                          title={
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5 }}>
                              <Typography variant="caption" sx={{ color: '#4ade80', fontWeight: 700 }}>
                                Passed (Đạt): {bot.passedCount} configs
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#ffc069', fontWeight: 700 }}>
                                Warning (Cảnh báo): {bot.warningCount} configs
                              </Typography>
                              <Typography variant="caption" sx={{ color: '#ff4d4f', fontWeight: 700 }}>
                                Disqualified (Loại): {bot.disqualifiedCount} configs
                              </Typography>
                            </Box>
                          }
                          arrow
                          slotProps={tooltipSlotProps}
                        >
                          <Box sx={{ width: '100%' }}>
                            <Box
                              sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, fontSize: '0.675rem', fontWeight: 600 }}
                            >
                              <span style={{ color: colors.success.text }}>{bot.passedCount} P</span>
                              <span style={{ color: colors.warning.text }}>{bot.warningCount} W</span>
                              <span style={{ color: colors.error.text }}>{bot.disqualifiedCount} D</span>
                            </Box>
                            <Box sx={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
                              {bot.passedCount > 0 && <Box sx={{ width: `${passedPct}%`, bgcolor: colors.success.text, opacity: 0.9 }} />}
                              {bot.warningCount > 0 && <Box sx={{ width: `${warningPct}%`, bgcolor: colors.warning.text, opacity: 0.9 }} />}
                              {bot.disqualifiedCount > 0 && <Box sx={{ width: `${disqualifiedPct}%`, bgcolor: colors.error.text, opacity: 0.9 }} />}
                            </Box>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {bot.avgFinalScore}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 700,
                          color: bot.avgPriority >= 80 ? colors.success.text : bot.avgPriority >= 50 ? colors.warning.text : colors.error.text
                        }}
                      >
                        {bot.avgPriority} / 100
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, color: bot.totalProfit >= 0 ? colors.success.text : colors.error.text }}>
                        {bot.totalProfit >= 0 ? '+' : ''}$
                        {bot.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {bot.avgPf}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {bot.avgRf}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {bot.avgPd}
                      </TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, color: colors.error.text }}>
                        {bot.avgDrawdown.toFixed(1)}%
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={bot.overallStatus}
                          size="small"
                          sx={{
                            fontWeight: 800,
                            fontSize: '0.675rem',
                            height: 20,
                            bgcolor: bot.statusColor === 'success' ? colors.success.bg : bot.statusColor === 'info' ? colors.info.bg : bot.statusColor === 'error' ? colors.error.bg : colors.warning.bg,
                            color: bot.statusColor === 'success' ? colors.success.text : bot.statusColor === 'info' ? colors.info.text : bot.statusColor === 'error' ? colors.error.text : colors.warning.text,
                            border: `1px solid ${bot.statusColor === 'success' ? colors.success.border : bot.statusColor === 'info' ? colors.info.border : bot.statusColor === 'error' ? colors.error.border : colors.warning.border}`,
                            borderRadius: 1.5
                          }}
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={12} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box
                            sx={{
                              m: 2,
                              p: 2,
                              bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'background.default',
                              borderRadius: 2,
                              border: '1px solid',
                              borderColor: 'divider'
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              fontWeight={700}
                              sx={{ mb: 1.5, color: 'text.primary', display: 'flex', alignItems: 'center', gap: 1 }}
                            >
                              <RobotOutlined style={{ color: theme.palette.primary.main }} />
                              Bot {bot.botId} Strategy List ({bot.totalConfigs} strategies)
                            </Typography>
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
                                  <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'background.default' : '#f8fafc' }}>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Strategy ID
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Backtest Table
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Trades
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Profit
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      PF
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      RF
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      P/D
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Drawdown
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Hard Flags
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Soft Flags
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Final Score
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Priority
                                    </TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                                      Action
                                    </TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {bot.strats.map((s, sIdx) => {
                                    const pScore = s.priorityScore ?? 100;
                                    const fScore = getFinalScoreValue(s);
                                    const hCount = Number(s.hardCount || 0);
                                    const sCount = Number(s.softCount || 0);

                                    return (
                                      <TableRow key={sIdx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                        <TableCell
                                          align="center"
                                          sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.75rem', color: 'text.primary' }}
                                        >
                                          {s.id}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                          {s.backtest || '-'}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                                          {s.trades}
                                        </TableCell>
                                        <TableCell
                                          align="center"
                                          sx={{
                                            fontWeight: 700,
                                            fontSize: '0.75rem',
                                            color: s.profit >= 0 ? colors.success.text : colors.error.text
                                          }}
                                        >
                                          {s.profit >= 0 ? '+' : ''}$
                                          {s.profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                                          {s.pf.toFixed(2)}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                                          {s.rf.toFixed(2)}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem' }}>
                                          {s.pd.toFixed(2)}
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontSize: '0.75rem', fontWeight: 600, color: colors.error.text }}>
                                          {(s.drawdownPct ?? (s.pd > 0 ? s.profit / s.pd : 0)).toFixed(1)}%
                                        </TableCell>
                                        <TableCell align="center">
                                           <Tooltip
                                             title={getHardFlagsTooltipText(s)}
                                             arrow
                                             slotProps={tooltipSlotProps}
                                          >
                                            <Chip
                                              label={hCount}
                                              size="small"
                                              color={hCount > 0 ? 'error' : 'default'}
                                              variant="outlined"
                                              sx={{ fontWeight: 700, fontSize: '10px', height: 18, cursor: 'help' }}
                                            />
                                          </Tooltip>
                                        </TableCell>
                                        <TableCell align="center">
                                           <Tooltip
                                             title={getSoftFlagsTooltipText(s)}
                                             arrow
                                             slotProps={tooltipSlotProps}
                                          >
                                            <Chip
                                              label={sCount}
                                              size="small"
                                              color={sCount >= 3 ? 'error' : sCount > 0 ? 'warning' : 'default'}
                                              variant="outlined"
                                              sx={{ fontWeight: 700, fontSize: '10px', height: 18, cursor: 'help' }}
                                            />
                                          </Tooltip>
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'primary.main' }}>
                                          {fScore}
                                        </TableCell>
                                        <TableCell align="center">
                                          {getPriorityRiskChip(s, theme)}
                                        </TableCell>
                                        <TableCell align="center">
                                          <Button
                                            variant="contained"
                                            size="small"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleInspectChildStrategy(s.id, s.backtest);
                                            }}
                                            sx={{
                                              fontSize: '0.675rem',
                                              py: 0.25,
                                              px: 1,
                                              borderRadius: 1.5,
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
                                </TableBody>
                              </Table>
                            </TableContainer>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          </TableContainer>
        )}
      </MainCard>
    </Box>
  );
}
