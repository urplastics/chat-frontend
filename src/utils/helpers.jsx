import { PASSWORD_MIN_LENGTH } from "./config";

/**
 * 格式化时间（如：14:30）
 * @param {Date} date - 时间对象
 * @returns {string} 格式化后的时间字符串
 */
export const formatTime = (date) => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * 表单验证（登录/注册通用）
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {string|null} 错误信息（null表示验证通过）
 */
export const validateAuthForm = (username, password) => {
  if (!username.trim()) return "请输入用户名";
  if (!password.trim()) return "请输入密码";
  if (password.length < PASSWORD_MIN_LENGTH) 
    return `密码长度不能少于${PASSWORD_MIN_LENGTH}位`;
  return null;
};

/**
 * 清除定时器（避免内存泄漏）
 * @param {NodeJS.Timeout|null} timer - 定时器引用
 */
export const clearSafeTimer = (timer) => {
  if (timer) {
    clearTimeout(timer);
    return null; // 重置定时器引用
  }
  return timer;
};