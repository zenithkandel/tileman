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

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "INJECT_KEY") {
    const tabId = sender.tab.id;

    // 1. Press the key down
    chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "keyDown",
      windowsVirtualKeyCode: msg.code,
      nativeVirtualKeyCode: msg.code,
      unmodifiedText: msg.text,
      text: msg.text
    });

    // 2. Release the key after a short delay (simulating a physical tap)
    setTimeout(() => {
      chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
        type: "keyUp",
        windowsVirtualKeyCode: msg.code,
        nativeVirtualKeyCode: msg.code
      });
    }, 50);
  }
});
function parseData(p) { try { return JSON.parse(p.substring(p.indexOf('['))); } catch (e) { return null; } }