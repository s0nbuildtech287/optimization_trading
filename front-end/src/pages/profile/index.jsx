import { useState, useEffect } from 'react';

// material-ui
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

// project imports
import MainCard from 'components/MainCard';
import { getProfile, updateProfile } from 'api/users';

// assets
import userAvatar from 'assets/images/users/meo.png';
import EditOutlined from '@ant-design/icons/EditOutlined';
import SaveOutlined from '@ant-design/icons/SaveOutlined';
import CloseOutlined from '@ant-design/icons/CloseOutlined';

// ================================|| PROFILE PAGE ||================================ //

const PHONE_REGEX = /^0[3|5|7|8|9]\d{8}$/;

export default function ProfilePage() {
  const [user, setUser] = useState({
    username: '',
    email: '',
    fullName: '',
    phone: '',
    role: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState(user);
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState({
    open: false,
    message: '',
    severity: 'success'
  });

  // Set page title
  useEffect(() => {
    document.title = 'Profile | Backtest';
  }, []);

  // Load user data from localStorage and Backend API
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        const userInfo = {
          username: userData.username || '',
          email: userData.email || '',
          fullName: userData.fullName || userData.preferences?.fullName || '',
          phone: userData.phone || userData.preferences?.phone || '',
          role: userData.roles?.[0]?.replace('ROLE_', '').toLowerCase() || 'user'
        };
        setUser(userInfo);
        setEditedUser(userInfo);
      }
    } catch (error) {
      console.error('Error loading user data from storage:', error);
    }

    // Fetch fresh profile from DB
    getProfile()
      .then((res) => {
        if (res && res.data) {
          const profileData = res.data;
          const freshInfo = {
            username: profileData.username || '',
            email: profileData.email || '',
            fullName: profileData.fullName || profileData.preferences?.fullName || '',
            phone: profileData.phone || profileData.preferences?.phone || '',
            role: profileData.roles?.[0]?.replace('ROLE_', '').toLowerCase() || 'user'
          };
          setUser(freshInfo);
          setEditedUser(freshInfo);

          const userStr = localStorage.getItem('user');
          if (userStr) {
            const parsed = JSON.parse(userStr);
            localStorage.setItem(
              'user',
              JSON.stringify({
                ...parsed,
                fullName: freshInfo.fullName,
                phone: freshInfo.phone,
                preferences: profileData.preferences || parsed.preferences
              })
            );
          }
        }
      })
      .catch((err) => {
        console.warn('Could not fetch remote profile:', err.message);
      });
  }, []);

  const handleEdit = () => {
    setPhoneError('');
    setAlert({ open: false, message: '', severity: 'success' });
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedUser(user);
    setPhoneError('');
    setAlert({ open: false, message: '', severity: 'success' });
    setIsEditing(false);
  };

  const handleSave = async () => {
    const cleanPhone = (editedUser.phone || '').trim();
    if (cleanPhone !== '') {
      if (!PHONE_REGEX.test(cleanPhone)) {
        setPhoneError('Invalid phone number. Please check and try again.');
        setAlert({
          open: true,
          message: 'Invalid phone number. Please check and try again.',
          severity: 'error'
        });
        return;
      }
    }

    setPhoneError('');
    setSaving(true);

    try {
      const res = await updateProfile({
        fullName: (editedUser.fullName || '').trim(),
        phone: cleanPhone
      });

      const updatedData = res.data || {};
      const newUserInfo = {
        ...user,
        fullName: updatedData.fullName !== undefined ? updatedData.fullName : (editedUser.fullName || '').trim(),
        phone: updatedData.phone !== undefined ? updatedData.phone : cleanPhone
      };

      const userStr = localStorage.getItem('user');
      if (userStr) {
        const userData = JSON.parse(userStr);
        localStorage.setItem(
          'user',
          JSON.stringify({
            ...userData,
            fullName: newUserInfo.fullName,
            phone: newUserInfo.phone,
            preferences: updatedData.preferences || userData.preferences
          })
        );
      }

      setUser(newUserInfo);
      setEditedUser(newUserInfo);
      setIsEditing(false);
      setAlert({
        open: true,
        message: 'Profile updated successfully',
        severity: 'success'
      });
    } catch (error) {
      console.error('Error saving user profile:', error);
      const msg = error.message || 'Failed to update profile';
      if (msg.toLowerCase().includes('phone')) {
        setPhoneError('Invalid phone number. Please check and try again.');
      }
      setAlert({
        open: true,
        message: msg,
        severity: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    if (field === 'phone' && phoneError) {
      setPhoneError('');
    }
    setEditedUser((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const profileInputProps = {
    sx: (theme) => ({
      '& .MuiInputBase-input': {
        color: theme.palette.text.primary
      },
      '& .MuiInputBase-input.Mui-disabled': {
        WebkitTextFillColor: theme.palette.text.primary,
        color: theme.palette.text.primary
      },
      '& .MuiInputBase-input::placeholder': {
        color: theme.palette.text.secondary,
        opacity: 1
      },
      '& .MuiInputBase-input.Mui-disabled::placeholder': {
        WebkitTextFillColor: theme.palette.text.secondary,
        color: theme.palette.text.secondary,
        opacity: 1
      }
    })
  };

  return (
    <Grid container spacing={3} justifyContent="center">
      <Grid size={{ xs: 12, md: 8, lg: 6 }}>
        <MainCard title="Profile Information">
          <Grid container spacing={3}>
            {alert.open && (
              <Grid size={12}>
                <Alert
                  severity={alert.severity}
                  onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
                >
                  {alert.message}
                </Alert>
              </Grid>
            )}

            {/* Avatar Section */}
            <Grid size={12}>
              <Stack direction="column" alignItems="center" spacing={2}>
                <Avatar
                  alt="profile user"
                  src={userAvatar}
                  sx={{ width: 120, height: 120 }}
                />
                <Typography variant="h4">{user.username}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {user.role.toUpperCase()}
                </Typography>
              </Stack>
            </Grid>

            <Grid size={12}>
              <Divider />
            </Grid>

            {/* User Information */}
            <Grid size={12}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ minWidth: 120, fontWeight: 600 }}>
                    Username:
                  </Typography>
                  <TextField
                    fullWidth
                    value={user.username}
                    disabled
                    size="small"
                    InputProps={profileInputProps}
                  />
                </Stack>

                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ minWidth: 120, fontWeight: 600 }}>
                    Email:
                  </Typography>
                  <TextField
                    fullWidth
                    value={user.email}
                    disabled
                    size="small"
                    InputProps={profileInputProps}
                  />
                </Stack>

                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ minWidth: 120, fontWeight: 600 }}>
                    Full Name:
                  </Typography>
                  <TextField
                    fullWidth
                    value={isEditing ? editedUser.fullName : user.fullName}
                    onChange={handleChange('fullName')}
                    disabled={!isEditing}
                    size="small"
                    placeholder="Enter your full name"
                    InputProps={profileInputProps}
                  />
                </Stack>

                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ minWidth: 120, fontWeight: 600 }}>
                    Phone:
                  </Typography>
                  <TextField
                    fullWidth
                    value={isEditing ? editedUser.phone : user.phone}
                    onChange={handleChange('phone')}
                    disabled={!isEditing}
                    size="small"
                    placeholder="Enter your phone number"
                    error={Boolean(phoneError)}
                    helperText={phoneError}
                    InputProps={profileInputProps}
                  />
                </Stack>

                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="subtitle1" sx={{ minWidth: 120, fontWeight: 600 }}>
                    Role:
                  </Typography>
                  <TextField
                    fullWidth
                    value={user.role}
                    disabled
                    size="small"
                    InputProps={profileInputProps}
                  />
                </Stack>
              </Stack>
            </Grid>

            <Grid size={12}>
              <Divider />
            </Grid>

            {/* Action Buttons */}
            <Grid size={12}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                {!isEditing ? (
                  <Button
                    variant="contained"
                    startIcon={<EditOutlined />}
                    onClick={handleEdit}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<CloseOutlined />}
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlined />}
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                )}
              </Stack>
            </Grid>
          </Grid>
        </MainCard>
      </Grid>
    </Grid>
  );
}
