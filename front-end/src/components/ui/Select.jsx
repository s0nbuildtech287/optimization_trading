import React from 'react';
import {
    FormControl,
    InputLabel,
    Select as MuiSelect,
    MenuItem,
    FormHelperText,
    Autocomplete,
    TextField,
    Box,
    Checkbox,
    IconButton,
} from '@mui/material';
import { X } from 'lucide-react';
import clsx from 'clsx';

/**
 * Format display label for multi-select based on selection count and field type.
 */
function formatMultipleValueLabel(count, label, placeholder) {
    if (count === 0) return placeholder || 'All';
    const lowerLabel = String(label || '').toLowerCase();
    if (lowerLabel.includes('manager')) return `${count} managers`;
    if (lowerLabel.includes('account') || lowerLabel.includes('tk')) return `${count} accounts`;
    if (lowerLabel.includes('fund')) return `${count} funds`;
    if (lowerLabel.includes('symbol')) return `${count} symbols`;
    return `${count} selected`;
}

/** Shared sx for the FormControl / MuiSelect variant */
const selectSx = {
    '& .MuiOutlinedInput-root.MuiInputBase-root': {
        backgroundColor: 'background.paper',
        borderRadius: '6px',
        height: '36px',
    },
    '& .MuiSelect-select.MuiInputBase-input': {
        paddingTop: '0px',
        paddingBottom: '0px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.875rem',
    },
};

/**
 * Select — Dropdown selector backed by MUI Select and Autocomplete.
 *
 * Props:
 *   - multiple: enables multi-select with checkboxes and count display
 *   - searchable: when single, uses Autocomplete; when multiple, adds an
 *     inline search box inside the dropdown (still uses MuiSelect so the
 *     label and renderValue behave correctly)
 */
