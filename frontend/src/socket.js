// src/socket.js — connects Socket.IO with the same JWT used by the REST API.
import { io } from 'socket.io-client';
import { BASE, getToken } from './api';

export function connectSocket() {
  return io(BASE, { auth: { token: getToken() } });
}
