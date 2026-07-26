import axios from "axios";
import { API_URL } from "./constants";

export const axiosClient = axios.create({
  baseURL: API_URL,
  withCredentials: true
});
