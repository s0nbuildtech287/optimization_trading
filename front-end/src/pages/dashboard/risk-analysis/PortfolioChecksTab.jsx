import React from 'react';
import {
  Box,
  Typography,
  IconButton
} from '@mui/material';
import Grid from '@mui/material/Grid';
import { QuestionCircleOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  Cell,
  Legend,
  ReferenceLine,
  PieChart,
  Pie
} from 'recharts';
import MainCard from 'components/MainCard';
import CardLoader, { CardError } from 'components/CardLoader';

const CustomTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          color: '#f8fafc',
          p: 1.5,
          borderRadius: 2,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.75rem',
          minWidth: 140,
          zIndex: 1000
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 0.5 }}
        >
          {label}
        </Typography>
        {payload.map((p, idx) => {
          let val = p.value;
          if (typeof val === 'number') {
            if (suffix === ' USD' || prefix === '$') {
              val = `${prefix}${val.toLocaleString()}${suffix}`;
            } else {
              val = `${prefix}${val}${suffix}`;
            }
          }
          return (
            <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.fill || p.color || '#3b82f6' }} />
                <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
                  {p.name === 'ob' ? 'Buy (OB)' : p.name === 'os' ? 'Sell (OS)' : p.name}
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                {val}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  }
  return null;
};

const DoubleExposureTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const overlapPercent = Number(data.pct || 0);
    const overlapDays = Number(data.days || 0);
    const totalDays = Number(data.total_days || 0);
    const singlePercent = 100 - overlapPercent;
    const singleDays = Number(data.single_days ?? Math.max(0, totalDays - overlapDays));

    return (
      <Box
        sx={{
          bgcolor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          color: '#f8fafc',
          p: 1.5,
          borderRadius: 2,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.75rem',
          minWidth: 180,
          zIndex: 1000
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', pb: 0.5 }}
        >
          Cặp: {label}
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#E24B4A' }} />
            <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
              Overlap
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
            {overlapPercent.toFixed(1)}% ({overlapDays.toLocaleString()} ngày)
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#B5D4F4' }} />
            <Typography variant="caption" sx={{ color: '#cbd5e1', fontWeight: 500 }}>
              Chỉ 1 khung
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
            {singlePercent.toFixed(1)}% ({singleDays.toLocaleString()} ngày)
          </Typography>
        </Box>

        {totalDays > 0 && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 2,
              mt: 0.75,
              pt: 0.75,
              borderTop: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
              Tổng ngày backtest
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
              {totalDays.toLocaleString()} ngày
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
  return null;
};

export default function PortfolioChecksTab({
  portfolioSnapshot,
  marginExposureDataLive,
  marginLoading,
  marginError,
  correlatedDdDataLive,
  symbolDivergenceDataLive,
  lightChartsLoading,
  lightChartsError,
  marketNeutralLive,
  doubleExposureDataLiveFormatted,
  doubleLoading,
  doubleError,
  assetConcentrationLive,
  strategyDominanceLiveFormatted,
  xDomainMax,
  renderHeaderActions,
  openHelpModal,
  CORRELATED_DD_HELP,
  DOUBLE_EXPOSURE_HELP
}) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Grid container spacing={3}>
        {/* ROW 1: Peak Margin Exposure + Correlated Drawdown Days */}
        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  ĐỈNH KÝ QUỸ ĐỒNG THỜI
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'Đỉnh ký quỹ đồng thời (Peak Margin Exposure)',
                      'Khi quá nhiều chiến lược cùng mở lệnh giao dịch cùng một thời điểm, đòn bẩy tài khoản sẽ bị kéo căng tối đa. Ngưỡng an toàn: ≤ 15% tổng số strategies.'
                    )
                  }
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Đỉnh ký quỹ đồng thời',
              `Phân tích biểu đồ Đỉnh ký quỹ đồng thời (Peak Margin Exposure) của danh mục`,
              marginExposureDataLive
            )}
          >
            {marginLoading ? (
              <CardLoader height={220} size={30} />
            ) : marginError ? (
              <CardError error={marginError} />
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Số strategies mở lệnh đồng thời theo ngày — đỉnh:{' '}
              <strong style={{ color: '#FF0000' }}>
                {portfolioSnapshot.peakMarginExposure?.count || 0} strategies ({portfolioSnapshot.peakMarginExposure?.date || 'N/A'})
              </strong>
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={marginExposureDataLive} margin={{ top: 15, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientExposureArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2E75B6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#9DC3E6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  domain={[0, Math.ceil(portfolioSnapshot.maxExposure)]}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<CustomTooltip suffix=" strategies" />} />

                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#2E75B6"
                  strokeWidth={2}
                  fill="url(#gradientExposureArea)"
                  dot={({ cx, cy, payload, index }) => {
                    if (payload.count >= portfolioSnapshot.marginLimit) {
                      return <circle key={index} cx={cx} cy={cy} r={4.5} fill="#FF0000" stroke="#ffffff" strokeWidth={1.5} />;
                    }
                    if (payload.count >= portfolioSnapshot.marginLimit * 0.7) {
                      return <circle key={index} cx={cx} cy={cy} r={3} fill="#00B0F0" />;
                    }
                    return <circle key={index} cx={cx} cy={cy} r={2} fill="#2E75B6" strokeOpacity={0.4} />;
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </MainCard>
    </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  NGÀY SỤT GIẢM ĐỒNG THUẬN
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => openHelpModal('Ngày sụt giảm đồng thuận (Correlated Drawdown Days)', CORRELATED_DD_HELP)}
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Ngày sụt giảm đồng thuận',
              `Phân tích biểu đồ Ngày sụt giảm đồng thuận (Correlated Drawdown Days) của danh mục`,
              correlatedDdDataLive
            )}
          >
            {lightChartsLoading ? (
              <CardLoader height={220} size={30} />
            ) : lightChartsError ? (
              <CardError error={lightChartsError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Số ngày có <strong>đồng thuận thua lỗ (ngưỡng động)</strong> — trung bình năm:{' '}
              <strong style={{ color: '#FF0000' }}>{portfolioSnapshot.correlatedLossDays || 0} ngày</strong>
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={correlatedDdDataLive} margin={{ top: 15, right: 8, left: -20, bottom: 0 }} barCategoryGap="10%">
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  domain={[0, Math.max(...correlatedDdDataLive.map((d) => Number(d.days || 0)), 6)]}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<CustomTooltip suffix=" days" />} />
                <Bar dataKey="days" radius={[3, 3, 0, 0]} barSize={28}>
                  {correlatedDdDataLive.map((entry, idx) => {
                    const maxCorrelatedDays = Math.max(...correlatedDdDataLive.map((d) => Number(d.days || 0)), 6);
                    let fillVal = '#2E75B6';
                    if (entry.days >= maxCorrelatedDays * 0.6)
                      fillVal = '#FF0000';
                    else if (entry.days >= maxCorrelatedDays * 0.3)
                      fillVal = '#9DC3E6';
                    else fillVal = '#70AD47';
                    return <Cell key={idx} fill={fillVal} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </>
            )}
          </MainCard>
        </Grid>

        {/* ROW 2: Multi-Symbol Strategy Divergence + Market-Neutral Balance */}
        <Grid size={{ xs: 12, md: 8 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  PHÂN KỲ HIỆU SUẤT ĐA TÀI SẢN
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'Phân kỳ hiệu suất đa tài sản (Multi-Symbol Strategy Divergence)',
                      'Một chiến lược hoạt động đa tài sản nhưng hiệu suất cực kỳ lệch pha — tài sản này nuôi lỗ tài sản kia, chênh lệch vượt ngưỡng an toàn $2K.'
                    )
                  }
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Phân kỳ hiệu suất đa tài sản',
              `Phân tích biểu đồ Phân kỳ hiệu suất đa tài sản (Multi-Symbol Strategy Divergence) của danh mục`,
              symbolDivergenceDataLive
            )}
          >
            {lightChartsLoading ? (
              <CardLoader height={240} size={30} />
            ) : lightChartsError ? (
              <CardError error={lightChartsError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Profit Buy (OB) vs Sell (OS) theo từng symbol — lệch pha lớn = rủi ro cao
            </Typography>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={symbolDivergenceDataLive}
                margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
                barCategoryGap="15%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} />
                <XAxis
                  dataKey="symbol"
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<CustomTooltip prefix="$" />} />
                <Legend
                  formatter={(v) => (v === 'ob' ? 'Buy (OB)' : 'Sell (OS)')}
                  wrapperStyle={{ fontSize: 10, paddingTop: 10, color: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                />
                <ReferenceLine y={0} stroke="#CBD5E1" strokeWidth={1} />
                <Bar dataKey="ob" fill="#2E75B6" radius={[3, 3, 0, 0]} name="ob" barSize={20}>
                  {symbolDivergenceDataLive.map((entry, idx) => {
                    let fillVal = '#2E75B6';
                    if (entry.ob < 0) fillVal = '#FF0000';
                    return <Cell key={idx} fill={fillVal} />;
                  })}
                </Bar>
                <Bar dataKey="os" fill="#9DC3E6" radius={[3, 3, 0, 0]} name="os" barSize={20}>
                  {symbolDivergenceDataLive.map((entry, idx) => {
                    let fillVal = '#9DC3E6';
                    if (entry.os < 0) fillVal = '#FF0000';
                    return <Cell key={idx} fill={fillVal} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </>
            )}
          </MainCard>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  CÂN BẰNG MUA/BÁN
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'Cân bằng Mua/Bán (Market-Neutral Balance)',
                      'Đo lường tính trung lập thị trường. Tỷ lệ hoàn hảo nằm trong ngưỡng an toàn 45%–55%.'
                    )
                  }
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Cân bằng mua bán',
              `Phân tích biểu đồ Cân bằng Mua/Bán (Market-Neutral Balance) của danh mục`,
              marketNeutralLive
            )}
          >
            {lightChartsLoading ? (
              <CardLoader height={240} size={30} />
            ) : lightChartsError ? (
              <CardError error={lightChartsError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Tỷ lệ Buy/Sell toàn danh mục — safe zone: <strong style={{ color: '#70AD47' }}>45%–55%</strong>
            </Typography>

            <Box sx={{ position: 'relative', width: '100%', height: 200 }}>
              <Box sx={{ width: '100%', height: '100%', zIndex: 2, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={marketNeutralLive}
                      cx="50%"
                      cy="45%"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={60}
                      outerRadius={78}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      <Cell key="buy" fill="var(--chart-title-color, #1F3864)" stroke="#ffffff" strokeWidth={1.5} />
                      <Cell key="sell" fill="#2E75B6" stroke="#ffffff" strokeWidth={1.5} />
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip suffix="%" />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Box
                sx={{
                  position: 'absolute',
                  zIndex: 1,
                  top: '41%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}
              >
                <Typography
                  variant="h5"
                  sx={{ fontWeight: 800, color: 'var(--chart-title-color, #1F3864)', fontFamily: 'monospace', lineHeight: 1.1 }}
                >
                  {portfolioSnapshot.marketNeutralRatio}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  OB : OS Ratio
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2.5, mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'var(--chart-title-color, #1F3864)' }} />
                <Typography variant="caption" fontWeight={700} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  Buy (OB): {Math.round(portfolioSnapshot.marketNeutralBuy)}%
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2E75B6' }} />
                <Typography variant="caption" fontWeight={700} sx={{ color: '#2E75B6' }}>
                  Sell (OS): {Math.round(portfolioSnapshot.marketNeutralSell)}%
                </Typography>
              </Box>
            </Box>
            </>
            )}
          </MainCard>
        </Grid>

        {/* ROW 3: Double Exposure + Asset Concentration + Strategy Profit Dominance */}
        <Grid size={{ xs: 12, md: 4 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  TRÙNG LẶP VỊ THẾ KÉP
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => openHelpModal('Trùng lặp vị thế kép (Double Exposure Overlap)', DOUBLE_EXPOSURE_HELP)}
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Trùng lặp vị thế kép',
              `Phân tích biểu đồ Trùng lặp vị thế kép (Double Exposure Overlap) của danh mục`,
              doubleExposureDataLiveFormatted
            )}
          >
            {doubleLoading ? (
              <CardLoader height={220} size={30} />
            ) : doubleError ? (
              <CardError error={doubleError} />
            ) : (
              <>
                {/* Custom Stacked Legend */}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              % ngày H1 & H4 cùng chiều trên cùng symbol — <strong>đỏ = trùng lệnh, xanh = chỉ 1 khung</strong>
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#E24B4A' }} />
                <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700 }}>Overlap %</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: '#B5D4F4' }} />
                <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700 }}>Chỉ 1 khung %</Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 0, height: 10, borderRight: '1.5px dashed #E24B4A' }} />
                <Typography sx={{ fontSize: '10px', color: 'text.secondary', fontWeight: 700 }}>An toàn ≤ 5%</Typography>
              </Box>
            </Box>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={doubleExposureDataLiveFormatted}
                margin={{ top: 15, right: 8, left: -20, bottom: 0 }}
                barCategoryGap="15%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} />
                <XAxis
                  dataKey="pair"
                  tick={{ fontSize: 8, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  angle={-15}
                  textAnchor="end"
                  height={45}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<DoubleExposureTooltip />} />
                <ReferenceLine
                  y={5}
                  stroke="#E24B4A"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: 'Limit (5%)', fontSize: 8, fill: '#E24B4A', position: 'top', fontWeight: 700 }}
                />

                <Bar dataKey="pct" stackId="a" fill="#E24B4A" radius={[0, 0, 0, 0]} barSize={20} />
                <Bar dataKey="singlePct" stackId="a" fill="#B5D4F4" radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </MainCard>
    </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  TỶ TRỌNG TẬP TRUNG TÀI SẢN
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'Tỷ trọng tập trung tài sản (Asset Concentration Ratio)',
                      'Toàn bộ lợi nhuận của danh mục bị lệ thuộc vào sự biến động của một tài sản đơn lẻ (Vàng), làm mất tính đa dạng hóa đầu tư. Ngưỡng an toàn: không symbol nào chiếm > 30%.'
                    )
                  }
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Tỷ trọng tập trung tài sản',
              `Phân tích biểu đồ Tỷ trọng tập trung tài sản (Asset Concentration Ratio) của danh mục`,
              assetConcentrationLive
            )}
          >
            {lightChartsLoading ? (
              <CardLoader height={240} size={30} />
            ) : lightChartsError ? (
              <CardError error={lightChartsError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Tỷ trọng profit theo symbol —{' '}
              <strong style={{ color: '#FF0000' }}>
                {portfolioSnapshot.topAsset.symbol} chiếm {Number(portfolioSnapshot.topAsset.value || 0).toFixed(1)}%
              </strong>
            </Typography>

            <Box sx={{ position: 'relative', width: '100%', height: 200 }}>
              <Box sx={{ width: '100%', height: '100%', zIndex: 2, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetConcentrationLive}
                      cx="50%"
                      cy="45%"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={60}
                      outerRadius={78}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="symbol"
                    >
                      {assetConcentrationLive.map((entry, index) => {
                        const colors = ['var(--chart-title-color, #1F3864)', '#2E75B6', '#9DC3E6', '#00B0F0', '#CBD5E1'];
                        const fill = colors[index % colors.length];
                        const stroke = index === 0 ? '#FF0000' : '#ffffff';
                        const strokeWidth = index === 0 ? 2.5 : 1.5;
                        return <Cell key={`cell-${index}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                      })}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip suffix="%" />} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Box
                sx={{
                  position: 'absolute',
                  zIndex: 1,
                  top: '41%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}
              >
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#FF0000', fontFamily: 'monospace', lineHeight: 1.1 }}>
                  {`${Number(portfolioSnapshot.topAsset.value || 0).toFixed(0)}%`}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'var(--chart-title-color, #1F3864)', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  {`${portfolioSnapshot.topAsset.symbol || 'N/A'} Peak`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.25, flexWrap: 'wrap', mt: 1.5 }}>
              {assetConcentrationLive.map((entry, index) => {
                const colors = ['var(--chart-title-color, #1F3864)', '#2E75B6', '#9DC3E6', '#00B0F0', '#CBD5E1'];
                const fill = colors[index % colors.length];
                const borderStyle = index === 0 ? '1px solid #FF0000' : 'none';
                return (
                  <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: fill, border: borderStyle }} />
                    <Typography variant="caption" fontWeight={700} sx={{ fontSize: '10px', color: fill }}>
                      {`${entry.symbol}: ${Number(entry.value || 0).toFixed(1)}%`}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
            </>
            )}
          </MainCard>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <MainCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ color: 'var(--chart-title-color, #1F3864)' }}>
                  ĐỘ ĐỘC QUYỀN LỢI NHUẬN
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    openHelpModal(
                      'Độ độc quyền lợi nhuận (Strategy Profit Dominance)',
                      'Một chiến lược đơn lẻ gánh vác quá lớn tỷ trọng sinh lời của danh mục, rất nguy hiểm nếu chiến lược đó bước vào chu kỳ lỗi. Ngưỡng an toàn: không strategy nào chiếm > 20%.'
                    )
                  }
                  sx={{ p: 0.25, color: 'text.secondary' }}
                >
                  <QuestionCircleOutlined style={{ fontSize: '13px' }} />
                </IconButton>
              </Box>
            }
            secondary={renderHeaderActions(
              'Độ độc quyền lợi nhuận',
              `Phân tích biểu đồ Độ độc quyền lợi nhuận (Strategy Profit Dominance) của danh mục`,
              strategyDominanceLiveFormatted
            )}
          >
            {lightChartsLoading ? (
              <CardLoader height={240} size={30} />
            ) : lightChartsError ? (
              <CardError error={lightChartsError} />
            ) : (
            <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Top strategies theo % profit —{' '}
              <strong style={{ color: '#FF0000' }}>
                {portfolioSnapshot.topDominance.id} gánh {Number(portfolioSnapshot.topDominance.pct || 0).toFixed(1)}%
              </strong>
            </Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={strategyDominanceLiveFormatted}
                layout="vertical"
                margin={{ top: 15, right: 8, left: -10, bottom: 0 }}
                barCategoryGap="10%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.3} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  domain={[0, xDomainMax]}
                  tickLine={false}
                  axisLine={{ stroke: '#CBD5E1' }}
                />
                <YAxis
                  type="category"
                  dataKey="id"
                  tick={{ fontSize: 8, fill: 'var(--chart-title-color, #1F3864)', fontWeight: 600 }}
                  width={110}
                  tickLine={false}
                  axisLine={false}
                />
                <RechartsTooltip content={<CustomTooltip suffix="%" />} />
                <ReferenceLine
                  x={20}
                  stroke="#FF0000"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: 'Limit (20%)', fontSize: 9, fill: '#FF0000', position: 'top', fontWeight: 700 }}
                />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={20}>
                  {strategyDominanceLiveFormatted.map((entry, idx) => {
                    let fillVal = '#2E75B6';
                    if (entry.pct >= 20) fillVal = 'var(--chart-title-color, #1F3864)';
                    return <Cell key={idx} fill={fillVal} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </>
            )}
          </MainCard>
        </Grid>
      </Grid>
    </Box>
  );
}
