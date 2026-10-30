import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

// material-ui
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';

// project imports
import MainCard from 'components/MainCard';
import Loader from 'components/Loader';

// api
import { getUsers, createUser, updateUser, deleteUser } from 'api/users';

// assets
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import EyeInvisibleOutlined from '@ant-design/icons/EyeInvisibleOutlined';

// ==============================|| ACCOUNT PROVISIONING ||============================== //

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'user', label: 'User' }
];

const createEmptyForm = () => ({
  username: '',
  email: '',
  role: 'user',
  password: ''
});

export default function AccountProvisioning() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const isAdmin = useMemo(() => {
    try {
      const stored = localStorage.getItem('user');
      const parsed = stored ? JSON.parse(stored) : null;
      const role = String(parsed?.role || '').toLowerCase();
      const roles = Array.isArray(parsed?.roles) ? parsed.roles.map((item) => String(item).toLowerCase()) : [];
      return role === 'admin' || roles.some((item) => item.includes('admin'));
    } catch (err) {
      return false;
    }
  }, []);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    document.title = 'Account Provisioning | Backtest';
  }, []);

  const formErrors = useMemo(() => {
    const errors = {};
    if (!form.username.trim()) errors.username = 'Username is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    if (!form.role) errors.role = 'Role is required';
    if (!editingId && !form.password.trim()) errors.password = 'Password is required';
    return errors;
  }, [form, editingId]);
  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await getUsers();
        const mapped = (res.data || []).map((user) => ({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.roles?.[0] || 'user',
          createdAt: user.createdAt ? new Date(user.createdAt).toLocaleString('en-GB') : '-'
        }));
        setRows(mapped);
      } catch (err) {
        setError(err.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);


  const isFormValid = Object.keys(formErrors).length === 0;

  const handleOpenCreate = () => {
    if (!isAdmin) return;
    setEditingId(null);
    setForm(createEmptyForm());
    setTouched({});
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row) => {
    setEditingId(row.id);
    setForm({
      username: row.username,
      email: row.email,
      role: row.role,
      password: ''
    });
    setTouched({});
    setShowPassword(false);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleSubmit = async () => {
    if (!isFormValid) {
      setTouched({ username: true, email: true, role: true, password: true });
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingId) {
        const payload = {
          username: form.username.trim(),
          email: form.email.trim(),
          role: form.role
        };
        if (form.password.trim()) {
          payload.password = form.password;
        }
        const res = await updateUser(editingId, payload);
        setRows((prev) =>
          prev.map((row) =>
            row.id === editingId
              ? {
                  ...row,
                  username: res.data.username,
                  email: res.data.email,
                  role: res.data.roles?.[0] || form.role,
                  createdAt: res.data.createdAt ? new Date(res.data.createdAt).toLocaleString('en-GB') : row.createdAt
                }
              : row
          )
        );
      } else {
        const res = await createUser({
          username: form.username.trim(),
          email: form.email.trim(),
          role: form.role,
          password: form.password
        });
        const newRow = {
          id: res.data.id,
          username: res.data.username,
          email: res.data.email,
          role: res.data.roles?.[0] || form.role,
          createdAt: res.data.createdAt ? new Date(res.data.createdAt).toLocaleString('en-GB') : '-'
        };
        setRows((prev) => [newRow, ...prev]);
      }

      setDialogOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = (rowId) => {
    setDeleteId(rowId);
    setConfirmOpen(true);
  };

  const handleDelete = async () => {
    setSaving(true);
    setError('');
    try {
      await deleteUser(deleteId);
      setRows((prev) => prev.filter((row) => row.id !== deleteId));
      setConfirmOpen(false);
      setDeleteId(null);
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseConfirm = () => {
    setConfirmOpen(false);
    setDeleteId(null);
  };

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  return (
    <Grid container spacing={3}>
      {(loading || saving) && <Loader />}
      <Grid size={12}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="h3">Account Provisioning</Typography>
            <Typography variant="body2" color="text.secondary">
              Create, edit, and manage staff accounts by role.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={handleOpenCreate}
            disabled={loading || saving || !isAdmin}
          >
            Create Account
          </Button>
        </Stack>
      </Grid>

      {!isAdmin ? (
        <Grid size={12}>
          <Typography variant="body2" color="text.secondary">
            Only admin accounts can create new users.
          </Typography>
        </Grid>
      ) : null}

      {error ? (
        <Grid size={12}>
          <Typography color="error.main">{error}</Typography>
        </Grid>
      ) : null}

      <Grid size={12}>
        <MainCard content={false}>
          <Stack spacing={0}>
            <Box sx={{ px: 3, py: 2 }}>
              <Typography variant="subtitle1">User List</Typography>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Username</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          Loading users...
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          No accounts yet. Click "Create Account" to add the first one.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.username}</TableCell>
                        <TableCell>{row.email}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.role}
                            size="small"
                            color={row.role === 'admin' ? 'warning' : 'default'}
                            sx={{ textTransform: 'capitalize' }}
                          />
                        </TableCell>
                        <TableCell>{row.createdAt || '-'}</TableCell>
                        <TableCell align="right">
                          <IconButton color="primary" onClick={() => handleOpenEdit(row)} disabled={saving}>
                            <EditOutlined />
                          </IconButton>
                          <IconButton color="error" onClick={() => handleConfirmDelete(row.id)} disabled={saving}>
                            <DeleteOutlined />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </MainCard>
      </Grid>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Account' : 'Create Account'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Username"
              value={form.username}
              onChange={handleChange('username')}
              error={touched.username && Boolean(formErrors.username)}
              helperText={touched.username ? formErrors.username : ''}
              fullWidth
            />
            <TextField
              label="Email"
              value={form.email}
              onChange={handleChange('email')}
              error={touched.email && Boolean(formErrors.email)}
              helperText={touched.email ? formErrors.email : ''}
              fullWidth
            />
            <FormControl fullWidth error={touched.role && Boolean(formErrors.role)}>
              <InputLabel id="role-label">Role</InputLabel>
              <Select
                labelId="role-label"
                label="Role"
                value={form.role}
                onChange={handleChange('role')}
              >
                {ROLE_OPTIONS.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleChange('password')}
              error={touched.password && Boolean(formErrors.password)}
              helperText={touched.password ? formErrors.password : editingId ? 'Leave empty if you do not want to change the password.' : 'Required for new accounts.'}
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword((show) => !show)}
                      onMouseDown={(e) => e.preventDefault()}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={saving}>
            {editingId ? 'Save Changes' : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={handleCloseConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent dividers>
          <Typography>Are you sure you want to delete this account?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirm} disabled={saving}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={saving}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
}
