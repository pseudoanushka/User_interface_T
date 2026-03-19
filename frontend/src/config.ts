// Global Configuration
// BACKEND (Arduino Base Station logic + CSV logger) — runs locally on this machine
export const BACKEND_IP = "localhost";
export const BACKEND_PORT = "8000";

// RASPBERRY PI (MAVSDK Drone logic + Camera)
export const RPI_IP = "192.168.0.97"; 
export const RPI_PORT = "8000";

export const getBaseUrl = () => `http://${BACKEND_IP}:${BACKEND_PORT}`;
export const getWsUrl = () => `ws://${BACKEND_IP}:${BACKEND_PORT}`;

export const getRpiUrl = () => `http://${RPI_IP}:${RPI_PORT}`;
export const getRpiWsUrl = () => `ws://${RPI_IP}:${RPI_PORT}`;
