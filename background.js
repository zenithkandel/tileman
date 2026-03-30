'use strict';

const targetDomain = "tileman.io";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes(targetDomain)) {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
    });
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (method === 'Network.webSocketFrameReceived') {
    const payload = params.response.payloadData;
    if (payload.includes('["put"')) {
      const data = parseData(payload);
      if (data) chrome.tabs.sendMessage(tabId, { type: 'RADAR_UPDATE', source: 'server', data: data[1] });
    }
  }
  if (method === 'Network.webSocketFrameSent') {
    const payload = params.response.payloadData;
    if (payload.includes('["1"')) {
      const data = parseData(payload);
      if (data) chrome.tabs.sendMessage(tabId, { type: 'RADAR_UPDATE', source: 'self', data: data[1] });
    }
  }
});

// NEW: Keyboard Injection Logic
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "INJECT_KEY") {
    const keyMap = { 0: 'ArrowUp', 1: 'ArrowRight', 2: 'ArrowDown', 3: 'ArrowLeft' };
    const key = keyMap[msg.direction];

    // This injects a native-like keyboard event into the page
    chrome.debugger.sendCommand({ tabId: sender.tab.id }, "Runtime.evaluate", {
      expression: `
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', keyCode: ${msg.code}, bubbles: true }));
      `
    });
  }
});

function parseData(p) { try { return JSON.parse(p.substring(p.indexOf('['))); } catch (e) { return null; } }