import { useState } from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import MainCard from 'components/MainCard';
import DashboardAiAnalysisDialog from 'components/dashboard/DashboardAiAnalysisDialog';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';
import CalendarOutlined from '@ant-design/icons/CalendarOutlined';
import { CardLoader } from 'components/CardLoader';

export const dashboardDetailButtonSx = {
  bgcolor: '#0f172a',
  color: '#fff',
  fontWeight: 600,
  px: 2.5,
  borderRadius: 1.5,
  '&:hover': { bgcolor: '#1e293b' }
};

const innerCardSx = {
  p: 2.5,
  borderRadius: 3,
  bgcolor: '#ffffff',
  borderColor: '#e2e8f0',
  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.01)',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.25s ease-in-out',
  '&:hover': {
    borderColor: 'primary.main',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.04)',
    transform: 'translateY(-2px)'
  }
};

export default function DashboardKpiSummary({ title, items, sx, aiAnalysis, onDetailedReportClick, onRemarksClick, loading }) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  const tooltipSlotProps = {
    tooltip: {
      sx: {
        bgcolor: isDarkMode ? '#1e293b' : '#0f172a',
        color: '#ffffff',
        boxShadow: isDarkMode 
          ? '0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)'
          : '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.15)',
        border: '1px solid',
        borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
        fontSize: '0.75rem',
        fontWeight: 500,
        padding: '8px 12px',
        borderRadius: '6px',
        lineHeight: 1.4
      }
    },
    arrow: {
      sx: {
        color: isDarkMode ? '#1e293b' : '#0f172a'
      }
    }
  };

  const [aiOpen, setAiOpen] = useState(false);
  const colMd = items.length <= 4 ? 12 / items.length : 2.4;

  const secondary = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Tooltip title="Có áp dụng Date Range" arrow slotProps={tooltipSlotProps}>
        <IconButton
          size="small"
          sx={{
            color: 'success.main',
            p: 0.25,
            mr: 0.5,
            cursor: 'default',
            '&:hover': { bgcolor: 'transparent' }
          }}
        >
          <CalendarOutlined style={{ fontSize: '16px' }} />
        </IconButton>
      </Tooltip>
      {aiAnalysis && (
        <Button size="small" variant="contained" onClick={() => setAiOpen(true)} sx={dashboardDetailButtonSx}>
          AI Analysis
        </Button>
      )}
      <Button
        size="small"
        variant="contained"
        onClick={() => {
          if (onRemarksClick) {
            onRemarksClick();
          } else if (onDetailedReportClick) {
            onDetailedReportClick();
          } else {
            window.location.href = '/dashboard?report=true';
          }
        }}
        sx={dashboardDetailButtonSx}
      >
        Remarks
      </Button>
    </Box>
  );

  return (
    <>
      <MainCard title={title} secondary={secondary} sx={{ mb: 3, width: '100%', ...sx }}>
        {loading ? (
          <CardLoader height={120} size={28} message="Loading summary..." />
        ) : (
        <Grid container spacing={2.5}>
          {items.map((item) => (
            <Grid key={item.label} size={{ xs: 12, sm: 6, md: colMd }}>
              <Card variant="outlined" sx={innerCardSx}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}
                    >
                      {item.label}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: item.valueColor || 'text.primary', mt: 0.5 }}>
                      {item.value}
                    </Typography>
                  </Box>
                  {item.icon && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: item.iconBg || '#f1f5f9',
                        flexShrink: 0
                      }}
                    >
                      {item.icon}
                    </Box>
                  )}
                </Box>
                {item.sub && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {item.sub}
                  </Typography>
                )}
              </Card>
            </Grid>
          ))}
        </Grid>
        )}
      </MainCard>

      {aiAnalysis && (
        <DashboardAiAnalysisDialog
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          title={aiAnalysis.title}
          subtitle={aiAnalysis.subtitle}
          badge={aiAnalysis.badge}
          sections={aiAnalysis.sections}
          targetId={aiAnalysis.targetId}
          selectedTable={aiAnalysis.selectedTable}
          dateRange={aiAnalysis.dateRange}
        />
      )}
    </>
  );
}

DashboardKpiSummary.propTypes = {
  title: PropTypes.string,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      sub: PropTypes.string,
      valueColor: PropTypes.string,
      icon: PropTypes.node,
      iconBg: PropTypes.string
    })
  ).isRequired,
  sx: PropTypes.object,
  aiAnalysis: PropTypes.shape({
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    badge: PropTypes.string,
    sections: PropTypes.arrayOf(
      PropTypes.shape({
        heading: PropTypes.string.isRequired,
        body: PropTypes.string.isRequired
      })
    ).isRequired
  }),
  onDetailedReportClick: PropTypes.func,
  onRemarksClick: PropTypes.func,
  loading: PropTypes.bool
};
