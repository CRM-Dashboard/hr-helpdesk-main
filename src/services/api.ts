// src/services/api.js
import { STORAGE_KEY } from "@/constant";
import axios from "axios";

// const base = `http://localhost:5000`;
const base = `https://gera-crm-server-dev.azurewebsites.net`;

// const base = `https://gera-crm-server.azurewebsites.net`;

const api = axios.create({
  baseURL: base,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Here you can process errors globally
    console.error("API call error:", error.message);
    // You can choose to display a generic message or further customize based on error type
    return Promise.reject(error);
  },
);

// 👇 Utility to add user credentials to FormData automatically
const postWithCred = async (url, formData = new FormData()) => {
  const credRaw = sessionStorage.getItem(STORAGE_KEY.CredentialSecret);
  const cred = credRaw ? JSON.parse(credRaw) : null;

  if (cred?.userName && cred?.passWord) {
    formData.append("userName", cred.userName);
    formData.append("passWord", cred.passWord);
  }
  //   console.log("postWithCred formdata entries:", Array.from(formData.entries()));

  return api.post(url, formData);
};

export { postWithCred };

export default api;
