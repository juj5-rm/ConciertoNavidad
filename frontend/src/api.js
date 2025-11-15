import axios from "axios";

const api = axios.create({
  baseURL: "https://conciertonavidad.onrender.com/api" // tu backend local
});

export default api;
