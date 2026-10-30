import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';

import QuestionCircleOutlined from '@ant-design/icons/QuestionCircleOutlined';

import MainCard from 'components/MainCard';
import CardLoader, { CardError } from 'components/CardLoader';

// ==========================================
// LOCAL HELPERS
// ==========================================

function ExitStackBar({ row }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const segments = [
    { key: 'tp', pct: row.tp, color: isDarkMode ? '#81c784' : '#70AD47', label: 'TP' },
    { key: 'sl', pct: row.sl, color: isDarkMode ? '#e57373' : '#FF0000', label: 'SL' },
    { key: 'co', pct: row.co, color: isDarkMode ? '#64b5f6' : '#2E75B6', label: 'CO' },
    { key: 'eot', pct: row.eot, color: isDarkMode ? '#4fc3f7' : '#00B0F0', label: 'EoT' }
  ];
  return (
    <Box sx={{
      display: 'flex',
      height: 12,
      borderRadius: 1.5,
      overflow: 'hidden',
      bgcolor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F2F4F7',
      minWidth: 140,
      border: '1px solid',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#E2E8F0'
    }}>
      {segments.map((s) => (
        <Tooltip key={s.key} title={`${s.label}: ${s.pct}%`} arrow>
          <Box sx={{ width: `${s.pct}%`, bgcolor: s.color }} />
        </Tooltip>
      ))}
    </Box>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function ExitBehaviorTab({
  exitReasonsData,
  exitLoading,
  exitError,
  tablePaperSx,
  renderHeaderActions,
  triggerHelp
}) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const chartTextColor = isDarkMode ? '#cbd5e1' : '#1e293b';

  return (
    <MainCard
      title={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>HÀNH VI THOÁT LỆNH</Typography>
          <IconButton size="small" onClick={() => triggerHelp('c9')} sx={{ p: 0.25, color: 'text.secondary' }}>
            <QuestionCircleOutlined style={{ fontSize: '13px' }} />
          </IconButton>
        </Box>
      }
      secondary={renderHeaderActions('Hành vi thoát lệnh', 'Phân tích Hành vi thoát lệnh TP, SL, CO, EoT', exitReasonsData)}
      sx={{ width: '100%' }}
    >
      {exitLoading ? (
        <CardLoader height={240} size={30} />
      ) : exitError ? (
        <CardError error={exitError} />
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mb: 2.5, p: 1.5, bgcolor: isDarkMode ? 'background.paper' : '#FFFFFF', borderRadius: 2, border: '1px solid', borderColor: 'divider', width: 'fit-content' }}>
        {[
          { color: isDarkMode ? '#81c784' : '#70AD47', label: 'TP' },
          { color: isDarkMode ? '#e57373' : '#FF0000', label: 'SL' },
          { color: isDarkMode ? '#64b5f6' : '#2E75B6', label: 'CO' },
          { color: isDarkMode ? '#4fc3f7' : '#00B0F0', label: 'EoT' }
        ].map((l) => (
          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: l.color }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: chartTextColor }}>{l.label}</Typography>
          </Box>
        ))}
      </Box>
      <TableContainer component={Paper} sx={tablePaperSx}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.default' }}>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Symbol</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, minWidth: 220 }}>Distribution</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>TP %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>SL %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>CO %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>EoT %</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Flag</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {exitReasonsData.map((row) => (
              <TableRow key={row.symbol} hover>
                <TableCell align="center" sx={{ fontWeight: 700, color: chartTextColor }}>{row.symbol}</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <ExitStackBar row={row} />
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ color: isDarkMode ? '#81c784' : '#70AD47', fontWeight: 700 }}>{row.tp}%</TableCell>
                <TableCell align="center" sx={{ color: isDarkMode ? '#e57373' : '#FF0000', fontWeight: 700 }}>{row.sl}%</TableCell>
                <TableCell align="center" sx={{ color: isDarkMode ? '#64b5f6' : '#2E75B6', fontWeight: 700 }}>{row.co}%</TableCell>
                <TableCell align="center" sx={{ color: row.eot > 10 ? (isDarkMode ? '#e57373' : '#FF0000') : (isDarkMode ? '#4fc3f7' : '#00B0F0'), fontWeight: 800 }}>{row.eot}%</TableCell>
                <TableCell align="center">
                  {row.eot > 10 && (
                    <Chip
                      label="EoT High"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: isDarkMode ? '#e57373' : '#FF0000',
                        bgcolor: isDarkMode ? 'rgba(244, 67, 54, 0.15)' : '#FFEBEB',
                        border: '1px solid',
                        borderColor: isDarkMode ? 'rgba(244, 67, 54, 0.3)' : '#FFC7C7',
                        borderRadius: 1.5
                      }}
                    />
                  )}
                  {row.sl >= 45 && (
                    <Chip
                      label="SL Heavy"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: isDarkMode ? '#64b5f6' : '#2E75B6',
                        bgcolor: isDarkMode ? 'rgba(33, 150, 243, 0.15)' : '#E8F1F5',
                        border: '1px solid',
                        borderColor: isDarkMode ? 'rgba(33, 150, 243, 0.3)' : '#BDD7EE',
                        borderRadius: 1.5,
                        ml: row.eot > 10 ? 0.5 : 0
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )}
</MainCard>
  );
}
