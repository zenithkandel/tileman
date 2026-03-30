'use strict';

const targetDomain = "tileman.io";

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes(targetDomain)) {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    });
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (method === 'Network.webSocketFrameReceived') {
    const payload = params.response.payloadData;
    if (payload.includes('["put"')) {
      const json = parseData(payload);
      if (json) chrome.tabs.sendMessage(tabId, { type: 'RADAR_UPDATE', source: 'server', data: json[1] });
    }
  }
  // This is the "Identity" packet — it's sent when YOU move
  if (method === 'Network.webSocketFrameSent') {
    const payload = params.response.payloadData;
    if (payload.includes('["1"')) {
      const json = parseData(payload);
      if (json) chrome.tabs.sendMessage(tabId, { type: 'RADAR_UPDATE', source: 'self', data: json[1] });
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "INJECT_KEY") {
    const tabId = sender.tab.id;
    // Hardware-level key tap
    chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "keyDown", windowsVirtualKeyCode: msg.code, nativeVirtualKeyCode: msg.code, text: msg.text, unmodifiedText: msg.text
    });
    setTimeout(() => {
      chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
        type: "keyUp", windowsVirtualKeyCode: msg.code, nativeVirtualKeyCode: msg.code
      });
    }, 30);
  }
});

function parseData(p) { try { return JSON.parse(p.substring(p.indexOf('['))); } catch (e) { return null; } }