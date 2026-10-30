import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import TablePagination from '@mui/material/TablePagination';
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';
import { PAGE_SIZE_OPTIONS } from 'config';

const EmptyActions = () => null;

export default function CustomTablePagination({
  count = 0,
  page = 0, // 0-indexed for TablePagination
  rowsPerPage = 50,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = PAGE_SIZE_OPTIONS,
  sx = {}
}) {
  const totalPages = Math.ceil(count / rowsPerPage) || 1;
  const currentPage = page + 1; // 1-indexed for MUI Pagination

  const handlePaginationChange = (event, value) => {
    if (onPageChange) {
      onPageChange(event, value - 1);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: 1,
        p: 1.5,
        mt: 0.5,
        ...sx
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', width: 'auto' }}>
        <TablePagination
          rowsPerPageOptions={rowsPerPageOptions}
          component="div"
          count={count}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={onPageChange}
          onRowsPerPageChange={onRowsPerPageChange}
          labelDisplayedRows={() => ''}
          ActionsComponent={EmptyActions}
          labelRowsPerPage="Page"
          sx={{
            '& .MuiToolbar-root': {
              minHeight: 32,
              p: 0
            },
            '& .MuiTablePagination-selectLabel': {
              m: 0,
              fontSize: '0.75rem'
            },
            '& .MuiTablePagination-select': {
              py: 0.5,
              fontSize: '0.75rem'
            },
            '& .MuiTablePagination-spacer': {
              display: 'none'
            }
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: 'auto' }}>
        <Pagination
          count={totalPages}
          page={currentPage}
          onChange={handlePaginationChange}
          size="small"
          showFirstButton
          showLastButton
          siblingCount={0}
          boundaryCount={1}
          renderItem={(item) => {
            const isPage = item.type === 'page';
            const isSelected = item.selected;

            let displayStyle = {};
            if (isPage && !isSelected) {
              displayStyle = { display: { xs: 'none', sm: 'inline-flex' } };
            } else if (item.type === 'start-ellipsis' || item.type === 'end-ellipsis') {
              displayStyle = { display: { xs: 'none', sm: 'inline-flex' } };
            }

            if (isPage) {
              return (
                <PaginationItem
                  {...item}
                  sx={{
                    mx: 0.5,
                    minWidth: { xs: 32, sm: 40 },
                    height: { xs: 32, sm: 40 },
                    borderRadius: 2,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      color: 'white',
                      '&:hover': { backgroundColor: 'primary.dark' }
                    },
                    '&:hover': { backgroundColor: 'action.hover' },
                    ...displayStyle
                  }}
                />
              );
            }
            return (
              <PaginationItem
                {...item}
                sx={{
                  minWidth: { xs: 32, sm: 40 },
                  height: { xs: 32, sm: 40 },
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { backgroundColor: 'action.hover', borderColor: 'primary.main', color: 'primary.main' },
                  ...displayStyle
                }}
              />
            );
          }}
        />
      </Box>
    </Box>
  );
}

CustomTablePagination.propTypes = {
  count: PropTypes.number,
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  onPageChange: PropTypes.func,
  onRowsPerPageChange: PropTypes.func,
  rowsPerPageOptions: PropTypes.array,
  sx: PropTypes.object
};
