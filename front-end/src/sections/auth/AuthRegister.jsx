import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

// material-ui
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

// third-party
import * as Yup from 'yup';
import { Formik } from 'formik';

// project imports
import IconButton from 'components/@extended/IconButton';
import AnimateButton from 'components/@extended/AnimateButton';
import { strengthColor, strengthIndicator } from 'utils/password-strength';
import { requestOTP, register } from 'api/auth';

// assets
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import EyeInvisibleOutlined from '@ant-design/icons/EyeInvisibleOutlined';

// ============================|| JWT - REGISTER WITH OTP ||============================ //

export default function AuthRegister() {
  const navigate = useNavigate();
  
  // Password strength
  const [level, setLevel] = useState();
  const [showPassword, setShowPassword] = useState(false);
  
  // OTP flow
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const changePassword = (value) => {
    const temp = strengthIndicator(value);
    setLevel(strengthColor(temp));
  };

  useEffect(() => {
    changePassword('');
  }, []);

  // ✅ COUNTDOWN TIMER
  const startCountdown = () => {
    setCountdown(300); // 5 minutes
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Formik
        initialValues={{
          username: '',
          email: '',
          password: '',
          confirmPassword: '',
          otp: '',
          submit: null
        }}
        validationSchema={Yup.object().shape({
          username: Yup.string().max(255).required('Username is required'),
          email: Yup.string()
            .email('Must be a valid email')
            .matches(/@lotusquant\.com$/, 'Only @lotusquant.com emails are allowed')
            .max(255)
            .required('Email is required'),
          password: Yup.string()
            .min(6, 'Password must be at least 6 characters')
            .required('Password is required')
            .test('no-leading-trailing-whitespace', 'Password cannot start or end with spaces', (value) => value === value.trim()),
          confirmPassword: Yup.string()
            .oneOf([Yup.ref('password'), null], 'Passwords must match')
            .required('Please confirm your password'),
          otp: otpSent ? Yup.string().length(6, 'OTP must be 6 digits').required('OTP is required') : Yup.string()
        })}
        onSubmit={async (values, { setErrors, setStatus, setSubmitting }) => {
          try {
            setError('');
            setSuccess('');

            if (!otpSent) {
              // ✅ STEP 1: Request OTP
              const result = await requestOTP(values.username, values.email, values.password);
              setEmail(result.email);
              setOtpSent(true);
              setSuccess(result.message);
              startCountdown();
            } else {
              // ✅ STEP 2: Register with OTP
              const result = await register(values.username, email, values.password, values.otp);
              setSuccess(result.message);

              setTimeout(() => {
                navigate('/login');
              }, 2000);
            }
          } catch (err) {
            setError(err.message);
            setStatus({ success: false });
            setErrors({ submit: err.message });
          } finally {
            setSubmitting(false);
          }
        }}
      >
        {({ errors, handleBlur, handleChange, handleSubmit, isSubmitting, touched, values }) => (
          <form noValidate onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* ✅ ERROR/SUCCESS ALERTS */}
              {error && (
                <Grid size={12}>
                  <Alert severity="error">{error}</Alert>
                </Grid>
              )}
              {success && (
                <Grid size={12}>
                  <Alert severity="success">{success}</Alert>
                </Grid>
              )}

              {/* ✅ OTP COUNTDOWN */}
              {otpSent && countdown > 0 && (
                <Grid size={12}>
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: 'rgba(255, 200, 124, 0.2)',
                      border: '1px solid rgba(255, 200, 124, 0.5)',
                      borderRadius: 1,
                      textAlign: 'center'
                    }}
                  >
                    <Typography variant="body2" sx={{ color: '#fff' }}>
                      ⏱️ OTP expires in: <strong>{formatTime(countdown)}</strong>
                    </Typography>
                  </Box>
                </Grid>
              )}

              {/* ✅ USERNAME */}
              <Grid size={12}>
                <Stack sx={{ gap: 1 }}>
                  <InputLabel htmlFor="username-signup" sx={{ color: '#fff' }}>
                    Username*
                  </InputLabel>
                  <OutlinedInput
                    id="username-signup"
                    type="text"
                    value={values.username}
                    name="username"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    placeholder="Confirm your username"
                    fullWidth
                    error={Boolean(touched.username && errors.username)}
                    disabled={otpSent}
                    sx={{
                      color: '#fff',
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: 'rgba(255, 255, 255, 0.7)',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.3) inset',
                        WebkitTextFillColor: '#000',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.5)'
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.8)'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#fff',
                          borderWidth: 2
                        }
                      }
                    }}
                  />
                </Stack>
                {touched.username && errors.username && (
                  <FormHelperText error>{errors.username}</FormHelperText>
                )}
              </Grid>

              {/* ✅ EMAIL */}
              <Grid size={12}>
                <Stack sx={{ gap: 1 }}>
                  <InputLabel htmlFor="email-signup" sx={{ color: '#fff' }}>
                    Email Address*
                  </InputLabel>
                  <OutlinedInput
                    fullWidth
                    error={Boolean(touched.email && errors.email)}
                    id="email-signup"
                    type="email"
                    value={values.email}
                    name="email"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    placeholder="Confirm your email"
                    disabled={otpSent}
                    sx={{
                      color: '#fff',
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: 'rgba(255, 255, 255, 0.7)',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.3) inset',
                        WebkitTextFillColor: '#000',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.5)'
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.8)'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#fff',
                          borderWidth: 2
                        }
                      }
                    }}
                  />
                </Stack>
                {touched.email && errors.email && <FormHelperText error>{errors.email}</FormHelperText>}
              </Grid>

              {/* ✅ PASSWORD */}
              <Grid size={12}>
                <Stack sx={{ gap: 1 }}>
                  <InputLabel htmlFor="password-signup" sx={{ color: '#fff' }}>
                    Password*
                  </InputLabel>
                  <OutlinedInput
                    fullWidth
                    error={Boolean(touched.password && errors.password)}
                    id="password-signup"
                    type={showPassword ? 'text' : 'password'}
                    value={values.password}
                    name="password"
                    onBlur={handleBlur}
                    onChange={(e) => {
                      handleChange(e);
                      changePassword(e.target.value);
                    }}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={handleClickShowPassword}
                          onMouseDown={handleMouseDownPassword}
                          edge="end"
                          color="secondary"
                          sx={{ color: '#000' }}
                        >
                          {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                        </IconButton>
                      </InputAdornment>
                    }
                    placeholder="Confirm your password"
                    disabled={otpSent}
                    sx={{
                      color: '#fff',
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: 'rgba(255, 255, 255, 0.7)',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.3) inset',
                        WebkitTextFillColor: '#000',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.5)'
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.8)'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#fff',
                          borderWidth: 2
                        }
                      }
                    }}
                  />
                </Stack>
                {touched.password && errors.password && <FormHelperText error>{errors.password}</FormHelperText>}
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid>
                      <Box sx={{ bgcolor: level?.color, width: 85, height: 8, borderRadius: '7px' }} />
                    </Grid>
                    <Grid>
                      <Typography variant="subtitle1" fontSize="0.75rem" sx={{ color: '#fff' }}>
                        {level?.label}
                      </Typography>
                    </Grid>
                  </Grid>
                </FormControl>
              </Grid>

              {/* ✅ CONFIRM PASSWORD */}
              <Grid size={12}>
                <Stack sx={{ gap: 1 }}>
                  <InputLabel htmlFor="confirm-password-signup" sx={{ color: '#fff' }}>
                    Confirm Password*
                  </InputLabel>
                  <OutlinedInput
                    fullWidth
                    error={Boolean(touched.confirmPassword && errors.confirmPassword)}
                    id="confirm-password-signup"
                    type="password"
                    value={values.confirmPassword}
                    name="confirmPassword"
                    onBlur={handleBlur}
                    onChange={handleChange}
                    placeholder="Confirm password"
                    disabled={otpSent}
                    sx={{
                      color: '#fff',
                      '& .MuiOutlinedInput-input::placeholder': {
                        color: 'rgba(255, 255, 255, 0.7)',
                        opacity: 1
                      },
                      '& .MuiOutlinedInput-input:-webkit-autofill': {
                        WebkitBoxShadow: '0 0 0 1000px rgba(255, 255, 255, 0.3) inset',
                        WebkitTextFillColor: '#000',
                        transition: 'background-color 5000s ease-in-out 0s'
                      },
                      '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.5)'
                        },
                        '&:hover fieldset': {
                          borderColor: 'rgba(255, 255, 255, 0.8)'
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#fff',
                          borderWidth: 2
                        }
                      }
                    }}
                  />
                </Stack>
                {touched.confirmPassword && errors.confirmPassword && (
                  <FormHelperText error>{errors.confirmPassword}</FormHelperText>
                )}
              </Grid>

              {/* ✅ OTP INPUT (Show only after OTP sent) */}
              {otpSent && (
                <Grid size={12}>
                  <Stack sx={{ gap: 1 }}>
                    <InputLabel htmlFor="otp-signup" sx={{ color: '#fff' }}>
                      Verification Code*
                    </InputLabel>
                    <OutlinedInput
                      fullWidth
                      error={Boolean(touched.otp && errors.otp)}
                      id="otp-signup"
                      type="text"
                      value={values.otp}
                      name="otp"
                      onBlur={handleBlur}
                      onChange={handleChange}
                      placeholder="Enter 6-digit code"
                      inputProps={{ maxLength: 6 }}
                      sx={{
                        color: '#fff',
                        '& .MuiOutlinedInput-input::placeholder': {
                          color: 'rgba(255, 255, 255, 0.7)',
                          opacity: 1
                        },
                        '& .MuiOutlinedInput-root': {
                          '& fieldset': {
                            borderColor: 'rgba(255, 255, 255, 0.5)'
                          },
                          '&:hover fieldset': {
                            borderColor: 'rgba(255, 255, 255, 0.8)'
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#fff',
                            borderWidth: 2
                          }
                        }
                      }}
                    />
                  </Stack>
                  {touched.otp && errors.otp && <FormHelperText error>{errors.otp}</FormHelperText>}
                  <FormHelperText sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Check your email ({email}) for the verification code
                  </FormHelperText>
                </Grid>
              )}

              {/* ✅ TERMS & CONDITIONS */}
              <Grid size={12}>
                <Typography variant="body2" sx={{ color: '#fff' }}>
                  By Signing up, you agree to our &nbsp;
                  <Link
                    variant="subtitle2"
                    component={RouterLink}
                    to="#"
                    sx={{ color: '#fff', transition: 'all 0.3s ease', '&:hover': { color: '#000', textDecoration: 'underline' } }}
                  >
                    Terms of Service
                  </Link>
                  &nbsp; and &nbsp;
                  <Link
                    variant="subtitle2"
                    component={RouterLink}
                    to="#"
                    sx={{ color: '#fff', transition: 'all 0.3s ease', '&:hover': { color: '#000', textDecoration: 'underline' } }}
                  >
                    Privacy Policy
                  </Link>
                </Typography>
              </Grid>

              {errors.submit && (
                <Grid size={12}>
                  <FormHelperText error>{errors.submit}</FormHelperText>
                </Grid>
              )}

              {/* ✅ SUBMIT BUTTON */}
              {/* 🔒 REGISTRATION DISABLED - Internal use only, accounts added directly to database */}
              {/* To re-enable registration: change disabled={true} to disabled={isSubmitting} */}
              <Grid size={12}>
                <AnimateButton>
                  <Button
                    disableElevation
                    disabled={true} // 🔒 Registration disabled - change to {isSubmitting} to enable
                    // disabled={isSubmitting} // 🔓 Uncomment this line to enable registration
                    fullWidth
                    size="large"
                    type="submit"
                    variant="contained"
                    color="primary"
                    sx={{ backgroundColor: '#2a2a2a', '&:hover': { backgroundColor: '#3a3a3a' } }}
                    startIcon={isSubmitting && <CircularProgress size={20} sx={{ color: '#fff' }} />}
                  >
                    {otpSent ? 'Verify & Register' : 'Send Verification Code'}
                  </Button>
                </AnimateButton>
              </Grid>

              {/* ✅ RESEND OTP */}
              {otpSent && countdown === 0 && (
                <Grid size={12}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={() => {
                      setOtpSent(false);
                      setError('');
                      setSuccess('');
                    }}
                    sx={{
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                      color: '#fff',
                      '&:hover': {
                        borderColor: '#fff',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                  >
                    Resend OTP
                  </Button>
                </Grid>
              )}
            </Grid>
          </form>
        )}
      </Formik>
    </>
  );
}