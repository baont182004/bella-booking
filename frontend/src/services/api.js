import axios from "axios";

const browserProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:"
    ? "https:"
    : "http:";
const browserHost =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "localhost";

const userServiceUrl =
  import.meta.env.VITE_USER_SERVICE_URL || `${browserProtocol}//${browserHost}:3001`;
const hotelServiceUrl =
  import.meta.env.VITE_HOTEL_SERVICE_URL || `${browserProtocol}//${browserHost}:3002`;
const bookingServiceUrl =
  import.meta.env.VITE_BOOKING_SERVICE_URL || `${browserProtocol}//${browserHost}:3003`;
const paymentServiceUrl =
  import.meta.env.VITE_PAYMENT_SERVICE_URL || `${browserProtocol}//${browserHost}:3004`;

export const userApi = axios.create({
  baseURL: userServiceUrl,
});

export const hotelApi = axios.create({
  baseURL: hotelServiceUrl,
});

export const bookingApi = axios.create({
  baseURL: bookingServiceUrl,
});

export const paymentApi = axios.create({
  baseURL: paymentServiceUrl,
});

export const setUserAuthToken = (token) => {
  const apis = [userApi, hotelApi, bookingApi, paymentApi];

  if (token) {
    apis.forEach((api) => {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    });
  } else {
    apis.forEach((api) => {
      delete api.defaults.headers.common.Authorization;
    });
  }
};
