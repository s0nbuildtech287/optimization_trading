const errorLogDAO = require("../dao/errorLogDAO");
const { VALIDATION } = require("../utils/messages");

async function logError(strategyId, functionName, error, type = "NEW_RUN") {
  try {
    const errorMessage = error?.message || String(error);
    await errorLogDAO.insertErrorLog({
      strategyId,
      functionName,
      errorMessage,
      type,
    });
  } catch (e) {
    console.error("Could not write structured application error:", e.message);
  }
}

// Express error handling middleware
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const isMalformedJson =
    err instanceof SyntaxError &&
    err.status === 400 &&
    (err.type === "entity.parse.failed" || Object.prototype.hasOwnProperty.call(err, "body"));

  if (isMalformedJson) {
    return res.status(400).json({
      statusCode: 400,
      error: "Bad Request",
      message: VALIDATION.INVALID_JSON_PAYLOAD,
    });
  }

  logError("ExpressApp", req.path, err);
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
}

async function clearLogs() {
  return errorLogDAO.clearErrorLogs();
}

module.exports = {
  logError,
  errorHandler,
  clearLogs,
};
