const API_BASE_URL = `http://localhost:${import.meta.env?.VITE_BACKEND_PORT || 5001}`; 

console.log("API_BASE_URL:", API_BASE_URL);  

export default API_BASE_URL;
