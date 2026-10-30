/**
 * Parse volume string từ MT5 export.
 * MT5 rút gọn số lớn bằng suffix K (nghìn) hoặc M (triệu).
 * Ví dụ: "5.12821K" → 5128.21, "1.5M" → 1500000, "132.47" → 132.47
 *
 * @param {string|number} value
 * @returns {number|null}
 */
const parseVolume = (value) => {
  if (value === null || value === undefined || value === "") return null;

  // Nếu đã là số thì trả về luôn
  if (typeof value === "number") return value;

  // Xóa dấu phẩy và khoảng trắng (phân cách hàng nghìn kiểu locale/regional)
  const cleaned = String(value).replace(/[\s,]/g, "").trim();

  const upper = cleaned.toUpperCase();

  if (upper.endsWith("K")) {
    const num = parseFloat(upper.slice(0, -1));
    return isNaN(num) ? null : num * 1_000;
  }

  if (upper.endsWith("M")) {
    const num = parseFloat(upper.slice(0, -1));
    return isNaN(num) ? null : num * 1_000_000;
  }

  if (upper.endsWith("B")) {
    const num = parseFloat(upper.slice(0, -1));
    return isNaN(num) ? null : num * 1_000_000_000;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

module.exports = { parseVolume };
