import axios from "axios";
import { API_BASE } from "./config";

// 创建Axios实例
const request = axios.create({
  baseURL: API_BASE,
  timeout: 5000, // 统一超时时间
  headers: {
    "Content-Type": "application/json",
  },
  // 解决token含特殊符号（如+、/、=）的编码问题：Axios默认会自动编码URL参数，但请求头需确保token原样传递
  transformRequest: [
    (data, headers) => {
      // 如果有token，直接在请求头中携带（避免URL编码导致的token解析失败）
      const token = localStorage.getItem("token");
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return JSON.stringify(data);
    },
  ],
});

// 请求拦截器：统一添加token（无需在组件中重复写）
request.interceptors.request.use(
  (config) => config,
  (error) => {
    console.error("请求预处理错误:", error);
    return Promise.reject(error);
  }
);

// 响应拦截器：统一处理错误（如token过期、服务器错误）
request.interceptors.response.use(
  (response) => response.data, // 直接返回响应体，组件中无需再写res.data
  (error) => {
    // 统一错误消息格式
    const errorMsg = 
      error.response?.data?.message || 
      error.message || 
      "网络请求失败，请稍后再试";
    // token过期特殊处理（假设后端返回401表示token无效）
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      window.location.href = "/login"; // 跳回登录页
    }
    return Promise.reject(new Error(errorMsg)); // 抛出错误，组件中统一catch
  }
);

export default request;