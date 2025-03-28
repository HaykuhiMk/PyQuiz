const API_BASE_URL = `${import.meta.env?.API_URL}:${import.meta.env?.VITE_BACKEND_PORT || 5001}`; 

console.log("API_BASE_URL:", API_BASE_URL);  

export default API_BASE_URL;
