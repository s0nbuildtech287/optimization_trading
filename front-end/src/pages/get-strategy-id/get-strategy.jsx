import React, { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Grid,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Tabs,
  Tab
} from '@mui/material';
import { CopyOutlined, GoogleOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';

// project imports
import MainCard from 'components/MainCard';
import { getServiceAccountEmails, getStrategyIdsFromFolder } from 'api/Strategy';
import CheckFileOptimization from './check-file-optimization';

// ─── Tab Panel Helper ─────────────────────────────────────────────────────────
function TabPanel({ children, value, index }) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ pt: 3 }}>
      {value === index && children}
    </Box>
  );
}

// ─── Tab 1: Get Strategy ID (existing logic) ──────────────────────────────────
const GetStrategyIdTab = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const [activeStep, setActiveStep] = useState(0);
  const [folderLink, setFolderLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [serviceAccounts, setServiceAccounts] = useState([]);
  const isAdmin = useMemo(() => {
    try {
      const stored = localStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : null;
      const role = String(parsed?.role || '').toLowerCase();
      const roles = Array.isArray(parsed?.roles) ? parsed.roles.map((item) => String(item).toLowerCase()) : [];
      return role === 'admin' || roles.some((item) => item.includes('admin'));
    } catch {
      return false;
    }
  }, []);
  const displayedServiceAccounts = isAdmin
    ? serviceAccounts
    : Array.from({ length: 8 }, (_, index) => `Account ${index + 1}: ********@********.iam.gserviceaccount.com`);

  useEffect(() => {
    if (!isAdmin) return;

    const loadServiceAccounts = async () => {
      try {
        const response = await getServiceAccountEmails();
        if (response.success && response.data?.emails) {
          setServiceAccounts(response.data.emails);
        }
      } catch (err) {
        console.error('Could not load service accounts from backend:', err);
      }
    };
    loadServiceAccounts();
  }, [isAdmin]);

  const steps = [
    {
      label: 'Cấp quyền cho Service Accounts',
      description: 'Cấp quyền đọc (Viewer) cho 8 service accounts vào Google Drive folder'
    },
    {
      label: 'Nhập link Google Drive folder',
      description: 'Dán link folder chứa các sheet cần lấy tên'
    },
    {
      label: 'Lấy danh sách Strategy ID',
      description: 'Hệ thống sẽ quét và trả về danh sách tên sheet'
    }
  ];

  const handleCopyEmail = async (email) => {
    if (!isAdmin) return;

    try {
      await navigator.clipboard.writeText(email);
      setSuccess(`Đã copy: ${email}`);
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      setError('Không thể copy email');
    }
  };

  const handleCopyAllEmails = async () => {
    if (!isAdmin) return;

    try {
      await navigator.clipboard.writeText(serviceAccounts.join('\n'));
      setSuccess('Đã copy tất cả email service accounts!');
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      setError('Không thể copy danh sách email');
    }
  };

  const handleGetSheetNames = async () => {
    if (!folderLink.trim()) {
      setError('Vui lòng nhập link Google Drive folder');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await getStrategyIdsFromFolder(folderLink);
      if (response.success && response.data?.sheetNames) {
        setSheetNames(response.data.sheetNames);
        setSuccess(`Đã lấy danh sách ${response.data.count} Strategy IDs thành công!`);
        setActiveStep(2);
      } else {
        setError('Không tìm thấy sheet nào trong folder');
      }
    } catch (err) {
      setError(err.message || 'Có lỗi xảy ra khi lấy danh sách sheet names');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySheetNames = async () => {
    try {
      await navigator.clipboard.writeText(sheetNames.join(', '));
      setSuccess('Đã copy danh sách Strategy IDs!');
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      setError('Không thể copy danh sách');
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setFolderLink('');
    setSheetNames([]);
    setError('');
    setSuccess('');
  };

  return (
    <Grid
      container
      spacing={0}
      alignItems="stretch"
      sx={{ height: '100%', flexWrap: { xs: 'wrap', md: 'nowrap' } }}
    >
      {/* Left side - Instructions */}
      <Grid
        item
        xs={12}
        md={6}
        sx={{
          display: 'flex',
          borderRight: '1px solid',
          borderColor: 'divider',
          minHeight: '100%',
          height: 'auto',
          minWidth: 0,
          flexShrink: { md: 0 },
          flexBasis: { md: '50%' },
          maxWidth: { md: '50%' }
        }}
      >
        <Card
          variant="outlined"
          sx={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none' }}
        >
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', p: 2, minWidth: 0 }}>
            <Typography variant="h6" gutterBottom>
              Hướng dẫn sử dụng
            </Typography>

            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((step, index) => (
                <Step key={step.label}>
                  <StepLabel>
                    <Typography variant="subtitle1" fontWeight="medium">
                      {step.label}
                    </Typography>
                  </StepLabel>
                  <StepContent>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      {step.description}
                    </Typography>

                    {/* Step 1: Service Accounts */}
                    {index === 0 && (
                      <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                          <Typography variant="body2" fontWeight="medium">
                            8 Service Account Emails:
                          </Typography>
                          {isAdmin && (
                            <Button size="small" variant="outlined" onClick={handleCopyAllEmails}>
                              Copy tất cả
                            </Button>
                          )}
                        </Box>
                        <List dense disablePadding>
                          {displayedServiceAccounts.map((email, idx) => (
                            <ListItem
                              key={idx}
                              sx={{
                                bgcolor: isDarkMode ? 'background.default' : 'grey.50',
                                mb: 0.5,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: isDarkMode ? 'divider' : 'grey.200',
                                minWidth: 0
                              }}
                              secondaryAction={
                                isAdmin ? (
                                  <IconButton edge="end" size="small" onClick={() => handleCopyEmail(email)}>
                                    <CopyOutlined />
                                  </IconButton>
                                ) : null
                              }
                            >
                              <ListItemText
                                sx={{ minWidth: 0 }}
                                primary={
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontFamily: 'monospace',
                                      fontSize: '0.75rem',
                                      overflowWrap: 'anywhere',
                                      wordBreak: 'break-word'
                                    }}
                                  >
                                    {email}
                                  </Typography>
                                }
                              />
                            </ListItem>
                          ))}
                        </List>
                        <Button
                          variant="contained"
                          size="small"
                          sx={{ mt: 2 }}
                          onClick={() => setActiveStep(1)}
                          startIcon={<CheckCircleOutlined />}
                        >
                          Đã cấp quyền
                        </Button>
                      </Box>
                    )}

                    {/* Step 2: Folder Link */}
                    {index === 1 && (
                      <Box>
                        <TextField
                          fullWidth
                          size="small"
                          label="Link Google Drive Folder"
                          placeholder="https://drive.google.com/drive/folders/..."
                          value={folderLink}
                          onChange={(e) => setFolderLink(e.target.value)}
                          sx={{ mb: 2 }}
                          InputProps={{
                            startAdornment: <GoogleOutlined style={{ marginRight: 8, color: isDarkMode ? '#aaa' : '#666' }} />
                          }}
                        />
                        <Button
                          variant="contained"
                          size="small"
                          onClick={handleGetSheetNames}
                          disabled={loading || !folderLink.trim()}
                          startIcon={loading ? <CircularProgress size={16} /> : <FileTextOutlined />}
                        >
                          {loading ? 'Đang lấy dữ liệu...' : 'Lấy danh sách'}
                        </Button>
                      </Box>
                    )}

                    {/* Step 3: Results */}
                    {index === 2 && sheetNames.length > 0 && (
                      <Box>
                        <Typography variant="body2" color="success.main" sx={{ mb: 1 }}>
                          ✓ Đã tìm thấy {sheetNames.length} Strategy IDs
                        </Typography>
                        <Button variant="contained" size="small" color="success" onClick={handleCopySheetNames}>
                          Copy danh sách
                        </Button>
                      </Box>
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </CardContent>
        </Card>
      </Grid>

      {/* Right side - Results */}
      <Grid
        item
        xs={12}
        md={6}
        sx={{
          display: 'flex',
          minHeight: '100%',
          height: 'auto',
          minWidth: 0,
          flexShrink: { md: 0 },
          flexBasis: { md: '50%' },
          maxWidth: { md: '50%' }
        }}
      >
        <Card
          variant="outlined"
          sx={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', border: 'none', boxShadow: 'none' }}
        >
          <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', p: 2, minWidth: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Kết quả</Typography>
              {sheetNames.length > 0 && (
                <Button size="small" variant="outlined" color="error" onClick={handleReset}>
                  Reset
                </Button>
              )}
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                {success}
              </Alert>
            )}

            {sheetNames.length > 0 ? (
              <Box>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: isDarkMode ? 'background.default' : 'grey.50',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: isDarkMode ? 'divider' : 'grey.300',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      lineHeight: 1.8,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word'
                    }}
                  >
                    {sheetNames.join(', ')}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 300,
                  color: 'text.secondary'
                }}
              >
                <FileTextOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
                <Typography variant="body2" textAlign="center">
                  Làm theo hướng dẫn bên trái để lấy danh sách Strategy IDs
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

// ─── Root Page Component with Tabs ────────────────────────────────────────────
const CheckStrategies = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <MainCard sx={{ height: '100%' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} aria-label="check strategies tabs">
          <Tab label="Get Strategy ID" id="tab-0" aria-controls="tabpanel-0" />
          <Tab label="Check File Optimization" id="tab-1" aria-controls="tabpanel-1" />
        </Tabs>
      </Box>

      <TabPanel value={activeTab} index={0}>
        <GetStrategyIdTab />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <CheckFileOptimization />
      </TabPanel>
    </MainCard>
  );
};

export default CheckStrategies;
