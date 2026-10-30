// ============================================
// FILE: service/orderService.js - OPTIMIZED WITH CACHE
// ============================================
const opDao = require('../dao/opDao');

// ✅ CACHE CONFIGURATION
const orderCache = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 ngày (604800000 ms)

/**
 * ✅ Generate cache key
 */
const getCacheKey = (tableName, params = {}) => {
    const sortedParams = Object.keys(params)
        .filter(key => params[key] !== null && params[key] !== undefined)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');

    return `order_${tableName}_${sortedParams || 'default'}`;
};

/**
 * ✅ Check if cache is valid
 */
const isCacheValid = (cacheEntry) => {
    if (!cacheEntry) return false;
    return (Date.now() - cacheEntry.timestamp) < CACHE_TTL;
};

/**
 * ✅ Get paged orders with caching
 */
/**
 * ✅ Get paged orders with caching (data + pagination only, NO totals)
 */
const getPagedOrders = async (tableName, page, pageSize, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null, sortTimeDir = null, sortDealDir = null, sortSymbolDir = null, sortCommissionDir = null, sortSwapDir = null, sortProfitDir = null) => {
    const cacheKey = getCacheKey(tableName, {
        page, pageSize, strategyId, symbol, year, search, startDate, endDate,
        sortTimeDir: sortTimeDir || 'default',
        sortDealDir: sortDealDir || 'default',
        sortSymbolDir: sortSymbolDir || 'default',
        sortCommissionDir: sortCommissionDir || 'default',
        sortSwapDir: sortSwapDir || 'default',
        sortProfitDir: sortProfitDir || 'default'
    });

    const cached = orderCache.get(cacheKey);

    // ✅ Return from cache if valid
    if (isCacheValid(cached)) {
        console.log(`✅ [ORDER CACHE HIT] ${cacheKey}`);
        return cached.data;
    }

    try {
        console.log(`🔄 [ORDER CACHE MISS] Loading ${cacheKey}...`);
        const startTime = Date.now();

        const limit = pageSize;
        const offset = (page - 1) * pageSize;

        // ✅ Chỉ lấy data + counts, KHÔNG lấy totals (totals có endpoint riêng)
        const [data, totalWithBalance, totalDisplayed] = await Promise.all([
            opDao.getDataPage(tableName, limit, offset, strategyId, symbol, year, search, startDate, endDate, sortTimeDir, sortDealDir, sortSymbolDir, sortCommissionDir, sortSwapDir, sortProfitDir),
            opDao.getTotalCount(tableName, strategyId, symbol, year, search, startDate, endDate),
            opDao.getTotalCountDisplayed(tableName, strategyId, symbol, year, search, startDate, endDate),
        ]);

        // Pagination tính theo displayed count (không có balance)
        const totalPages = Math.ceil(totalDisplayed / pageSize);

        const result = {
            data,
            pagination: {
                total: totalWithBalance,
                totalDisplayed: totalDisplayed,
                totalPages,
                currentPage: page,
                pageSize,
            },
        };

        // ✅ Store in cache
        orderCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        const duration = Date.now() - startTime;
        console.log(`✅ [ORDER] Loaded in ${duration}ms and cached`);

        return result;
    } catch (error) {
        console.error('❌ Error loading orders:', error);
        throw error;
    }
};

/**
 * ✅ Get order totals separately (heavy aggregation query, cached independently)
 */
const getOrderTotals = async (tableName, strategyId = null, symbol = null, year = null, search = null, startDate = null, endDate = null) => {
    const cacheKey = getCacheKey(tableName, {
        type: 'totals', strategyId, symbol, year, search, startDate, endDate
    });

    const cached = orderCache.get(cacheKey);

    if (isCacheValid(cached)) {
        console.log(`✅ [TOTALS CACHE HIT] ${cacheKey}`);
        return cached.data;
    }

    try {
        console.log(`🔄 [TOTALS CACHE MISS] Loading ${cacheKey}...`);
        const startTime = Date.now();

        const totals = await opDao.getTotals(tableName, strategyId, symbol, year, search, startDate, endDate);

        const result = {
            commission: totals.totalCommission,
            swap: totals.totalSwap,
            profit: totals.totalProfit,
            orders: totals.totalOrders,
            profitableOrders: totals.profitableOrders,
            totalOutOrders: totals.totalOutOrders,
            winrate: totals.totalOutOrders > 0
                ? parseFloat(((totals.profitableOrders / totals.totalOutOrders) * 100).toFixed(2))
                : 0,
            strategies: totals.totalStrategies,
        };

        orderCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });

        const duration = Date.now() - startTime;
        console.log(`✅ [TOTALS] Loaded in ${duration}ms and cached`);

        return result;
    } catch (error) {
        console.error('❌ Error loading totals:', error);
        throw error;
    }
};

/**
 * ✅ Clear order cache (call after sync)
 */
const clearOrderCache = (tableName = null) => {
    if (tableName) {
        // Clear specific table cache
        const keysToDelete = [];
        for (const key of orderCache.keys()) {
            if (key.startsWith(`order_${tableName}_`)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => orderCache.delete(key));
        console.log(`🗑️  Cleared order cache for ${tableName}`);
    } else {
        // Clear all cache
        orderCache.clear();
        console.log('[CACHE] Cleared order cache');
    }
};

/**
 * ✅ Get cache stats (for monitoring)
 */
const getCacheStats = () => {
    const stats = {
        totalEntries: orderCache.size,
        entries: []
    };

    for (const [key, value] of orderCache.entries()) {
        const age = Date.now() - value.timestamp;
        stats.entries.push({
            key,
            ageMs: age,
            isValid: age < CACHE_TTL
        });
    }

    return stats;
};

module.exports = {
    getPagedOrders,
    getOrderTotals,
    clearOrderCache,
    getCacheStats
};
