'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function invokeWithFallback(primaryChannel, fallbackChannel, ...args) {
  try {
    return await ipcRenderer.invoke(primaryChannel, ...args);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const noHandler = `No handler registered for '${primaryChannel}'`;
    if (fallbackChannel && message.includes(noHandler)) {
      return ipcRenderer.invoke(fallbackChannel, ...args);
    }
    throw error;
  }
}

contextBridge.exposeInMainWorld('aria', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, callback) =>
    ipcRenderer.on(channel, (_event, ...args) => callback(...args)),
  getSettings: () => invokeWithFallback('settings:get', 'get-settings'),
  saveSettings: (settings) => invokeWithFallback('settings:set', 'save-settings', settings),
  sendPrompt: (prompt) => ipcRenderer.invoke('agent:send-prompt', prompt),
  startAgentStream: (payload) => ipcRenderer.invoke('agent:start-stream', payload),
  memoryInvoke: (action, payload) => ipcRenderer.invoke('memory:invoke', { action, payload }),
  onAgentToken: (callback) => {
    const wrappedStream = (_event, payload) => callback(payload);
    const wrappedToken = (_event, token) => callback(token);
    ipcRenderer.on('agent:stream-token', wrappedStream);
    ipcRenderer.on('agent-token', wrappedToken);
    return () => {
      ipcRenderer.removeListener('agent:stream-token', wrappedStream);
      ipcRenderer.removeListener('agent-token', wrappedToken);
    };
  },
  onAgentComplete: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on('agent:stream-complete', wrapped);
    return () => ipcRenderer.removeListener('agent:stream-complete', wrapped);
  },
  onAgentError: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on('agent:stream-error', wrapped);
    return () => ipcRenderer.removeListener('agent:stream-error', wrapped);
  },
  onStatus: (callback) => {
    const wrapped = (_event, payload) => callback(payload);
    ipcRenderer.on('status:update', wrapped);
    return () => ipcRenderer.removeListener('status:update', wrapped);
  },
  whatsappInit: () => ipcRenderer.invoke('whatsapp-init'),
  whatsappSend: (contact, message) =>
    ipcRenderer.invoke('whatsapp-send', { contact, message }),
  whatsappStatus: () => ipcRenderer.invoke('whatsapp-status'),
  onWhatsappQR: (cb) => {
    const wrapped = (_event, qr) => cb(qr);
    ipcRenderer.on('whatsapp-qr', wrapped);
    return () => ipcRenderer.removeListener('whatsapp-qr', wrapped);
  },
  onWhatsappReady: (cb) => {
    const wrapped = () => cb();
    ipcRenderer.on('whatsapp-ready', wrapped);
    return () => ipcRenderer.removeListener('whatsapp-ready', wrapped);
  },
  removeAgentTokenListener: () =>
    ipcRenderer.removeAllListeners('agent-token')
});