import React from 'react';
import PropTypes from 'prop-types';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

// material-ui
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

// third-party
import * as Yup from 'yup';
import { Formik } from 'formik';

// project imports
import IconButton from 'components/@extended/IconButton';
import AnimateButton from 'components/@extended/AnimateButton';
import { login } from 'api/auth';

// assets
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import EyeInvisibleOutlined from '@ant-design/icons/EyeInvisibleOutlined';

// ============================|| JWT - LOGIN ||============================ //

export default function AuthLogin({ isDemo = false }) {
  const navigate = useNavigate();
  const [checked, setChecked] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const [showPassword, setShowPassword] = React.useState(false);
  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  return (
    <>
      <Formik
        initialValues={{
          username: '',
          password: '',
          submit: null
        }}
        validationSchema={Yup.object().shape({
          username: Yup.string().max(255).required('Username or Email is required'),
          password: Yup.string()
            .required('Password is required')
            .test('no-leading-trailing-whitespace', 'Password cannot start or end with spaces', (value) => value === value.trim())
        })}
        onSubmit={async (values, { setErrors, setStatus, setSubmitting }) => {
          try {
            setLoading(true);
            const response = await login(values.username, values.password);
            
            // Lưu token vào localStorage
            if (response.accessToken) {
              localStorage.setItem('authToken', response.accessToken);
              localStorage.setItem('user', JSON.stringify(response));
            }
            
            setStatus({ success: true });
            setSubmitting(false);
            setLoading(false);
            
            // Redirect đến dashboard
            navigate('/dashboard');
          } catch (err) {
            console.error(err);
            setStatus({ success: false });
            setErrors({ submit: err.message });
            setSubmitting(false);
            setLoading(false);
          }
        }}
      >
        {({ errors, handleBlur, handleChange, handleSubmit, touched, values, isSubmitting }) => (
          <form noValidate onSubmit={handleSubmit}>
            <Grid container spacing={2.5}>
              <Grid size={12}>
                <Stack sx={{ gap: 0.75 }}>
                  <InputLabel htmlFor="username-login" sx={{ color: '#cbd5e1', fontWeight: 500, fontSize: '0.875rem' }}>
                    Username or Email
                  </InputLabel>
                  <OutlinedInput
                    id="username-login"
                    type="text"
                    value={values.username}
                    name="username"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    placeholder="Enter your username or email"
                    fullWidth
                    error={Boolean(touched.username && errors.username)}
                    sx={{
                      color: '#f8fafc',
                      backgroundColor: 'rgba(15, 23, 42, 0.65)',
                      borderRadius: 1.5,
                      '& .MuiOutlinedInput-input': {
                        py: 1.25,
                        fontSize: '0.9rem'
                      },
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: '#64748b',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(15, 23, 42, 0.95) inset',
                        WebkitTextFillColor: '#f8fafc',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(148, 163, 184, 0.2)'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(0, 240, 255, 0.5)'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#00f0ff',
                        boxShadow: '0 0 12px rgba(0, 240, 255, 0.25)'
                      }
                    }}
                  />
                </Stack>
                {touched.username && errors.username && (
                  <FormHelperText error id="standard-weight-helper-text-username-login">
                    {errors.username}
                  </FormHelperText>
                )}
              </Grid>
              <Grid size={12}>
                <Stack sx={{ gap: 0.75 }}>
                  <InputLabel htmlFor="-password-login" sx={{ color: '#cbd5e1', fontWeight: 500, fontSize: '0.875rem' }}>
                    Password
                  </InputLabel>
                  <OutlinedInput
                    fullWidth
                    error={Boolean(touched.password && errors.password)}
                    id="-password-login"
                    type={showPassword ? 'text' : 'password'}
                    value={values.password}
                    name="password"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleClickShowPassword}
                          onMouseDown={handleMouseDownPassword}
                          edge="end"
                          sx={{ color: '#94a3b8', '&:hover': { color: '#00f0ff' } }}
                        >
                          {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                        </IconButton>
                      </InputAdornment>
                    }
                    placeholder="Enter your password"
                    sx={{
                      color: '#f8fafc',
                      backgroundColor: 'rgba(15, 23, 42, 0.65)',
                      borderRadius: 1.5,
                      '& .MuiOutlinedInput-input': {
                        py: 1.25,
                        fontSize: '0.9rem'
                      },
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: '#64748b',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(15, 23, 42, 0.95) inset',
                        WebkitTextFillColor: '#f8fafc',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(148, 163, 184, 0.2)'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(0, 240, 255, 0.5)'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#00f0ff',
                        boxShadow: '0 0 12px rgba(0, 240, 255, 0.25)'
                      }
                    }}
                  />
                </Stack>
                {touched.password && errors.password && (
                  <FormHelperText error id="standard-weight-helper-text-password-login">
                    {errors.password}
                  </FormHelperText>
                )}
              </Grid>
              <Grid sx={{ mt: -0.5 }} size={12}>
                <Stack direction="row" sx={{ gap: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={checked}
                        onChange={(event) => setChecked(event.target.checked)}
                        name="checked"
                        size="small"
                        sx={{
                          color: 'rgba(148, 163, 184, 0.5)',
                          '&.Mui-checked': {
                            color: '#00f0ff'
                          }
                        }}
                      />
                    }
                    label={<Typography variant="body2" sx={{ color: '#cbd5e1', fontSize: '0.85rem' }}>Keep me signed in</Typography>}
                  />
                  <Link
                    variant="body2"
                    component={RouterLink}
                    to="#"
                    sx={{
                      textDecoration: 'none',
                      color: '#38bdf8',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s ease',
                      '&:hover': { color: '#00f0ff', textDecoration: 'underline' }
                    }}
                  >
                    Forgot Password?
                  </Link>
                </Stack>
              </Grid>
              <Grid size={12}>
                <AnimateButton>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    type="submit"
                    disabled={isSubmitting || loading}
                    sx={{
                      background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.6) 0%, rgba(14, 116, 144, 0.7) 50%, rgba(13, 148, 136, 0.6) 100%)',
                      border: '1px solid rgba(0, 240, 255, 0.22)',
                      backdropFilter: 'blur(8px)',
                      color: 'rgba(248, 250, 252, 0.92)',
                      fontWeight: 600,
                      fontSize: '0.92rem',
                      textTransform: 'none',
                      letterSpacing: '0.02em',
                      borderRadius: 1.5,
                      py: 1.15,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.25s ease',
                      '&:hover': {
                        background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.8) 0%, rgba(14, 116, 144, 0.85) 50%, rgba(13, 148, 136, 0.8) 100%)',
                        borderColor: 'rgba(0, 240, 255, 0.4)',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                        color: '#ffffff',
                        transform: 'translateY(-1px)'
                      },
                      '&.Mui-disabled': {
                        background: 'rgba(148, 163, 184, 0.15)',
                        borderColor: 'transparent',
                        color: 'rgba(255, 255, 255, 0.35)'
                      }
                    }}
                  >
                    {loading ? 'Authenticating...' : 'Sign In to Lotusquant'}
                  </Button>
                </AnimateButton>
              </Grid>
              {errors.submit && (
                <Grid size={12}>
                  <FormHelperText error>{errors.submit}</FormHelperText>
                </Grid>
              )}
            </Grid>
          </form>
        )}
      </Formik>
    </>
  );
}

AuthLogin.propTypes = { isDemo: PropTypes.bool };
