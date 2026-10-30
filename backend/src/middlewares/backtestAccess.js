const backtestAccessService = require('../service/backtestAccessService');
const { BACKTEST_ACCESS_ERROR_CODE } = require('../utils/constants');
const { GENERAL, VALIDATION } = require('../utils/messages');

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parseDateString(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string' && typeof val !== 'number' && !(val instanceof Date)) return null;

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'all') {
      return null;
    }
    const normalized = trimmed.includes('.') && trimmed.split('.').length === 3
      ? trimmed.replace(/\./g, '-')
      : trimmed;
    if (!isValidDateOnly(normalized)) return 'INVALID';
    return new Date(`${normalized}T00:00:00.000Z`);
  }

  const date = new Date(val);
  if (isNaN(date.getTime())) return 'INVALID';
  return date;
}

function extractDateRangeParams(req) {
  const query = req.query || {};
  const body = req.body || {};

  const fromDate = query.fromDate ?? query.from_date ?? body.fromDate ?? body.from_date;
  const toDate = query.toDate ?? query.to_date ?? body.toDate ?? body.to_date;

  const rawStart = query.startDate
    ?? query.start_date
    ?? query['filter[start_date]']
    ?? query['filter[startDate]']
    ?? body.startDate
    ?? body.start_date
    ?? body['filter[start_date]']
    ?? body['filter[startDate]'];

  const rawEnd = query.endDate
    ?? query.end_date
    ?? query['filter[end_date]']
    ?? query['filter[endDate]']
    ?? body.endDate
    ?? body.end_date
    ?? body['filter[end_date]']
    ?? body['filter[endDate]'];

  return { fromDate, toDate, rawStart, rawEnd };
}

function validateDashboardDateRange(req, res, next) {
  const { fromDate, toDate, rawStart, rawEnd } = extractDateRangeParams(req);

  if (fromDate !== undefined || toDate !== undefined) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: VALIDATION.UNSUPPORTED_DATE_PARAMS,
      details: VALIDATION.UNSUPPORTED_DATE_PARAMS
    });
  }

  const hasStartDate = rawStart !== undefined && rawStart !== null && String(rawStart).trim() !== '';
  const hasEndDate = rawEnd !== undefined && rawEnd !== null && String(rawEnd).trim() !== '';
  if (!hasStartDate && !hasEndDate) return next();

  if (!hasStartDate || !hasEndDate) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: VALIDATION.DATE_RANGE_REQUIRES_BOTH,
      details: VALIDATION.DATE_RANGE_REQUIRES_BOTH
    });
  }

  const startDate = parseDateString(rawStart);
  const endDate = parseDateString(rawEnd);

  if (startDate === 'INVALID' || endDate === 'INVALID') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: VALIDATION.INVALID_DATE_FORMAT,
      details: VALIDATION.INVALID_DATE_FORMAT
    });
  }

  if (startDate > endDate) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate).',
      details: 'Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate).'
    });
  }

  if (req.query) {
    if (req.query.start_date && !req.query.startDate) req.query.startDate = req.query.start_date;
    if (req.query.end_date && !req.query.endDate) req.query.endDate = req.query.end_date;
  }

  return next();
}

function validateGeneralDateRange(req, res, next) {
  const { fromDate, toDate, rawStart, rawEnd } = extractDateRangeParams(req);

  if (fromDate !== undefined || toDate !== undefined) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: VALIDATION.UNSUPPORTED_DATE_PARAMS,
      details: VALIDATION.UNSUPPORTED_DATE_PARAMS
    });
  }

  const startDate = parseDateString(rawStart);
  const endDate = parseDateString(rawEnd);

  if (startDate === 'INVALID' || endDate === 'INVALID') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Định dạng ngày bắt đầu hoặc ngày kết thúc không hợp lệ.',
      details: 'Định dạng ngày bắt đầu hoặc ngày kết thúc không hợp lệ.'
    });
  }

  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate).',
      details: 'Khoảng thời gian không hợp lệ: Ngày bắt đầu (startDate) không được lớn hơn ngày kết thúc (endDate).'
    });
  }

  if (req.query) {
    if (req.query.start_date && !req.query.startDate) req.query.startDate = req.query.start_date;
    if (req.query.end_date && !req.query.endDate) req.query.endDate = req.query.end_date;
  }

  return next();
}

function validateDashboardSourceSelection(req, res, next) {
  const sourceInput = req.query?.sourceNames ?? req.query?.tableName;
  const hasSource = Array.isArray(sourceInput)
    ? sourceInput.some((value) => String(value || '').trim())
    : String(sourceInput || '').trim().length > 0;

  if (!hasSource) {
    return res.status(400).json({ success: false, error: VALIDATION.SOURCE_NAMES_REQUIRED });
  }

  return next();
}

function getRequestedBacktestSource(req) {
  return req.query?.sourceNames
    || req.query?.tableName
    || req.query?.backtestTable
    || req.query?.backtest_table
    || req.body?.sourceNames
    || req.body?.tableName
    || req.body?.backtestTable
    || req.body?.backtest_table
    || 'all_backtests';
}

async function verifyBacktestSourceAccess(req, res, next) {
  try {
    req.accessibleBacktestTables = await backtestAccessService.validateAccessibleSourceNames(
      req.actor,
      getRequestedBacktestSource(req),
    );
    next();
  } catch (error) {
    const status = Number(error.status) || 500;
    res.status(status).json({
      success: false,
      code: error.code || BACKTEST_ACCESS_ERROR_CODE.ACCESS_ERROR,
      message: status >= 500 ? GENERAL.INTERNAL_ERROR : error.message,
    });
  }
}

module.exports = {
  getRequestedBacktestSource,
  validateDashboardDateRange,
  validateGeneralDateRange,
  validateDateRangeMiddleware: validateGeneralDateRange,
  validateDashboardSourceSelection,
  verifyBacktestSourceAccess,
  extractDateRangeParams,
  parseDateString,
};
