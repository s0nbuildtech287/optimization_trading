// src/controller/chatController.js
const openaiService = require('../service/openaiService');

/**
 * GET /api/chat/models
 */
async function getModels(req, res) {
  try {
    const models = await openaiService.getAvailableModels();
    res.json({ models, defaultModel: openaiService.getDefaultModel() });
  } catch (error) {
    console.error('❌ [CHAT] getModels error:', error.message);
    res.status(500).json({ message: error.message });
  }
}

/**
 * POST /api/chat/send
 * Body: { message, model, history?, pageContext? }
 * pageContext: { page, filters, currentData } — context từ trang hiện tại
 */
async function sendMessage(req, res) {
  try {
    const { message, model, history = [], pageContext = null } = req.body;
    const userId = req.user?.id || req.ip || 'anonymous';

    if (!message?.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const availableModels = await openaiService.getAvailableModels();
    const selectedModel = openaiService.isValidModel(model, availableModels)
      ? model
      : openaiService.getDefaultModel();

    // Build messages — inject pageContext as system context if provided
    const messages = [...history.slice(-20)];

    if (pageContext) {
      const ctxLines = [`[Context từ trang ${pageContext.page || 'hiện tại'}]`];
      if (pageContext.filters && Object.keys(pageContext.filters).length > 0) {
        ctxLines.push(`Filters đang áp dụng: ${JSON.stringify(pageContext.filters)}`);
      }
      if (pageContext.totalStrategies != null) {
        ctxLines.push(`Tổng số strategies đang hiển thị: ${pageContext.totalStrategies}`);
      }
      if (pageContext.currentData?.length) {
        // Gửi tối đa 20 strategies đầu tiên để AI có context
        const sample = pageContext.currentData.slice(0, 20);
        ctxLines.push(`Dữ liệu strategies hiện tại (${sample.length} dòng đầu):\n${JSON.stringify(sample)}`);
      }
      if (pageContext.chartData) {
        // Trực quan hóa và thu gọn dữ liệu biểu đồ quá lớn để tránh quá tải token
        const cleanAndTruncate = (data) => {
          if (!data) return data;
          if (Array.isArray(data)) {
            return data.map(item => {
              if (item && typeof item === 'object') {
                const cleanedItem = { ...item };
                for (const key of Object.keys(cleanedItem)) {
                  if (Array.isArray(cleanedItem[key])) {
                    const arr = cleanedItem[key];
                    if (arr.length > 20) {
                      cleanedItem[key] = [...arr.slice(0, 20), `... (và ${arr.length - 20} phần tử khác đã ẩn để tiết kiệm token)`];
                    }
                  }
                }
                return cleanedItem;
              }
              return item;
            });
          } else if (typeof data === 'object') {
            const cleanedData = { ...data };
            for (const key of Object.keys(cleanedData)) {
              if (Array.isArray(cleanedData[key])) {
                const arr = cleanedData[key];
                if (arr.length > 20) {
                  cleanedData[key] = [...arr.slice(0, 20), `... (và ${arr.length - 20} phần tử khác đã ẩn để tiết kiệm token)`];
                }
              }
            }
            return cleanedData;
          }
          return data;
        };
        const truncatedData = cleanAndTruncate(pageContext.chartData);
        ctxLines.push(`Dữ liệu biểu đồ/phân tích cụ thể:\n${JSON.stringify(truncatedData)}`);
      }
      messages.push({ role: 'system', content: ctxLines.join('\n') });
    }

    messages.push({ role: 'user', content: message });

    const result = await openaiService.createChatCompletion(messages, selectedModel, userId);

    res.json({
      message: result.message,
      tokensUsed: result.tokensUsed,
      cost: `~${result.cost.toFixed(4)}`,
      model: selectedModel,
    });
  } catch (error) {
    console.error('❌ [CHAT] sendMessage error:', error.message);
    const status = error.message.includes('Rate limit') ? 429 : 500;
    res.status(status).json({ message: error.message });
  }
}

module.exports = { getModels, sendMessage };