function Select({
    options = [],
    value,
    onChange,
    label,
    placeholder = 'All',
    showPlaceholder = true,
    searchable = false,
    size = 'sm',
    status = 'default',
    hint,
    error,
    full = false,
    disabled = false,
    className = '',
    id,
    multiple = false,
    ...rest
}) {
    const resolvedStatus = error ? 'error' : status;
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const helperText = error || hint;
    const muiSize = size === 'sm' ? 'small' : 'medium';

    // ── Multiple select: always use MuiSelect so label/renderValue work correctly ──
    if (multiple) {
        // Map value to match the exact types (string vs number) in options
        const optionValuesMap = new Map(options.map(opt => [String(opt.value), opt.value]));
        const safeValue = (Array.isArray(value) ? value : [])
            .map(val => optionValuesMap.get(String(val)) ?? val);

        // Internal search state for searchable multi-select
        const [menuSearch, setMenuSearch] = React.useState('');

        const filteredOptions = searchable && menuSearch
            ? options.filter(opt => String(opt.label || '').toLowerCase().includes(menuSearch.toLowerCase()))
            : options;

        const hasClearable = safeValue.length > 0 && !disabled;

        return (
            <FormControl
                id={selectId}
                size={muiSize}
                disabled={disabled}
                error={resolvedStatus === 'error'}
                fullWidth
                className={clsx('w-full sm:w-auto', !full && 'sm:min-w-[200px]', className)}
                style={full ? { width: '100%', minWidth: 0 } : undefined}
                sx={{
                    ...selectSx,
                    // Extra padding-right to prevent text from overlapping the clear button
                    ...(hasClearable && {
                        '& .MuiSelect-select': { paddingRight: '48px !important' },
                    }),
                }}
            >
                {label && (
                    <InputLabel id={`${selectId}-label`} shrink>
                        {label}
                    </InputLabel>
                )}
                <MuiSelect
                    labelId={`${selectId}-label`}
                    id={selectId}
                    multiple
                    value={safeValue}
                    label={label}
                    notched
                    displayEmpty
                    renderValue={(selected) => formatMultipleValueLabel(selected.length, label, placeholder)}
                    onChange={(e) => {
                        const val = e.target.value;
                        onChange(typeof val === 'string' ? val.split(',') : val);
                    }}
                    endAdornment={
                        hasClearable ? (
                            <IconButton
                                size="small"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onChange([]);
                                }}
                                sx={{
                                    position: 'absolute',
                                    right: '28px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    padding: '2px',
                                    color: 'text.secondary',
                                    '&:hover': { color: 'text.primary' },
                                }}
                                tabIndex={-1}
                            >
                                <X size={14} />
                            </IconButton>
                        ) : null
                    }
                    MenuProps={{
                        disableScrollLock: true,
                        anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                        transformOrigin: { vertical: 'top', horizontal: 'left' },
                        PaperProps: {
                            style: { maxHeight: 200 },
                            sx: {
                                maxHeight: '200px !important',
                                '& .MuiMenu-list': {
                                    paddingTop: 0,
                                    paddingBottom: 0,
                                }
                            }
                        },
                        slotProps: {
                            paper: {
                                style: { maxHeight: 200 },
                                sx: { maxHeight: '200px !important' }
                            }
                        },
                        autoFocus: false,
                    }}
                    {...rest}
                >
                    {/* Inline search box inside dropdown for searchable multi-select */}
                    {searchable && (
                        <Box
                            onKeyDown={(e) => e.stopPropagation()}
                            sx={{ px: 1, pt: 1, pb: 0.5, position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'background.paper' }}
                        >
                            <TextField
                                autoFocus
                                fullWidth
                                size="small"
                                placeholder="Search..."
                                value={menuSearch}
                                onChange={(e) => setMenuSearch(e.target.value)}
                                sx={{
                                    '& .MuiInputBase-root': { height: '32px', fontSize: '0.8rem' },
                                }}
                            />
                        </Box>
                    )}
                    {filteredOptions.map((opt) => (
                        <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.875rem', py: '4px' }}>
                            <Checkbox
                                size="small"
                                checked={safeValue.includes(opt.value)}
                                sx={{ py: 0, mr: 1 }}
                            />
                            {opt.label}
                        </MenuItem>
                    ))}
                </MuiSelect>
                {helperText && <FormHelperText>{helperText}</FormHelperText>}
            </FormControl>
        );
    }

    // ── Single searchable: Autocomplete (combobox) ──
    if (searchable) {
        const autocompleteOptions = showPlaceholder
            ? [{ value: '', label: placeholder }, ...options]
            : options;

        const selectedOption = autocompleteOptions.find(opt => String(opt.value) === String(value)) || null;

        return (
            <Box
                className={clsx('w-full sm:w-auto', !full && 'sm:min-w-[200px]', className)}
                style={full ? { width: '100%', minWidth: 0 } : undefined}
            >
                <Autocomplete
                    id={selectId}
                    disabled={disabled}
                    size={muiSize}
                    fullWidth
                    options={autocompleteOptions}
                    getOptionLabel={(option) => option.label || ''}
                    value={selectedOption}
                    onChange={(event, newValue) => {
                        onChange(newValue ? newValue.value : '');
                    }}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            size={muiSize}
                            fullWidth
                            label={label}
                            placeholder={placeholder}
                            error={resolvedStatus === 'error'}
                            helperText={helperText}
                            InputLabelProps={{
                                ...params.InputLabelProps,
                                shrink: true,
                            }}
                            sx={{
                                '& .MuiOutlinedInput-root.MuiInputBase-root': {
                                    backgroundColor: 'background.paper',
                                    borderRadius: '6px',
                                    paddingTop: '2px',
                                    paddingBottom: '2px',
                                    height: '36px',
                                },
                                '& .MuiInputBase-input.MuiOutlinedInput-input': {
                                    padding: '4px 4px',
                                    fontSize: '0.875rem',
                                },
                            }}
                        />
                    )}
                    {...rest}
                />
            </Box>
        );
    }

    // ── Default: standard MUI Select (single) ──
    return (
        <FormControl
            id={selectId}
            size={muiSize}
            disabled={disabled}
            error={resolvedStatus === 'error'}
            fullWidth
            className={clsx('w-full sm:w-auto', !full && 'sm:min-w-[200px]', className)}
            style={full ? { width: '100%', minWidth: 0 } : undefined}
            sx={selectSx}
        >
            {label && (
                <InputLabel id={`${selectId}-label`} shrink={true} sx={{ color: (theme) => theme.palette.mode === 'dark' ? '#fff' : undefined }}>
                    {label}
                </InputLabel>
            )}
            <MuiSelect
                labelId={`${selectId}-label`}
                id={selectId}
                value={value}
                label={label}
                notched={true}
                onChange={(e) => onChange(e.target.value)}
                displayEmpty={showPlaceholder}
                MenuProps={{
                    disableScrollLock: true,
                    anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                    transformOrigin: { vertical: 'top', horizontal: 'left' },
                    PaperProps: {
                        style: { maxHeight: 200 },
                        sx: { maxHeight: '200px !important' }
                    },
                    slotProps: {
                        paper: {
                            style: { maxHeight: 200 },
                            sx: { maxHeight: '200px !important' }
                        }
                    },
                }}
                {...rest}
            >
                {showPlaceholder && <MenuItem value=""><em>{placeholder}</em></MenuItem>}
                {options.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.875rem' }}>
                        {opt.label}
                    </MenuItem>
                ))}
            </MuiSelect>
            {helperText && <FormHelperText>{helperText}</FormHelperText>}
        </FormControl>
    );
}

export default React.memo(Select);
