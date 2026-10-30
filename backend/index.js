const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const aiAnalysisReportDao = require("./src/dao/aiAnalysisReportDao");
const opDao = require("./src/dao/opDao");
const strategyMetadataDAO = require("./src/dao/strategyMetadataDao");
const userDao = require("./src/dao/userDao");
const setupSwagger = require("./src/config/swagger");
const sheetRoute = require("./src/routes/opRoute");
const authRoute = require("./src/routes/authRoute");
const userRoute = require("./src/routes/userRoute");
const systemLogRoutes = require("./src/routes/systemLogRoute");
const dashboardRoute = require("./src/routes/dashboardRoute");
const riskAnalysisRoute = require("./src/routes/riskAnalysisRoute");
const behaviorAnalysisRoute = require("./src/routes/behaviorAnalysisRoute");
const comparativeRankingRoute = require("./src/routes/comparativeRankingRoute");
const strategyRoutes = require("./src/routes/strategyRoutes");
const chatRoute = require("./src/routes/chatRoute");
const marketRoute = require("./src/routes/marketRoute");
const aiAnalysisRoute = require("./src/routes/aiAnalysisRoute");
const lotThresholdRoute = require("./src/routes/lotThresholdRoute");
const lotThresholdDao = require("./src/dao/lotThresholdDao");
const mt5OptimizationSchemaDao = require("./src/dao/mt5OptimizationSchemaDao");
const mt5OptimizationService = require("./src/service/mt5OptimizationService");
const { DATABASE } = require("./src/utils/messages");
const dashboardService = require("./src/service/dashboardService");
const riskAnalysisService = require("./src/service/riskAnalysisService");
const behaviorAnalysisService = require("./src/service/behaviorAnalysisService");
const comparativeRankingService = require("./src/service/comparativeRankingService");
const strategyService = require("./src/service/strategyService");
const orderService = require("./src/service/orderService");
const db = require("./src/models");
const { errorHandler } = require("./src/service/errorLogService");

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3456",
      "http://127.0.0.1:3456"
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Disable browser cache for dynamic API responses thưa đại ca Xuân Sơn
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Swagger documentation
setupSwagger(app);

// Date range validation middleware for all /api endpoints thưa đại ca Xuân Sơn
const { validateGeneralDateRange } = require("./src/middlewares/backtestAccess");
app.use("/api", validateGeneralDateRange);

// Routes
app.use("/", authRoute);
// Worker protocol authenticates with X-API-Key and must be mounted before
// broad /api routers that apply JWT middleware to every nested path.
app.use("/", require("./src/routes/mt5WorkerRoute"));
app.use("/api", marketRoute);
app.use("/api", sheetRoute);
app.use("/api", systemLogRoutes);
app.use("/api", dashboardRoute);
app.use("/api", riskAnalysisRoute);
app.use("/api", behaviorAnalysisRoute);
app.use("/api", comparativeRankingRoute);
app.use("/api", userRoute);
app.use("/api/strategies", strategyRoutes);
app.use("/api", chatRoute);
app.use("/api", aiAnalysisRoute);
app.use("/api/lot-threshold", lotThresholdRoute);
app.use("/api", require("./src/routes/notificationRoute"));
app.use("/api/mt5-optimization", require("./src/routes/mt5OptimizationRoute"));

const seedDefaultAdmin = async () => {
  try {
    const User = db.User;
    const Role = db.Role;

    let user = await User.findOne({
      where: { username: "admin" },
      include: [{ model: Role }]
    });

    const [adminRole] = await Role.findOrCreate({ where: { name: "admin" } });

    if (!user) {
      user = await User.create({
        username: "admin",
        email: "admin@lotusquant.com",
        password: "Lotusquant@123",
        role_id: adminRole.id
      });
      console.log("[AUTH] Default admin user created and granted admin role.");
      return;
    }

    if (user.role_id !== adminRole.id) {
      user.role_id = adminRole.id;
      await user.save();
      console.log("[AUTH] Admin role granted to existing admin user.");
    } else {
      console.log("[AUTH] Admin user already exists with admin role.");
    }
  } catch (err) {
    console.error("[AUTH] Failed to seed admin role:", err.message);
  }
};

async function initializeDatabase() {
  try {
    console.log(DATABASE.INIT_START);
    
    // Tự động tạo bảng User, Role từ models
    const queryInterface = db.sequelize.getQueryInterface();
    const existingTables = await queryInterface.showAllTables();
    const usersExists = existingTables.includes('users');
    const rolesExists = existingTables.includes('roles');
    await db.sequelize.sync({ alter: false });
    console.log(usersExists ? "[DB] users table already exists" : "[DB] users table created");
    console.log(rolesExists ? "[DB] roles table already exists" : "[DB] roles table created");
    
    await userDao.initUserTable();
    await strategyMetadataDAO.initStrategyMetadataTable();
    await strategyMetadataDAO.initUserPreferencesTable();
    await aiAnalysisReportDao.initAiAnalysisReportTable();
    await lotThresholdDao.initLotThresholdTable();
    await require("./src/utils/syncProgressTracker").initSyncJobsTable();
    await require("./src/dao/dataSourceDao").initDataSourceTable();
    await mt5OptimizationSchemaDao.initMt5OptimizationSchema();
    await mt5OptimizationService.sweepRuntimeDirectories();
    await require("./src/dao/notificationDAO").initNotificationTable();
    await opDao.createBacktestIndexes();

    // Clear tất cả cache khi khởi động server
    console.log("[CACHE] Clearing all caches on server startup...");
    dashboardService.clearDashboardCache();
    riskAnalysisService.clearRiskAnalysisCache();
    behaviorAnalysisService.clearBehaviorAnalysisCache();
    comparativeRankingService.clearComparativeCache();
    strategyService.clearStrategyCache();
    orderService.clearOrderCache(); // Clear all order cache
    console.log("[CACHE] All caches cleared");

    console.log(DATABASE.INIT_COMPLETE);
    await seedDefaultAdmin();
  } catch (err) {
    console.error(DATABASE.INIT_FAILED, err.message);
  }
}

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}/api-docs`);
});

initializeDatabase();

const mt5RecoveryTimer = setInterval(() => {
  mt5OptimizationService.recoverExpiredJobs().catch((error) => {
    console.warn('[mt5] lease recovery skipped:', error.message);
  });
}, 30000);
mt5RecoveryTimer.unref();

const mt5RuntimeSweepTimer = setInterval(() => {
  mt5OptimizationService.sweepRuntimeDirectories().catch((error) => {
    console.warn('[mt5] runtime sweep skipped:', error.message);
  });
}, require('./src/utils/constants').MT5.RUNTIME_SWEEP_INTERVAL_MS);
mt5RuntimeSweepTimer.unref();

// Serve static files (for production)
app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res) => {
  const distIndex = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    res.status(404).json({ error: `Route ${req.originalUrl} not found` });
  }
});

app.use(errorHandler);
