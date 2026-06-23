// src/services/api.js
import { RESOLVED_BACKEND_BASE_URL } from "@/services/sapClient";
import axios from "axios";

const api = axios.create({
  baseURL: RESOLVED_BACKEND_BASE_URL, // import.meta?.env?.VITE_APP_SERVER_URL || "Ddd",
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Here you can process errors globally
    console.error("API call error:", error.message);
    // You can choose to display a generic message or further customize based on error type
    return Promise.reject(error);
  }
);

export default api;
