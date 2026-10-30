import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Box,
} from '@mui/material';

const SIZE_MAP = {
    sm: 'xs', // ~400px
    md: 'sm', // ~600px
    lg: 'md', // ~900px
    xl: 'lg', // ~1200px
    '2xl': 'xl', // ~1536px
};

/**
 * Reusable Modal component backed by MUI Dialog
 */
function Modal({
    isOpen,
    onClose,
    title,
    size = 'md',
    showClose = true,
    footer,
    children,
    className = '',
    contentSx = {},
    ...rest
}) {
    const muiMaxWidth = SIZE_MAP[size] || 'sm';

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            fullWidth
            maxWidth={muiMaxWidth}
            className={className}
            PaperProps={{
                sx: {
                    borderRadius: '12px',
                    boxShadow: 24,
                }
            }}
            {...rest}
        >
            {/* Header */}
            {(title || showClose) && (
                <DialogTitle
                    sx={{
                        m: 0,
                        p: 2.5,
                        fontWeight: 600,
                        fontSize: '1.125rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    {title || <span />}
                    {showClose && (
                        <IconButton
                            aria-label="close"
                            onClick={onClose}
                            sx={{
                                color: 'text.secondary',
                                '&:hover': { bgcolor: 'action.hover' },
                                width: 32,
                                height: 32,
                                fontSize: '1.125rem',
                            }}
                        >
                            ✕
                        </IconButton>
                    )}
                </DialogTitle>
            )}

            {/* Body */}
            <DialogContent
                sx={{
                    p: 2.5,
                    overflowY: 'auto',
                    flex: '1 1 auto',
                    '&::-webkit-scrollbar': {
                        width: 6,
                        height: 6,
                    },
                    '&::-webkit-scrollbar-track': {
                        background: 'transparent',
                    },
                    '&::-webkit-scrollbar-thumb': {
                        background: 'transparent',
                        borderRadius: 3,
                        transition: 'background 0.2s ease-in-out',
                    },
                    '&:hover::-webkit-scrollbar-thumb': {
                        background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                        background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
                    },
                    ...contentSx,
                }}
            >
                <Box sx={{ mt: 1 }}>{children}</Box>
            </DialogContent>

            {/* Footer */}
            {footer && (
                <DialogActions
                    sx={{
                        p: 2,
                        px: 2.5,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        gap: 1.5,
                    }}
                >
                    {footer}
                </DialogActions>
            )}
        </Dialog>
    );
}

export default React.memo(Modal);
